import { placeQueryOf, type RegionId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REGION_BY_CODE } from "../src/geography/regions-data";
import { runImport } from "../src/import/importer";
import { cityRepo } from "../src/repos/city-repo";
import { citySearchRepo, cyrillicTrigramsAvailable } from "../src/repos/city-search-repo";
import { buildCities } from "../src/seed";
import { makeCity, setupTestDatabase, truncateAll } from "../src/test-utils/index";
import { buildXlsx, FIXTURE_ROWS, pinFor } from "./import-fixture";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const bytes = buildXlsx();
beforeEach(async () => {
  await truncateAll(db);
  await cityRepo(db).insertMissing(buildCities());
  await runImport({ db, bytes, commit: true, editions: [pinFor(bytes)] });
});

const regionId = (code: string) => (REGION_BY_CODE.get(code)?.id ?? "") as RegionId;
const find = async (
  raw: string,
  options: { regionBias?: RegionId | null; cyrillicTrigrams?: boolean } = {},
) => {
  const query = placeQueryOf(raw);
  if (query.kind !== "ok") throw new Error(`"${raw}" is too short`);
  return citySearchRepo(db).search(query, { regionBias: options.regionBias ?? null, ...options });
};
const names = (rows: readonly { nameUk: string }[]) => rows.map((r) => r.nameUk);

describe("citySearchRepo.search", () => {
  it("finds a settlement by exact name, by prefix and by a Latin spelling", async () => {
    expect(names(await find("Фастів"))).toEqual(["Фастів"]);
    expect(names(await find("Бориспі"))).toEqual(["Бориспіль"]);
    expect(names(await find("kyiv"))).toEqual(["Київ"]);
    expect(names(await find("bila tserkva"))).toEqual(["Біла Церква"]);
  });

  it("strips a typed kind word and an apostrophe the way the stored key does", async () => {
    expect(names(await find("м. Бровари"))).toContain("Бровари");
    expect((await find("Кам'янка-Бузька"))[0]?.nameUk).toBe("Камʼянка-Бузька");
  });

  it("ranks an exact match before a prefix match before a trigram match", async () => {
    await cityRepo(db).insertMissing([
      makeCity({ name: { uk: "Лозова", en: { text: "Lozova", provenance: "human" } } }),
      makeCity({ name: { uk: "Лозовата", en: { text: "Lozovata", provenance: "human" } } }),
      makeCity({ name: { uk: "Лозово", en: { text: "Lozovo", provenance: "human" } } }),
    ]);
    expect(names(await find("Лозова"))).toEqual(["Лозова", "Лозовата", "Лозово"]);
  });

  it("tolerates a typo through trigrams", async () => {
    expect(names(await find("Миколаівка"))).toEqual(expect.arrayContaining(["Миколаївка"]));
  });

  it("puts a city before a village of the same name, then the caller's oblast first", async () => {
    const byKind = await find("Бровари");
    expect(byKind.map((r) => [r.nameUk, r.kind])).toEqual([
      ["Бровари", "city"],
      ["Бровари", "village"],
    ]);
    const biased = await find("Іванівка", { regionBias: regionId("UA46") });
    expect(biased[0]?.regionId).toBe(regionId("UA46"));
    expect(biased).toHaveLength(3);
  });

  it("carries the disambiguating pieces and no coordinates", async () => {
    const [match] = await find("Дзвінка", { regionBias: null });
    expect(Object.keys(match ?? {}).sort()).toEqual([
      "districtNameUk",
      "hromadaNameUk",
      "id",
      "kind",
      "nameScope",
      "nameUk",
      "regionId",
      "regionUkShort",
      "slug",
    ]);
  });

  it("returns a settlement of Crimea or Sevastopol like any other, by any spelling", async () => {
    for (const [query, name] of [
      ["Левітанівка", "Левітанівка"],
      ["Левіт", "Левітанівка"],
      ["Левітанівк", "Левітанівка"],
      ["levitanivka", "Левітанівка"],
      ["Севастополь", "Севастополь"],
      ["sevastopol", "Севастополь"],
    ] as const) {
      expect(
        (await find(query)).map((r) => r.nameUk),
        query,
      ).toContain(name);
    }
  });

  it("never returns a retired settlement", async () => {
    const without = buildXlsx(FIXTURE_ROWS.filter((r) => r[6] !== "Борова"));
    await runImport({
      db,
      bytes: without,
      commit: true,
      editions: [pinFor(without, { K: 2, M: 8, X: 0, C: 11 })],
    });
    expect(await find("Борова")).toEqual([]);
  });

  it("returns at most 20 rows", async () => {
    await cityRepo(db).insertMissing(
      Array.from({ length: 30 }, (_, i) =>
        makeCity({ name: { uk: `Тестове${i}`, en: { text: `Testove${i}`, provenance: "human" } } }),
      ),
    );
    expect(await find("Тестове")).toHaveLength(20);
  });

  it("treats LIKE wildcards in the query as plain characters", async () => {
    expect(await find("%%")).toEqual([]);
    expect(await find("б_ов")).toEqual([]);
  });
});

describe("when the database yields no Cyrillic trigrams", () => {
  it("is probed once per connection and is true on a UTF-8 database", async () => {
    expect(await cyrillicTrigramsAvailable(db)).toBe(true);
  });

  it("falls back to the Latin key: a Cyrillic typo with no matching prefix still finds the place", async () => {
    // "Миколаивка" (и for ї): no stored Cyrillic key starts with it, so only trigrams can match.
    const withTrigrams = await find("Миколаивка", { cyrillicTrigrams: true });
    const fallback = await find("Миколаивка", { cyrillicTrigrams: false });
    expect(names(withTrigrams)).toContain("Миколаївка");
    expect(names(fallback)).toContain("Миколаївка");
  });

  it("still finds an exact and a prefix match", async () => {
    expect(names(await find("Фастів", { cyrillicTrigrams: false }))).toEqual(["Фастів"]);
    expect(names(await find("Бориспі", { cyrillicTrigrams: false }))).toEqual(["Бориспіль"]);
  });

  it("finds nothing for an unrelated word, so the fallback is not a match-all", async () => {
    expect(await find("Зіркомір", { cyrillicTrigrams: false })).toEqual([]);
  });
});

describe("cyrillicTrigramsAvailable with a failing database", () => {
  /** A stand-in whose probe query rejects on the first call and answers after that. */
  const flaky = () => {
    const calls = { n: 0 };
    const fake = {
      select: () => ({
        from: () => {
          calls.n += 1;
          return calls.n === 1
            ? Promise.reject(new Error("transient"))
            : Promise.resolve([{ n: 5 }]);
        },
      }),
    };
    return { fake: fake as never, calls };
  };

  it("does not remember a failure, and remembers a success", async () => {
    const { fake, calls } = flaky();
    await expect(cyrillicTrigramsAvailable(fake)).rejects.toThrow("transient");
    await Promise.resolve(); // let the cache drop the rejected probe
    expect(await cyrillicTrigramsAvailable(fake)).toBe(true);
    expect(await cyrillicTrigramsAvailable(fake)).toBe(true);
    expect(calls.n).toBe(2);
  });
});
