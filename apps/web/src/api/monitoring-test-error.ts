import { createHash, timingSafeEqual } from "node:crypto";
import type { RateLimiter } from "./rate-limit";
import { retryAfterSecondsOf } from "./retry-after";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Fixed on purpose: nothing from the request (header, body, query, URL, address) goes into it. */
export const TEST_ERROR_MESSAGE =
  "Sentry test error: thrown on purpose by POST /api/monitoring/test";

export type TestErrorDeps = {
  cronSecret: string | undefined;
  dsn: string | undefined;
  /** HMAC'd address key (`ipRateLimitKey`), computed by the caller. */
  ipKey: string;
  limiter: RateLimiter;
  now: Date;
};

/**
 * Throws only for the exact bearer secret; every other caller sees a plain 404. The per-IP limit
 * comes first, so guessing the secret is limited too. The comparison is over SHA-256 digests in
 * constant time, and an unset or empty secret refuses everyone.
 */
export async function handleMonitoringTestError(
  request: Request,
  deps: TestErrorDeps,
): Promise<Response> {
  if (!(await deps.limiter.check(deps.ipKey, deps.now))) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(retryAfterSecondsOf(deps.limiter, deps.ipKey, deps.now)) },
    });
  }
  const header = request.headers.get("authorization");
  const secret = deps.cronSecret;
  const allowed =
    !!deps.dsn?.trim() &&
    secret !== undefined &&
    secret !== "" &&
    header !== null &&
    timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
  if (!allowed) return new Response("Not Found", { status: 404 });
  throw new Error(TEST_ERROR_MESSAGE);
}
