import type { RateLimiter } from "./rate-limit";

/** What `Retry-After` says when a limiter can't tell: the length of the per-IP window (60 s). */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** Seconds until `key` may try again, from the limiter's own state; never below 1. */
export function retryAfterSecondsOf(limiter: RateLimiter, key: string, now: Date): number {
  const seconds = limiter.retryAfterSeconds?.(key, now);
  return seconds === undefined ? DEFAULT_RETRY_AFTER_SECONDS : Math.max(1, Math.ceil(seconds));
}
