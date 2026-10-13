import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drizzleKitArgs } from "../src/migrate-args";
import { checkProductionWrite, productionEndpoint } from "../src/prod-guard";

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
  // The developer's real .env.local must never decide a test's outcome.
  const NO_ENV_FILE = resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env");
  const run = (script: string, args: readonly string[] = []) =>
    spawnSync("npx", ["tsx", script, ...args], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        DATABASE_URL: PROD_DIRECT,
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
        LOCATION_HMAC_SECRET: "x".repeat(64),
      },
      timeout: 60_000,
    });

  /** Fail closed through the real CLI: with production unconfigured, a Neon target is refused. */
  it("db:migrate refuses a non-local target when production isn't configured", () => {
    const env = { ...process.env, DATABASE_URL: CHILD_BRANCH, PROD_GUARD_ENV_FILE: NO_ENV_FILE };
    delete (env as Record<string, string | undefined>).PROD_NEON_ENDPOINT;
    const result = spawnSync("npx", ["tsx", "src/migrate.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env,
      timeout: 60_000,
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
        ...process.env,
        DATABASE_URL: "postgresql://u:SECRETPW@[not-a-host",
        PROD_NEON_ENDPOINT: PROD_ENDPOINT,
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
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
      env: { ...process.env, TEST_DATABASE_URL: CHILD_BRANCH, PROD_GUARD_ENV_FILE: NO_ENV_FILE },
      timeout: 60_000,
    });
    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stderr).toContain("The test database must be local");
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
