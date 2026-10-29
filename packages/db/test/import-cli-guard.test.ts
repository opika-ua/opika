import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseImportArgs, reportLines } from "../src/import/import-settlements";
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
  it("reads --file, --commit and --expect, and takes --prod without effect", () => {
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
      hiddenFromPicker: 2,
      perRegion: { UA32: 10 },
      unmanagedRows: 0,
    }).join("\n");
    expect(text).toContain("insert 14, adopt 8");
    expect(text).toContain("7 aliases to add");
    expect(text).toContain("Hidden from the picker (Crimea, Sevastopol): 2");
  });
});

/**
 * The real CLIs, spawned: both refuse a production target before reading a file, a database or
 * anything else, with `--prod` given. Fake endpoints, and a network that is disabled in the child
 * as a second line of defence, though the guard exits first.
 */
describe("db:seed and db:import-settlements refuse production even with --prod", () => {
  const PKG = resolve(fileURLToPath(import.meta.url), "../..");
  const NO_ENV_FILE = resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env");
  const INHERITED_ENV = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !(AMBIENT_CONNECTION_VARIABLES as readonly string[]).includes(name.toUpperCase()),
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

  it.each([
    ["db:seed", "src/seed.ts", ["--prod", "--profile=demo", "--force", "--db-name=neondb"]],
    [
      "db:import-settlements",
      "src/import/import-settlements.ts",
      ["--file", "nope.xlsx", "--commit", "--prod", "--expect", "ep-quiet-lake-a1b2c3"],
    ],
  ])("%s", { timeout: 90_000 }, (_name, script, args) => {
    for (const url of [PROD, PROD_DIRECT]) {
      const result = run(script, args, url, PROD_ENDPOINT);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("never runs against production");
      expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
      // It stopped at the guard: no target line, no file read, no connection attempt.
      expect(result.stdout).not.toContain("Target:");
      expect(result.stderr).not.toContain("nope.xlsx");
    }
  });

  it("db:import-settlements refuses a Neon target when production is not configured", {
    timeout: 90_000,
  }, () => {
    const result = run(
      "src/import/import-settlements.ts",
      ["--file", "nope.xlsx", "--prod", "--expect", "ep-other-hill-d4e5f6"],
      CHILD_BRANCH,
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("PROD_NEON_ENDPOINT is not set");
  });
});
