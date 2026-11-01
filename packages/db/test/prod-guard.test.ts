import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateTargetCheck, parseMigrateArgs } from "../src/migrate-args";
import {
  AMBIENT_CONNECTION_VARIABLES,
  type AmbientConnectionVariable,
  assertProductionWriteAllowed,
  checkProductionWrite,
  type DatabaseTarget,
  databaseTargetLine,
  databaseTargetOf,
  expectedTargetOf,
  type HostAmbiguity,
  productionEndpoint,
} from "../src/prod-guard";
import { smokeTarget } from "../src/test-utils/smoke-target";

/** Fake endpoints only. Nothing here resolves, and nothing should try. */
const PROD_ENDPOINT = "ep-quiet-lake-a1b2c3";
const PROD = "postgresql://u:secret@ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb";
const PROD_DIRECT = "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech/neondb";
const CHILD_BRANCH =
  "postgresql://u:secret@ep-other-hill-d4e5f6-pooler.eu-central-1.aws.neon.tech/neondb";
const LOCAL = "postgres://opika:opika@localhost:5433/opika";

describe("checkProductionWrite", () => {
  it.each([
    ["localhost", LOCAL],
    ["127.0.0.1", "postgres://opika:opika@127.0.0.1:5433/opika_test"],
  ])("lets a local database through without a flag (%s)", (_name, url) => {
    expect(checkProductionWrite(url, [], PROD_ENDPOINT)).toEqual({
      kind: "allowed",
      reason: "local",
    });
    expect(checkProductionWrite(url, [], undefined)).toEqual({ kind: "allowed", reason: "local" });
  });

  it("refuses production without --prod", () => {
    expect(checkProductionWrite(PROD, [], PROD_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "production_without_flag",
    });
  });

  /** One compute, two hostnames: comparing hostnames alone would let this through. */
  it("refuses production under its other hostname too", () => {
    expect(checkProductionWrite(PROD_DIRECT, [], PROD_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "production_without_flag",
    });
  });

  it("allows production with an explicit --prod", () => {
    expect(checkProductionWrite(PROD, ["--prod"], PROD_ENDPOINT)).toEqual({
      kind: "allowed",
      reason: "production_flagged",
    });
  });

  it("lets a different Neon compute (a child branch) through", () => {
    expect(checkProductionWrite(CHILD_BRANCH, [], PROD_ENDPOINT)).toEqual({
      kind: "allowed",
      reason: "not_production",
    });
  });

  /** A missing env var must never read as permission. */
  it("fails closed when production isn't configured", () => {
    expect(checkProductionWrite(CHILD_BRANCH, [], undefined)).toEqual({
      kind: "refused",
      reason: "production_unknown",
    });
    expect(checkProductionWrite(CHILD_BRANCH, ["--prod"], undefined)).toEqual({
      kind: "allowed",
      reason: "production_flagged",
    });
  });

  it("doesn't treat a URL that merely contains 'localhost' as local", () => {
    const sneaky =
      "postgresql://localhost:pw@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech/localhost";
    expect(checkProductionWrite(sneaky, [], PROD_ENDPOINT).kind).toBe("refused");
  });
});

describe("checkProductionWrite edge cases", () => {
  it.each([
    [
      "uppercase hostname",
      "postgresql://u:secret@EP-QUIET-LAKE-A1B2C3.EU-CENTRAL-1.AWS.NEON.TECH/neondb",
    ],
    [
      "explicit port and the query Neon's console gives",
      "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech:5432/neondb?sslmode=require&channel_binding=require",
    ],
    [
      "trailing dot",
      "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech./neondb",
    ],
    [
      "a different region suffix on the same compute",
      "postgresql://u:secret@ep-quiet-lake-a1b2c3.c-2.eu-central-1.aws.neon.tech/neondb",
    ],
  ])("still recognises production: %s", (_name, url) => {
    expect(checkProductionWrite(url, [], PROD_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "production_without_flag",
    });
  });

  it("refuses a target that won't parse, and a production setting that isn't an endpoint id", () => {
    expect(checkProductionWrite("not a url", [], PROD_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "unparseable",
    });
    expect(
      checkProductionWrite(CHILD_BRANCH, [], "postgresql://u:secret@ep-x.neon.tech/db"),
    ).toEqual({
      kind: "refused",
      reason: "misconfigured",
    });
  });
});

/**
 * Verbatim from the review that found the hole (KH-Q12 purge, 2026-10-19).
 * `ep-dawn-pond-b1dz515g` is production's endpoint id, already public in
 * docs/onboarding-a-shelter.md; the literal `<region>` keeps the second host
 * unresolvable, so even a regression couldn't reach anything with it.
 */
const REVIEWS_EXAMPLE =
  "postgres://u:p@localhost#,ep-dawn-pond-b1dz515g.<region>.aws.neon.tech/neondb";
const REVIEWS_PROD_ENDPOINT = "ep-dawn-pond-b1dz515g";
const PROD_HOST = `${PROD_ENDPOINT}-pooler.eu-central-1.aws.neon.tech`;
const CHILD_HOST = "ep-other-hill-d4e5f6.eu-central-1.aws.neon.tech";

/**
 * Oleksii, 2026-10-19, verbatim: "Refuse any database URL the guard can't
 * classify unambiguously as one host: '#' (fragment), ',' (already), query
 * parameters that set or override the host (host=, hostaddr=, and any others
 * the driver honours; check the postgres/neon driver docs), userinfo tricks,
 * and anything else that lets the parsed host differ from what the driver
 * connects to. Test each case, including the exact example you found."
 *
 * Each row names the rule it breaks, so a row caught by a different rule (the
 * review's example has a comma after its `#`) still fails when its own rule is
 * removed.
 */
const NOT_ONE_HOST: ReadonlyArray<readonly [string, string, HostAmbiguity]> = [
  ["the review's example: a fragment hiding a second host", REVIEWS_EXAMPLE, "fragment"],
  ["a fragment and nothing else", "postgres://opika:opika@localhost:5433/opika#x", "fragment"],
  [
    "a fragment between the port and a second host",
    `postgres://localhost:5433#@${PROD_HOST}/neondb`,
    "fragment",
  ],
  ["a comma host list", `postgresql://u:secret@localhost,${PROD_HOST}/neondb`, "host_list"],
  [
    "a percent-encoded comma",
    `postgresql://u:secret@nope%2C${PROD_HOST}/neondb?sslmode=require`,
    "host_list",
  ],
  [
    "a lowercase percent-encoded comma",
    `postgresql://u:secret@nope%2c${PROD_HOST}/neondb`,
    "host_list",
  ],
  [
    "a second '@' hiding a host list",
    `postgresql://u:secret@${PROD_HOST},x@localhost:5433/neondb`,
    "userinfo",
  ],
  ["a second '@' alone", `postgresql://u:secret@${PROD_HOST}@localhost:5433/neondb`, "userinfo"],
  ["an unescaped '@' in the password", "postgres://opika:p@ss@localhost:5433/opika", "userinfo"],
  ["?host=", `postgres://opika:opika@localhost:5433/opika?host=${PROD_HOST}`, "query"],
  ["?hostaddr=", "postgres://opika:opika@localhost:5433/opika?hostaddr=3.125.0.1", "query"],
  ["?service=", "postgres://opika:opika@localhost:5433/opika?service=prod", "query"],
  ["?port=", "postgres://opika:opika@localhost:5433/opika?port=5432", "query"],
  [
    "?database=",
    "postgres://opika:opika@localhost:5433/opika_test_0123abcd?database=opika",
    "query",
  ],
  [
    "?options= naming an endpoint",
    `postgresql://u:secret@3.125.0.1/neondb?sslmode=require&options=endpoint%3D${PROD_ENDPOINT}`,
    "query",
  ],
  [
    "?sslmode= with a value it doesn't take",
    `postgresql://u:secret@${CHILD_HOST}/neondb?sslmode=x`,
    "query",
  ],
  [
    "the endpoint in the password (Neon's SNI workaround D)",
    `postgresql://u:endpoint=${PROD_ENDPOINT};pw@3.125.0.1/neondb?sslmode=require`,
    "routing_hint_password",
  ],
  [
    "the endpoint in the password, percent-encoded",
    `postgresql://u:%65ndpoint%3D${PROD_ENDPOINT}$pw@${CHILD_HOST}/neondb`,
    "routing_hint_password",
  ],
  [
    "a project in the user name",
    `postgresql://project=${PROD_ENDPOINT}:pw@3.125.0.1/neondb`,
    "routing_hint_user",
  ],
  [
    "the endpoint in the database name (workaround B)",
    `postgresql://u:secret@3.125.0.1/neondb%20options%3Dendpoint%3D${PROD_ENDPOINT}`,
    "routing_hint_database",
  ],
  // His words (2026-10-19, verbatim): "Refuse a URL whose password or query carries endpoint= or options= too."
  [
    "options= in the password",
    `postgresql://u:options=pw@${CHILD_HOST}/neondb`,
    "routing_hint_password",
  ],
  [
    "options= in the password, percent-encoded",
    `postgresql://u:%6Fptions%3D-c%20x@${CHILD_HOST}/neondb`,
    "routing_hint_password",
  ],
  ["?endpoint=", `postgresql://u:secret@${CHILD_HOST}/neondb?endpoint=${PROD_ENDPOINT}`, "query"],
  [
    "?options= naming no endpoint",
    `postgresql://u:secret@${CHILD_HOST}/neondb?options=-c%20x`,
    "query",
  ],
  // neon() re-parses as http:, which rewrites these; a host must come back from that reading
  // exactly as written (review of #144, finding 2). Same on every Node version.
  // neon() throws on a %-escape decodeURIComponent rejects, printing the whole string (delta
  // review of #144, finding 1).
  [
    "a malformed escape in the password",
    `postgresql://u:pw%zz@${CHILD_HOST}/neondb`,
    "escape_password",
  ],
  [
    "a cut UTF-8 escape in the password",
    `postgresql://u:pw%C3@${CHILD_HOST}/neondb`,
    "escape_password",
  ],
  [
    "a malformed escape in the user name",
    `postgresql://u%FF:pw@${CHILD_HOST}/neondb`,
    "escape_user",
  ],
  [
    "a malformed escape in the database name",
    `postgresql://u:pw@${CHILD_HOST}/neon%zzdb`,
    "escape_database",
  ],
  ["an IPv4 shorthand", "postgres://opika:opika@127.1:5433/opika", "host_form"],
  ["a hex IPv4", "postgres://opika:opika@0x7f000001:5433/opika", "host_form"],
  ["an IPv6 literal", "postgres://opika:opika@[::1]:5433/opika", "host_form"],
  ["a percent-encoded unix-socket path", "postgres://opika:opika@%2Ftmp/opika", "host_form"],
  [
    "a percent-escape inside the host",
    "postgres://opika:opika@local%68ost:5433/opika",
    "host_form",
  ],
  ["an empty host", "postgres:///opika", "no_host"],
  [
    "a backslash before the '@'",
    `postgres://${PROD_HOST}:443\\@${CHILD_HOST}/neondb`,
    "characters",
  ],
  ["a tab inside the host", "postgres://opika:opika@local\thost:5433/opika", "characters"],
  ["a leading space", " postgres://opika:opika@localhost:5433/opika", "characters"],
  ["a non-ASCII host", "postgres://opika:opika@lоcalhost:5433/opika", "characters"],
  ["another scheme", "http://opika:opika@localhost:5433/opika", "scheme"],
  ["no '//' after the scheme", "postgres:opika", "scheme"],
];

describe("one host, or refused (2026-10-19)", () => {
  it.each(NOT_ONE_HOST)("checkProductionWrite refuses %s, --prod or not", (_name, url, cause) => {
    for (const argv of [[], ["--prod"]]) {
      for (const prod of [PROD_ENDPOINT, REVIEWS_PROD_ENDPOINT, undefined]) {
        expect(checkProductionWrite(url, argv, prod)).toEqual({
          kind: "refused",
          reason: "ambiguous_host",
          cause,
        });
      }
    }
  });

  it.each(NOT_ONE_HOST)("databaseTargetOf won't name %s", (_name, url, cause) => {
    expect(databaseTargetOf(url)).toEqual({ kind: "ambiguous_host", cause });
  });

  it.each(NOT_ONE_HOST)(
    "migrateTargetCheck refuses %s, even with a matching --expect",
    (_name, url) => {
      expect(migrateTargetCheck(url, undefined).kind).toBe("refused");
      for (const expected of [PROD_ENDPOINT, REVIEWS_PROD_ENDPOINT]) {
        expect(migrateTargetCheck(url, expected)).toEqual({
          kind: "refused",
          reason: expect.stringMatching(/^the target can't be read as exactly one host: /),
        });
      }
    },
  );

  /** The three readings the review found, one line each, now refused. */
  it("refuses the review's example in all three places it got through", () => {
    expect(checkProductionWrite(REVIEWS_EXAMPLE, [], REVIEWS_PROD_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "ambiguous_host",
      cause: "fragment",
    });
    expect(databaseTargetOf(REVIEWS_EXAMPLE)).toEqual({
      kind: "ambiguous_host",
      cause: "fragment",
    });
    expect(migrateTargetCheck(REVIEWS_EXAMPLE, undefined).kind).toBe("refused");
    expect(expectedTargetOf(REVIEWS_EXAMPLE, REVIEWS_PROD_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "the target can't be read as exactly one host: it has a '#' fragment",
    });
    expect(databaseTargetLine(REVIEWS_EXAMPLE)).toBe(
      "Target: DATABASE_URL can't be read as exactly one host (it has a '#' fragment), so it can't be named (not printing it).",
    );
  });

  /**
   * The driver evidence, pinned: postgres-js (which drizzle-kit uses too)
   * really reads these differently from `URL`, built lazily (nothing connects).
   * If an upgrade changes its parsing, this says so before anyone relies on it.
   */
  it.each([
    [REVIEWS_EXAMPLE, "localhost", ["localhost#", "ep-dawn-pond-b1dz515g.<region>.aws.neon.tech"]],
    [`postgres://u:p@nope%2C${PROD_HOST}/neondb`, `nope%2C${PROD_HOST}`, ["nope", PROD_HOST]],
    [
      `postgres://u:p@${PROD_HOST},x@localhost:5433/neondb`,
      "localhost",
      [PROD_HOST, "x@localhost"],
    ],
    ["postgres://u:p@%2Ftmp,localhost/opika", "%2Ftmp,localhost", ["/tmp", "localhost"]],
    ["postgres://opika:opika@[::1]:5433/opika", "[::1]", ["["]],
  ])("postgres-js and URL disagree on %s", async (url, whatwgHost, driverHosts) => {
    expect(new URL(url).hostname).toBe(whatwgHost);
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    try {
      expect(sql.options.host).toEqual(driverHosts);
    } finally {
      await sql.end();
    }
  });
});

/**
 * Invalid punycode: the review's password-printing host (`xn--a.…`) and PG-T13's middle label.
 * Node 22's URL parser rejects `xn--a`, so the http: reading refuses it as `host_form`; Node 24's
 * (CI) accepts it, and the host rule refuses it instead. Refused on both, whichever reads it
 * first; the cause is the runtime's, so only the verdict is asserted (CI, 2026-10-19).
 */
describe("invalid punycode is refused on every Node version", () => {
  const EITHER_REFUSAL = [
    { kind: "refused", reason: "ambiguous_host", cause: "host_form" },
    { kind: "refused", reason: "not_a_neon_host" },
  ];
  it.each([
    ["in the host", "postgres://u:secret@xn--a.eu-central-1.aws.neon.tech/db"],
    ["as a middle label", "postgres://u:secret@ep-a.xn--a.eu-central-1.aws.neon.tech/db"],
  ])("%s", (_name, url) => {
    for (const argv of [[], ["--prod"]]) {
      for (const prod of [PROD_ENDPOINT, REVIEWS_PROD_ENDPOINT, undefined]) {
        expect(EITHER_REFUSAL).toContainEqual(checkProductionWrite(url, argv, prod, {}));
      }
    }
    expect(["ambiguous_host", "remote"]).toContain(databaseTargetOf(url).kind);
    expect(migrateTargetCheck(url, PROD_ENDPOINT).kind).toBe("refused");
  });
});

/** The forms the scripts and the runbook really use keep working (his brief). */
describe("one host: the forms in use still pass", () => {
  type Named = Extract<DatabaseTarget, { host: string }>;
  const LOCAL_OK = { kind: "allowed", reason: "local" } as const;
  const NOT_PROD = { kind: "allowed", reason: "not_production" } as const;
  const PROD_REFUSED = { kind: "refused", reason: "production_without_flag" } as const;
  const ONE_HOST: ReadonlyArray<
    readonly [string, string, Named, ReturnType<typeof checkProductionWrite>]
  > = [
    [
      "docker-compose's database",
      LOCAL,
      { kind: "local", host: "localhost", port: "5433", database: "opika" },
      LOCAL_OK,
    ],
    [
      "a derived test database",
      "postgres://opika:opika@localhost:5433/opika_test_0123abcd",
      { kind: "local", host: "localhost", port: "5433", database: "opika_test_0123abcd" },
      LOCAL_OK,
    ],
    [
      "127.0.0.1, default port",
      "postgres://opika:opika@127.0.0.1/opika_test",
      { kind: "local", host: "127.0.0.1", port: "5432", database: "opika_test" },
      LOCAL_OK,
    ],
    [
      "a percent-encoded password with '@', '#' and ','",
      "postgres://opika:p%40s%23s%2Cw@localhost:5433/opika",
      { kind: "local", host: "localhost", port: "5433", database: "opika" },
      LOCAL_OK,
    ],
    [
      "Neon pooled, as its console gives it",
      `postgresql://neondb_owner:npg_AbC123dEf@${PROD_HOST}/neondb?sslmode=require&channel_binding=require`,
      { kind: "neon", endpoint: PROD_ENDPOINT, host: PROD_HOST },
      PROD_REFUSED,
    ],
    [
      "Neon direct with sslmode=require",
      `postgresql://u:secret@${CHILD_HOST}/neondb?sslmode=require`,
      { kind: "neon", endpoint: "ep-other-hill-d4e5f6", host: CHILD_HOST },
      NOT_PROD,
    ],
    [
      "Neon with a port, no query",
      `postgres://u:secret@${CHILD_HOST}:5432/neondb`,
      { kind: "neon", endpoint: "ep-other-hill-d4e5f6", host: CHILD_HOST },
      NOT_PROD,
    ],
    [
      "uppercase scheme and host",
      `POSTGRESQL://u:secret@${CHILD_HOST.toUpperCase()}/neondb`,
      { kind: "neon", endpoint: "ep-other-hill-d4e5f6", host: CHILD_HOST },
      NOT_PROD,
    ],
  ];

  it.each(ONE_HOST)("names %s", (_name, url, target) => {
    expect(databaseTargetOf(url)).toEqual(target);
  });

  it.each(ONE_HOST)("the guard decides %s on its host alone", (_name, url, _target, verdict) => {
    expect(checkProductionWrite(url, [], PROD_ENDPOINT)).toEqual(verdict);
  });

  /** The host the guard checks is the host postgres-js would connect to (built lazily, nothing connects). */
  it.each(ONE_HOST)(
    "postgres-js connects to the host the guard names: %s",
    async (_name, url, target) => {
      const sql = postgres(url, { max: 1, onnotice: () => {} });
      try {
        expect(sql.options.host.map((host) => host.toLowerCase())).toEqual([target.host]);
      } finally {
        await sql.end();
      }
    },
  );
});

/**
 * PG-T10 (b), Oleksii, 2026-10-19, verbatim: "Hosts: refuse any non-local host
 * that isn't ep-…[-pooler].<region>.aws.neon.tech, and --prod doesn't override
 * that." and "Local access: WSL-IP local Postgres access is lost; that's accepted."
 */
const NOT_A_NEON_HOST: ReadonlyArray<readonly [string, string]> = [
  [
    "a raw IP (the review's exploit host)",
    "postgresql://u:secret@3.125.0.1/neondb?sslmode=require",
  ],
  ["a WSL IP (local, but not a local host name)", "postgres://opika:opika@172.28.16.1:5433/opika"],
  ["another provider", "postgres://u:secret@db.example.org:6543/app"],
  [
    "a label in front of production's endpoint",
    `postgresql://u:secret@foo.${REVIEWS_PROD_ENDPOINT}.eu-central-1.aws.neon.tech/neondb`,
  ],
  [
    "a Neon host that isn't an endpoint",
    "postgresql://u:secret@api.eu-central-1.aws.neon.tech/neondb",
  ],
  ["an endpoint with no region", `postgresql://u:secret@${PROD_ENDPOINT}.neon.tech/neondb`],
  [
    "a second endpoint label (delta review of #144, finding 7)",
    `postgresql://u:secret@ep-foo.${REVIEWS_PROD_ENDPOINT}.eu-central-1.aws.neon.tech/neondb`,
  ],
  ["a region that isn't one", `postgresql://u:secret@${PROD_ENDPOINT}.x.aws.neon.tech/neondb`],
  [
    "an endpoint host under another domain",
    `postgresql://u:secret@${PROD_ENDPOINT}.eu-central-1.aws.neon.tech.example.org/neondb`,
  ],
  ["localhost, fully qualified", "postgres://opika:opika@localhost.:5433/opika"],
];

describe("a non-local host is a Neon endpoint host, or refused (PG-T10 (b))", () => {
  it.each(NOT_A_NEON_HOST)("checkProductionWrite refuses %s, --prod or not", (_name, url) => {
    for (const argv of [[], ["--prod"]]) {
      for (const prod of [PROD_ENDPOINT, REVIEWS_PROD_ENDPOINT, undefined]) {
        expect(checkProductionWrite(url, argv, prod, {})).toEqual({
          kind: "refused",
          reason: "not_a_neon_host",
        });
      }
    }
  });

  it.each(NOT_A_NEON_HOST)("migrateTargetCheck refuses %s", (_name, url) => {
    expect(migrateTargetCheck(url, PROD_ENDPOINT)).toEqual({
      kind: "refused",
      reason: "the target is not a Neon endpoint",
    });
  });

  /** Review of #144, finding 5: the label printed the dot-stripped host, which reads as local. */
  it("names a fully qualified localhost exactly as written", () => {
    expect(databaseTargetLine("postgres://opika:opika@localhost.:5433/opika")).toBe(
      "Target: remote host localhost. (not a Neon endpoint)",
    );
  });
});

/**
 * Oleksii, 2026-10-19, verbatim: "Environment: also refuse when any of these
 * are set: PGHOST, PGHOSTADDR, PGPORT, PGPASSWORD, PGOPTIONS, PGSERVICE,
 * PGSERVICEFILE. … DATABASE_URL is the only input the guard trusts." and
 * "Tests: the reviewer's exploit (raw IP plus PGPASSWORD=endpoint=…) and the
 * variant with a valid child-branch hostname plus that PGPASSWORD. Both must be
 * refused. Also a mutation that drops the env check must fail a test."
 */
describe("DATABASE_URL is the only input the guard trusts (2026-10-19)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const EXPLOIT_PASSWORD = `endpoint=${REVIEWS_PROD_ENDPOINT};pw`;
  const RAW_IP = "postgresql://neondb_owner@3.125.0.1/neondb?sslmode=require";
  const CHILD_NO_PASSWORD = `postgresql://neondb_owner@${CHILD_HOST}/neondb?sslmode=require`;

  it("his list, then the three postgres-js adds, in that order", () => {
    expect(AMBIENT_CONNECTION_VARIABLES).toEqual([
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
    ]);
  });

  it.each(AMBIENT_CONNECTION_VARIABLES)(
    "refuses with %s set, a local target and --prod included",
    (name) => {
      for (const url of [LOCAL, CHILD_BRANCH, PROD]) {
        for (const argv of [[], ["--prod"]]) {
          expect(checkProductionWrite(url, argv, PROD_ENDPOINT, { [name]: "x" })).toEqual({
            kind: "refused",
            reason: "ambient_settings",
            variables: [name],
          });
        }
      }
      // Set but empty still counts: the guard doesn't second-guess what a driver makes of "".
      expect(checkProductionWrite(LOCAL, [], undefined, { [name]: "" })).toMatchObject({
        reason: "ambient_settings",
      });
    },
  );

  it("names every one that is set, in the list's order", () => {
    const variables: AmbientConnectionVariable[] = ["PGHOST", "PGPASSWORD", "PGDATABASE"];
    expect(
      checkProductionWrite(LOCAL, [], undefined, { PGDATABASE: "a", PGPASSWORD: "b", PGHOST: "c" }),
    ).toEqual({ kind: "refused", reason: "ambient_settings", variables });
  });

  it("refuses the review's exploit: a raw IP plus PGPASSWORD naming production's endpoint", () => {
    expect(
      checkProductionWrite(RAW_IP, [], REVIEWS_PROD_ENDPOINT, { PGPASSWORD: EXPLOIT_PASSWORD }),
    ).toEqual({ kind: "refused", reason: "ambient_settings", variables: ["PGPASSWORD"] });
    // Each rule holds on its own: with the environment clean, the host rule still refuses it.
    expect(checkProductionWrite(RAW_IP, [], REVIEWS_PROD_ENDPOINT, {})).toEqual({
      kind: "refused",
      reason: "not_a_neon_host",
    });
  });

  /** The env check alone refuses this one: the URL by itself is a child branch, allowed. */
  it("refuses a valid child-branch host plus that PGPASSWORD", () => {
    expect(checkProductionWrite(CHILD_NO_PASSWORD, [], REVIEWS_PROD_ENDPOINT, {})).toEqual({
      kind: "allowed",
      reason: "not_production",
    });
    for (const argv of [[], ["--prod"]]) {
      expect(
        checkProductionWrite(CHILD_NO_PASSWORD, argv, REVIEWS_PROD_ENDPOINT, {
          PGPASSWORD: EXPLOIT_PASSWORD,
        }),
      ).toEqual({ kind: "refused", reason: "ambient_settings", variables: ["PGPASSWORD"] });
    }
  });

  it("reads the process environment when none is passed", () => {
    vi.stubEnv("PGPASSWORD", EXPLOIT_PASSWORD);
    expect(checkProductionWrite(CHILD_NO_PASSWORD, [], REVIEWS_PROD_ENDPOINT)).toMatchObject({
      reason: "ambient_settings",
    });
  });

  /** A smoke writes test data: the same rule, through its own guard. */
  it("smokeTarget refuses that PGPASSWORD too, naming the variable and not its value", () => {
    expect(
      smokeTarget(CHILD_NO_PASSWORD, "ep-other-hill-d4e5f6", REVIEWS_PROD_ENDPOINT, {
        PGPASSWORD: EXPLOIT_PASSWORD,
      }),
    ).toEqual({
      kind: "refused",
      reason:
        "set in the environment: PGPASSWORD. A driver reads it alongside DATABASE_URL, the only connection setting the guard checks. Unset it and put everything in DATABASE_URL (not printing any value)",
    });
    expect(
      smokeTarget(CHILD_NO_PASSWORD, "ep-other-hill-d4e5f6", REVIEWS_PROD_ENDPOINT, {}),
    ).toEqual({ kind: "ok", host: CHILD_HOST });
  });
});

/**
 * Oleksii, 2026-10-19, verbatim: "Refusal messages: they name the variable or
 * URL part, never print its value, and never print the URL." and "Odd host
 * printing the password (the older bug): add a test that no refusal or driver
 * error path prints the password." The driver paths are spawned below, in
 * "every writing CLI runs the guard first".
 */
const SENTINEL = "npg_S3NTINEL";
const SENTINEL_HOST = "203.0.113.7";

describe("no refusal prints the password, the URL or a variable's value", () => {
  afterEach(() => vi.restoreAllMocks());
  const NO_FILE = join(tmpdir(), "opika-prod-guard-no-such-file.env");
  const REFUSED: ReadonlyArray<readonly [string, string, Record<string, string>, string]> = [
    ["unparseable", `postgresql://u:${SENTINEL}@[not-a-host`, {}, "could not be parsed"],
    ["a fragment", `postgres://u:${SENTINEL}@localhost:5433/opika#x`, {}, "'#' fragment"],
    [
      "a host list",
      `postgresql://u:${SENTINEL}@localhost,${PROD_HOST}/neondb`,
      {},
      "several hosts",
    ],
    [
      "?options=",
      `postgresql://u:${SENTINEL}@${CHILD_HOST}/neondb?options=endpoint%3D${PROD_ENDPOINT}`,
      {},
      "its query string",
    ],
    [
      "options= in the password",
      `postgresql://u:options=${SENTINEL}@${SENTINEL_HOST}/neondb`,
      {},
      "its password carries",
    ],
    [
      "the older bug's host",
      `postgres://u:${SENTINEL}@xn--a.eu-central-1.aws.neon.tech/db`,
      {},
      // host_form where the http: reading rejects `xn--a` (Node 22), the host rule where it
      // doesn't (Node 24, CI): refused either way, and named.
      "the database URL",
    ],
    ["a raw IP", `postgresql://u:${SENTINEL}@${SENTINEL_HOST}/neondb`, {}, "neither local"],
    [
      "PGPASSWORD naming production",
      `postgresql://u@${CHILD_HOST}/neondb`,
      { PGPASSWORD: `endpoint=${PROD_ENDPOINT};${SENTINEL}`, PGHOST: SENTINEL_HOST },
      "set in the environment: PGHOST, PGPASSWORD.",
    ],
    [
      "production without --prod",
      `postgresql://u:${SENTINEL}@${PROD_HOST}/neondb`,
      {},
      "this target is PRODUCTION",
    ],
    [
      "PROD_NEON_ENDPOINT holding a URL",
      `postgresql://u:${SENTINEL}@${CHILD_HOST}/neondb`,
      { PROD_NEON_ENDPOINT: `postgresql://u:${SENTINEL}@${SENTINEL_HOST}/db` },
      "doesn't look like a Neon endpoint id",
    ],
  ];

  it.each(REFUSED)(
    "%s: names the rule, prints nothing of the URL or the value",
    (_name, url, extra, rule) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(process, "exit").mockImplementation((code) => {
        throw new Error(`exit ${code}`);
      });
      const env = { PROD_NEON_ENDPOINT: PROD_ENDPOINT, PROD_GUARD_ENV_FILE: NO_FILE, ...extra };
      expect(() => assertProductionWriteAllowed(url, ["node", "x"], env)).toThrow("exit 1");
      expect(error).toHaveBeenCalledTimes(1);
      const printed = String(error.mock.calls[0]?.[0]);
      expect(printed).toContain(rule);
      for (const leak of [
        SENTINEL,
        SENTINEL_HOST,
        "u:",
        "@",
        "xn--a",
        CHILD_HOST,
        PROD_HOST,
        PROD_ENDPOINT,
      ]) {
        expect(printed).not.toContain(leak);
      }
    },
  );
});

/**
 * Oleksii, 2026-10-13: db:check-hashes and db:migrate print which database
 * they ran against. Expected lines are written out literally, not rebuilt
 * from the helper's own pieces.
 */
describe("databaseTargetLine", () => {
  it("names a Neon target by its endpoint id, the same for the pooled and direct hostnames", () => {
    expect(databaseTargetLine(PROD)).toBe(
      "Target: Neon endpoint ep-quiet-lake-a1b2c3 (ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech)",
    );
    expect(databaseTargetLine(PROD_DIRECT)).toBe(
      "Target: Neon endpoint ep-quiet-lake-a1b2c3 (ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech)",
    );
    expect(databaseTargetOf(PROD)).toMatchObject({
      kind: "neon",
      endpoint: "ep-quiet-lake-a1b2c3",
    });
    expect(databaseTargetOf(PROD_DIRECT)).toMatchObject({
      kind: "neon",
      endpoint: "ep-quiet-lake-a1b2c3",
    });
  });

  it("normalises case and a trailing dot to the hostname the driver connects to", () => {
    expect(
      databaseTargetLine(
        "postgresql://u:secret@EP-QUIET-LAKE-A1B2C3-POOLER.EU-CENTRAL-1.AWS.NEON.TECH./neondb",
      ),
    ).toBe(
      "Target: Neon endpoint ep-quiet-lake-a1b2c3 (ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech)",
    );
  });

  it("names a local target by host, port and database", () => {
    expect(databaseTargetLine(LOCAL)).toBe("Target: local (localhost:5433/opika)");
    expect(databaseTargetLine("postgres://opika:opika@127.0.0.1/opika_test")).toBe(
      "Target: local (127.0.0.1:5432/opika_test)",
    );
    expect(databaseTargetLine("postgres://opika:opika@localhost:5433")).toBe(
      "Target: local (localhost:5433/<default database>)",
    );
  });

  /** Review of 4e30965, finding 2: a line that exists to be proof never guesses. */
  it("refuses to label a host list or an empty host, and says which", () => {
    expect(databaseTargetLine("postgres://u:p@ep-a-pooler.x.neon.tech,localhost/db")).toBe(
      "Target: DATABASE_URL can't be read as exactly one host (it lists several hosts), so it can't be named (not printing it).",
    );
    expect(databaseTargetLine("postgres:///opika")).toBe(
      "Target: DATABASE_URL can't be read as exactly one host (it names no host), so it can't be named (not printing it).",
    );
  });

  it("calls a non-Neon remote host neither Neon nor local", () => {
    expect(databaseTargetLine("postgres://u:secret@db.example.org:6543/app")).toBe(
      "Target: remote host db.example.org (not a Neon endpoint)",
    );
    // Merely containing "localhost" or "neon" doesn't make it either.
    expect(databaseTargetLine("postgres://localhost:secret@ep-x.neon.example.org/localhost")).toBe(
      "Target: remote host ep-x.neon.example.org (not a Neon endpoint)",
    );
  });

  it("refuses a URL that won't parse without echoing it", () => {
    expect(databaseTargetLine("postgresql://u:SECRETPW@[not-a-host")).toBe(
      "Target: DATABASE_URL could not be parsed (not printing it).",
    );
    expect(databaseTargetOf("not a url")).toEqual({ kind: "unparseable" });
  });

  /** No user, no password, no query string, in any variant. */
  it.each([
    [
      "neon pooled",
      "postgresql://alice:secret@ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&password=secret&options=secret",
    ],
    [
      "neon direct",
      "postgresql://alice:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech:5432/neondb?sslmode=require",
    ],
    ["local", "postgres://alice:secret@localhost:5433/opika?password=secret"],
    ["remote", "postgres://alice:secret@db.example.org/app?options=secret"],
    ["unparseable", "postgresql://alice:secret@[bad?password=secret"],
  ])("never prints credentials or the query string (%s)", (_name, url) => {
    const line = databaseTargetLine(url);
    expect(line).not.toContain("secret");
    expect(line).not.toContain("alice");
    expect(line).not.toContain("?");
    expect(line).not.toContain("sslmode");
  });
});

/** A read-only script given --prod must not announce a write (review of RG-Q10, finding 3). */
describe("assertProductionWriteAllowed's warning", () => {
  afterEach(() => vi.restoreAllMocks());
  const env = { PROD_NEON_ENDPOINT: PROD_ENDPOINT };

  it.each([
    ["write", "WARNING: writing to PRODUCTION (--prod given)."],
    ["read", "WARNING: reading PRODUCTION (--prod given)."],
  ] as const)("names a %s as what it is", (access, message) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    assertProductionWriteAllowed(PROD, ["node", "x", "--prod"], env, access);
    expect(error.mock.calls).toEqual([[message]]);
  });
});

/** PG-2: the scripts read production's endpoint from the gitignored .env.local themselves. */
describe("productionEndpoint", () => {
  const envFile = (contents: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "opika-prod-guard-"));
    const file = join(dir, ".env.local");
    writeFileSync(file, contents);
    return file;
  };

  it("reads PROD_NEON_ENDPOINT from the env file, and only that key", () => {
    const file = envFile("VERCEL_OIDC_TOKEN=abc\nPROD_NEON_ENDPOINT=ep-quiet-lake-a1b2c3\n");
    const env: Record<string, string | undefined> = { PROD_GUARD_ENV_FILE: file };
    expect(productionEndpoint(env)).toBe("ep-quiet-lake-a1b2c3");
    // Nothing else from the file is loaded into the environment.
    expect(env.VERCEL_OIDC_TOKEN).toBeUndefined();
    expect(process.env.VERCEL_OIDC_TOKEN === "abc").toBe(false);
  });

  it("prefers the process environment over the file", () => {
    const file = envFile("PROD_NEON_ENDPOINT=ep-from-file\n");
    expect(
      productionEndpoint({ PROD_NEON_ENDPOINT: "ep-from-env", PROD_GUARD_ENV_FILE: file }),
    ).toBe("ep-from-env");
  });

  it("is undefined when neither has it, so the guard fails closed", () => {
    expect(
      productionEndpoint({ PROD_GUARD_ENV_FILE: join(tmpdir(), "opika-no-such-file.env") }),
    ).toBeUndefined();
    expect(productionEndpoint({ PROD_GUARD_ENV_FILE: envFile("OTHER=1\n") })).toBeUndefined();
  });
});

/** AW-F1 (Oleksii: "a real --expect on db:migrate … tests for wrong and missing endpoints"). */
describe("parseMigrateArgs", () => {
  /** PG-F3: `--prod` and `--expect <ep>` and nothing else; nothing is handed on any more. */
  it("takes --prod and --expect <ep>, in any order", () => {
    expect(parseMigrateArgs(["--expect", "ep-other-hill-d4e5f6", "--prod"])).toEqual({
      kind: "ok",
      expect: "ep-other-hill-d4e5f6",
    });
  });

  it("reads --expect=ep-… the same as --expect ep-… (review of #124, finding 3)", () => {
    expect(parseMigrateArgs(["--expect=ep-other-hill-d4e5f6", "--prod"])).toEqual({
      kind: "ok",
      expect: "ep-other-hill-d4e5f6",
    });
    expect(parseMigrateArgs(["--expect="]).kind).toBe("refused");
  });

  it("reads --expect's value, and takes no arguments at all", () => {
    expect(parseMigrateArgs(["--prod", "--expect", "ep-other-hill-d4e5f6"])).toEqual({
      kind: "ok",
      expect: "ep-other-hill-d4e5f6",
    });
    expect(parseMigrateArgs([])).toEqual({ kind: "ok", expect: undefined });
  });

  it.each([
    ["--expect with nothing after it", ["--expect"]],
    ["--expect followed by another flag", ["--expect", "--prod"]],
  ])("refuses a missing endpoint: %s", (_case, argv) => {
    expect(parseMigrateArgs(argv)).toEqual({
      kind: "refused",
      reason: "--expect needs an endpoint id (ep-…) after it",
    });
  });

  it("refuses --expect given twice", () => {
    expect(parseMigrateArgs(["--expect", "ep-a1", "--expect", "ep-b2"])).toEqual({
      kind: "refused",
      reason: "--expect is given twice",
    });
  });
});

describe("migrateTargetCheck", () => {
  it("a local database needs no --expect", () => {
    expect(migrateTargetCheck(LOCAL, undefined)).toEqual({ kind: "ok" });
  });

  it("a local database takes no --expect: it names a Neon endpoint", () => {
    expect(migrateTargetCheck(LOCAL, "ep-other-hill-d4e5f6").kind).toBe("refused");
  });

  it("a Neon target without --expect is refused (the missing endpoint)", () => {
    expect(migrateTargetCheck(CHILD_BRANCH, undefined)).toEqual({
      kind: "refused",
      reason: "pass --expect ep-… (the target's Neon endpoint id)",
    });
  });

  it("a Neon target whose compute isn't --expect is refused (the wrong endpoint)", () => {
    expect(migrateTargetCheck(PROD_DIRECT, "ep-other-hill-d4e5f6")).toEqual({
      kind: "refused",
      reason: "the target's Neon endpoint is not --expect",
    });
  });

  it("the matching compute passes, pooled or direct, with or without -pooler on --expect", () => {
    expect(migrateTargetCheck(CHILD_BRANCH, "ep-other-hill-d4e5f6")).toEqual({ kind: "ok" });
    expect(migrateTargetCheck(PROD_DIRECT, "ep-quiet-lake-a1b2c3-pooler")).toEqual({ kind: "ok" });
  });

  it("a non-Neon remote host is refused", () => {
    expect(
      migrateTargetCheck("postgres://u:secret@db.example.org:5432/x", "ep-other-hill-d4e5f6").kind,
    ).toBe("refused");
  });
});

/**
 * The wiring, end to end: each real CLI, pointed at a fake "production",
 * must refuse before connecting to anything. A guard that exists but isn't
 * called by a script is decoration.
 */
/**
 * Each child CLI gets up to a minute (an `npx tsx` cold start takes seconds on Windows, more under
 * load), and the test around it gets that plus a margin. Under vitest's 15 s default the test
 * was stopped while its child was still inside its own minute, so these failed only under load,
 * as timeouts, never as assertions (19 s on a machine running two full checks at once).
 */
const SPAWN_TIMEOUT_MS = 60_000;
/** The environment each spawned CLI inherits, minus the variables the guard refuses on sight. */
const INHERITED_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !(AMBIENT_CONNECTION_VARIABLES as readonly string[]).includes(name.toUpperCase()),
  ),
);
const SPAWN_TEST_TIMEOUT_MS = SPAWN_TIMEOUT_MS + 30_000;

describe("every writing CLI runs the guard first", { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  const PKG = resolve(fileURLToPath(import.meta.url), "../..");
  // The developer's real .env.local must never decide a test's outcome.
  const NO_ENV_FILE = resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env");
  const run = (
    script: string,
    args: readonly string[] = [],
    target: { DATABASE_URL: string; PROD_NEON_ENDPOINT: string } = {
      DATABASE_URL: PROD_DIRECT,
      PROD_NEON_ENDPOINT: PROD_ENDPOINT,
    },
    extra: Record<string, string> = {},
  ) =>
    spawnSync("npx", ["tsx", "--import", "./test/no-network.mjs", script, ...args], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...INHERITED_ENV,
        ...target,
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
        LOCATION_HMAC_SECRET: "x".repeat(64),
        ...extra,
      },
      timeout: SPAWN_TIMEOUT_MS,
    });

  /** Fail closed through the real CLI: with production unconfigured, a Neon target is refused. */
  it("db:migrate refuses a non-local target when production isn't configured", () => {
    const env = { ...INHERITED_ENV, DATABASE_URL: CHILD_BRANCH, PROD_GUARD_ENV_FILE: NO_ENV_FILE };
    delete (env as Record<string, string | undefined>).PROD_NEON_ENDPOINT;
    const result = spawnSync("npx", ["tsx", "src/migrate.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env,
      timeout: SPAWN_TIMEOUT_MS,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("PROD_NEON_ENDPOINT is not set");
    expect(result.stderr).not.toContain("secret");
  });

  /** The STOP's finding 1: a URL that won't parse must not end up in a crash dump. */
  it("db:migrate refuses an unparseable URL without printing it", () => {
    const result = spawnSync("npx", ["tsx", "src/migrate.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...INHERITED_ENV,
        DATABASE_URL: "postgresql://u:SECRETPW@[not-a-host",
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
      },
      timeout: SPAWN_TIMEOUT_MS,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("could not be parsed");
    expect(result.stderr).not.toContain("SECRETPW");
  });

  /** Test setup drops every table: local only, with no override at all. */
  it("test database setup refuses a non-local TEST_DATABASE_URL", () => {
    const result = spawnSync("npx", ["tsx", "-e", "import('./src/test-utils/setup.ts')"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...INHERITED_ENV, TEST_DATABASE_URL: CHILD_BRANCH, PROD_GUARD_ENV_FILE: NO_ENV_FILE },
      timeout: SPAWN_TIMEOUT_MS,
    });
    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stderr).toContain("The test database must be local");
    expect(result.stderr).not.toContain("secret");
  });

  /**
   * Oleksii, 2026-10-13: the target is the first line, before any result or
   * failure. A fake Neon URL must never reach Neon, so the driver's one
   * transport is disabled in the child (test/no-network.mjs) and the run fails
   * right after printing it.
   */
  it("db:check-hashes prints the target first, before it fails to connect", () => {
    const result = spawnSync(
      "npx",
      ["tsx", "--import", "./test/no-network.mjs", "src/check-migration-hashes.ts"],
      {
        cwd: PKG,
        encoding: "utf8",
        shell: process.platform === "win32",
        env: { ...INHERITED_ENV, DATABASE_URL: PROD, PROD_GUARD_ENV_FILE: NO_ENV_FILE },
        timeout: SPAWN_TIMEOUT_MS,
      },
    );
    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stdout.split(/\r?\n/)[0]).toBe(
      "Target: Neon endpoint ep-quiet-lake-a1b2c3 (ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech)",
    );
    // It failed on the disabled network, not somewhere before reaching it.
    expect(result.stderr).toContain("network disabled by test/no-network.mjs");
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
  });

  it("db:check-hashes refuses an unparseable URL after saying so, without printing it", () => {
    const result = spawnSync("npx", ["tsx", "src/check-migration-hashes.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...INHERITED_ENV, DATABASE_URL: "postgresql://u:SECRETPW@[not-a-host" },
      timeout: SPAWN_TIMEOUT_MS,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout.split(/\r?\n/)[0]).toBe(
      "Target: DATABASE_URL could not be parsed (not printing it).",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain("SECRETPW");
  });

  /**
   * After the guard (a local target passes without a flag), before the migration, which then
   * fails on the closed local port.
   */
  it("db:migrate prints the target before it migrates", () => {
    const result = spawnSync("npx", ["tsx", "src/migrate.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...INHERITED_ENV,
        DATABASE_URL: "postgres://opika:secret@localhost:1/opika_print_target",
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
      },
      timeout: SPAWN_TIMEOUT_MS,
    });
    expect(result.stdout.split(/\r?\n/)[0]).toBe("Target: local (localhost:1/opika_print_target)");
    expect(result.stderr).toContain("ERROR: the migration failed:");
    expect(result.status, result.stderr).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
  });

  /** AW-F1 through the real CLI: the endpoint check runs after the guard and before anything else. */
  const migrateWith = (url: string, args: readonly string[]) =>
    spawnSync("npx", ["tsx", "--import", "./test/no-network.mjs", "src/migrate.ts", ...args], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...INHERITED_ENV,
        DATABASE_URL: url,
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
      },
      timeout: SPAWN_TIMEOUT_MS,
    });

  it("db:migrate refuses a non-production Neon target with no --expect (missing endpoint)", () => {
    const result = migrateWith(CHILD_BRANCH, []);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("pass --expect ep-…");
    expect(result.stdout).not.toContain("Target:");
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
  });

  it("db:migrate refuses production with --prod but the wrong --expect (wrong endpoint)", () => {
    const result = migrateWith(PROD_DIRECT, ["--prod", "--expect", "ep-other-hill-d4e5f6"]);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("the target's Neon endpoint is not --expect");
    expect(result.stdout).not.toContain("Target:");
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
  });

  it("db:migrate refuses --expect with no endpoint after it, before the guard", () => {
    const result = migrateWith(CHILD_BRANCH, ["--expect"]);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("--expect needs an endpoint id");
    expect(result.stdout).not.toContain("Target:");
  });

  /** The matching compute gets through both guards; the migration then meets the disabled network. */
  it("db:migrate with the matching --expect prints the target, then migrates (the network disabled)", () => {
    const result = migrateWith(CHILD_BRANCH, ["--expect", "ep-other-hill-d4e5f6"]);
    expect(result.stdout.split(/\r?\n/)[0]).toBe(
      "Target: Neon endpoint ep-other-hill-d4e5f6 (ep-other-hill-d4e5f6-pooler.eu-central-1.aws.neon.tech)",
    );
    // It reached the migration's connection, and the preload stopped it there.
    expect(result.stderr).toContain(
      "ERROR: the migration failed: network disabled by test/no-network.mjs",
    );
    expect(result.status, result.stderr).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
  });

  const WRITING_CLIS = [
    // Refused by the guard before the migration connects; `run`'s network preload stops it if not.
    ["db:migrate", "src/migrate.ts", []],
    ["db:seed", "src/seed.ts", ["--profile=demo", "--force", "--db-name=neondb"]],
    ["onboard:shelter", "src/onboard-shelter.ts", ["does-not-matter.json"]],
    // Read-only, but it reads every exact address, so it takes --prod too (RG-Q10).
    ["location:verify", "src/verify-locations.ts", []],
    ["admin:bootstrap", "src/admin.ts", ["bootstrap", "oleksii@example.org"]],
    ["admin:grant", "src/admin.ts", ["grant", "oleksii@example.org"]],
    ["admin:revoke", "src/admin.ts", ["revoke", "oleksii@example.org"]],
    ["admin:sweep-invites", "src/admin.ts", ["sweep-invites"]],
    // Deletes every kabinet sign-in (KH-Q12 rotation): the guard runs before --expect is checked.
    ["auth:revoke-all", "src/auth-revoke-all.ts", ["--commit"]],
  ] as const;

  /**
   * 2026-10-19: the review's example got through every one of these as
   * "local". With production's endpoint configured and --prod given, it is
   * still refused, before anything connects, and never echoed.
   */
  it.each(WRITING_CLIS)(
    "%s refuses the review's example, even with --prod",
    (_name, script, args) => {
      const result = run(script, [...args, "--prod"], {
        DATABASE_URL: REVIEWS_EXAMPLE,
        PROD_NEON_ENDPOINT: REVIEWS_PROD_ENDPOINT,
      });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain(
        "ERROR: the database URL can't be read as exactly one host: it has a '#' fragment. Only one host can be checked against production. Refusing (not printing it).",
      );
      expect(result.stderr).not.toContain("u:p@");
      expect(result.stderr).not.toContain("<region>");
      expect(result.stdout).not.toContain("Target:");
    },
  );

  /** demo:remove checks --expect before the guard: the same reading refuses it there first. */
  it("demo:remove refuses the review's example at its --expect check", () => {
    const result = run("src/demo-remove.ts", ["--expect", REVIEWS_PROD_ENDPOINT], {
      DATABASE_URL: REVIEWS_EXAMPLE,
      PROD_NEON_ENDPOINT: REVIEWS_PROD_ENDPOINT,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(
      "REFUSED: the target can't be read as exactly one host: it has a '#' fragment. Nothing was run.",
    );
    expect(result.stderr).not.toContain("u:p@");
    expect(result.stdout).not.toContain("Target:");
  });

  /** His exploit variant through every real CLI: a child-branch URL, PGPASSWORD naming production. */
  it.each(WRITING_CLIS)(
    "%s refuses a child-branch URL when PGPASSWORD names production, even with --prod",
    (_name, script, args) => {
      const result = run(
        script,
        [...args, "--prod"],
        {
          DATABASE_URL: `postgresql://neondb_owner@${CHILD_HOST}/neondb?sslmode=require`,
          PROD_NEON_ENDPOINT: PROD_ENDPOINT,
        },
        { PGPASSWORD: `endpoint=${PROD_ENDPOINT};${SENTINEL}` },
      );
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("ERROR: set in the environment: PGPASSWORD.");
      expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
      expect(result.stdout).not.toContain("Target:");
    },
  );

  it("demo:remove refuses it too, after its --expect check passes", () => {
    const result = run(
      "src/demo-remove.ts",
      ["--expect", "ep-other-hill-d4e5f6"],
      {
        DATABASE_URL: `postgresql://neondb_owner@${CHILD_HOST}/neondb?sslmode=require`,
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
      },
      { PGPASSWORD: `endpoint=${PROD_ENDPOINT};${SENTINEL}` },
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("ERROR: set in the environment: PGPASSWORD.");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  /**
   * db:full-reset has the identical --expect-then-guard ordering as
   * demo:remove (both read via `expectedTargetOf` before
   * `assertProductionWriteAllowed`), so it needs the same two dedicated
   * tests rather than joining `WRITING_CLIS` - a bare member there would
   * assert the generic guard's "ERROR: …" message where this script's own
   * --expect check actually answers first, with "REFUSED: …".
   */
  it("db:full-reset refuses the review's example at its --expect check", () => {
    const result = run("src/full-reset.ts", ["--expect", REVIEWS_PROD_ENDPOINT], {
      DATABASE_URL: REVIEWS_EXAMPLE,
      PROD_NEON_ENDPOINT: REVIEWS_PROD_ENDPOINT,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(
      "REFUSED: the target can't be read as exactly one host: it has a '#' fragment. Nothing was run.",
    );
    expect(result.stderr).not.toContain("u:p@");
    expect(result.stdout).not.toContain("Target:");
  });

  it("db:full-reset refuses it too, after its --expect check passes", () => {
    const result = run(
      "src/full-reset.ts",
      ["--expect", "ep-other-hill-d4e5f6"],
      {
        DATABASE_URL: `postgresql://neondb_owner@${CHILD_HOST}/neondb?sslmode=require`,
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
      },
      { PGPASSWORD: `endpoint=${PROD_ENDPOINT};${SENTINEL}` },
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("ERROR: set in the environment: PGPASSWORD.");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  /**
   * Tier 1 review finding 4, PR #199: db:full-reset's own `--prod`
   * requirement had no direct test - only the `--expect`-ordering exploits
   * above, which pass `--expect` a value matching the target on purpose to
   * reach the second guard. This is the plain case: a real production
   * target, a correct `--expect`, no `--prod` at all.
   */
  it("db:full-reset refuses production without --prod", () => {
    const result = run("src/full-reset.ts", ["--expect", PROD_ENDPOINT]);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("this target is PRODUCTION");
    expect(result.stderr).not.toContain("secret");
    expect(result.stderr).not.toContain("ep-quiet-lake");
    expect(result.stdout).not.toContain("Target:");
  });

  it("db:full-reset refuses the password-printing URLs before any driver sees them", () => {
    for (const url of [
      `postgres://u:${SENTINEL}@xn--a.eu-central-1.aws.neon.tech/db`,
      `postgresql://u:${SENTINEL}%zz@${CHILD_HOST}/neondb?sslmode=require`,
    ]) {
      const result = withNoNetwork("src/full-reset.ts", ["--expect", PROD_ENDPOINT, "--prod"], url);
      expect(result.status, result.stderr).toBe(1);
      expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
      expect(`${result.stdout}${result.stderr}`).not.toContain("network disabled");
    }
  });

  it.each([
    ["db:migrate", "src/migrate.ts", []],
    ["admin:sweep-invites", "src/admin.ts", ["sweep-invites"]],
  ] as const)(
    "%s refuses a raw IP even with --prod, printing neither it nor the password",
    (_name, script, args) => {
      const result = run(script, [...args, "--prod"], {
        DATABASE_URL: `postgresql://u:${SENTINEL}@${SENTINEL_HOST}/neondb`,
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
      });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain(
        "nor a Neon endpoint host (ep-…[-pooler].<region>.aws.neon.tech)",
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
      expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL_HOST);
    },
  );

  /**
   * Review of #144, finding 2: `xn--a.…` passed the old guard, then (on Node 22, whose URL parser
   * rejects it) neon() threw with the whole
   * connection string, password included (admin and db:check-hashes). The child's one transport
   * is disabled, so nothing reaches Neon even on a regression.
   */
  const withNoNetwork = (
    script: string,
    args: readonly string[],
    url: string,
    extra: Record<string, string> = {},
  ) =>
    spawnSync("npx", ["tsx", "--import", "./test/no-network.mjs", script, ...args], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...INHERITED_ENV,
        DATABASE_URL: url,
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
        ...extra,
      },
      timeout: SPAWN_TIMEOUT_MS,
    });

  it.each([
    ["admin:sweep-invites", "src/admin.ts", ["sweep-invites"]],
    ["db:check-hashes", "src/check-migration-hashes.ts", []],
  ] as const)(
    "%s refuses the password-printing URLs before any driver sees them",
    (_name, script, args) => {
      for (const url of [
        `postgres://u:${SENTINEL}@xn--a.eu-central-1.aws.neon.tech/db`,
        `postgresql://u:${SENTINEL}%zz@${CHILD_HOST}/neondb?sslmode=require`,
      ]) {
        const result = withNoNetwork(script, args, url);
        expect(result.status, result.stderr).toBe(1);
        expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
        expect(`${result.stdout}${result.stderr}`).not.toContain("network disabled");
      }
    },
  );

  /** A target that passes every check reaches the driver; its failure still prints no password. */
  it.each([
    [
      "a Neon host, the network disabled",
      `postgresql://u:${SENTINEL}@${CHILD_HOST}/neondb?sslmode=require`,
      "network disabled by test/no-network.mjs",
    ],
    [
      "a local host with nothing listening",
      `postgres://u:${SENTINEL}@localhost:1/opika_no_listener`,
      "ECONNREFUSED",
    ],
  ])("admin's driver error prints no password: %s", (_name, url, failure) => {
    const result = withNoNetwork("src/admin.ts", ["sweep-invites"], url);
    expect(result.status).not.toBe(0);
    // It failed in the driver, not somewhere before reaching it.
    expect(`${result.stdout}${result.stderr}`).toContain(failure);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  it("db:check-hashes refuses a host that is neither local nor Neon, before connecting", () => {
    const result = withNoNetwork(
      "src/check-migration-hashes.ts",
      [],
      `postgresql://u:${SENTINEL}@${SENTINEL_HOST}/neondb`,
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(
      "ERROR: the host is neither local nor a Neon endpoint host (ep-…[-pooler].<region>.aws.neon.tech). Refusing (not printing it).",
    );
    expect(result.stderr).not.toContain("network disabled");
    // Refused before the target line, which would name the host.
    expect(result.stdout).not.toContain("Target:");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL_HOST);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  it("db:check-hashes refuses when PGPASSWORD is set, before connecting", () => {
    const result = withNoNetwork(
      "src/check-migration-hashes.ts",
      [],
      `postgresql://neondb_owner@${CHILD_HOST}/neondb`,
      { PGPASSWORD: `endpoint=${PROD_ENDPOINT};${SENTINEL}` },
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("ERROR: set in the environment: PGPASSWORD.");
    expect(result.stderr).not.toContain("network disabled");
    expect(result.stdout).not.toContain("Target:");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SENTINEL);
  });

  it.each(WRITING_CLIS)("%s refuses production without --prod", (_name, script, args) => {
    const result = run(script, args);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("this target is PRODUCTION");
    // Never echo the URL, even while refusing it.
    expect(result.stderr).not.toContain("secret");
    expect(result.stderr).not.toContain("ep-quiet-lake");
    // A refused target gets the refusal only: the Target line comes after the
    // guard, never before it (review of 4e30965, finding 1).
    expect(result.stdout).not.toContain("Target:");
  });
});
