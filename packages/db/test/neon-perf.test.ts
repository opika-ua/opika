import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { count, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { animals } from "../src/schema/animals";
import { cities } from "../src/schema/cities";
import { shelters } from "../src/schema/shelters";
import { setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";
import { assertExplainable, runReport, scenariosOf, summarisePlan } from "../src/tools/perf-report";
import {
  buildPerfAnimals,
  buildPerfShelters,
  PERF_PUBLISHED_ANIMALS,
  perfCities,
  seedPerf,
} from "../src/tools/perf-seed";
import {
  createRecordingDatabase,
  findRepeatedStatements,
  labelOf,
  perfTarget,
  REPEAT_THRESHOLD,
  scrubbed,
  wavesOf,
} from "../src/tools/perf-support";
import { connect } from "../src/tools/search-diagnose";

/** Fake endpoints only. Nothing here resolves; the spawned CLIs run with the network disabled. */
const PROD_ENDPOINT = "ep-quiet-lake-a1b2c3";
const NO_ENV_FILE = resolve(tmpdir(), "opika-prod-guard-test-no-such-file.env");
const url = (endpoint: string, pooled = false) =>
  `postgresql://u:secret@${endpoint}${pooled ? "-pooler" : ""}.eu-central-1.aws.neon.tech/neondb`;
const PROD = url(PROD_ENDPOINT);
const CHILD = url("ep-other-hill-d4e5f6");
const LOCAL = "postgres://opika:opika@localhost:5433/opika";
const ENV = { PROD_NEON_ENDPOINT: PROD_ENDPOINT, PROD_GUARD_ENV_FILE: NO_ENV_FILE };
const UNSET = { PROD_GUARD_ENV_FILE: NO_ENV_FILE };

describe("perfTarget: where the performance tools may run", () => {
  it("accepts a local database without --expect, and a non-production child with it", () => {
    expect(perfTarget(LOCAL, [], [], UNSET)).toMatchObject({ kind: "ok", scope: "local" });
    expect(perfTarget(CHILD, ["--expect", "ep-other-hill-d4e5f6"], [], ENV)).toMatchObject({
      kind: "ok",
      scope: "child_branch",
    });
  });

  it("refuses production, pooled or direct, with or without --prod and with a matching --expect", () => {
    for (const target of [PROD, url(PROD_ENDPOINT, true)]) {
      for (const argv of [
        [],
        ["--prod"],
        ["--expect", PROD_ENDPOINT],
        ["--prod", "--expect", PROD_ENDPOINT],
      ]) {
        const result = perfTarget(target, argv, [], ENV);
        expect(result.kind).toBe("refused");
      }
    }
  });

  it("fails closed when PROD_NEON_ENDPOINT is unset", () => {
    const result = perfTarget(CHILD, ["--expect", "ep-other-hill-d4e5f6"], [], UNSET);
    expect(result).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(result)).toContain("PROD_NEON_ENDPOINT");
  });

  it("refuses a Neon target with no --expect, a different --expect, and a local target with --expect", () => {
    expect(perfTarget(CHILD, [], [], ENV).kind).toBe("refused");
    expect(perfTarget(CHILD, ["--expect", "ep-another-one-999999"], [], ENV).kind).toBe("refused");
    expect(perfTarget(LOCAL, ["--expect", "ep-other-hill-d4e5f6"], [], UNSET).kind).toBe("refused");
  });

  it("refuses the pooled hostname of a child branch", () => {
    const result = perfTarget(
      url("ep-other-hill-d4e5f6", true),
      ["--expect", "ep-other-hill-d4e5f6"],
      [],
      ENV,
    );
    expect(result).toMatchObject({ kind: "refused" });
    expect(JSON.stringify(result)).toContain("pooled");
  });

  it("refuses an argument it does not know without echoing it", () => {
    const result = perfTarget(LOCAL, ["--wat-secret-flag"], [], UNSET);
    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).not.toContain("wat-secret-flag");
  });

  it("refuses when a driver-level environment variable is set", () => {
    expect(perfTarget(LOCAL, [], [], { ...UNSET, PGHOST: "elsewhere" }).kind).toBe("refused");
  });
});

describe("the spawned CLIs refuse before connecting", () => {
  const PKG = resolve(fileURLToPath(import.meta.url), "../..");
  const run = (script: string, args: readonly string[], databaseUrl: string, endpoint?: string) =>
    spawnSync("npx", ["tsx", "--import", "./test/no-network.mjs", script, ...args], {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([name]) => !/^(PG|PROD_NEON_ENDPOINT$)/i.test(name)),
        ),
        DATABASE_URL: databaseUrl,
        ...(endpoint === undefined ? {} : { PROD_NEON_ENDPOINT: endpoint }),
        PROD_GUARD_ENV_FILE: NO_ENV_FILE,
      },
      timeout: 60_000,
    });

  it.each(["src/tools/perf-seed.ts", "src/tools/perf-report.ts"])(
    "%s refuses production, even with --prod and --expect, and prints no secret",
    { timeout: 120_000 },
    (script) => {
      for (const args of [[], ["--prod", "--expect", PROD_ENDPOINT]]) {
        const result = run(script, args, PROD, PROD_ENDPOINT);
        expect(result.status, result.stderr).toBe(1);
        expect(result.stderr).toContain("REFUSED");
        expect(`${result.stdout}${result.stderr}`).not.toMatch(/secret|postgres(ql)?:\/\//);
      }
    },
  );

  it.each(["src/tools/perf-seed.ts", "src/tools/perf-report.ts"])(
    "%s refuses a Neon target when PROD_NEON_ENDPOINT is unset, and one with no --expect",
    { timeout: 120_000 },
    (script) => {
      const unset = run(script, ["--expect", "ep-other-hill-d4e5f6"], CHILD);
      expect(unset.status).toBe(1);
      expect(unset.stderr).toContain("PROD_NEON_ENDPOINT");
      const noExpect = run(script, [], CHILD, PROD_ENDPOINT);
      expect(noExpect.status).toBe(1);
      expect(noExpect.stderr).toContain("REFUSED");
    },
  );
});

describe("N+1 and wave detection", () => {
  it("flags one statement text repeated with different parameters, not a single call", () => {
    const sqlText = 'select * from "cities" where "id" = $1';
    const calls = Array.from({ length: REPEAT_THRESHOLD }, (_, i) => ({
      sql: sqlText,
      params: [`c${i}`],
    }));
    expect(findRepeatedStatements([...calls, { sql: "select 1", params: [] }])).toEqual([
      { sql: sqlText, count: REPEAT_THRESHOLD, distinctParams: REPEAT_THRESHOLD },
    ]);
    expect(findRepeatedStatements(calls.slice(0, REPEAT_THRESHOLD - 1))).toEqual([]);
  });

  it("groups overlapping calls into one wave and sequential ones into the next", () => {
    const waves = wavesOf([
      { start: 0, end: 10 },
      { start: 2, end: 8 },
      { start: 12, end: 20 },
      { start: 21, end: 30 },
    ]);
    expect(waves.map((w) => w.length)).toEqual([2, 1, 1]);
  });

  it("labels a statement by verb and table", () => {
    expect(labelOf('select "id", count(*) OVER() from "animals" where x')).toBe(
      "SELECT animals +page",
    );
  });
});

describe("the report's read-only guarantee and output hygiene", () => {
  it("lets only constant reads and EXPLAINs of SELECTs leave the tool", () => {
    const explain = (body: string) => ({ text: `EXPLAIN (ANALYZE, BUFFERS) ${body}`, params: [] });
    expect(() =>
      assertExplainable(explain('SELECT * FROM "animals" WHERE "id" = $1')),
    ).not.toThrow();
    for (const body of [
      'INSERT INTO "animals" VALUES (1)',
      'UPDATE "animals" SET name = $1',
      'DELETE FROM "animals"',
      'SELECT * INTO tmp FROM "animals"',
      'SELECT * FROM "animals" FOR UPDATE',
      "SELECT set_config('x', 'y', false)",
    ]) {
      expect(() => assertExplainable(explain(body))).toThrow();
    }
    expect(() => assertExplainable({ text: "DELETE FROM animals", params: [] })).toThrow();
  });

  it("removes anything shaped like a connection string", () => {
    expect(scrubbed("failed: postgres://u:p@host/db?x=1 end")).toBe("failed: <url removed> end");
  });

  it("trims a plan to node lines, times and buffers", () => {
    const summary = summarisePlan([
      "Limit  (cost=1..2 rows=24 width=9) (actual time=0.1..0.2 rows=24 loops=1)",
      "  Buffers: shared hit=5",
      "  ->  Seq Scan on animals  (cost=0..1 rows=9 width=9) (actual time=0.0..0.1 rows=9 loops=1)",
      "Planning Time: 0.30 ms",
      "Execution Time: 1.25 ms",
    ]);
    expect(summary).toMatchObject({
      planningMs: 0.3,
      executionMs: 1.25,
      seqScans: 1,
      buffers: "Buffers: shared hit=5",
    });
    expect(summary.nodes.join("\n")).not.toContain("cost=");
  });
});

describe("against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  }, 120_000);
  afterAll(async () => cleanup?.());

  it("builds the stated corpus shape (no database)", () => {
    const cityList = perfCities();
    expect(cityList).toHaveLength(20);
    const shelterList = buildPerfShelters(cityList, new Date());
    expect(shelterList).toHaveLength(30);
    const built = buildPerfAnimals(shelterList, cityList, new Date());
    const kind = (k: string) => built.filter((a) => a.animal.listing.kind === k);
    // 1,500 in verified shelters (discoverable) plus 15 each in the pending and the suspended one.
    expect(kind("published")).toHaveLength(PERF_PUBLISHED_ANIMALS + 30);
    for (const k of ["reserved", "draft", "adopted", "withdrawn"])
      expect(kind(k).length).toBeGreaterThan(0);
    const per = new Map<string, number>();
    for (const { animal } of built) per.set(animal.shelterId, (per.get(animal.shelterId) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeGreaterThan(250);
    expect(shelterList.filter((s) => !per.has(s.id)).length).toBeGreaterThanOrEqual(2);
    const photoCounts = new Set(built.map((a) => a.animal.photos.length));
    expect([...photoCounts].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("seeds the corpus, writes nothing on a second run, and refuses a partial one", {
    timeout: 180_000,
  }, async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const first = await seedPerf(db);
    expect(first).toMatchObject({ kind: "seeded", shelters: 30, cities: 20 });

    const countOf = async (table: typeof animals | typeof shelters | typeof cities) =>
      Number((await db.select({ n: count() }).from(table))[0]?.n);
    expect(await countOf(shelters)).toBe(30);
    expect(await countOf(cities)).toBe(20);
    const published = await db.execute(
      sql`SELECT count(*)::int AS n FROM animals WHERE listing_kind = 'published'`,
    );
    expect((published as unknown as { n: number }[])[0]?.n).toBe(PERF_PUBLISHED_ANIMALS + 30);
    const total = await countOf(animals);

    expect(await seedPerf(db)).toMatchObject({ kind: "already_seeded", shelters: 30 });
    expect(await countOf(animals)).toBe(total);

    await db.execute(sql`DELETE FROM animals WHERE id = (SELECT id FROM animals LIMIT 1)`);
    await expect(seedPerf(db)).rejects.toThrow(/partly there/);
    // Put the deleted animal back for the next tests by reseeding the shelters' animals is not
    // possible; the remaining tests only need the corpus to be about this size.
  });

  it("runs the report read-only: same rows after, every section present, no URL in the output", {
    timeout: 180_000,
  }, async () => {
    const before = await db.execute(sql`SELECT count(*)::int AS n FROM animals`);
    const lines: string[] = [];
    await runReport(TEST_DATABASE_URL, (l) => lines.push(l));
    const after = await db.execute(sql`SELECT count(*)::int AS n FROM animals`);
    expect(after).toEqual(before);

    const text = lines.join("\n");
    for (const label of [
      "gallery.list, unfiltered, freshest",
      "gallery.list, one city",
      "species=dog + size=medium",
      "longest waiting",
      "gallery.facetCounts",
      "animal detail",
      "shelter page",
      "city search",
      "kabinet K2 list",
      "unused indexes",
    ]) {
      expect(text).toContain(label);
    }
    expect(text).toMatch(/round trip: cold [\d.]+ ms \| warm [\d.]+ ms/);
    expect(text).toMatch(/DB execution cold\/warm/);
    expect(text).not.toContain(TEST_DATABASE_URL);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(lines.length).toBeLessThan(400);
    expect(
      scenariosOf({ busyShelter: null, emptyShelter: null, animalId: null, cityId: null }).filter(
        (s) => s.run === null,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("a write sent through the report's own read-only runner is refused by the server", async () => {
    const run = connect(TEST_DATABASE_URL, () => {});
    await expect(
      run([{ text: "UPDATE animals SET name = name WHERE false", params: [] }]),
    ).rejects.toThrow(/read-only/i);
  });

  it("records each statement with a start and end, and sees two concurrent reads as one wave", async () => {
    const recorder = createRecordingDatabase(TEST_DATABASE_URL);
    try {
      await Promise.all([
        recorder.db.select({ n: count() }).from(animals),
        recorder.db.select({ n: count() }).from(shelters),
      ]);
      await recorder.db.select({ n: count() }).from(cities);
      expect(recorder.calls).toHaveLength(3);
      for (const c of recorder.calls) expect(c.end).toBeGreaterThanOrEqual(c.start);
      expect(wavesOf(recorder.calls).map((w) => w.length)).toEqual([2, 1]);
    } finally {
      await recorder.close();
    }
  });
});
