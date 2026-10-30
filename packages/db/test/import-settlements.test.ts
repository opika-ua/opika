import { and, eq, isNotNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ImportOutcome, runImport } from "../src/import/importer";
import { maintenanceLines } from "../src/import/post-import-maintenance";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { cities } from "../src/schema/cities";
import { citySlugAliases } from "../src/schema/city-slug-aliases";
import { buildCities } from "../src/seed";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";
import { loadCityReferences, referenceFingerprint } from "../src/tools/city-references";
import { buildXlsx, FIXTURE_ROWS, FIXTURE_SETTLEMENT_COUNTS, pinFor } from "./import-fixture";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => {
  await truncateAll(db);
  await cityRepo(db).insertMissing(buildCities());
});

const bytes = buildXlsx();
const pin = pinFor(bytes);
const run = (commit: boolean, file: Uint8Array = bytes, editions = [pinFor(file)]) =>
  runImport({ db, bytes: file, commit, editions });

const committed = (outcome: ImportOutcome) => {
  if (outcome.kind !== "committed") throw new Error(`expected a commit, got ${outcome.kind}`);
  return outcome;
};

const slugs = async () =>
  (await db.select({ slug: cities.slug }).from(cities)).map((r) => r.slug).sort();

describe("runImport", () => {
  it("a dry run reads and plans but writes nothing", async () => {
    const before = await slugs();
    const outcome = await run(false);
    expect(outcome.kind).toBe("planned");
    expect(await slugs()).toEqual(before);
    expect((await db.select().from(citySlugAliases)).length).toBe(0);
  });

  it("commits the settlements, adopts the 8, renames 7 and converges in one run", async () => {
    const result = committed(await run(true));
    expect(result.plan.report).toMatchObject({
      settlements: 22,
      inserted: 14,
      adopted: 8,
      aliasesAdded: 7,
      retired: 0,
    });
    expect(result.stored).toEqual({ withCode: 22, withoutCode: 0, aliases: 7, retired: 0 });
    expect(result.remaining).toBe(0);
    expect(await db.select().from(cities)).toHaveLength(22);
  });

  it("a second run changes nothing", async () => {
    await run(true);
    const before = await db.select().from(cities).orderBy(cities.id);
    const again = await run(true);
    expect(again.kind === "committed" && again.plan.report).toMatchObject({
      inserted: 0,
      adopted: 0,
      updated: 0,
      aliasesAdded: 0,
      unchanged: 22,
    });
    expect(await db.select().from(cities).orderBy(cities.id)).toEqual(before);
    expect(await db.select().from(citySlugAliases)).toHaveLength(7);
  });

  it("keeps each legacy city's id, English name and coordinates", async () => {
    const seeded = buildCities();
    await run(true);
    for (const city of seeded) {
      const stored = await cityRepo(db).findById(city.id);
      expect(stored?.name).toEqual(city.name);
      expect(stored?.centroid).toEqual(city.centroid);
    }
    const [brovary] = await db.select().from(cities).where(eq(cities.slug, "brovary-kyivska"));
    expect(brovary).toMatchObject({
      districtNameUk: "Броварський район",
      hromadaNameUk: "Броварська міська громада",
      nameScope: "unique_in_region",
    });
  });

  it("keeps every shelter and animal pointing at the same city id, renamed city or not", async () => {
    // One shelter and animal per legacy city: Kyiv keeps its slug, the other 7 are renamed.
    for (const city of buildCities()) {
      const shelter = makeShelter();
      await shelterRepo(db).insert({
        ...shelter,
        publicLocation: { ...shelter.publicLocation, cityId: city.id },
      });
      await animalRepo(db).insert(makeAnimal({ shelterId: shelter.id }), city.id);
    }
    const before = await loadCityReferences(db);
    expect(before.referenced).toHaveLength(8);
    expect(before.referenced.every((r) => r.animals === 1 && r.shelters === 1)).toBe(true);

    await run(true);
    const after = await loadCityReferences(db);
    expect(after.referenced.map((r) => r.slug)).not.toEqual(before.referenced.map((r) => r.slug));
    expect(after.referenced.map((r) => [r.cityId, r.animals, r.shelters])).toEqual(
      before.referenced.map((r) => [r.cityId, r.animals, r.shelters]),
    );
    expect(referenceFingerprint(after.referenced)).toBe(referenceFingerprint(before.referenced));
    // And nothing was added to the references by a rerun.
    await run(true);
    expect(referenceFingerprint((await loadCityReferences(db)).referenced)).toBe(
      referenceFingerprint(before.referenced),
    );
  });

  it("reports the starting point before it plans: cities, codes and aliases it began with", async () => {
    const dry = await run(false);
    if (dry.kind !== "planned") throw new Error(`expected a plan, got ${dry.kind}`);
    expect(dry.preflight).toEqual({ cities: 8, withCode: 0, withoutCode: 8, aliases: 0 });
    const result = committed(await run(true));
    expect(result.preflight).toEqual({ cities: 8, withCode: 0, withoutCode: 8, aliases: 0 });
    const rerun = committed(await run(true));
    expect(rerun.preflight).toEqual({ cities: 22, withCode: 22, withoutCode: 0, aliases: 7 });
  });

  it("refuses, writing nothing, when migration 0020's columns can't be read", async () => {
    const without0020 = new Proxy(db, {
      get(target, property) {
        if (property === "select") {
          return () => {
            throw new Error("column does not exist");
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const outcome = await runImport({
      db: without0020,
      bytes,
      commit: true,
      editions: [pin],
    });
    expect(outcome.kind === "refused" && outcome.reasons.join()).toMatch(/migration 0020/);
    expect(await slugs()).toContain("brovary");
    expect(await db.select().from(citySlugAliases)).toHaveLength(0);
  });

  it("leaves every imported centroid null", async () => {
    await run(true);
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(cities)
      .where(and(isNotNull(cities.katottgCode), isNotNull(cities.centroidLat)));
    // Only the 8 seeded rows keep their manual coordinates.
    expect(row?.n).toBe(8);
  });

  it("points the old slug of each renamed city at it, and never has a slug both ways", async () => {
    await run(true);
    const aliases = await db.select().from(citySlugAliases);
    const canonical = new Set(
      (await db.select({ slug: cities.slug }).from(cities)).map((r) => r.slug),
    );
    expect(aliases.map((a) => a.slug).sort()).toEqual([
      "bila-tserkva",
      "boryspil",
      "brovary",
      "bucha",
      "fastiv",
      "irpin",
      "vyshhorod",
    ]);
    expect(aliases.every((a) => a.reason === "legacy")).toBe(true);
    for (const alias of aliases) expect(canonical.has(alias.slug)).toBe(false);
  });

  it("leaves a row with no code that is not one of the 8 untouched", async () => {
    const stray = makeCity({ name: { uk: "Тест", en: { text: "Test", provenance: "human" } } });
    await cityRepo(db).insert(stray);
    const outcome = committed(await run(true));
    expect(outcome.plan.report.unmanagedRows).toBe(1);
    expect(await cityRepo(db).findById(stray.id)).toEqual(stray);
  });

  it("refuses a file whose checksum is not pinned, before touching anything", async () => {
    const outcome = await run(false, bytes, [{ ...pin, sha256: "0".repeat(64) }]);
    expect(outcome).toMatchObject({ kind: "refused" });
    const refused = outcome.kind === "refused" ? outcome.reasons.join() : "";
    expect(refused).toMatch(/matches no pinned edition/);
  });

  it("refuses a file that parses to other counts than the pin", async () => {
    const wrong = { ...pin, settlements: { ...FIXTURE_SETTLEMENT_COUNTS, C: 12 } };
    const outcome = await run(false, bytes, [wrong]);
    expect(outcome.kind === "refused" && outcome.reasons.join()).toMatch(/pinned at K 2, M 8/);
  });

  it("retires a vanished settlement without deleting it, then restores it when it returns", async () => {
    await run(true);
    const without = buildXlsx(FIXTURE_ROWS.filter((row) => row[6] !== "Борова"));
    const gone = committed(
      await run(true, without, [pinFor(without, { ...FIXTURE_SETTLEMENT_COUNTS, X: 0 })]),
    );
    expect(gone.plan.report.retired).toBe(1);
    const [row] = await db.select().from(cities).where(eq(cities.slug, "borova-kharkivska"));
    expect(row?.retiredInEdition).toBe("2099-01-01");
    expect(await db.select().from(cities)).toHaveLength(22);

    committed(await run(true));
    const [back] = await db.select().from(cities).where(eq(cities.slug, "borova-kharkivska"));
    expect(back?.retiredInEdition).toBeNull();
  });

  it("refuses to retire a settlement a shelter still points at, and writes nothing", async () => {
    await run(true);
    const [borova] = await db.select().from(cities).where(eq(cities.slug, "borova-kharkivska"));
    const shelter = makeShelter();
    await shelterRepo(db).insert({
      ...shelter,
      publicLocation: { ...shelter.publicLocation, cityId: borova?.id as never },
    });
    const without = buildXlsx(FIXTURE_ROWS.filter((row) => row[6] !== "Борова"));
    const outcome = await run(true, without, [
      pinFor(without, { ...FIXTURE_SETTLEMENT_COUNTS, X: 0 }),
    ]);
    expect(outcome.kind === "refused" && outcome.reasons.join()).toMatch(/still points at them/);
    const [still] = await db.select().from(cities).where(eq(cities.slug, "borova-kharkivska"));
    expect(still?.retiredInEdition).toBeNull();
  });
});

describe("a run that dies half way", () => {
  /** A database whose first UPDATE throws: the first legacy city is about to be renamed. */
  const dyingAtFirstUpdate = new Proxy(() => db, {}) as unknown as () => typeof db;
  const crashing = () =>
    new Proxy(dyingAtFirstUpdate(), {
      get(target, property) {
        if (property === "update") {
          return () => {
            throw new Error("crash");
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  it("still creates every legacy redirect when it is rerun", async () => {
    await expect(
      runImport({ db: crashing(), bytes, commit: true, editions: [pinFor(bytes)] }),
    ).rejects.toThrow("crash");
    // The old slugs are already recorded, while the cities still carry them.
    expect(await db.select().from(citySlugAliases)).toHaveLength(7);
    expect(await slugs()).toContain("brovary");

    const rerun = committed(await run(true));
    expect(rerun.stored?.aliases).toBe(7);
    expect(rerun.remaining).toBe(0);
    const canonical = await slugs();
    expect(canonical).toContain("brovary-kyivska");
    expect(canonical).not.toContain("brovary");
    const aliases = (await db.select().from(citySlugAliases)).map((a) => a.slug);
    for (const alias of aliases) expect(canonical).not.toContain(alias);
  });
});

describe("db:seed after an import", () => {
  it("inserts only missing cities: an imported slug, its fields and its alias survive a reseed", async () => {
    await run(true);
    const before = await db.select().from(cities).orderBy(cities.id);

    await cityRepo(db).insertMissing(buildCities());

    expect(await db.select().from(cities).orderBy(cities.id)).toEqual(before);
    const aliases = await db.select().from(citySlugAliases);
    expect(aliases).toHaveLength(7);
    // The seed's own slug for Brovary is the alias: reseeding must not make it canonical again.
    const canonical = new Set(await slugs());
    expect(canonical.has("brovary")).toBe(false);
    expect(canonical.has("brovary-kyivska")).toBe(true);
    for (const alias of aliases) expect(canonical.has(alias.slug)).toBe(false);
  });

  it("still adds a seeded city that is missing", async () => {
    await db.delete(cities).where(eq(cities.slug, "kyiv"));
    await cityRepo(db).insertMissing(buildCities());
    expect(await slugs()).toContain("kyiv");
  });
});

describe("planner statistics and GIN pending lists after a commit", () => {
  const FAST = { attempts: 2, waitMs: 5 };
  type Seen = { text: string; codedCitiesThen: number };
  /** The real database; every `db.execute` recorded with how many imported cities existed at that moment. */
  const watched = (
    options: { swallowAnalyze?: boolean; failOn?: string; failAnalyze?: boolean } = {},
  ) => {
    const seen: Seen[] = [];
    const proxy = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "execute") return Reflect.get(target, prop, receiver);
        return async (query: { queryChunks?: unknown }) => {
          const text = JSON.stringify(query.queryChunks ?? "");
          const [{ n } = { n: 0 }] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(cities)
            .where(isNotNull(cities.katottgCode));
          seen.push({ text, codedCitiesThen: n });
          if (options.failAnalyze && text.includes("ANALYZE cities")) throw new Error("boom");
          if (options.failOn && text.includes(options.failOn)) throw new Error("no permission");
          if (options.swallowAnalyze && text.includes("ANALYZE cities")) return [];
          return (target.execute as (q: unknown) => unknown)(query);
        };
      },
    });
    const of = (needle: string) => seen.filter((e) => e.text.includes(needle));
    return {
      db: proxy,
      analyzed: () => of("ANALYZE cities"),
      cleaned: () => of("gin_clean_pending_list"),
    };
  };
  const go = (w: { db: typeof db }, commit = true, editions = [pin]) =>
    runImport({ db: w.db, bytes, commit, editions, verify: FAST });

  it("analyzes once and merges both trigram pending lists, one statement each, after a commit", async () => {
    const w = watched();
    const outcome = committed(await go(w));
    expect(w.analyzed()).toHaveLength(1);
    expect(w.cleaned()).toHaveLength(2);
    expect(
      w
        .cleaned()
        .map((e) => e.text)
        .join(),
    ).toContain("cities_search_name_trgm_idx");
    expect(
      w
        .cleaned()
        .map((e) => e.text)
        .join(),
    ).toContain("cities_search_latin_trgm_idx");
    expect(outcome.maintenance?.statistics).toEqual({ kind: "refreshed" });
    expect(outcome.maintenance?.pendingLists.map((p) => p.kind)).toEqual(["merged", "merged"]);
    expect(maintenanceLines(outcome.maintenance).join(" | ")).toMatch(
      /Planner statistics refreshed: ANALYZE cities[\s\S]*cities_search_name_trgm_idx, \d+ pages cleaned[\s\S]*cities_search_latin_trgm_idx, \d+ pages cleaned/,
    );
  });

  it("runs both AFTER the data is applied, never before", async () => {
    const w = watched();
    await go(w);
    // 'codedCitiesThen' counts imported rows at the moment each statement ran: zero would mean it
    // ran before applyPlan.
    for (const step of [...w.analyzed(), ...w.cleaned()]) {
      expect(step.codedCitiesThen).toBeGreaterThan(0);
    }
  });

  it("does neither on a dry run or a refusal", async () => {
    const dry = watched();
    const planned = await go(dry, false);
    expect(planned.kind).toBe("planned");
    expect(planned.kind === "planned" && planned.maintenance).toBeNull();
    const refused = watched();
    expect((await go(refused, true, [])).kind).toBe("refused");
    for (const w of [dry, refused]) {
      expect(w.analyzed()).toHaveLength(0);
      expect(w.cleaned()).toHaveLength(0);
    }
  });

  it("a failing ANALYZE or cleanup is a value and leaves the committed data in place", async () => {
    const w = watched({ failAnalyze: true, failOn: "cities_search_latin_trgm_idx" });
    const outcome = committed(await go(w));
    expect(outcome.maintenance?.statistics).toEqual({ kind: "failed", message: "boom" });
    expect(outcome.maintenance?.pendingLists).toEqual([
      expect.objectContaining({ index: "cities_search_name_trgm_idx", kind: "merged" }),
      { index: "cities_search_latin_trgm_idx", kind: "failed", message: "no permission" },
    ]);
    expect(outcome.remaining).toBe(0);
    const text = maintenanceLines(outcome.maintenance).join(" | ");
    expect(text).toMatch(/WARNING: .*ANALYZE cities did not take effect/);
    expect(text).toMatch(/WARNING: .*cities_search_latin_trgm_idx failed/);
    expect(text).not.toMatch(/refreshed/);
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(cities)
      .where(isNotNull(cities.katottgCode));
    expect(n).toBeGreaterThan(0);
  });

  it("does not claim 'refreshed' when ANALYZE returns but the role was not allowed to run it", async () => {
    // Postgres only WARNs for a non-owner; the stand-in swallows the statement, so last_analyze
    // stays where it was.
    await db.execute(sql`SELECT pg_stat_reset_single_table_counters('cities'::regclass)`);
    const w = watched({ swallowAnalyze: true });
    const outcome = committed(await go(w));
    expect(outcome.maintenance?.statistics.kind).toBe("failed");
    expect(maintenanceLines(outcome.maintenance).join(" | ")).not.toContain("refreshed");
  });
});
