import type { InviteLandingRow } from "@opika/db/repos";
import { addressRateLimitKey, ipRateLimitKey } from "../api/rate-limit-key";
import type { KabinetAuth } from "./auth";
import { isSameOriginPost } from "./confirm-route";
import { maskAddress } from "./email-senders";
import { forwardedClientHeaders } from "./forwarded-client-headers";
import { normalizeEmail, type SignInLimiters } from "./sign-in-limit";

/**
 * The invite landing, `/kabinet/vkhid?zaproshennia=<id>`. Its look is KS-Q2
 * A: K1's card, about the invitation, the address fixed rather than a field.
 *
 * **Only a POST sends (EM-Q3, Oleksii 2026-10-14, verbatim: "(b). The invite
 * landing shows one «Надіслати посилання» button; only its POST sends. A GET
 * sends nothing. Test: a GET doesn't consume the per-address send budget.").**
 * This replaces IN-Q11's "opening it sends" for the landing: mail scanners
 * open every link (Brevo rewrites them all), and each scanner GET used to
 * send an email and spend one of the address's five an hour, so the
 * volunteer's own open could read `rate_limited`. The GET now renders one
 * button and touches nothing: no lookup, no budget, no send
 * (`app/kabinet/vkhid/page.tsx`, whose imports a test pins). Everything below
 * runs on the button's POST, behind the confirm page's same-origin check
 * (`isSameOriginPost`), the page carrying the same `strict-origin` Referrer-
 * Policy so the browser sends a real Origin and never the id in a Referer.
 *
 * Why the GET doesn't look the invitation up: a lookup on GET would tell
 * anyone holding an id (a scanner, a forwarded email, a guess) whether it is
 * live, and naming the shelter on GET would need it. It costs one thing:
 * an expired or accepted invitation is only said so after the tap.
 *
 * What the POST tells whom. Holding a live invitation id means having
 * received the invite email, so the answer may name the shelter and the
 * address (masked) (copy sheet L). Everything else reads alike:
 *
 * - an id nobody issued, a malformed one, an expired, withdrawn or rejected
 *   invitation: one `unusable` state, so the answer never says which;
 * - the per-IP sign-in budget is charged before the lookup, on every POST,
 *   valid id or not, and running it out reads the same either way: guessing
 *   ids costs the guesser the same budget a sign-in attempt does, and learns
 *   nothing from the answer;
 * - only a live invitation charges its address's budget, the same
 *   `addressRateLimitKey` K1's form charges (an HMAC of the address, §9
 *   answer 7), so the landing and the form share HS-Q5's five links an hour.
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
  if (!(await deps.limiters.perIp.check(ipRateLimitKey(deps.ip), deps.now))) {
    return { kind: "rate_limited" };
  }
  if (!INVITATION_ID.test(invitationId)) return { kind: "unusable" };
  const row = await deps.lookup(invitationId.toLowerCase());
  if (row === null || row.status === "other") return { kind: "unusable" };
  if (row.status === "accepted") return { kind: "already_accepted" };
  if (row.expiresAt.getTime() <= deps.now.getTime()) return { kind: "unusable" };
  const email = normalizeEmail(row.email);
  if (!(await deps.limiters.perAddress.check(addressRateLimitKey(email), deps.now))) {
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
 * The button's POST (EM-Q3). A cross-site post is `forbidden` before
 * anything is read or charged; the rest is `inviteLandingOf`. A missing or
 * repeated id field is read as an unusable id, so it still costs the per-IP
 * budget like any other guess.
 */
export async function submitInviteLanding(
  submitted: { origin: string | null; invitationId: unknown },
  deps: InviteLandingDeps & { baseURL: string },
): Promise<InviteLanding | { kind: "forbidden" }> {
  if (!isSameOriginPost(submitted.origin, deps.baseURL)) return { kind: "forbidden" };
  const invitationId = typeof submitted.invitationId === "string" ? submitted.invitationId : "";
  return inviteLandingOf(invitationId, deps);
}

/**
 * Better Auth's magic-link request for `email`, made server-side. `Origin` is
 * the site's own (Better Auth checks it on a POST); no `callbackURL`, since
 * the emailed link is the confirm page and sign-in always lands on
 * `/kabinet` (`docs/h2-invite-confirm-shapes.md` §1). The visitor's headers
 * come along (`forwardedClientHeaders`, the confirm page's helper), though
 * nothing on this path reads them today: Better Auth runs no limit of its
 * own (`disableIpTracking`, KH-Q6), `hooks.before` doesn't charge
 * `sign-in/magic-link`, and the request writes a verification row, no
 * session. The landing's limits are `inviteLandingOf`'s, on `signInLimiters`.
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
