import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseImportArgs, preflightLines, reportLines } from "../src/import/import-settlements";
import { decideImportTarget } from "../src/import/import-target";
import type { ReadinessScan } from "../src/import/readiness";
import {
  AMBIENT_CONNECTION_VARIABLES,
  assertNotProductionTarget,
  checkNonProductionTarget,
} from "../src/prod-guard";

/** Fake endpoints only. Nothing here resolves, and nothing should try. */
const PROD_ENDPOINT = "ep-quiet-lake-a1b2c3";
const PROD = "postgresql://u:secret@ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb";
const PROD_DIRECT = "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech/neondb";
const CHILD_BRANCH =
  "postgresql://u:secret@ep-other-hill-d4e5f6-pooler.eu-central-1.aws.neon.tech/neondb";
const LOCAL = "postgres://opika:opika@localhost:5433/opika";

describe("checkNonProductionTarget", () => {
  it("lets a local database and a different Neon compute through", () => {
    expect(checkNonProductionTarget(LOCAL, [], PROD_ENDPOINT)).toMatchObject({ kind: "allowed" });
    expect(checkNonProductionTarget(CHILD_BRANCH, [], PROD_ENDPOINT)).toEqual({
      kind: "allowed",
      reason: "not_production",
    });
  });

  it.each([
    ["pooled", PROD],
    ["direct", PROD_DIRECT],
  ])("refuses production (%s hostname) with --prod exactly as without it", (_name, url) => {
    for (const argv of [[], ["--prod"], ["--commit", "--prod"]]) {
      expect(checkNonProductionTarget(url, argv, PROD_ENDPOINT)).toEqual({
        kind: "refused",
        reason: "production_without_flag",
      });
    }
  });

  it("refuses a Neon target when production is unknown, --prod or not (fail closed)", () => {
    for (const argv of [[], ["--prod"]]) {
      expect(checkNonProductionTarget(CHILD_BRANCH, argv, undefined)).toEqual({
        kind: "refused",
        reason: "production_unknown",
      });
    }
  });

  it("is the same guard otherwise: ambient settings and non-Neon hosts are refused too", () => {
    expect(checkNonProductionTarget(LOCAL, [], PROD_ENDPOINT, { PGHOST: "x" })).toMatchObject({
      kind: "refused",
      reason: "ambient_settings",
    });
    expect(
      checkNonProductionTarget("postgres://u:p@10.0.0.5/db", ["--prod"], PROD_ENDPOINT),
    ).toEqual({ kind: "refused", reason: "not_a_neon_host" });
  });
});

describe("assertNotProductionTarget", () => {
  afterEach(() => vi.restoreAllMocks());
  const refused = (url: string, argv: readonly string[], env: Record<string, string>) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertNotProductionTarget(url, argv, "Doing the thing", env)).toThrow(
      "process.exit called",
    );
    expect(exit).toHaveBeenCalledWith(1);
    return error.mock.calls.map((c) => String(c[0])).join("\n");
  };
  const NO_FILE = { PROD_GUARD_ENV_FILE: resolve(tmpdir(), "opika-no-such-env-file") };

  it("tells a production target that --prod does nothing here, without printing the URL", () => {
    const message = refused(PROD, ["--prod"], { PROD_NEON_ENDPOINT: PROD_ENDPOINT, ...NO_FILE });
    expect(message).toContain("Doing the thing never runs against production");
    expect(message).toContain("--prod does not change that");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("a1b2c3");
  });

  it("refuses when production is unknown, saying so", () => {
    const message = refused(CHILD_BRANCH, ["--prod"], NO_FILE);
    expect(message).toContain("PROD_NEON_ENDPOINT is not set");
    expect(message).not.toContain("secret");
  });

  it("returns for a child branch", () => {
    const exit = vi.spyOn(process, "exit");
    assertNotProductionTarget(CHILD_BRANCH, [], "Doing the thing", {
      PROD_NEON_ENDPOINT: PROD_ENDPOINT,
      ...NO_FILE,
    });
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("parseImportArgs", () => {
  it("reads --file, --commit and --expect, and reads --prod away (the target decision reads it from argv)", () => {
    expect(
      parseImportArgs(["--file", "c.xlsx", "--commit", "--expect", "ep-a-1", "--prod"]),
    ).toEqual({
      kind: "ok",
      file: "c.xlsx",
      commit: true,
      expect: "ep-a-1",
    });
    expect(parseImportArgs(["--file=c.xlsx"])).toMatchObject({ commit: false, expect: undefined });
  });

  it("refuses a missing file, an unknown flag and a bare --expect", () => {
    expect(parseImportArgs([])).toMatchObject({ kind: "refused" });
    expect(parseImportArgs(["--file", "c.xlsx", "--force"])).toMatchObject({ kind: "refused" });
    expect(parseImportArgs(["--file", "c.xlsx", "--expect"])).toMatchObject({ kind: "refused" });
  });
});

describe("reportLines", () => {
  it("prints counts only", () => {
    const text = reportLines({
      edition: "2099-01-01",
      settlements: 22,
      byCategory: { K: 2, M: 8, X: 1, C: 11 },
      inserted: 14,
      adopted: 8,
      updated: 0,
      unchanged: 0,
      renamedSlugs: 0,
      aliasesAdded: 7,
      retired: 0,
      nameScopes: {
        unique_in_ukraine: 1,
        unique_in_region: 2,
        unique_in_district: 3,
        shared_in_district: 4,
      },
      slugSuffixes: 0,
      perRegion: { UA32: 10 },
      unmanagedRows: 0,
    }).join("\n");
    expect(text).toContain("insert 14, adopt 8");
    expect(text).toContain("7 aliases to add");
    expect(text).not.toMatch(/hidden/i);
  });
});

const CLEAR: ReadinessScan = { kind: "clear", filesScanned: 12 };
const BLOCKED: ReadinessScan = {
  kind: "blocked",
  filesScanned: 12,
  // Written in pieces so a repository-wide search for the removed name stays empty.
  findings: [{ file: "apps/web/src/some-page.ts", line: 7, name: ["cities", ".list"].join("") }],
};

describe("decideImportTarget", () => {
  const NO_FILE = { PROD_GUARD_ENV_FILE: resolve(tmpdir(), "opika-no-such-env-file") };
  const ENV = { PROD_NEON_ENDPOINT: PROD_ENDPOINT, ...NO_FILE };
  const CHILD_ENDPOINT = "ep-other-hill-d4e5f6";
  const decide = (
    url: string,
    argv: readonly string[],
    expect: string | undefined,
    options: { env?: Record<string, string>; scan?: () => ReadinessScan } = {},
  ) =>
    decideImportTarget({
      url,
      argv,
      expect,
      env: options.env ?? ENV,
      scan: options.scan ?? (() => CLEAR),
    });
  const reason = (target: ReturnType<typeof decide>) =>
    target.kind === "refused" ? target.reason : "";

  it("lets production through only with --prod, --expect equal to the compute, and a clear scan", () => {
    for (const url of [PROD, PROD_DIRECT]) {
      expect(decide(url, ["--prod"], PROD_ENDPOINT)).toEqual({
        kind: "ok",
        scope: "production",
        filesScanned: 12,
      });
      // The pooled spelling of --expect names the same compute.
      expect(decide(url, ["--prod"], `${PROD_ENDPOINT}-pooler`)).toMatchObject({
        scope: "production",
      });
    }
  });

  it("refuses production without --prod, naming what it needs", () => {
    const message = reason(decide(PROD, [], PROD_ENDPOINT));
    expect(message).toContain("PRODUCTION");
    expect(message).toContain("needs --prod");
    expect(message).not.toContain("secret");
  });

  it("refuses production with --prod but no --expect, or a wrong one", () => {
    expect(reason(decide(PROD, ["--prod"], undefined))).toContain("--expect");
    expect(reason(decide(PROD, ["--prod"], CHILD_ENDPOINT))).toContain("not --expect");
    expect(reason(decide(PROD, ["--prod"], "not-an-endpoint"))).toContain("--expect");
  });

  it("refuses --prod when production is not configured, and a Neon target too (fail closed)", () => {
    // `--expect` equal to the target is not enough: nothing says this target is not elsewhere.
    expect(reason(decide(PROD, ["--prod"], PROD_ENDPOINT, { env: NO_FILE }))).toContain(
      "PROD_NEON_ENDPOINT is not set",
    );
    expect(reason(decide(CHILD_BRANCH, ["--prod"], CHILD_ENDPOINT, { env: NO_FILE }))).toContain(
      "PROD_NEON_ENDPOINT is not set",
    );
    expect(reason(decide(CHILD_BRANCH, [], CHILD_ENDPOINT, { env: NO_FILE }))).toContain(
      "PROD_NEON_ENDPOINT is not set",
    );
  });

  it("refuses production when the readiness scan is blocked or could not run, saying exactly why", () => {
    const blocked = reason(decide(PROD, ["--prod"], PROD_ENDPOINT, { scan: () => BLOCKED }));
    expect(blocked).toContain("still reads the full city list");
    expect(blocked).toContain("apps/web/src/some-page.ts:7");
    const unscannable = reason(
      decide(PROD, ["--prod"], PROD_ENDPOINT, {
        scan: () => ({ kind: "unscannable", reason: "no source files were found" }),
      }),
    );
    expect(unscannable).toContain("could not read the source tree");
  });

  it("does not run the scan until every other condition holds", () => {
    let scans = 0;
    const scan = () => {
      scans += 1;
      return CLEAR;
    };
    decide(PROD, [], PROD_ENDPOINT, { scan });
    decide(PROD, ["--prod"], undefined, { scan });
    decide(PROD, ["--prod"], CHILD_ENDPOINT, { scan });
    decide(PROD, ["--prod"], PROD_ENDPOINT, { env: NO_FILE, scan });
    expect(scans).toBe(0);
  });

  it("does not run the scan for a child branch or a local database, which it allows", () => {
    const scan = () => {
      throw new Error("the scan is for production only");
    };
    expect(decide(CHILD_BRANCH, [], CHILD_ENDPOINT, { scan })).toEqual({
      kind: "ok",
      scope: "child_branch",
      filesScanned: null,
    });
    expect(decide(LOCAL, [], undefined, { scan })).toMatchObject({ scope: "local" });
  });

  it("still refuses what it can't classify, and --prod on a target that is not production", () => {
    expect(reason(decide(CHILD_BRANCH, [], undefined))).toContain("--expect");
    expect(reason(decide(CHILD_BRANCH, [], PROD_ENDPOINT))).toContain("not --expect");
    expect(reason(decide(CHILD_BRANCH, ["--prod"], CHILD_ENDPOINT))).toContain("not production");
    expect(reason(decide(LOCAL, ["--prod"], undefined))).toContain("not production");
    expect(reason(decide("postgres://u:p@10.0.0.5/db", ["--prod"], PROD_ENDPOINT))).toContain(
      "Neon endpoint host",
    );
    expect(
      reason(decide(PROD, ["--prod"], PROD_ENDPOINT, { env: { ...ENV, PGHOST: "x" } })),
    ).toContain("PGHOST");
  });

  it("never echoes a URL or an endpoint in a refusal", () => {
    for (const target of [
      decide(PROD, [], PROD_ENDPOINT),
      decide(PROD, ["--prod"], CHILD_ENDPOINT),
      decide(PROD, ["--prod"], PROD_ENDPOINT, { scan: () => BLOCKED }),
    ]) {
      expect(reason(target)).not.toContain("secret");
      expect(reason(target)).not.toContain("a1b2c3");
    }
  });
});

describe("preflightLines", () => {
  const report = { adopted: 8, unmanagedRows: 0 } as Parameters<typeof preflightLines>[1];
  const pre = { cities: 8, withCode: 0, withoutCode: 8, aliases: 0 };

  it("states the starting point and that adoption keeps ids", () => {
    const text = preflightLines(pre, report, "production").join("\n");
    expect(text).toContain("8 cities now (0 with a code, 8 without), 0 slug aliases");
    expect(text).toContain("8 legacy cities to adopt in place");
    expect(text).not.toContain("WARNING");
  });

  it("is loud in production about rows that are not the 8 legacy cities, and only there", () => {
    const stray = { ...report, unmanagedRows: 2 };
    expect(preflightLines(pre, stray, "production").join("\n")).toContain("WARNING: 2 row(s)");
    expect(preflightLines(pre, stray, "child_branch").join("\n")).not.toContain("WARNING");
  });
});

/**
 * The real CLIs, spawned. Fake endpoints and a network disabled in the child: every case here
 * stops before any connection. A refusal stops at the guard; the accepted cases get as far as the
 * file read (a path that doesn't exist) and print the target line, which comes first.
 */
describe("the CLIs, spawned", () => {
  const PKG = resolve(fileURLToPath(import.meta.url), "../..");
  const NO_ENV_FILE = resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env");
  const CHILD_ENDPOINT = "ep-other-hill-d4e5f6";
  const INHERITED_ENV = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !(AMBIENT_CONNECTION_VARIABLES as readonly string[]).includes(name.toUpperCase()) &&
        name.toUpperCase() !== "PROD_NEON_ENDPOINT",
    ),
  );
  const run = (script: string, args: readonly string[], url: string, endpoint?: string) =>
    spawnSync("npx", ["tsx", "--import", "./test/no-network.mjs", script, ...args], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...INHERITED_ENV,
        DATABASE_URL: url,
        ...(endpoint === undefined ? {} : { PROD_NEON_ENDPOINT: endpoint }),
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
      },
      timeout: 60_000,
    });
  const IMPORT = "src/import/import-settlements.ts";
  const FILE = ["--file", "nope.xlsx"];
  const output = (r: ReturnType<typeof run>) => `${r.stdout}${r.stderr}`;

  it("db:seed refuses production even with --prod", { timeout: 90_000 }, () => {
    for (const url of [PROD, PROD_DIRECT]) {
      const result = run(
        "src/seed.ts",
        ["--prod", "--profile=demo", "--force", "--db-name=neondb"],
        url,
        PROD_ENDPOINT,
      );
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("never runs against production");
      expect(output(result)).not.toContain("secret");
      expect(result.stdout).not.toContain("Target:");
    }
  });

  it.each([
    [
      "without --prod",
      [...FILE, "--commit", "--expect", PROD_ENDPOINT],
      PROD_ENDPOINT,
      "needs --prod",
    ],
    ["with --prod but no --expect", [...FILE, "--prod"], PROD_ENDPOINT, "--expect"],
    [
      "with --prod and a wrong --expect",
      [...FILE, "--prod", "--expect", CHILD_ENDPOINT],
      PROD_ENDPOINT,
      "not --expect",
    ],
    [
      "when PROD_NEON_ENDPOINT is unset",
      [...FILE, "--prod", "--expect", PROD_ENDPOINT],
      undefined,
      "PROD_NEON_ENDPOINT is not set",
    ],
  ])(
    "db:import-settlements refuses production %s",
    {
      timeout: 90_000,
    },
    (_name, args, endpoint, text) => {
      const result = run(IMPORT, args, PROD, endpoint);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain(text);
      expect(output(result)).not.toContain("secret");
      expect(output(result)).not.toContain("a1b2c3");
      // It stopped at the guard: no target line, no file read, no connection attempt.
      expect(result.stdout).not.toContain("Target:");
      expect(result.stderr).not.toContain("cannot read");
    },
  );

  it("db:import-settlements refuses --prod on a child branch", { timeout: 90_000 }, () => {
    const result = run(
      IMPORT,
      [...FILE, "--prod", "--expect", CHILD_ENDPOINT],
      CHILD_BRANCH,
      PROD_ENDPOINT,
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("not production");
    expect(result.stdout).not.toContain("Target:");
  });

  it("db:import-settlements refuses a Neon target when production is not configured", {
    timeout: 90_000,
  }, () => {
    const result = run(IMPORT, [...FILE, "--expect", CHILD_ENDPOINT], CHILD_BRANCH);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("PROD_NEON_ENDPOINT is not set");
  });

  it("db:import-settlements accepts exactly the production compute, then stops at the missing file", {
    timeout: 90_000,
  }, () => {
    // The real source tree is scanned here, so this also fails if a full-list read is back in it.
    for (const url of [PROD, PROD_DIRECT]) {
      const result = run(
        IMPORT,
        [...FILE, "--commit", "--prod", "--expect", PROD_ENDPOINT],
        url,
        PROD_ENDPOINT,
      );
      expect(result.status, output(result)).toBe(1);
      expect(result.stdout).toContain(`Target: Neon endpoint ${PROD_ENDPOINT}`);
      expect(result.stdout).toContain("PRODUCTION target: --prod given");
      expect(result.stdout).toContain("--commit: WRITING.");
      expect(result.stderr).toContain("cannot read --file");
      expect(output(result)).not.toContain("secret");
    }
  });

  it("db:import-settlements accepts a child branch with --expect alone, then stops at the missing file", {
    timeout: 90_000,
  }, () => {
    const result = run(IMPORT, [...FILE, "--expect", CHILD_ENDPOINT], CHILD_BRANCH, PROD_ENDPOINT);
    expect(result.status, output(result)).toBe(1);
    expect(result.stdout).toContain(`Target: Neon endpoint ${CHILD_ENDPOINT}`);
    expect(result.stdout).not.toContain("PRODUCTION target");
    expect(result.stderr).toContain("cannot read --file");
  });
});
