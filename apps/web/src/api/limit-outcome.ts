import type { RateLimiter } from "./rate-limit";

/** One charge's result. `unavailable`: the store timed out or failed, so nothing was decided. */
export type LimitOutcome = "allowed" | "refused" | "unavailable";

/** `limiter.attempt`, or `check` read as allowed or refused where a limiter has no store to lose. */
export async function attemptOf(
  limiter: RateLimiter,
  key: string,
  now: Date,
): Promise<LimitOutcome> {
  if (limiter.attempt !== undefined) return limiter.attempt(key, now);
  return (await limiter.check(key, now)) ? "allowed" : "refused";
}
