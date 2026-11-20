import { attemptOf } from "../api/limit-outcome";
import type { RateLimiter } from "../api/rate-limit";
import { ipRateLimitKey } from "../api/rate-limit-key";
import { INVITE_LINK, RESET_LINK, SIGN_IN_LINK } from "./email-links";
import { type KabinetLimiters, kabinetUserKey } from "./rate-limits";

/**
 * Every `/kabinet` page: `/kabinet`, `/kabinet/vkhid` and any page added
 * under it later. Not `/api/kabinet/*`, which `handleKabinetRpc` already
 * charges against the same limiters; counting it here too would charge an
 * API call twice.
 */
export const isKabinetPagePath = (pathname: string): boolean =>
  pathname === "/kabinet" || pathname.startsWith("/kabinet/");

/**
 * A `/kabinet` request the proxy charges as a page load. Every one of them
 * except the sign-in confirm page's POST: that POST runs Better Auth's
 * verify server-side, through `auth.handler` with a request, and `auth.ts`'s
 * `hooks.before` already charges that call against these same limiters, per
 * IP only: `forwardedClientHeaders` passes no cookie, so the inner request
 * never names a session and the per-user check can't run for it
 * (`LIMITED_AUTH_PATHS`; review of the #95 merge, finding 1). Charging the POST here too
 * would bill one sign-in twice on one budget (merge of #95 into the invite
 * PR). A POST the confirm route refuses before the verify (wrong Origin, no
 * token-shaped value) is charged nowhere; it reads no database and builds no
 * Better Auth call. The confirm page's GET renders a button only and stays
 * charged here like any other page load.
 */
export const isChargedKabinetPageLoad = (method: string, pathname: string): boolean =>
  isKabinetPagePath(pathname) && !(method === "POST" && pathname === SIGN_IN_LINK.path);

/**
 * Whether a `/kabinet` page load may go through (KS-Q3, answered as KH-Q8:
 * "reuse the existing kabinet limiters").
 *
 * The pages call the router in-process, so `rpc-route.ts`'s HS-Q10 limits
 * never saw them, while each load runs getSession, a role lookup, the support
 * check and the shelter read. This charges a load against the same budgets,
 * keyed exactly as the API keys them, in the API's order: per IP first,
 * before any query, then per signed-in user. A page load and an API call
 * therefore share one allowance.
 *
 * `kabinetLimiters`, not `signInLimiters`: those budget magic-link *sends*
 * (5 an hour per address, 20 per IP, HS-Q5). A page load is a read like an
 * API call; charging it there would let someone refreshing the sign-in page
 * use up the budget that lets them ask for a link.
 *
 * `userId` is resolved only once the IP is within its budget, so a caller
 * over it costs no session read.
 *
 * With the store unreachable (owner, 2026-11-20) the load goes through for a
 * session `userId` validates (signed-in use fails open) and for a plain GET of
 * the sign-in pages (`OUTAGE_OPEN_PAGES`), whose every action stays refused;
 * any other anonymous load is refused. `perUser` fails open itself.
 */
export async function kabinetPageLoadAllowed(
  limiters: KabinetLimiters,
  request: { ip: string; userId: () => Promise<string | null>; page?: PageRequest },
  now: Date,
): Promise<boolean> {
  return (await kabinetPageLoadVerdict(limiters, request, now)).kind === "allowed";
}

/** A page request as the outage rule reads it: the method, the path and whether it has a query. */
export type PageRequest = { method: string; pathname: string; searchParams: URLSearchParams };

export type PageLoadVerdict =
  | { kind: "allowed" }
  /** `limiter` and `key` are the refusal's, for `Retry-After`. */
  | { kind: "refused"; limiter: RateLimiter; key: string };

/**
 * The sign-in, «Забули пароль?» and new-password pages (owner, 2026-11-20): with the store
 * unreachable a GET of them loads, so a person sees the form and its honest error, not a refusal.
 * Each reads at most the session, and that only from a signed session cookie (Better Auth checks
 * the HMAC before any query), so an anonymous GET costs no database read. The invite landing
 * (`/kabinet/vkhid?zaproshennia=`, the same page) reads the invitation by its token on every GET,
 * so it is not included: in an outage it gets the 429 page.
 */
export const OUTAGE_OPEN_PAGES: ReadonlySet<string> = new Set([
  "/kabinet/vkhid",
  "/kabinet/vkhid/zabuly",
  RESET_LINK.path,
]);

const opensInOutage = (page: PageRequest | undefined): boolean =>
  page !== undefined &&
  (page.method === "GET" || page.method === "HEAD") &&
  OUTAGE_OPEN_PAGES.has(page.pathname) &&
  !page.searchParams.has(INVITE_LINK.param);

/** `kabinetPageLoadAllowed`, with the limiter that refused, for the 429's `Retry-After`. */
export async function kabinetPageLoadVerdict(
  limiters: KabinetLimiters,
  request: { ip: string; userId: () => Promise<string | null>; page?: PageRequest },
  now: Date,
): Promise<PageLoadVerdict> {
  const ipKey = ipRateLimitKey(request.ip);
  const ip = await attemptOf(limiters.perIp, ipKey, now);
  if (ip === "refused") return { kind: "refused", limiter: limiters.perIp, key: ipKey };
  // Before the session read: the page reads it itself, so an outage GET costs no second read.
  if (ip === "unavailable" && opensInOutage(request.page)) return { kind: "allowed" };
  const userId = await request.userId();
  if (userId === null) {
    return ip === "allowed"
      ? { kind: "allowed" }
      : { kind: "refused", limiter: limiters.perIp, key: ipKey };
  }
  const userKey = kabinetUserKey(userId);
  return (await limiters.perUser.check(userKey, now))
    ? { kind: "allowed" }
    : { kind: "refused", limiter: limiters.perUser, key: userKey };
}
