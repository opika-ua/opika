/**
 * One structured warning when a limiter cannot reach its store, at most once a minute per instance
 * so an outage cannot flood the logs (the per-request `console.error` in `rate-limit.ts` stays).
 * Carries the limiter's prefix and the failure kind only: no key, address or error text.
 */
export const UNREACHABLE_WARNING_INTERVAL_MS = 60_000;

export type UnreachableLine = {
  event: "rate_limiter_unreachable";
  limiter: string;
  reason: "timeout" | "error";
  suppressed: number;
};

export type UnreachableWarner = (
  limiter: string,
  reason: "timeout" | "error",
  nowMs?: number,
) => void;

export function unreachableWarner(
  // biome-ignore lint/suspicious/noConsole: the structured warning is the point of this module
  log: (line: UnreachableLine) => void = (line) => console.warn(line),
): UnreachableWarner {
  let lastAt: number | null = null;
  let suppressed = 0;
  return (limiter, reason, nowMs = Date.now()) => {
    if (lastAt !== null && nowMs - lastAt < UNREACHABLE_WARNING_INTERVAL_MS) {
      suppressed++;
      return;
    }
    log({ event: "rate_limiter_unreachable", limiter, reason, suppressed });
    lastAt = nowMs;
    suppressed = 0;
  };
}

export const warnLimiterUnreachable = unreachableWarner();
