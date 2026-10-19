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
      reason: "production_without_flag" | "production_unknown" | "unparseable" | "misconfigured";
    }
  | { kind: "refused"; reason: "ambiguous_host"; cause: HostAmbiguity };

/**
 * Why a database URL can't be read as exactly one host. The guard checks one
 * host against production, so that host has to be the one the driver would
 * connect to. Each cause is a form where the guard's reading (WHATWG `URL`)
 * and a driver's were shown to differ, or one the guard can't vouch for, so it
 * refuses rather than guesses (Oleksii, 2026-10-19: "Refuse any database URL
 * the guard can't classify unambiguously as one host").
 */
export type HostAmbiguity =
  | "characters"
  | "fragment"
  | "scheme"
  | "userinfo"
  | "host_list"
  | "no_host"
  | "host_form"
  | "query"
  | "routing_hint";

/** What a refusal says: the rule the URL broke, never any part of the URL. */
export const HOST_AMBIGUITY_TEXT: Readonly<Record<HostAmbiguity, string>> = {
  characters: "it contains a space, a backslash, a control character or a non-ASCII character",
  fragment: "it has a '#' fragment",
  scheme: "it doesn't start with postgres:// or postgresql://",
  userinfo: "it has more than one '@' before the host",
  host_list: "it lists several hosts",
  no_host: "it names no host",
  host_form: "its host isn't a plain hostname or IPv4 address",
  query: "it carries a query parameter, or a value, the guard doesn't accept",
  routing_hint: "it names a Neon endpoint or project outside the host",
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const ENDPOINT_ID = /^ep-[a-z0-9-]+$/;

/**
 * The only query parameters a database URL may carry, each with the values it
 * may take: what Neon's own connection strings use, nothing else. None of them
 * names a host. Everything else is refused, because drivers and Neon read
 * parameters as connection settings: the pg-connection-string inside
 * `@neondatabase/serverless` (its `Client`/`Pool`, unused here) takes `?host=`
 * over the URL's host, libpq (`psql`, which no script uses) honours `host`,
 * `hostaddr` and `service`, Neon's proxy routes by `options=endpoint%3D…`, and
 * postgres-js sends unknown keys to the server as startup parameters
 * (`?database=` replaces the path's database). An allowlist fails closed on a
 * parameter nobody has looked at yet.
 */
const ALLOWED_QUERY = new Map<string, ReadonlySet<string>>([
  ["sslmode", new Set(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"])],
  ["channel_binding", new Set(["disable", "prefer", "require"])],
]);

/** Neon's SNI workarounds name the endpoint outside the hostname (`endpoint=ep-…`, older `project=`). */
const NEON_ROUTING_HINT = /(endpoint|project)=/i;

/** Each valid `%XX` decoded on its own, the rest kept: a malformed escape elsewhere can't hide a hint. */
const decodeEscapes = (text: string): string =>
  text.replace(/%([0-9a-f]{2})/gi, (_escape, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );

const parseOrNull = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

type HostReading =
  | { kind: "one_host"; parsed: URL; host: string }
  | { kind: "unparseable" }
  | { kind: "ambiguous_host"; cause: HostAmbiguity };

/**
 * The one host a database URL names, or why it can't be read as exactly one.
 * Every check below exists because `URL`'s reading and postgres-js's own
 * (`parseUrl` and `parseOptions` in postgres@3.4.9 `src/index.js`, which
 * drizzle-kit uses too) or neon()'s (it re-parses the string as `http:`) can
 * differ. postgres-js slices the authority itself: everything after `://` up
 * to the first `?` or `/`, the host after the *first* `@`, percent-decoded;
 * whenever that contains a comma it connects to that list, in order, failing
 * over on error, and ignores `URL`'s host entirely. Once the checks pass, its
 * slice and `URL`'s hostname are the same characters.
 *
 * `host` is lowercased (`postgres:` isn't a WHATWG special scheme, so `URL`
 * keeps the host's case) and otherwise exactly as written.
 */
function readOneHost(url: string): HostReading {
  const parsed = parseOrNull(url);
  if (parsed === null) return { kind: "unparseable" };
  const ambiguous = (cause: HostAmbiguity): HostReading => ({ kind: "ambiguous_host", cause });

  // `URL` drops tabs and newlines anywhere and trims spaces; postgres-js slices
  // the raw string, so the two would read different characters. neon() re-parses
  // the string as `http:`, where a backslash ends the authority as `/` does.
  if (!/^[\x21-\x5b\x5d-\x7e]+$/.test(url)) return ambiguous("characters");
  // postgres-js ends the host at the first `?` or `/`, never at `#`: in
  // `…@localhost#,ep-….neon.tech/db`, `URL` reads localhost while postgres-js
  // reads ["localhost#", "ep-….neon.tech"] and fails over to the second (the
  // review that found this hole). A connection string has no use for a fragment.
  if (url.includes("#")) return ambiguous("fragment");
  // Other schemes get WHATWG's special-scheme host rules (backslashes, IPv4
  // rewriting); neon() refuses them, postgres-js ignores the scheme entirely.
  if (!/^postgres(ql)?:\/\//i.test(url)) return ambiguous("scheme");

  const authority = url.slice(url.indexOf("://") + 3).split(/[?/]/)[0] ?? "";
  // postgres-js takes the host after the first `@`, `URL` after the last:
  // `u:p@ep-….neon.tech,x@localhost/db` is localhost to `URL` and
  // ["ep-….neon.tech", "x@localhost"] to postgres-js, production first.
  const at = authority.indexOf("@");
  if (at !== authority.lastIndexOf("@")) return ambiguous("userinfo");
  const hostAndPort = authority.slice(at + 1);
  // postgres-js percent-decodes its host before splitting on commas, so
  // `nope%2Cep-….neon.tech` is one opaque host to `URL` and two to it.
  if (/,|%2c/i.test(hostAndPort)) return ambiguous("host_list");
  const host = hostAndPort.replace(/:[0-9]*$/, "");
  // An empty host falls back to PGHOST, or localhost.
  if (host === "") return ambiguous("no_host");
  // Anything but letters, digits, dots and hyphens: percent-escapes (postgres-js
  // decodes them, `%2F` turning the host into a unix-socket path), brackets
  // (postgres-js splits `[::1]` at its first `:` and connects to `[`).
  if (!/^[a-z0-9.-]+$/i.test(host)) return ambiguous("host_form");

  for (const [key, value] of parsed.searchParams) {
    if (ALLOWED_QUERY.get(key)?.has(value) !== true) return ambiguous("query");
  }
  // Neon routes a connection by an endpoint named in the password (or, through
  // libpq, the database name) ahead of the hostname's, so the host checked here
  // would not decide which database answers.
  for (const part of [parsed.username, parsed.password, parsed.pathname]) {
    if (NEON_ROUTING_HINT.test(decodeEscapes(part))) return ambiguous("routing_hint");
  }
  return { kind: "one_host", parsed, host: host.toLowerCase() };
}

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
  | { kind: "ambiguous_host"; cause: HostAmbiguity }
  | { kind: "unparseable" };

/**
 * The same suffix test as `client.ts`'s `isNeonHost`, which picks the driver,
 * applied after the trailing dot is stripped (a fully qualified
 * `x.neon.tech.` is still Neon, so the label holds even where the two
 * spellings differ).
 */
const isNeonHostname = (hostname: string): boolean => hostname.endsWith(".neon.tech");

export function databaseTargetOf(url: string): DatabaseTarget {
  // A URL that isn't exactly one host could reach any of several databases:
  // the line couldn't name the database honestly, and it exists to be proof
  // (review of 4e30965, finding 2). The same reading as the production guard.
  const reading = readOneHost(url);
  if (reading.kind !== "one_host") return reading;
  const { parsed } = reading;
  // Local only when the production guard agrees it is: a fully qualified
  // `localhost.` goes to the resolver, so it is named as remote.
  if (LOCAL_HOSTS.has(reading.host)) {
    return {
      kind: "local",
      host: reading.host,
      // Postgres' own default, which is what an omitted port connects to.
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, ""),
    };
  }
  // The trailing dot is the same host written fully qualified.
  const host = reading.host.replace(/\.$/, "");
  // The endpoint id is the compute, which is what the production guard compares,
  // so the pooled and direct hostnames of one database print the same id.
  const endpoint = computeOf(host);
  if (isNeonHostname(host) && ENDPOINT_ID.test(endpoint)) return { kind: "neon", endpoint, host };
  return { kind: "remote", host };
}

/**
 * The `--expect` check (DR-B1, guard 3b): the target must be exactly that Neon compute. Shared
 * by `demo:remove` and `db:migrate` (AW-F1). Never echoes the URL or the endpoint.
 */
export type ExpectedTarget = { kind: "ok" } | { kind: "refused"; reason: string };

export function expectedTargetOf(url: string, expect: string | undefined): ExpectedTarget {
  if (expect === undefined || !/^ep-[a-z0-9-]+$/.test(expect.trim().toLowerCase())) {
    return { kind: "refused", reason: "pass --expect ep-… (the target's Neon endpoint id)" };
  }
  const target = databaseTargetOf(url);
  if (target.kind === "ambiguous_host") {
    return {
      kind: "refused",
      reason: `the target can't be read as exactly one host: ${HOST_AMBIGUITY_TEXT[target.cause]}`,
    };
  }
  if (target.kind !== "neon") {
    return { kind: "refused", reason: "the target is not a Neon endpoint" };
  }
  const expected = expect
    .trim()
    .toLowerCase()
    .replace(/-pooler$/, "");
  return target.endpoint === expected
    ? { kind: "ok" }
    : { kind: "refused", reason: "the target's Neon endpoint is not --expect" };
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
      return `Target: DATABASE_URL can't be read as exactly one host (${HOST_AMBIGUITY_TEXT[target.cause]}), so it can't be named (not printing it).`;
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
  const target = readOneHost(targetUrl);
  if (target.kind === "unparseable") return { kind: "refused", reason: "unparseable" };
  // Only one host can be checked against production, and it has to be the one
  // the driver connects to. A host list (review of 9ce9bc1, finding 1), a
  // fragment hiding one (2026-10-19), an empty host falling back to PGHOST:
  // none of them can be shown not to be production, so --prod doesn't help
  // either. Same reading as `databaseTargetOf`.
  if (target.kind === "ambiguous_host") {
    return { kind: "refused", reason: "ambiguous_host", cause: target.cause };
  }
  // Exact hostname match, never a substring test: a URL merely *containing*
  // "localhost" (in a password, a query string) must not pass as local.
  if (LOCAL_HOSTS.has(target.host)) {
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

  if (computeOf(target.host) !== prod) return { kind: "allowed", reason: "not_production" };
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
  console.error(refusalMessage(check));
  process.exit(1);
}

function refusalMessage(check: Extract<ProductionWriteCheck, { kind: "refused" }>): string {
  switch (check.reason) {
    case "production_without_flag":
      return (
        `ERROR: this target is PRODUCTION (its Neon compute is ${PROD_ENDPOINT_ENV}). ` +
        `Pass ${PROD_FLAG} if that is really what you mean.`
      );
    case "production_unknown":
      return (
        `ERROR: ${PROD_ENDPOINT_ENV} is not set (environment or the root .env.local), so this ` +
        `non-local target can't be shown not to be production. Set it, or pass ${PROD_FLAG} if ` +
        "you mean production."
      );
    case "unparseable":
      return "ERROR: a database URL could not be parsed. Refusing (not printing it).";
    case "ambiguous_host":
      return (
        `ERROR: the database URL can't be read as exactly one host: ${HOST_AMBIGUITY_TEXT[check.cause]}. ` +
        "Only one host can be checked against production. Refusing (not printing it)."
      );
    case "misconfigured":
      return (
        `ERROR: ${PROD_ENDPOINT_ENV} doesn't look like a Neon endpoint id (ep-…). Refusing ` +
        "(not printing it)."
      );
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled reason; unreachable at runtime */
    default: {
      const unreachable: never = check;
      throw new Error(`Unhandled refusal ${JSON.stringify(unreachable)}`);
    }
  }
}
