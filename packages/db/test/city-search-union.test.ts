import { placeQueryOf, type RegionId } from "@opika/domain";
import { and, isNull, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REGION_BY_CODE } from "../src/geography/regions-data";
import { runImport } from "../src/import/importer";
import { cityRepo } from "../src/repos/city-repo";
import { BRANCH_LIMIT, citySearchRepo } from "../src/repos/city-search-repo";
import { cities } from "../src/schema/cities";
import { buildCities } from "../src/seed";
import { makeCity, setupTestDatabase, truncateAll } from "../src/test-utils/index";
import { buildXlsx, pinFor } from "./import-fixture";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const bytes = buildXlsx();
const named = (uk: string, en: string) =>
  makeCity({ name: { uk, en: { text: en, provenance: "human" } } });

const KINDS = ["village", "city", "selyshche"] as const;
const REGION_CYCLE = ["UA46", "UA51", "UA32"].map(
  (c) => (REGION_BY_CODE.get(c)?.id ?? "") as RegionId,
);
const mixed = (uk: string, en: string, i: number, varyKind: boolean) =>
  makeCity({
    name: { uk, en: { text: en, provenance: "human" } },
    kind: varyKind ? (KINDS[i % 3] ?? "village") : "village",
    regionId: REGION_CYCLE[i % 3] as RegionId,
  });

beforeEach(async () => {
  await truncateAll(db);
  await cityRepo(db).insertMissing(buildCities());
  await runImport({ db, bytes, commit: true, editions: [pinFor(bytes)] });
  // Far more matches than one branch may return, for a prefix and for a trigram probe.
  await cityRepo(db).insertMissing([
    ...Array.from({ length: 130 }, (_, i) => named(`Тестове${i}`, `Testove${i}`)),
    ...Array.from({ length: 90 }, (_, i) => named(`Лозовата${i}`, `Lozovata${i}`)),
    named("Лозова", "Lozova"),
    // Over-limit sets whose settlement type and region are mixed, with ids unrelated to either:
    // the branch cut must keep the city rows and the biased region's rows, not an arbitrary 50.
    ...Array.from({ length: 130 }, (_, i) => mixed(`Мішане${i}`, `Mishane${i}`, i, true)),
    ...Array.from({ length: 130 }, (_, i) => mixed(`Узорне${i}`, `Uzorne${i}`, i, false)),
    named("Камʼянське-Тест", "Kamianske-Test"),
  ]);
});

/* ORACLE: the single-OR statement this PR replaced, kept here only. It is what `cities.search`
   ran through N3 (a Seq Scan over every row); the union must return its answers. */
type Q = Extract<ReturnType<typeof placeQueryOf>, { kind: "ok" }>;
const KIND_RANK = sql`CASE ${cities.kind}
  WHEN 'special_status_city' THEN 0 WHEN 'city' THEN 1 WHEN 'selyshche' THEN 2 ELSE 3 END`;
const likePrefix = (key: string) => `${key.replace(/[\\%_]/gu, "\\$&")}%`;

function oldQuery(q: Q, regionBias: RegionId | null, useCyrillicTrigrams: boolean) {
  const { cyrillic, latin } = q;
  const exact =
    cyrillic === null
      ? sql`(${cities.searchLatin} = ${latin})`
      : sql`(${cities.searchName} = ${cyrillic} OR ${cities.searchLatin} = ${latin})`;
  const prefix =
    cyrillic === null
      ? sql`(${cities.searchLatin} LIKE ${likePrefix(latin)})`
      : sql`(${cities.searchName} LIKE ${likePrefix(cyrillic)} OR ${cities.searchLatin} LIKE ${likePrefix(latin)})`;
  const trigramLatin = sql`(${cities.searchLatin} % ${latin} AND similarity(${cities.searchLatin}, ${latin}) >= 0.35)`;
  const trigramCyrillic = useCyrillicTrigrams
    ? sql`(${cities.searchName} % ${cyrillic} AND similarity(${cities.searchName}, ${cyrillic}) >= 0.35)`
    : null;
  const similarity = useCyrillicTrigrams
    ? sql`greatest(similarity(${cities.searchName}, ${cyrillic}), similarity(${cities.searchLatin}, ${latin}))`
    : sql`similarity(${cities.searchLatin}, ${latin})`;
  const bias = regionBias === null ? sql`(0)::int` : sql`(${cities.regionId} = ${regionBias})::int`;
  const where = and(
    isNull(cities.retiredInEdition),
    or(
      sql`${cities.searchLatin} LIKE ${likePrefix(latin)}`,
      cyrillic === null ? undefined : sql`${cities.searchName} LIKE ${likePrefix(cyrillic)}`,
      trigramLatin,
      trigramCyrillic ?? undefined,
    ),
  );
  const ids = () =>
    db
      .select({
        id: cities.id,
        nameUk: cities.nameUk,
        exact: sql<number>`${exact}::int`.mapWith(Number),
        prefix: sql<number>`${prefix}::int`.mapWith(Number),
        kindRank: sql<number>`${KIND_RANK}`.mapWith(Number),
        bias: sql<number>`${bias}`.mapWith(Number),
        similarity: sql<number>`${similarity}`.mapWith(Number),
      })
      .from(cities)
      .where(where)
      .orderBy(
        sql`${exact}::int DESC`,
        sql`${prefix}::int DESC`,
        KIND_RANK,
        sql`${bias} DESC`,
        sql`${similarity} DESC`,
        cities.id,
      )
      .limit(20)
      .then((rows) =>
        rows
          .sort(
            (a, b) =>
              b.exact - a.exact ||
              b.prefix - a.prefix ||
              a.kindRank - b.kindRank ||
              b.bias - a.bias ||
              b.similarity - a.similarity ||
              a.nameUk.localeCompare(b.nameUk, "uk"),
          )
          .map((r) => r.id),
      );
  return { where, ids };
}

const lviv = (REGION_BY_CODE.get("UA46")?.id ?? "") as RegionId;

const PROBES = [
  "Київ", // exact
  "Бровари", // exact, namesakes of different kinds
  "бровари",
  "БРОВАРИ",
  "Бров", // prefix
  "Бориспі",
  "Іванівка", // namesakes across regions
  "Миколаївка",
  "Миколаивка", // typo: trigram only
  "Миколаівка",
  "Кам'янка-Бузька", // ASCII apostrophe
  "Камʼянка-Бузька", // U+02BC
  "Камʼянське",
  "м. Бровари", // kind word stripped
  "kyiv", // Latin transliteration
  "bila tserkva",
  "Левітанівк",
  "sevastopol",
  "Зіркомір", // nothing
  "Лозова", // exact, prefix and trigram neighbours
  "Лозовата",
  "Лозовата1",
  "Тестове", // prefix with more than BRANCH_LIMIT matches
  "Тестов",
  "Testove",
  "Лозовт", // trigram with more than BRANCH_LIMIT matches
  "Бр", // short input
  "Ки",
];

describe("cities.search as a union of index branches equals the single-OR query", () => {
  for (const regionBias of [null, lviv] as const) {
    for (const cyrillicTrigrams of [true, false]) {
      it(`gives the same ranked ids on ${PROBES.length} probes (bias ${regionBias === null ? "none" : "Lviv"}, Cyrillic trigrams ${cyrillicTrigrams})`, async () => {
        for (const raw of PROBES) {
          const query = placeQueryOf(raw);
          expect(query.kind, `${raw} must be a runnable query`).toBe("ok");
          if (query.kind !== "ok") continue;
          const useCyr = query.cyrillic !== null && cyrillicTrigrams;
          const expected = await oldQuery(query, regionBias, useCyr).ids();
          const found = await citySearchRepo(db).search(query, { regionBias, cyrillicTrigrams });
          expect(
            found.map((r) => r.id),
            raw,
          ).toEqual(expected);
        }
      });
    }
  }

  it("keeps the right rows when mixed types and regions overflow a branch, with and without a bias", async () => {
    for (const regionBias of [null, lviv] as const) {
      for (const raw of ["Мішане", "Узорне", "Mishane"]) {
        const query = placeQueryOf(raw);
        if (query.kind !== "ok") throw new Error(raw);
        const old = oldQuery(query, regionBias, true);
        const [counted] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(cities)
          .where(old.where);
        expect(counted?.n, `${raw} must overflow a branch`).toBeGreaterThan(BRANCH_LIMIT);
        const found = await citySearchRepo(db).search(query, { regionBias });
        expect(
          found.map((r) => r.id),
          `${raw} bias ${regionBias}`,
        ).toEqual(await old.ids());
        if (raw === "Мішане") expect(found.every((r) => r.kind === "city")).toBe(true);
        if (raw === "Узорне" && regionBias !== null) {
          expect(found.every((r) => r.regionId === regionBias)).toBe(true);
        }
      }
    }
  });

  it("keeps the top 20 when a branch is cut at its limit", async () => {
    for (const raw of ["Тестове", "Testove", "Лозовт", "Лозовата"]) {
      const query = placeQueryOf(raw);
      if (query.kind !== "ok") throw new Error(raw);
      const old = oldQuery(query, null, true);
      const [counted] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(cities)
        .where(old.where);
      expect(counted?.n, `${raw} must overflow a branch`).toBeGreaterThan(BRANCH_LIMIT);
      const found = await citySearchRepo(db).search(query, { regionBias: null });
      expect(found.map((r) => r.id)).toEqual(await old.ids());
      expect(found).toHaveLength(20);
    }
  });
});
