import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drizzleKitArgs } from "../src/migrate-args";
import {
  assertProductionWriteAllowed,
  checkProductionWrite,
  databaseTargetLine,
  databaseTargetOf,
  productionEndpoint,
} from "../src/prod-guard";

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
  /**
   * Review of 9ce9bc1, finding 1: postgres-js fails over through a comma host
   * list, so production second in line was reached without --prod; and an
   * empty host goes wherever PGHOST points. Both are refused, never guessed.
   */
  it("refuses a host list with production anywhere in it, and an empty host", () => {
    for (const url of [
      `postgresql://u:secret@ep-other-hill-d4e5f6.eu-central-1.aws.neon.tech,${PROD_ENDPOINT}-pooler.eu-central-1.aws.neon.tech/neondb`,
      "postgresql://u:secret@localhost,ep-other-hill-d4e5f6.eu-central-1.aws.neon.tech/neondb",
      "postgres:///opika",
    ]) {
      expect(checkProductionWrite(url, [], PROD_ENDPOINT)).toEqual({
        kind: "refused",
        reason: "ambiguous_host",
      });
      expect(checkProductionWrite(url, ["--prod"], PROD_ENDPOINT)).toEqual({
        kind: "refused",
        reason: "ambiguous_host",
      });
    }
  });

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
    expect(databaseTargetLine("postgres://opika:opika@[::1]:5433")).toBe(
      "Target: local ([::1]:5433/<default database>)",
    );
  });

  /** Review of 4e30965, finding 2: a line that exists to be proof never guesses. */
  it("refuses to label a host list or an empty host", () => {
    for (const url of [
      "postgres://u:p@ep-a-pooler.x.neon.tech,localhost/db",
      "postgres:///opika",
    ]) {
      expect(databaseTargetLine(url)).toBe(
        "Target: DATABASE_URL names several hosts or none, so it can't be named (not printing it).",
      );
    }
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
        env: { ...process.env, DATABASE_URL: PROD, PROD_GUARD_ENV_FILE: NO_ENV_FILE },
        timeout: 60_000,
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
      env: { ...process.env, DATABASE_URL: "postgresql://u:SECRETPW@[not-a-host" },
      timeout: 60_000,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout.split(/\r?\n/)[0]).toBe(
      "Target: DATABASE_URL could not be parsed (not printing it).",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain("SECRETPW");
  });

  /**
   * After the guard (a local target passes without a flag), before drizzle-kit.
   * The missing config makes drizzle-kit stop before it connects to anything.
   */
  it("db:migrate prints the target before drizzle-kit starts", () => {
    const result = spawnSync("npx", ["tsx", "src/migrate.ts", "--config=does-not-exist.ts"], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        DATABASE_URL: "postgres://opika:secret@localhost:1/opika_print_target",
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
      },
      timeout: 60_000,
    });
    expect(result.stdout.split(/\r?\n/)[0]).toBe("Target: local (localhost:1/opika_print_target)");
    expect(result.status, result.stderr).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
  });

  it.each([
    ["db:migrate", "src/migrate.ts", []],
    ["db:seed", "src/seed.ts", ["--profile=demo", "--force", "--db-name=neondb"]],
    ["onboard:shelter", "src/onboard-shelter.ts", ["does-not-matter.json"]],
    // Read-only, but it reads every exact address, so it takes --prod too (RG-Q10).
    ["location:verify", "src/verify-locations.ts", []],
    ["admin:bootstrap", "src/admin.ts", ["bootstrap", "oleksii@example.org"]],
    ["admin:grant", "src/admin.ts", ["grant", "oleksii@example.org"]],
    ["admin:revoke", "src/admin.ts", ["revoke", "oleksii@example.org"]],
    ["admin:sweep-invites", "src/admin.ts", ["sweep-invites"]],
  ] as const)("%s refuses production without --prod", (_name, script, args) => {
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
