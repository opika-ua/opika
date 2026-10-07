/**
 * The one check every script that writes to a database runs before it
 * connects: `db:migrate`, `db:seed`, `onboard:shelter`.
 *
 * Production is identified by `PROD_NEON_DATABASE_URL` (a gitignored local
 * env file, never committed). A write aimed at production needs an explicit
 * `--prod` on the command line. Habit can't supply it the way it supplies
 * `--force`, and the person typing it has said, in so many words, which
 * database they mean.
 *
 * Compared by Neon compute endpoint, not only by hostname. One compute
 * answers on two hostnames (`ep-xxx` and `ep-xxx-pooler`), so a hostname
 * comparison alone lets production through under its other name.
 *
 * Fails closed. With `PROD_NEON_DATABASE_URL` unset, nothing can be proven
 * *not* production, so every non-local target is refused without `--prod`.
 * A missing env var must never read as permission.
 *
 * Why it exists (2026-10-07): a URL supplied for a "check" turned out to be
 * production, the project's only Neon branch, and was briefly described as a
 * non-production branch. Writes there are currently allowed (test data only,
 * Oleksii's standing OK), which is exactly why the line has to be explicit:
 * an allowance for test data must not carry over silently to the day real
 * shelters exist.
 */

export const PROD_DATABASE_URL_ENV = "PROD_NEON_DATABASE_URL";
export const PROD_FLAG = "--prod";

export type ProductionWriteCheck =
  | { kind: "allowed"; reason: "local" | "not_production" | "production_flagged" }
  | {
      kind: "refused";
      reason: "production_without_flag" | "production_unknown" | "unparseable";
    };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const parseOrNull = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/** `ep-quiet-lake-a1b2c3-pooler.eu-…` and `ep-quiet-lake-a1b2c3.eu-…` are one compute. */
const computeOf = (hostname: string): string =>
  (hostname.toLowerCase().split(".")[0] ?? "").replace(/-pooler$/, "");

export function checkProductionWrite(
  targetUrl: string,
  argv: readonly string[],
  prodUrl: string | undefined,
): ProductionWriteCheck {
  // A URL that won't parse is refused, never thrown on: Node's uncaught-error
  // dump prints the input, password included.
  const target = parseOrNull(targetUrl);
  if (target === null) return { kind: "refused", reason: "unparseable" };
  // Exact hostname match, never a substring test: a URL merely *containing*
  // "localhost" (in a password, a query string) must not pass as local.
  if (LOCAL_HOSTS.has(target.hostname.toLowerCase().replace(/^\[|\]$/g, ""))) {
    return { kind: "allowed", reason: "local" };
  }

  const flagged = argv.includes(PROD_FLAG);
  if (!prodUrl) {
    return flagged
      ? { kind: "allowed", reason: "production_flagged" }
      : { kind: "refused", reason: "production_unknown" };
  }

  const prod = parseOrNull(prodUrl);
  if (prod === null) return { kind: "refused", reason: "unparseable" };
  // Equal hostnames always give equal compute ids, so this one test covers both.
  const isProduction = computeOf(target.hostname) === computeOf(prod.hostname);
  if (!isProduction) return { kind: "allowed", reason: "not_production" };
  return flagged
    ? { kind: "allowed", reason: "production_flagged" }
    : { kind: "refused", reason: "production_without_flag" };
}

/** For CLIs: prints why and exits non-zero on refusal. Never prints a URL. */
export function assertProductionWriteAllowed(
  targetUrl: string,
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const check = checkProductionWrite(targetUrl, argv, env[PROD_DATABASE_URL_ENV]);
  if (check.kind === "allowed") {
    if (check.reason === "production_flagged") {
      console.error(`WARNING: writing to PRODUCTION (${PROD_FLAG} given).`);
    }
    return;
  }
  const messages: Record<typeof check.reason, string> = {
    production_without_flag:
      `ERROR: this target is PRODUCTION (same Neon compute as ${PROD_DATABASE_URL_ENV}). ` +
      `Pass ${PROD_FLAG} if that is really what you mean.`,
    production_unknown:
      `ERROR: ${PROD_DATABASE_URL_ENV} is not set, so this non-local target can't be ` +
      `shown not to be production. Set it, or pass ${PROD_FLAG} if you mean production.`,
    unparseable: "ERROR: a database URL could not be parsed. Refusing (not printing it).",
  };
  console.error(messages[check.reason]);
  process.exit(1);
}
