import type { PeekableRateLimiter, RateLimiter } from "../api/rate-limit";

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
 * `shelter.cities.search` (owner, 2026-11-18): 60 a minute per signed-in person, on top of the
 * kabinet's 100. A picker types a few letters a second; this is room for that, not a scrape.
 */
export const CITY_SEARCH_RATE_LIMITS = { perUser: { windowMs: 60_000, maxRequests: 60 } } as const;

/** Per person, whoever is searching: the shelter's admin, or the operator in a support view. */
export const citySearchKey = (who: string) => `city-search:${who}`;

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
 * share one allowance. A photo upload spends it only once it lands, as a crop
 * does (owner, 2026-11-16): a refused file, a call naming another shelter's
 * animal or a run past the processing budget costs an upload attempt
 * (`PHOTO_UPLOAD_ATTEMPT_LIMITS`), not the allowance. `shelter.logo.set`
 * charges this same allowance up front (pet card PR 3b, a decision taken,
 * not a second pool); `shelter.logo.remove` isn't an upload and charges nothing.
 */
export const PHOTO_UPLOAD_RATE_LIMITS = {
  perHour: { windowMs: 60 * 60_000, maxRequests: 60 },
  perDay: { windowMs: 24 * 60 * 60_000, maxRequests: 300 },
} as const;

/**
 * Every upload and every crop attempt, landed or not, taken before its work and never given back
 * (owner: crops 2026-11-12, uploads 2026-11-16). A shelter's photo work is at most 90 upload
 * attempts + 30 crop attempts an hour (450 + 150 a day), whatever fails. A logo upload still spends
 * the shared allowance before its work, so logos add at most 60 an hour (300 a day) on top.
 */
export const PHOTO_UPLOAD_ATTEMPT_LIMITS = {
  perHour: { windowMs: 60 * 60_000, maxRequests: 90 },
  perDay: { windowMs: 24 * 60 * 60_000, maxRequests: 450 },
} as const;

export const PHOTO_CROP_ATTEMPT_LIMITS = {
  perHour: { windowMs: 60 * 60_000, maxRequests: 30 },
  perDay: { windowMs: 24 * 60 * 60_000, maxRequests: 150 },
} as const;

type AttemptLimiters = { perHour: RateLimiter; perDay: RateLimiter };

/** The allowance's limiters can be asked without spending: work checks first, charges on landing. */
export type PhotoUploadLimiters = {
  perHour: PeekableRateLimiter;
  perDay: PeekableRateLimiter;
  uploadAttempts: AttemptLimiters;
  cropAttempts: AttemptLimiters;
};

export const shelterUploadKey = (shelterId: string) => `shelter:${shelterId}`;
export const shelterUploadAttemptKey = (shelterId: string) => `shelter:${shelterId}:upload`;
export const shelterCropAttemptKey = (shelterId: string) => `shelter:${shelterId}:crop`;
