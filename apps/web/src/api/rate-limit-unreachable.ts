/**
 * One structured warning when a limiter cannot reach its store, at most once a minute per instance
 * so an outage cannot flood the logs (the per-request `console.error` in `rate-limit.ts` stays).
 * Carries the limiter's prefix and the failure kind only: no key, address or error text.
 * The same throttled line also goes to Sentry as «rate limiter unreachable» (owner, 2026-11-20).
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

export const SENTRY_UNREACHABLE_MESSAGE = "rate limiter unreachable";

let sentrySequence = 0;

/**
 * A warning-level Sentry message tagged with the limiter's prefix and the outcome, nothing else.
 * The SDK loads only when a DSN is set, as in `instrumentation.ts`; a failed send is dropped.
 * The SDK's Dedupe drops an event identical to the one before (same message and stack), so a new
 * fingerprint each time lets the next minute's event through; the scrubber never sends it.
 */
export function reportUnreachableToSentry(line: UnreachableLine): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return Promise.resolve();
  sentrySequence += 1;
  const fingerprint = [SENTRY_UNREACHABLE_MESSAGE, String(sentrySequence)];
  return import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureMessage(SENTRY_UNREACHABLE_MESSAGE, {
        level: "warning",
        tags: { limiter: line.limiter, outcome: line.reason },
        fingerprint,
      });
    })
    .catch(() => undefined);
}

export function unreachableWarner(
  // biome-ignore lint/suspicious/noConsole: the structured warning is the point of this module
  log: (line: UnreachableLine) => void = (line) => console.warn(line),
  report: (line: UnreachableLine) => unknown = reportUnreachableToSentry,
): UnreachableWarner {
  let lastAt: number | null = null;
  let suppressed = 0;
  return (limiter, reason, nowMs = Date.now()) => {
    if (lastAt !== null && nowMs - lastAt < UNREACHABLE_WARNING_INTERVAL_MS) {
      suppressed++;
      return;
    }
    const line: UnreachableLine = {
      event: "rate_limiter_unreachable",
      limiter,
      reason,
      suppressed,
    };
    log(line);
    report(line);
    lastAt = nowMs;
    suppressed = 0;
  };
}

export const warnLimiterUnreachable = unreachableWarner();
