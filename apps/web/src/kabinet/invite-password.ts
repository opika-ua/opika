import { randomBytes } from "node:crypto";
import type { InviteTokenRow } from "@opika/db/repos";
import type { RateLimiter } from "../api/rate-limit";
import { ipRateLimitKey } from "../api/rate-limit-key";
import type { KabinetAuth } from "./auth";
import { maskAddress } from "./email-senders";
import { forwardedClientHeaders } from "./forwarded-client-headers";
import type { AcceptInvitation } from "./invitation-accept";
import { shelterPasswordVerdictOf } from "./password-checks";
import type { PasswordRefusal } from "./password-codes";

/**
 * The invitation link's «Створіть пароль» (PW-2, `docs/shelter-passwords.md` §4.2, §6.1):
 * `/kabinet/vkhid?zaproshennia=<token>`. Oleksii, 2026-10-20, verbatim: "Q1, the invite page
 * lookup: a read-only lookup by the token's hash. It consumes nothing, charges no rate limit and
 * sends nothing. An unknown, expired, used or revoked link renders one identical "link no longer
 * works" page. The address is shown masked."
 *
 * - **The link's page** (`invitePasswordLandingOf`) reads the invitation its token names and
 *   shows the form, naming the shelter and the address (masked), or the one unusable page. It
 *   writes nothing and sends nothing, so a mail scanner opening the link, any number of times,
 *   leaves it exactly as it was. It adds no budget of its own; the page load counts against the
 *   per-IP page budget, as every `/kabinet` page does (PW2-Q1 (a)).
 * - **The form's POST** (`acceptInvitationWithPassword`, the oRPC procedure
 *   `invitation.acceptWithPassword`): 20 an hour per IP; the same reading of the invitation; the
 *   policy; then the link is used up, the address marked verified, the password written, the
 *   user signed in and the invitation accepted, in that order (below).
 *
 * The token is 256 random bits (43 base64url characters), so neither the page nor the POST is an
 * oracle worth asking: guessing a live token is out of reach at any rate.
 */

/** Random bytes in a link's token: 256 bits, as the anonymous session's (decision #13). */
const INVITE_TOKEN_BYTES = 32;

/** A token as `newInviteToken` makes it; anything else is never looked up. */
const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const newInviteToken = (): string => randomBytes(INVITE_TOKEN_BYTES).toString("base64url");

/**
 * Whether a token's invitation can still set a password, decided from what the database holds
 * (`kabinetInviteTokenRepo.landingOf`). Every "no" is the same `unusable`, so neither the page
 * nor the POST says which: unknown, expired (the link or the invitation), used, withdrawn or
 * accepted; an invitee the clean-up removed; and an address that may not take a password this
 * way: the operator's (§4.6: the operator never has a password), one that already has a
 * password, or one that is already a member somewhere (an existing admin uses «Забули пароль?»,
 * his scope item 9).
 */
export type InvitePasswordState =
  | {
      kind: "usable";
      invitationId: string;
      userId: string;
      email: string;
      shelterName: string;
    }
  | { kind: "unusable" };

const UNUSABLE = { kind: "unusable" } as const;

export function invitePasswordStateOf(row: InviteTokenRow | null, now: Date): InvitePasswordState {
  if (row === null || row.userId === null) return UNUSABLE;
  if (row.status !== "pending") return UNUSABLE;
  if (row.invitationExpiresAt.getTime() <= now.getTime()) return UNUSABLE;
  if (row.linkExpiresAt.getTime() <= now.getTime()) return UNUSABLE;
  if (row.operator || row.member || row.hasPassword) return UNUSABLE;
  return {
    kind: "usable",
    invitationId: row.invitationId,
    userId: row.userId,
    email: row.email,
    shelterName: row.shelterName,
  };
}

/** The link's page: the form for this invitation, or the one unusable page. */
export type InvitePasswordLanding =
  | { kind: "form"; shelterName: string; maskedEmail: string }
  | { kind: "unusable" };

/** The read the page and the POST share: never a write, never a budget. */
export type InviteLookup = (token: string) => Promise<InviteTokenRow | null>;

export async function invitePasswordLandingOf(
  token: string,
  deps: { lookup: InviteLookup; now: Date },
): Promise<InvitePasswordLanding> {
  if (!INVITE_TOKEN.test(token)) return UNUSABLE;
  const state = invitePasswordStateOf(await deps.lookup(token), deps.now);
  return state.kind === "usable"
    ? { kind: "form", shelterName: state.shelterName, maskedEmail: maskAddress(state.email) }
    : UNUSABLE;
}

/**
 * The two things the POST asks of Better Auth, so the orchestration below is tested against a
 * real instance (`inviteCredentialsOf`) and its failures against stand-ins.
 */
export type InviteCredentials = {
  /**
   * Marks the address verified, through Better Auth's adapter: the link reached that mailbox, as
   * a magic link does, and the automatic accept takes only a verified address (IN-Q13).
   */
  markVerified: (userId: string) => Promise<void>;
  /** Hashes with Better Auth's hasher (scrypt) and writes the user's first credential through its adapter. */
  createCredential: (userId: string, password: string) => Promise<void>;
  /**
   * Better Auth's own password sign-in for `email`, so the session and its cookie are Better
   * Auth's and every sign-in hook runs (the per-IP budget, the delay, the operator guard,
   * PW1-F6's reads).
   */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ kind: "signed_in"; userId: string; setCookies: string[] } | { kind: "refused" }>;
};

/** What the RPC route hands the procedure: on wherever sign-in is available, off for in-process page clients. */
export type InvitePasswords =
  | { kind: "off" }
  | {
      kind: "on";
      /** §4.3: "Invite acceptance | 20/h" per IP. */
      perIp: RateLimiter;
      ip: string;
      credentials: InviteCredentials;
    };

export const INVITE_PASSWORDS_OFF: InvitePasswords = Object.freeze({ kind: "off" } as const);

export type AcceptWithPasswordResult =
  /** Signed in: the route sets these cookies (Better Auth's session cookie). */
  | { kind: "signed_in"; setCookies: string[] }
  /** The password is set and the link used, but the sign-in didn't go through (the delay, a budget): sign in by hand. */
  | { kind: "password_set" }
  | { kind: "unusable" }
  | { kind: "rejected"; reason: PasswordRefusal }
  | { kind: "rate_limited" };

export type AcceptWithPasswordDeps = {
  lookup: InviteLookup;
  /** Deletes the link's row; true for exactly one caller (`kabinetInviteTokenRepo.consume`). */
  consume: (token: string, now: Date) => Promise<boolean>;
  /** PW1-F1-N1: the user's other reset links go once a password is written. Never throws. */
  voidResetLinks: (userId: string) => Promise<void>;
  /** The automatic accept (IN-Q12/IN-Q13), for the signed-in user. */
  accept: AcceptInvitation;
  perIp: RateLimiter;
  ip: string;
  credentials: InviteCredentials;
  now: Date;
};

/**
 * The form's POST. In this order, each step's reason given where the order matters:
 *
 * 1. **20 an hour per IP** (§4.3), charged on every POST before anything is read, whatever the
 *    token, so guessing tokens costs the guesser that budget and learns nothing.
 * 2. **The invitation, as the page reads it**: unusable is one answer.
 * 3. **The policy**, for the invitation's own address and shelter (§3, the same check as the
 *    reset and the change). A refused password leaves the link usable, as on a reset (PW1-D9).
 * 4. **The link is used up** (one delete): of two POSTs at once, exactly one goes on. Before
 *    the writes, not after them, so only the one POST that used the link writes anything.
 * 5. **The address is marked verified** (the link was delivered to it, the proof a magic link
 *    gives). Before the credential (review finding 4; Oleksii, 2026-10-21, verbatim excerpt:
 *    "Swap the two steps, so a crash between them can’t strand a shelter"): a failure after this
 *    step and before the next leaves no password, so a resend's link reads usable and finishes.
 *    The other way round, it left a password on an unverified address, which a resend reads as
 *    unusable and the automatic accept refuses.
 * 6. **The credential is written**, through Better Auth. Before the sign-in, never after
 *    (PW1-F5-N2): writing it ends every session of the user (migration 0013's trigger), so a
 *    session made first would be deleted at once. From here the address is verified and holds
 *    a password, so a failure later is finished by signing in with it: the automatic accept
 *    runs on that sign-in.
 * 7. **The user's other reset links are voided** (PW1-F1-N1), as after a reset or a change.
 * 8. **Better Auth signs the user in** with the password just set. Its own hooks run: PW1-F6's
 *    first read happens after step 6 has committed, so both reads see the same credential and
 *    the sign-in stands. If it doesn't go through, the password still stands: `password_set`.
 * 9. **The invitation is accepted** for the signed-in user, by the automatic accept that every
 *    sign-in runs (IN-Q12). If it fails, the person is still signed in and `/kabinet` retries it
 *    and says so (`selfHealingIdentity`), exactly as after a magic link.
 *
 * Not one transaction (neon-http has none): a failure after step 4 leaves the link used. Before
 * step 6 that costs a resend; from step 6 on, a sign-in with the new password. Never a password
 * on the wrong account: the address is always the invitation's, never the request's.
 */
export async function acceptInvitationWithPassword(
  input: { token: string; password: string },
  deps: AcceptWithPasswordDeps,
): Promise<AcceptWithPasswordResult> {
  if (!(await deps.perIp.check(ipRateLimitKey(deps.ip), deps.now))) return { kind: "rate_limited" };
  if (!INVITE_TOKEN.test(input.token)) return UNUSABLE;
  const state = invitePasswordStateOf(await deps.lookup(input.token), deps.now);
  if (state.kind === "unusable") return UNUSABLE;
  const verdict = shelterPasswordVerdictOf(input.password, {
    email: state.email,
    shelterName: state.shelterName,
  });
  if (verdict.kind !== "ok") return { kind: "rejected", reason: verdict.kind };
  if (!(await deps.consume(input.token, deps.now))) return UNUSABLE;
  await deps.credentials.markVerified(state.userId);
  await deps.credentials.createCredential(state.userId, input.password);
  await deps.voidResetLinks(state.userId);
  const signedIn = await deps.credentials.signIn(state.email, input.password);
  // The address is the invitation's, so the session is the invitee's; anything else is never
  // handed to the browser.
  if (signedIn.kind === "refused" || signedIn.userId !== state.userId) {
    return { kind: "password_set" };
  }
  await deps.accept(signedIn.userId);
  return { kind: "signed_in", setCookies: signedIn.setCookies };
}

/** Better Auth's password sign-in, as the auth route forwards it. */
const SIGN_IN_PATH = "/api/auth/sign-in/email";

/**
 * The Better Auth calls, on the real instance. The credential is Better Auth's own first-
 * password write (`internalAdapter.createAccount`, what a reset runs for an admin with no
 * password: `provider_id = 'credential'`, `account_id` the user's id, the hash from its own
 * hasher), so nothing here writes `auth_account` by hand. The sign-in is a server-built request
 * into `auth.handler`, as the confirm page's verify is: the visitor's IP headers come along
 * (`forwardedClientHeaders`), so the hooks charge the visitor's own budgets, and `Origin` is the
 * site's own (Better Auth checks it on a POST). Its body, which carries the session token, never
 * leaves the server: only the `Set-Cookie` values go back to the browser.
 */
export function inviteCredentialsOf(
  auth: Pick<KabinetAuth, "handler" | "$context">,
  baseURL: string,
  requestHeaders: Headers,
): InviteCredentials {
  return {
    async markVerified(userId) {
      const context = await auth.$context;
      await context.internalAdapter.updateUser(userId, { emailVerified: true });
    },
    async createCredential(userId, password) {
      const context = await auth.$context;
      await context.internalAdapter.createAccount({
        userId,
        providerId: "credential",
        accountId: userId,
        password: await context.password.hash(password),
      });
    },
    async signIn(email, password) {
      const url = new URL(SIGN_IN_PATH, baseURL);
      const headers = forwardedClientHeaders(requestHeaders);
      headers.set("content-type", "application/json");
      headers.set("origin", url.origin);
      const response = await auth.handler(
        new Request(url, { method: "POST", headers, body: JSON.stringify({ email, password }) }),
      );
      if (!response.ok) return { kind: "refused" };
      const body: unknown = await response.json().catch(() => null);
      const user =
        typeof body === "object" && body !== null ? (body as { user?: unknown }).user : undefined;
      const userId =
        typeof user === "object" && user !== null ? (user as { id?: unknown }).id : undefined;
      if (typeof userId !== "string") return { kind: "refused" };
      return { kind: "signed_in", userId, setCookies: response.headers.getSetCookie() };
    },
  };
}
