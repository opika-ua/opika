import type { InviteLandingRow } from "@opika/db/repos";
import type { KabinetAuth } from "./auth";
import { maskAddress } from "./email-senders";
import { forwardedClientHeaders } from "./forwarded-client-headers";
import { normalizeEmail, type SignInLimiters } from "./sign-in-limit";

/**
 * The invite landing, `/kabinet/vkhid?zaproshennia=<id>` (IN-Q11, Oleksii,
 * verbatim: "The invite email links to the invite page. Opening it sends a
 * fresh magic link to the invited address only, and changes nothing else.
 * It's GET-safe, because the only side effect is an email to the address
 * already on the invitation. Rate-limit it with the existing per-address
 * limits."). Its look is KS-Q2 A: K1's card, about the invitation, the
 * address fixed rather than a field, then «check your email».
 *
 * What it tells whom. Holding a live invitation id means having received the
 * invite email, so the page may name the shelter and the address (masked) to
 * whoever opens it (copy sheet L). Everything else reads alike:
 *
 * - an id nobody issued, a malformed one, an expired, withdrawn or rejected
 *   invitation: one `unusable` state, so the page never says which;
 * - the per-IP sign-in budget is charged before the lookup, on every open,
 *   valid id or not, and running it out reads the same either way: guessing
 *   ids costs the guesser the same budget a sign-in attempt does, and learns
 *   nothing from the answer;
 * - only a live invitation charges its address's budget, the same
 *   `address:` key K1's form charges, so the landing and the form share
 *   HS-Q5's five links an hour.
 *
 * The magic link goes through Better Auth's own `sign-in/magic-link`, by a
 * server-built request into `auth.handler` (the entry the auth route
 * forwards to; no server API beyond `getSession`, so no-self-serve-yet's scan
 * is unchanged), to the address on the invitation and never one from the
 * request.
 */
export type InviteLanding =
  | { kind: "sent"; shelterName: string; maskedEmail: string }
  | { kind: "send_failed"; shelterName: string }
  | { kind: "already_accepted" }
  | { kind: "rate_limited" }
  | { kind: "unusable" };

/** Better Auth's magic-link request, one of FORWARDED_AUTH_PATHS (a test pins that it still is). */
export const MAGIC_LINK_REQUEST_PATH = "/api/auth/sign-in/magic-link";

/** Invitation ids are UUIDs (`crypto.randomUUID`, RG-Q3); anything else is never looked up. */
const INVITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InviteLandingDeps = {
  lookup: (invitationId: string) => Promise<InviteLandingRow | null>;
  limiters: SignInLimiters;
  ip: string;
  now: Date;
  /** Asks Better Auth to send a magic link to `email`; true when it accepted the request. */
  sendMagicLink: (email: string) => Promise<boolean>;
};

export async function inviteLandingOf(
  invitationId: string,
  deps: InviteLandingDeps,
): Promise<InviteLanding> {
  if (!(await deps.limiters.perIp.check(`ip:${deps.ip}`, deps.now))) {
    return { kind: "rate_limited" };
  }
  if (!INVITATION_ID.test(invitationId)) return { kind: "unusable" };
  const row = await deps.lookup(invitationId.toLowerCase());
  if (row === null || row.status === "other") return { kind: "unusable" };
  if (row.status === "accepted") return { kind: "already_accepted" };
  if (row.expiresAt.getTime() <= deps.now.getTime()) return { kind: "unusable" };
  const email = normalizeEmail(row.email);
  if (!(await deps.limiters.perAddress.check(`address:${email}`, deps.now))) {
    return { kind: "rate_limited" };
  }
  let accepted: boolean;
  try {
    accepted = await deps.sendMagicLink(email);
  } catch {
    accepted = false;
  }
  return accepted
    ? { kind: "sent", shelterName: row.shelterName, maskedEmail: maskAddress(email) }
    : { kind: "send_failed", shelterName: row.shelterName };
}

/**
 * Better Auth's magic-link request for `email`, made server-side. `Origin` is
 * the site's own (Better Auth checks it on a POST); no `callbackURL`, since
 * the emailed link is the confirm page and sign-in always lands on
 * `/kabinet` (`docs/h2-invite-confirm-shapes.md` §1). The visitor's client-IP
 * headers come along (`forwardedClientHeaders`), so Better Auth's own limit
 * on this path counts each visitor, not every landing open in the instance
 * as one.
 */
export async function sendMagicLinkThroughAuth(
  auth: Pick<KabinetAuth, "handler">,
  baseURL: string,
  email: string,
  requestHeaders: Headers,
): Promise<boolean> {
  const url = new URL(MAGIC_LINK_REQUEST_PATH, baseURL);
  const headers = forwardedClientHeaders(requestHeaders);
  headers.set("content-type", "application/json");
  headers.set("origin", url.origin);
  const response = await auth.handler(
    new Request(url, { method: "POST", headers, body: JSON.stringify({ email }) }),
  );
  return response.ok;
}
