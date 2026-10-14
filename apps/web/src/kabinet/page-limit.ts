import { SIGN_IN_LINK } from "./email-links";
import { type KabinetLimiters, kabinetIpKey, kabinetUserKey } from "./rate-limits";

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
 */
export async function kabinetPageLoadAllowed(
  limiters: KabinetLimiters,
  request: { ip: string; userId: () => Promise<string | null> },
  now: Date,
): Promise<boolean> {
  if (!(await limiters.perIp.check(kabinetIpKey(request.ip), now))) return false;
  const userId = await request.userId();
  if (userId === null) return true;
  return limiters.perUser.check(kabinetUserKey(userId), now);
}
