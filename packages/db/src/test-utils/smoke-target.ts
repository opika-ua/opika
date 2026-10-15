/**
 * The guard every real-Neon smoke run goes through (`test/neon-smoke.ts`, and
 * the app's auth smoke, `apps/web/scripts/neon-auth-smoke.ts`): the target's
 * compute must be exactly `--expect`, and never production. Moved here from
 * `test/neon-smoke.ts` (unchanged) so both scripts share one guard.
 */

const computeOf = (host: string) =>
  (host.toLowerCase().split(".")[0] ?? "").replace(/-pooler$/, "");

export type SmokeTarget = { kind: "ok"; host: string } | { kind: "refused"; reason: string };

/** Pure, so it is tested without a network: the endpoint must match `--expect` and not be production. */
export function smokeTarget(
  url: string,
  expect: string | undefined,
  prodEndpoint: string | undefined,
): SmokeTarget {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { kind: "refused", reason: "DATABASE_URL does not parse (not printing it)" };
  }
  if (!host.toLowerCase().endsWith(".neon.tech"))
    return { kind: "refused", reason: "not a Neon host" };
  if (expect === undefined || !/^ep-[a-z0-9-]+$/.test(expect)) {
    return { kind: "refused", reason: "pass --expect ep-… (the rehearsal branch's endpoint id)" };
  }
  if (computeOf(host) !== expect) {
    return { kind: "refused", reason: `endpoint is ${computeOf(host)}, expected ${expect}` };
  }
  if (!prodEndpoint) {
    return {
      kind: "refused",
      reason:
        "PROD_NEON_ENDPOINT is unknown, so the target can't be shown not to be production " +
        "(a worktree has no .env.local: set it in the shell, the ep-… id only)",
    };
  }
  // Compared only once it is provably an endpoint id: a URL or a quoted value
  // here would never equal `expect` and let production through (review of
  // the scripts row, finding 1). Same rule as the production guard.
  const prod = computeOf(prodEndpoint.trim());
  if (!/^ep-[a-z0-9-]+$/.test(prod)) {
    return {
      kind: "refused",
      reason: "PROD_NEON_ENDPOINT is not an endpoint id (ep-…); not comparing",
    };
  }
  if (prod === expect) {
    return {
      kind: "refused",
      reason: "that is the production endpoint; this script never runs there",
    };
  }
  return { kind: "ok", host };
}
