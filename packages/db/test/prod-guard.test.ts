import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drizzleKitArgs } from "../src/migrate-args";
import { checkProductionWrite } from "../src/prod-guard";

/** Fake endpoints only. Nothing here resolves, and nothing should try. */
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
    expect(checkProductionWrite(url, [], PROD)).toEqual({ kind: "allowed", reason: "local" });
    expect(checkProductionWrite(url, [], undefined)).toEqual({ kind: "allowed", reason: "local" });
  });

  it("refuses production without --prod", () => {
    expect(checkProductionWrite(PROD, [], PROD)).toEqual({
      kind: "refused",
      reason: "production_without_flag",
    });
  });

  /** One compute, two hostnames: comparing hostnames alone would let this through. */
  it("refuses production under its other hostname too", () => {
    expect(checkProductionWrite(PROD_DIRECT, [], PROD)).toEqual({
      kind: "refused",
      reason: "production_without_flag",
    });
  });

  it("allows production with an explicit --prod", () => {
    expect(checkProductionWrite(PROD, ["--prod"], PROD)).toEqual({
      kind: "allowed",
      reason: "production_flagged",
    });
  });

  it("lets a different Neon compute (a child branch) through", () => {
    expect(checkProductionWrite(CHILD_BRANCH, [], PROD)).toEqual({
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
    expect(checkProductionWrite(sneaky, [], PROD).kind).toBe("refused");
  });
});

describe("checkProductionWrite edge cases", () => {
  it.each([
    [
      "uppercase hostname",
      "postgresql://u:secret@EP-QUIET-LAKE-A1B2C3.EU-CENTRAL-1.AWS.NEON.TECH/neondb",
    ],
    [
      "explicit port and options",
      "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech:5432/neondb?sslmode=require&options=x",
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
    expect(checkProductionWrite(url, [], PROD)).toEqual({
      kind: "refused",
      reason: "production_without_flag",
    });
  });

  it("refuses a target or production URL that won't parse, rather than throwing", () => {
    expect(checkProductionWrite("not a url", [], PROD)).toEqual({
      kind: "refused",
      reason: "unparseable",
    });
    expect(checkProductionWrite(CHILD_BRANCH, [], "also not a url")).toEqual({
      kind: "refused",
      reason: "unparseable",
    });
  });
});

describe("drizzleKitArgs", () => {
  /** `--prod` is this package's flag; drizzle-kit doesn't know it. */
  it("passes everything through except --prod", () => {
    expect(drizzleKitArgs(["--prod", "--verbose"])).toEqual(["migrate", "--verbose"]);
    expect(drizzleKitArgs([])).toEqual(["migrate"]);
  });
});

/**
 * The wiring, end to end: each real CLI, pointed at a fake "production",
 * must refuse before connecting to anything. A guard that exists but isn't
 * called by a script is decoration.
 */
describe("every writing CLI runs the guard first", () => {
  const PKG = resolve(fileURLToPath(import.meta.url), "../..");
  const run = (script: string, args: readonly string[] = []) =>
    spawnSync("npx", ["tsx", script, ...args], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        DATABASE_URL: PROD_DIRECT,
        PROD_NEON_DATABASE_URL: PROD,
        LOCATION_HMAC_SECRET: "x".repeat(64),
      },
      timeout: 60_000,
    });

  /** Fail closed through the real CLI: with production unconfigured, a Neon target is refused. */
  it("db:migrate refuses a non-local target when production isn't configured", () => {
    const env = { ...process.env, DATABASE_URL: CHILD_BRANCH };
    delete (env as Record<string, string | undefined>).PROD_NEON_DATABASE_URL;
    const result = spawnSync("npx", ["tsx", "src/migrate.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env,
      timeout: 60_000,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("PROD_NEON_DATABASE_URL is not set");
    expect(result.stderr).not.toContain("secret");
  });

  /** The STOP's finding 1: a URL that won't parse must not end up in a crash dump. */
  it("db:migrate refuses an unparseable URL without printing it", () => {
    const result = spawnSync("npx", ["tsx", "src/migrate.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://u:SECRETPW@[not-a-host",
        PROD_NEON_DATABASE_URL: PROD,
      },
      timeout: 60_000,
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
      env: { ...process.env, TEST_DATABASE_URL: CHILD_BRANCH },
      timeout: 60_000,
    });
    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stderr).toContain("TEST_DATABASE_URL is not a local database");
    expect(result.stderr).not.toContain("secret");
  });

  it.each([
    ["db:migrate", "src/migrate.ts", []],
    ["db:seed", "src/seed.ts", ["--profile=demo", "--force", "--db-name=neondb"]],
    ["onboard:shelter", "src/onboard-shelter.ts", ["does-not-matter.json"]],
  ] as const)("%s refuses production without --prod", (_name, script, args) => {
    const result = run(script, args);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("this target is PRODUCTION");
    // Never echo the URL, even while refusing it.
    expect(result.stderr).not.toContain("secret");
    expect(result.stderr).not.toContain("ep-quiet-lake");
  });
});
