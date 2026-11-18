import { inMemoryRateLimiter, type RateLimiter } from "../api/rate-limit";

/**
 * For tests that drive `handleKabinetRpc`: `shelter.cities.search`'s limiter, required by the
 * route, with room no test reaches unless it means to.
 */
export const roomyCitySearch = (): RateLimiter =>
  inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 });
