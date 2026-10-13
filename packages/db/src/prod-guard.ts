import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/**
 * The one check every script that writes to a database runs before it
 * connects: `db:migrate`, `db:seed`, `onboard:shelter`.
 *
 * Production is identified by its Neon **compute endpoint id**
 * (`PROD_NEON_ENDPOINT=ep-…`), never by a connection string. The id is all the
 * guard needs, and it carries no password, so `.env.example`'s rule ("never put
 * the production connection string in any .env file") still holds (PG-1 → A,
 * Oleksii, 2026-10-07).
 *
 * A write aimed at production needs an explicit `--prod` on the command line.
 * Habit can't supply it the way it supplies `--force`, and the person typing
 * it has said, in so many words, which database they mean.
 *
 * Compared by compute, not hostname: one compute answers on two hostnames
 * (`ep-xxx` and `ep-xxx-pooler`), and a hostname comparison alone lets
 * production through under its other name.
 *
 * Fails closed. With no production endpoint known, nothing can be proven
 * *not* production, so every non-local target is refused without `--prod`.
 * A missing setting must never read as permission.
 *
 * Why it exists (2026-10-07): a URL supplied for a "check" turned out to be
 * production, the project's only Neon branch, and was briefly described as a
 * non-production branch. Writes there are currently allowed (test data only,
 * Oleksii's standing OK), which is exactly why the line has to be explicit:
 * an allowance for test data must not carry over silently to the day real
 * shelters exist.
 */

export const PROD_ENDPOINT_ENV = "PROD_NEON_ENDPOINT";
export const PROD_FLAG = "--prod";
/** Tests point this at a file that doesn't exist, so the developer's real `.env.local` never leaks in. */
export const PROD_GUARD_ENV_FILE_ENV = "PROD_GUARD_ENV_FILE";

export type ProductionWriteCheck =
  | { kind: "allowed"; reason: "local" | "not_production" | "production_flagged" }
  | {
      kind: "refused";
      reason:
        | "production_without_flag"
        | "production_unknown"
        | "unparseable"
        | "ambiguous_host"
        | "misconfigured";
    };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const ENDPOINT_ID = /^ep-[a-z0-9-]+$/;

const parseOrNull = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/** `ep-quiet-lake-a1b2c3-pooler.eu-…`, `ep-quiet-lake-a1b2c3.eu-…` and `ep-quiet-lake-a1b2c3` are one compute. */
const computeOf = (hostOrId: string): string =>
  (hostOrId.toLowerCase().split(".")[0] ?? "").replace(/-pooler$/, "");

/**
 * Which database a script is about to touch, reduced to what can be printed.
 *
 * Why it exists (Oleksii, 2026-10-13): `db:check-hashes` and `db:migrate`
 * printed their results with nothing saying where they came from, so a pasted
 * "every hash matches" proved nothing about which branch it was run against.
 * The line printed first is that proof.
 *
 * Built from named fields of the parsed URL, never by redacting the string:
 * a redaction regex has to anticipate every place a secret can sit (password,
 * user, `?password=`, `?options=`), whereas a field that is never copied
 * can't leak. No user, no password, no query string, in any variant.
 */
export type DatabaseTarget =
  | { kind: "neon"; endpoint: string; host: string }
  | { kind: "local"; host: string; port: string; database: string }
  | { kind: "remote"; host: string }
  | { kind: "ambiguous_host" }
  | { kind: "unparseable" };

/**
 * The same suffix test as `client.ts`'s `isNeonHost`, which picks the driver,
 * applied after the trailing dot is stripped (a fully qualified
 * `x.neon.tech.` is still Neon, so the label holds even where the two
 * spellings differ).
 */
const isNeonHostname = (hostname: string): boolean => hostname.endsWith(".neon.tech");

export function databaseTargetOf(url: string): DatabaseTarget {
  const parsed = parseOrNull(url);
  if (parsed === null) return { kind: "unparseable" };
  // A comma lists several hosts (postgres-js tries them in turn) and an empty
  // host falls back to PGHOST or localhost: either way the line couldn't
  // name the database honestly, and it exists to be proof (review, finding 2).
  if (parsed.hostname === "" || parsed.hostname.includes(",")) return { kind: "ambiguous_host" };
  // `postgres:` isn't a WHATWG special scheme, so `URL` keeps the host's case;
  // the trailing dot is the same host written fully qualified.
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (LOCAL_HOSTS.has(host.replace(/^\[|\]$/g, ""))) {
    return {
      kind: "local",
      host,
      // Postgres' own default, which is what an omitted port connects to.
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, ""),
    };
  }
  // The endpoint id is the compute, which is what the production guard compares,
  // so the pooled and direct hostnames of one database print the same id.
  const endpoint = computeOf(host);
  if (isNeonHostname(host) && ENDPOINT_ID.test(endpoint)) return { kind: "neon", endpoint, host };
  return { kind: "remote", host };
}

/** The line a script prints before its results. */
export function databaseTargetLine(url: string): string {
  const target = databaseTargetOf(url);
  switch (target.kind) {
    case "neon":
      return `Target: Neon endpoint ${target.endpoint} (${target.host})`;
    case "local":
      return `Target: local (${target.host}:${target.port}/${target.database || "<default database>"})`;
    case "remote":
      return `Target: remote host ${target.host} (not a Neon endpoint)`;
    case "ambiguous_host":
      return "Target: DATABASE_URL names several hosts or none, so it can't be named (not printing it).";
    case "unparseable":
      return "Target: DATABASE_URL could not be parsed (not printing it).";
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = target;
      throw new Error(`Unhandled target ${JSON.stringify(unreachable)}`);
    }
  }
}

export function checkProductionWrite(
  targetUrl: string,
  argv: readonly string[],
  prodEndpoint: string | undefined,
): ProductionWriteCheck {
  // A URL that won't parse is refused, never thrown on: Node's uncaught-error
  // dump prints the input, password included.
  const target = parseOrNull(targetUrl);
  if (target === null) return { kind: "refused", reason: "unparseable" };
  // Only one host can be checked against production. A comma lists several
  // (postgres-js fails over through them, so a production host second in
  // line would be reached without --prod), and an empty host falls back to
  // PGHOST or localhost: neither can be shown not to be production
  // (review of 9ce9bc1, finding 1). Same rule as `databaseTargetOf`.
  if (target.hostname === "" || target.hostname.includes(",")) {
    return { kind: "refused", reason: "ambiguous_host" };
  }
  // Exact hostname match, never a substring test: a URL merely *containing*
  // "localhost" (in a password, a query string) must not pass as local.
  if (LOCAL_HOSTS.has(target.hostname.toLowerCase().replace(/^\[|\]$/g, ""))) {
    return { kind: "allowed", reason: "local" };
  }

  const flagged = argv.includes(PROD_FLAG);
  if (!prodEndpoint) {
    return flagged
      ? { kind: "allowed", reason: "production_flagged" }
      : { kind: "refused", reason: "production_unknown" };
  }
  // A value that isn't an endpoint id (a pasted URL, a typo) can't be compared
  // honestly: refuse rather than guess, and never echo it.
  const prod = computeOf(prodEndpoint.trim());
  if (!ENDPOINT_ID.test(prod)) return { kind: "refused", reason: "misconfigured" };

  if (computeOf(target.hostname) !== prod) return { kind: "allowed", reason: "not_production" };
  return flagged
    ? { kind: "allowed", reason: "production_flagged" }
    : {
        kind: "refused",
        reason: "production_without_flag",
      };
}

const REPO_ENV_LOCAL = resolve(fileURLToPath(import.meta.url), "../../../../.env.local");

/**
 * Production's endpoint id: from the process environment if set there,
 * otherwise from the repo's gitignored `.env.local` (PG-2 → A). Only this one
 * key is read from the file; nothing else in it enters the process, so a
 * script that writes never inherits secrets it has no use for.
 */
export function productionEndpoint(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const fromEnv = env[PROD_ENDPOINT_ENV];
  if (fromEnv) return fromEnv;
  const file = env[PROD_GUARD_ENV_FILE_ENV] ?? REPO_ENV_LOCAL;
  if (!existsSync(file)) return undefined;
  try {
    return parseEnv(readFileSync(file, "utf8"))[PROD_ENDPOINT_ENV] || undefined;
  } catch {
    return undefined;
  }
}

/**
 * For CLIs: prints why and exits non-zero on refusal. Never prints a URL or the endpoint.
 *
 * `access` only changes the warning's wording. A read-only script that reads
 * what production keeps private (`location:verify` reads every exact address)
 * takes the same explicit flag, and must not claim to be writing.
 */
export function assertProductionWriteAllowed(
  targetUrl: string,
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  access: "write" | "read" = "write",
): void {
  const check = checkProductionWrite(targetUrl, argv, productionEndpoint(env));
  if (check.kind === "allowed") {
    if (check.reason === "production_flagged") {
      const verb = access === "write" ? "writing to" : "reading";
      console.error(`WARNING: ${verb} PRODUCTION (${PROD_FLAG} given).`);
    }
    return;
  }
  const messages: Record<typeof check.reason, string> = {
    production_without_flag:
      `ERROR: this target is PRODUCTION (its Neon compute is ${PROD_ENDPOINT_ENV}). ` +
      `Pass ${PROD_FLAG} if that is really what you mean.`,
    production_unknown:
      `ERROR: ${PROD_ENDPOINT_ENV} is not set (environment or the root .env.local), so this ` +
      `non-local target can't be shown not to be production. Set it, or pass ${PROD_FLAG} if ` +
      "you mean production.",
    unparseable: "ERROR: a database URL could not be parsed. Refusing (not printing it).",
    ambiguous_host:
      "ERROR: the database URL names several hosts or none; only one host can be checked against production. Refusing (not printing it).",
    misconfigured:
      `ERROR: ${PROD_ENDPOINT_ENV} doesn't look like a Neon endpoint id (ep-…). Refusing ` +
      "(not printing it).",
  };
  console.error(messages[check.reason]);
  process.exit(1);
}
