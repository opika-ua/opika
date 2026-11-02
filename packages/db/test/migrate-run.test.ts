import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { committedHashes, compareHashes } from "../src/check-migration-hashes";
import {
  applyMigrations,
  dotenvFilesIn,
  type MigrateEnvironment,
  type MigrateIo,
  runMigrate,
} from "../src/migrate-run";
import {
  CHECKOUT_ROOT,
  dropTestDatabase,
  ensureTestDatabase,
  testDatabaseUrl,
} from "../src/test-utils/test-database";

/**
 * PG-F3: db:migrate applies migrations in this process on the one URL the guard checked. These
 * run `runMigrate` with fake io (no database), plus one run against a throwaway local database.
 */

const LOCAL = "postgres://opika:opika@localhost:5433/opika_test_deadbeef";
const PASSWORD = "hunter2-pw";
const WITH_PASSWORD = `postgres://migrator:${PASSWORD}@localhost:1/opika_print_target`;

type Harness = {
  io: MigrateIo;
  out: string[];
  err: string[];
  guard: ReturnType<typeof vi.fn>;
  applyMigrations: ReturnType<typeof vi.fn>;
};

function harness(overrides: Partial<MigrateIo> = {}, dotenvFiles: string[] = []): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const guard = vi.fn();
  const apply = vi.fn(async () => {});
  const io: MigrateIo = {
    guard,
    applyMigrations: apply,
    dotenvFiles: () => dotenvFiles,
    log: (line) => out.push(line),
    error: (line) => err.push(line),
    ...overrides,
  };
  return { io, out, err, guard, applyMigrations: apply };
}

const everything = (h: Harness) => [...h.out, ...h.err].join("\n");

describe("runMigrate refusals (nothing is guarded or migrated)", () => {
  it.each([
    [["--config", "other.ts"]],
    [["--config=other.ts"]],
    [["dotenv_config_path=x.env"]],
    [["--verbose"]],
  ])("refuses the argument list %j", async (argv) => {
    const h = harness();
    expect(await runMigrate(argv, { DATABASE_URL: LOCAL }, h.io)).toBe(1);
    expect(h.guard).not.toHaveBeenCalled();
    expect(h.applyMigrations).not.toHaveBeenCalled();
    expect(everything(h)).not.toContain("other.ts");
    expect(everything(h)).not.toContain("x.env");
  });

  it.each(["DOTENV_CONFIG_OVERRIDE", "dotenv_config_path", "Dotenv_Config_Debug"])(
    "refuses %s in the environment, names it, prints no value",
    async (name) => {
      const h = harness();
      const env: MigrateEnvironment = { DATABASE_URL: LOCAL, [name]: "leaky-value" };
      expect(await runMigrate([], env, h.io)).toBe(1);
      expect(h.err.join("\n")).toContain(name);
      expect(everything(h)).not.toContain("leaky-value");
      expect(h.guard).not.toHaveBeenCalled();
      expect(h.applyMigrations).not.toHaveBeenCalled();
    },
  );

  it.each([
    "PGHOST",
    "PGHOSTADDR",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGPASSFILE",
    "PGUSERNAME",
    "PGOPTIONS",
  ])("refuses %s in the environment, names it, prints no value", async (name) => {
    const h = harness();
    const env: MigrateEnvironment = { DATABASE_URL: LOCAL, [name]: "leaky-value" };
    expect(await runMigrate([], env, h.io)).toBe(1);
    expect(h.err.join("\n")).toContain(name);
    expect(everything(h)).not.toContain("leaky-value");
    expect(h.guard).not.toHaveBeenCalled();
    expect(h.applyMigrations).not.toHaveBeenCalled();
  });

  it("allows the PG* variables that only tune the connection to the URL's own host", async () => {
    const h = harness();
    const env: MigrateEnvironment = {
      DATABASE_URL: LOCAL,
      PGSSLMODE: "require",
      PGCONNECT_TIMEOUT: "5",
      PGAPPNAME: "opika",
    };
    expect(await runMigrate([], env, h.io)).toBe(0);
    expect(h.applyMigrations).toHaveBeenCalledOnce();
  });

  it("refuses a missing DATABASE_URL", async () => {
    const h = harness();
    expect(await runMigrate([], {}, h.io)).toBe(1);
    expect(h.guard).not.toHaveBeenCalled();
  });
});

describe("runMigrate and a .env file", () => {
  it("with --prod, refuses and names the file, never reading it, and runs nothing", async () => {
    const h = harness({}, [".env", "..\\..\\packages\\db\\.env"]);
    expect(await runMigrate(["--prod"], { DATABASE_URL: LOCAL }, h.io)).toBe(1);
    expect(h.err.join("\n")).toContain(".env");
    expect(h.err.join("\n")).toContain("packages");
    expect(h.guard).not.toHaveBeenCalled();
    expect(h.applyMigrations).not.toHaveBeenCalled();
  });

  it("without --prod, ignores it with exactly one line and still migrates", async () => {
    const h = harness({}, [".env"]);
    expect(await runMigrate([], { DATABASE_URL: LOCAL }, h.io)).toBe(0);
    const ignored = h.out.filter((line) => line.startsWith("Ignored"));
    expect(ignored).toHaveLength(1);
    expect(ignored[0]).toContain(".env");
    expect(h.applyMigrations).toHaveBeenCalledOnce();
  });

  it("without a .env there is no such line", async () => {
    const h = harness();
    await runMigrate([], { DATABASE_URL: LOCAL }, h.io);
    expect(h.out.some((line) => line.startsWith("Ignored"))).toBe(false);
  });
});

describe("dotenvFilesIn", () => {
  const dir = mkdtempSync(join(tmpdir(), "opika-pgf3-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reports nothing for the directory when it has no .env", () => {
    expect(dotenvFilesIn(dir)).not.toContain(".env");
  });

  it("reports a .env in the directory, by existence only", () => {
    const withEnv = join(dir, "with");
    mkdirSync(withEnv);
    writeFileSync(join(withEnv, ".env"), "DATABASE_URL=postgres://sentinel-never-read\n");
    expect(dotenvFilesIn(withEnv)).toContain(".env");
    expect(JSON.stringify(dotenvFilesIn(withEnv))).not.toContain("sentinel");
  });
});

describe("runMigrate, one URL", () => {
  it("hands the very value it read once to the guard, the target line and the migration", async () => {
    let reads = 0;
    const env = {
      get DATABASE_URL() {
        reads++;
        return reads === 1 ? LOCAL : "postgres://other:other@localhost:1/elsewhere";
      },
    } as MigrateEnvironment;
    const h = harness();
    expect(await runMigrate([], env, h.io)).toBe(0);
    expect(reads).toBe(1);
    expect(h.guard.mock.calls[0]?.[0]).toBe(LOCAL);
    expect(h.applyMigrations).toHaveBeenCalledWith(LOCAL);
    expect(h.out[0]).toBe("Target: local (localhost:5433/opika_test_deadbeef)");
  });
});

describe("runMigrate outcomes", () => {
  it("success: the target line, then the completion line", async () => {
    const h = harness();
    expect(await runMigrate([], { DATABASE_URL: LOCAL }, h.io)).toBe(0);
    expect(h.out).toEqual([
      "Target: local (localhost:5433/opika_test_deadbeef)",
      "Migrations: every committed migration is now applied.",
    ]);
  });

  it("a failing migration returns 1 with its message, and the URL and password are cut out", async () => {
    const h = harness({
      applyMigrations: async () => {
        throw new Error(`boom at ${WITH_PASSWORD} as ${PASSWORD}`);
      },
    });
    expect(await runMigrate([], { DATABASE_URL: WITH_PASSWORD }, h.io)).toBe(1);
    expect(h.err.join("\n")).toContain("ERROR: the migration failed: boom at");
    expect(everything(h)).not.toContain(PASSWORD);
    expect(everything(h)).not.toContain(WITH_PASSWORD);
  });

  it("a refused guard stops everything: no target line, no migration", async () => {
    const h = harness({
      guard: () => {
        throw new Error("refused by the guard");
      },
    });
    await expect(runMigrate([], { DATABASE_URL: LOCAL }, h.io)).rejects.toThrow("refused");
    expect(h.out).toEqual([]);
    expect(h.applyMigrations).not.toHaveBeenCalled();
  });

  it("a refused --expect stops before the target line and the migration", async () => {
    const h = harness();
    const neon = "postgres://u:p@ep-other-hill-d4e5f6.eu-central-1.aws.neon.tech/db";
    expect(await runMigrate(["--expect", "ep-not-this-one"], { DATABASE_URL: neon }, h.io)).toBe(1);
    expect(h.out).toEqual([]);
    expect(h.applyMigrations).not.toHaveBeenCalled();
  });

  // Test 13: the real migrator against a closed loopback port, a password in the URL.
  it("a connection failure prints neither the URL, the credentials nor the password", async () => {
    const h = harness({ applyMigrations });
    expect(await runMigrate([], { DATABASE_URL: WITH_PASSWORD }, h.io)).toBe(1);
    expect(h.err.join("\n")).toContain("ERROR: the migration failed:");
    expect(h.err.join("\n")).toContain("ECONNREFUSED");
    const text = everything(h);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(WITH_PASSWORD);
    expect(text).not.toContain(`migrator:${PASSWORD}`);
    expect(text).not.toContain("postgres://");
  });
});

describe("applyMigrations on a throwaway local database", () => {
  const url = testDatabaseUrl("test", `${CHECKOUT_ROOT}-pgf3-scratch`);
  afterAll(async () => {
    await dropTestDatabase(url, "force");
  });

  const snapshot = async () => {
    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
      return (await client`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`) as unknown as {
        hash: string;
        created_at: string;
      }[];
    } finally {
      await client.end();
    }
  };

  it("applies every committed migration, the hashes match db:check-hashes, and a second run changes nothing", async () => {
    await dropTestDatabase(url, "force");
    await ensureTestDatabase(url);
    await applyMigrations(url);
    const first = await snapshot();
    const checks = compareHashes(committedHashes(), first);
    expect(checks.length).toBeGreaterThan(10);
    expect(checks.filter((check) => check.status !== "match")).toEqual([]);
    expect(first).toHaveLength(checks.length);

    await applyMigrations(url);
    expect(await snapshot()).toEqual(first);
  });
});
