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
 *
 * DATABASE_URL is the only input it trusts, and a non-local host has to be a
 * Neon endpoint host (Oleksii, 2026-10-19, PG-T10 (b), verbatim: "refuse any
 * non-local host that isn't ep-…[-pooler].<region>.aws.neon.tech, and --prod
 * doesn't override that", and "DATABASE_URL is the only input the guard
 * trusts"). The review that led there: a raw IP passed as "not production"
 * while `PGPASSWORD='endpoint=ep-…;…'`, which the driver reads alongside the
 * URL, routed the connection to production inside Neon.
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
        | "misconfigured"
        | "not_a_neon_host";
    }
  | { kind: "refused"; reason: "ambiguous_host"; cause: HostAmbiguity }
  | {
      kind: "refused";
      reason: "ambient_settings";
      variables: readonly AmbientConnectionVariable[];
    };

/**
 * Environment variables a driver reads alongside DATABASE_URL. Any of them set
 * means the URL the guard checked isn't the whole of what the driver connects
 * with, so the guard refuses outright, local targets included (a `localhost`
 * port can be a tunnel). The first seven are his list (2026-10-19, verbatim:
 * "also refuse when any of these are set: PGHOST, PGHOSTADDR, PGPORT,
 * PGPASSWORD, PGOPTIONS, PGSERVICE, PGSERVICEFILE"); libpq reads them all.
 * The last three are added under his "DATABASE_URL is the only input the guard
 * trusts": postgres-js 3.4.9 (`parseOptions`, which drizzle-kit uses too) reads
 * them whenever the URL leaves out its user or database (PG-T11, a decision
 * taken, reversible).
 */
export const AMBIENT_CONNECTION_VARIABLES = [
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGPASSWORD",
  "PGOPTIONS",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGUSER",
  "PGUSERNAME",
  "PGDATABASE",
] as const;
export type AmbientConnectionVariable = (typeof AMBIENT_CONNECTION_VARIABLES)[number];

/** The ambient variables that are set, an empty one included: names only, never a value. */
export const ambientConnectionSettings = (
  env: Readonly<Record<string, string | undefined>>,
): AmbientConnectionVariable[] =>
  AMBIENT_CONNECTION_VARIABLES.filter((name) => env[name] !== undefined);

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
  | "routing_hint_user"
  | "routing_hint_password"
  | "routing_hint_database"
  | "escape_user"
  | "escape_password"
  | "escape_database";

/** What a refusal says: the rule the URL broke and the part it broke it in, never the part's value. */
export const HOST_AMBIGUITY_TEXT: Readonly<Record<HostAmbiguity, string>> = {
  characters: "it contains a space, a backslash, a control character or a non-ASCII character",
  fragment: "it has a '#' fragment",
  scheme: "it doesn't start with postgres:// or postgresql://",
  userinfo: "it has more than one '@' before the host",
  host_list: "it lists several hosts",
  no_host: "it names no host",
  host_form: "its host isn't a plain hostname or IPv4 address, written the way a driver reads it",
  query: "its query string carries a parameter, or a value, the guard doesn't accept",
  routing_hint_user: "its user name carries endpoint=, project= or options=",
  routing_hint_password: "its password carries endpoint=, project= or options=",
  routing_hint_database: "its database name carries endpoint=, project= or options=",
  escape_user: "its user name has a %-escape that doesn't decode",
  escape_password: "its password has a %-escape that doesn't decode",
  escape_database: "its database name has a %-escape that doesn't decode",
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const ENDPOINT_ID = /^ep-[a-z0-9-]+$/;

/**
 * A Neon endpoint host: the compute's id (with `-pooler` for the pooled one) as
 * the first label, an optional cell label (`c-2`), an AWS region
 * (`eu-central-1`), then `aws.neon.tech`. Applied after the trailing dot is
 * stripped. Neon's proxy routes by that first label, the one the guard
 * compares. Exactly these shapes and no others: any other label in between
 * (`ep-a.ep-prod.eu-central-1…`) would rest on how the proxy reads the rest of
 * the name, so a shape Neon introduces later is refused until it's added here.
 */
const NEON_ENDPOINT_HOST =
  /^ep-[a-z0-9-]+\.(?:c-[0-9]+\.)?[a-z]{2}(?:-[a-z]+)+-[0-9]+\.aws\.neon\.tech$/;
const isNeonEndpointHost = (host: string): boolean =>
  NEON_ENDPOINT_HOST.test(host.replace(/\.$/, ""));

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

/**
 * Neon's SNI workarounds name the endpoint outside the hostname (`endpoint=ep-…`,
 * older `project=`, or libpq's `options=endpoint%3D…`). His words (2026-10-19,
 * verbatim): "Refuse a URL whose password or query carries endpoint= or options=
 * too." The query is covered by `ALLOWED_QUERY`; this covers the rest.
 */
const NEON_ROUTING_HINT = /(endpoint|project|options)=/i;

/** Whether `decodeURIComponent` accepts the text (`%zz`, `%FF` and a cut UTF-8 sequence it doesn't). */
const decodes = (text: string): boolean => {
  try {
    decodeURIComponent(text);
    return true;
  } catch {
    return false;
  }
};

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

/** The host as an `http:` URL reads it, or null where that reading refuses it. */
const httpHostnameOf = (host: string): string | null =>
  parseOrNull(`http://${host}`)?.hostname ?? null;

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
  // neon() re-parses the string as `http:`, where a host can be rewritten
  // (`127.1` becomes `127.0.0.1`) or, depending on the Node version, refused
  // (`xn--a`, invalid punycode: Node 22 refuses it, Node 24 doesn't). A refusal
  // there throws with the whole connection string in its message, password
  // included (review of #144, finding 2), so the host must come back from that
  // reading exactly as written.
  if (httpHostnameOf(host) !== host.toLowerCase()) return ambiguous("host_form");

  for (const [key, value] of parsed.searchParams) {
    if (ALLOWED_QUERY.get(key)?.has(value) !== true) return ambiguous("query");
  }
  const parts = [
    [parsed.username, "escape_user", "routing_hint_user"],
    [parsed.password, "escape_password", "routing_hint_password"],
    [parsed.pathname, "escape_database", "routing_hint_database"],
  ] as const;
  for (const [part, malformed, hint] of parts) {
    // neon() decodes these with decodeURIComponent, and when that throws it
    // throws too, with the whole connection string, password included, in its
    // message (delta review of #144, finding 1).
    if (!decodes(part)) return ambiguous(malformed);
    // Neon routes a connection by an endpoint named in the password (or,
    // through libpq, the database name) ahead of the hostname's, so the host
    // checked here would not decide which database answers.
    if (NEON_ROUTING_HINT.test(decodeEscapes(part))) return ambiguous(hint);
  }
  return { kind: "one_host", parsed, host: host.toLowerCase() };
}

/** `ep-quiet-lake-a1b2c3-pooler.eu-…`, `ep-quiet-lake-a1b2c3.eu-…` and `ep-quiet-lake-a1b2c3` are one compute. */
export const computeOf = (hostOrId: string): string =>
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
  // Neon only in the one shape the production guard accepts. A remote host is
  // named exactly as written, trailing dot included: stripped, `localhost.`
  // would print as "remote host localhost" (review of #144, finding 5).
  if (!isNeonEndpointHost(reading.host)) return { kind: "remote", host: reading.host };
  // The trailing dot is the same host written fully qualified.
  const host = reading.host.replace(/\.$/, "");
  // The endpoint id is the compute, which is what the production guard compares,
  // so the pooled and direct hostnames of one database print the same id.
  return { kind: "neon", endpoint: computeOf(host), host };
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
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProductionWriteCheck {
  // First, and for every target: a setting the driver reads alongside the URL
  // can send the connection somewhere the URL doesn't say (PGPASSWORD naming an
  // endpoint routes inside Neon; PGPORT redirects a portless localhost), so no
  // verdict on the URL alone would hold. --prod doesn't help either.
  const ambient = ambientConnectionSettings(env);
  if (ambient.length > 0)
    return { kind: "refused", reason: "ambient_settings", variables: ambient };
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
  // Anything else must be a Neon endpoint host, whose first label is the compute
  // Neon routes by and the one compared below. A raw IP, another provider or an
  // odd label under neon.tech can't be shown not to be production, and --prod
  // doesn't open it: production is only ever reached through its own name
  // (PG-T10 (b); a local Postgres on a WSL IP is refused too, which he accepted).
  if (!isNeonEndpointHost(target.host)) return { kind: "refused", reason: "not_a_neon_host" };

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
  const check = checkProductionWrite(targetUrl, argv, productionEndpoint(env), env);
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

/** The ambient refusal's text: the variables by name, never a value. Shared with the smoke guard. */
export const ambientSettingsText = (variables: readonly AmbientConnectionVariable[]): string =>
  `set in the environment: ${variables.join(", ")}. A driver reads ${variables.length === 1 ? "it" : "them"} ` +
  "alongside DATABASE_URL, the only connection setting the guard checks. Unset " +
  `${variables.length === 1 ? "it" : "them"} and put everything in DATABASE_URL`;

function refusalMessage(check: Extract<ProductionWriteCheck, { kind: "refused" }>): string {
  switch (check.reason) {
    case "ambient_settings":
      return `ERROR: ${ambientSettingsText(check.variables)}. Refusing (not printing any value).`;
    case "not_a_neon_host":
      return (
        "ERROR: the database URL's host is neither local (localhost, 127.0.0.1, 0.0.0.0) nor a " +
        "Neon endpoint host (ep-…[-pooler].<region>.aws.neon.tech), so it can't be checked " +
        `against production, and ${PROD_FLAG} doesn't change that. Refusing (not printing it).`
      );
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
