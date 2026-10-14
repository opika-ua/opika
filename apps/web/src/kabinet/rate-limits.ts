import type { RateLimiter } from "../api/rate-limit";

/**
 * HS-Q10 (Oleksii): the kabinet's own limits, on the shared Upstash store but
 * never the adopter budget (carrier NAT puts unrelated shelters and adopters
 * behind one IP). 100 a minute per signed-in user; 300 a minute per IP as a
 * backstop for everything under `/api/kabinet/*`, signed in or not, and,
 * since KH-Q8, every `/kabinet` page load too (`page-limit.ts`).
 *
 * Its own module, not `rpc-route.ts`, so `proxy.ts` can reach the limiters
 * without importing the whole kabinet router.
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
