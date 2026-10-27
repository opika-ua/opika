import type { RateLimiter } from "../api/rate-limit";

/**
 * HS-Q10 (Oleksii): the kabinet's own limits, on the shared Upstash store but
 * never the adopter budget (carrier NAT puts unrelated shelters and adopters
 * behind one IP). 100 a minute per signed-in user; 300 a minute per IP as a
 * backstop for everything under `/api/kabinet/*`, signed in or not, and,
 * since KH-Q8, every `/kabinet` page load too (`page-limit.ts`).
 *
 * Since the hardening review, also every HTTP call into Better Auth for
 * `magic-link/verify` (since IN-Q11 reached only through the confirm page's
 * POST), `get-session` and `sign-out` (KH-Q6 follow-up, `auth.ts`'s
 * `hooks.before`).
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
 * The per-user key, shared by the API and the page loads, so a page load and
 * an API call draw on the same allowance. The per-IP key is
 * `ipRateLimitKey` (`api/rate-limit-key.ts`), the one every limiter uses:
 * an HMAC of the address, never the address (EM-Q11).
 */
export const kabinetUserKey = (userId: string) => `user:${userId}`;

/**
 * P-Q12 (K-Q2: "per-shelter upload rate limit"): 60 uploads an hour and 300 a
 * day per shelter, on the shared store in production like every kabinet
 * limit. Keyed by the shelter, not the user, so two admins of one shelter
 * share one allowance, and charged on every `shelter.photos.add` that passed
 * the write policy, before ownership (P-T4) and before the file is sniffed or
 * decoded: a refused file still cost the server the work of reading it, and a
 * call naming another shelter's animal spends a unit too. Since pet card
 * PR 3b, `shelter.logo.set` charges this same allowance too (a decision
 * taken, not a second pool); `shelter.logo.remove` isn't an upload and
 * charges nothing.
 */
export const PHOTO_UPLOAD_RATE_LIMITS = {
  perHour: { windowMs: 60 * 60_000, maxRequests: 60 },
  perDay: { windowMs: 24 * 60 * 60_000, maxRequests: 300 },
} as const;

export type PhotoUploadLimiters = { perHour: RateLimiter; perDay: RateLimiter };

export const shelterUploadKey = (shelterId: string) => `shelter:${shelterId}`;
