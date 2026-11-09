/**
 * Healthchecks.io check-in for a cron: one plain `fetch`, no SDK. The URL is the check's ping URL
 * from an env var (unset or blank: nothing happens); `<url>/fail` reports a failed run. It must
 * never change a cron's outcome, so it is short, swallows every error, and logs nothing: the URL
 * carries the check's secret slug.
 */
export const HEALTHCHECK_TIMEOUT_MS = 3_000;

export type CronOutcome = "ok" | "fail";

export async function pingHealthcheck(
  url: string | undefined,
  outcome: CronOutcome,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const base = url?.trim().replace(/\/+$/, "");
  if (!base) return;
  try {
    const response = await fetchImpl(outcome === "ok" ? base : `${base}/fail`, {
      method: "GET",
      signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
    });
    // Free the connection; the body is "OK" and unused.
    await response.body?.cancel();
  } catch {
    // Deliberately silent: a check-in problem is Healthchecks' to alert on (a missed ping).
  }
}
