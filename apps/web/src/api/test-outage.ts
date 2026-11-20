import type { Redis } from "@upstash/redis";
import { type OnUnavailable, type PeekableRateLimiter, upstashRateLimiter } from "./rate-limit";

/** A rejection the library may leave unawaited, marked handled so it isn't an unhandled one. */
const refused = (): Promise<never> => {
  const rejection = Promise.reject(new Error("ECONNREFUSED unreachable.invalid"));
  rejection.catch(() => undefined);
  return rejection;
};

/** Tests only: a Redis client every command of which fails, as Upstash does in an outage. */
export const unreachableRedis = (): Redis => new Proxy({}, { get: () => refused }) as Redis;

/** Tests only: the real Upstash-backed limiter, on a store that can't be reached. */
export const unreachableLimiter = (onUnavailable: OnUnavailable): PeekableRateLimiter =>
  upstashRateLimiter({
    redis: unreachableRedis(),
    windowMs: 60_000,
    maxRequests: 300,
    prefix: "test-outage",
    onUnavailable,
  });
