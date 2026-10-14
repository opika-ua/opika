import type { RateLimiter } from "../api/rate-limit";

/**
 * HS-Q10 (Oleksii): the kabinet's own limits, on the shared Upstash store but
 * never the adopter budget (carrier NAT puts unrelated shelters and adopters
 * behind one IP). 100 a minute per signed-in user; 300 a minute per IP as a
 * backstop for everything under `/api/kabinet/*`, signed in or not, and,
 * since KH-Q8, every `/kabinet` page load too (`page-limit.ts`).
 *
 * Since the hardening review, also every `/api/auth/*` call to
 * `magic-link/verify`, `get-session` and `sign-out` (KH-Q6 follow-up,
 * `auth.ts`'s `hooks.before`).
 *
 * Numbers and keys only, in their own module: `kabinet/limiters.ts` builds
 * the instances from them, and neither imports the router or Better Auth,
 * so `proxy.ts` can charge a page load without loading either. (The earlier
 * comment said the split kept the router out of the proxy, which was true,
 * while the proxy still imported `kabinet/runtime` and with it Better Auth
 * on every route: review of the hardening, finding 3.)
 */
export const KABINET_RATE_LIMITS = {
  perUser: { windowMs: 60_000, maxRequests: 100 },
  perIp: { windowMs: 60_000, maxRequests: 300 },
} as const;

export type KabinetLimiters = { perUser: RateLimiter; perIp: RateLimiter };

/**
 * The limiter keys, shared by the API and the page loads, so a page load and
 * an API call draw on the same allowance.
 */
export const kabinetIpKey = (ip: string) => `ip:${ip}`;
export const kabinetUserKey = (userId: string) => `user:${userId}`;
