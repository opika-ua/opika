import {
  ambientConnectionSettings,
  ambientSettingsText,
  computeOf,
  databaseTargetOf,
  HOST_AMBIGUITY_TEXT,
} from "../prod-guard";

/**
 * The guard every real-Neon smoke run goes through (`test/neon-smoke.ts`, and
 * the app's auth smoke, `apps/web/scripts/neon-auth-smoke.ts`): the target's
 * compute must be exactly `--expect`, and never production. Moved here from
 * `test/neon-smoke.ts` so both scripts share one guard; it reads the host
 * through the production guard's `databaseTargetOf` (2026-10-19).
 */

export type SmokeTarget = { kind: "ok"; host: string } | { kind: "refused"; reason: string };

/** Pure, so it is tested without a network: the endpoint must match `--expect` and not be production. */
export function smokeTarget(
  url: string,
  expect: string | undefined,
  prodEndpoint: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): SmokeTarget {
  // A smoke writes test data, so the production guard's rule holds here too: a
  // setting the driver reads alongside the URL (PGPASSWORD naming production's
  // endpoint) would route a rehearsal-host connection to production (PG-T10).
  const ambient = ambientConnectionSettings(env);
  if (ambient.length > 0) {
    return { kind: "refused", reason: `${ambientSettingsText(ambient)} (not printing any value)` };
  }
  // The production guard's reading, so the host compared below is the one the
  // driver connects to (a `#`, a second `@` or a host list could put production
  // behind a rehearsal host; Oleksii, 2026-10-19).
  const target = databaseTargetOf(url);
  if (target.kind === "unparseable") {
    return { kind: "refused", reason: "DATABASE_URL does not parse (not printing it)" };
  }
  if (target.kind === "ambiguous_host") {
    return {
      kind: "refused",
      reason: `DATABASE_URL can't be read as exactly one host: ${HOST_AMBIGUITY_TEXT[target.cause]} (not printing it)`,
    };
  }
  if (target.kind !== "neon") return { kind: "refused", reason: "not a Neon host" };
  const { host } = target;
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
