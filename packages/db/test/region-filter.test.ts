import {
  type CityId,
  EVERYONE_SCOPE,
  type FeedFilters,
  NO_FILTERS,
  type RegionId,
  type RegionSlug,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KYIV_OBLAST_REGION_ID, REGION_BY_SLUG } from "../src/geography/regions-data";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { citySlugAliases } from "../src/schema/city-slug-aliases";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * The oblast dimension: the union-of-scopes rule, the facet roll-up, Crimea handled like every region, and the
 * token resolver. `feed-predicate-identity.test.ts` pins that cities alone still generate the
 * SQL they did before.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

const NOW = new Date("2026-08-05T12:00:00.000Z");

const regionId = (slug: string): RegionId => {
  const region = REGION_BY_SLUG.get(slug as RegionSlug);
  if (!region) throw new Error(`no region ${slug}`);
  return region.id;
};
const KYIV_OBL = KYIV_OBLAST_REGION_ID;
const LVIV_OBL = regionId("lvivska");
const CRIMEA = regionId("krym");

beforeAll(async () => {
  const result = await setupTestDatabase();
  db = result.db;
  cleanup = result.cleanup;
});
afterAll(async () => {
  await cleanup?.();
});
beforeEach(async () => {
  await truncateAll(db);
});

async function seedPlace(region: RegionId, nameUk: string, slug: string, animalCount: number) {
  const city = makeCity({
    regionId: region,
    slug: slug as never,
    name: { uk: nameUk, en: { text: slug, provenance: "human" } },
  });
  await cityRepo(db).insert(city);
  if (animalCount > 0) {
    const shelter = makeShelter({
      displayName: `Притулок ${nameUk}`,
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
    });
    await shelterRepo(db).insert(shelter);
    await animalRepo(db).insertMany(
      Array.from({ length: animalCount }, (_, i) => ({
        animal: makeAnimal({ shelterId: shelter.id, name: `${nameUk} ${i}` }),
        cityId: city.id,
      })),
    );
  }
  return city;
}

async function corpus() {
  const brovary = await seedPlace(KYIV_OBL, "Бровари", "brovary-test", 2);
  const irpin = await seedPlace(KYIV_OBL, "Ірпінь", "irpin-test", 1);
  const lviv = await seedPlace(LVIV_OBL, "Львів", "lviv-test", 3);
  const yalta = await seedPlace(CRIMEA, "Ялта", "yalta-test", 1);
  const empty = await seedPlace(KYIV_OBL, "Буча", "bucha-test", 0);
  return { brovary, irpin, lviv, yalta, empty };
}

const total = async (filters: FeedFilters): Promise<number> =>
  (
    await galleryRepo(db).list({
      filters,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    })
  ).totalMatching;

const regionsOf = (...values: [RegionId, ...RegionId[]]): FeedFilters["regions"] => ({
  kind: "oneOf",
  values,
});
const citiesOf = (...values: [CityId, ...CityId[]]): FeedFilters["cities"] => ({
  kind: "oneOf",
  values,
});

describe("the oblast filter (union of scopes)", () => {
  it("an oblast alone is every animal in its cities", async () => {
    await corpus();
    expect(await total({ ...NO_FILTERS, regions: regionsOf(KYIV_OBL) })).toBe(3);
    expect(await total({ ...NO_FILTERS, regions: regionsOf(LVIV_OBL) })).toBe(3);
    expect(await total({ ...NO_FILTERS, regions: regionsOf(KYIV_OBL, LVIV_OBL) })).toBe(6);
  });

  it("an oblast plus one of its own cities narrows to that city", async () => {
    const { brovary } = await corpus();
    expect(
      await total({ ...NO_FILTERS, regions: regionsOf(KYIV_OBL), cities: citiesOf(brovary.id) }),
    ).toBe(2);
  });

  it("a city elsewhere is added to the oblast, not intersected with it", async () => {
    const { lviv } = await corpus();
    // All of Kyiv oblast (3) plus the Lviv city (3): the pick is in another oblast, so it does
    // not drop the Kyiv oblast scope.
    expect(
      await total({ ...NO_FILTERS, regions: regionsOf(KYIV_OBL), cities: citiesOf(lviv.id) }),
    ).toBe(6);
  });

  it("picked cities of one oblast do not hide a second, otherwise unpicked oblast", async () => {
    const { brovary } = await corpus();
    // Kyiv oblast narrowed to Brovary (2) plus all of Lviv oblast (3).
    expect(
      await total({
        ...NO_FILTERS,
        regions: regionsOf(KYIV_OBL, LVIV_OBL),
        cities: citiesOf(brovary.id),
      }),
    ).toBe(5);
  });

  it("composes with the other dimensions", async () => {
    await corpus();
    expect(
      await total({
        ...NO_FILTERS,
        regions: regionsOf(KYIV_OBL),
        species: { kind: "oneOf", values: ["cat"] },
      }),
    ).toBe(0);
  });

  it("cities alone are unchanged", async () => {
    const { irpin, lviv } = await corpus();
    expect(await total({ ...NO_FILTERS, cities: citiesOf(irpin.id, lviv.id) })).toBe(4);
  });
});

describe("galleryRepo.facetCounts, location facets", () => {
  it("offers only the cities that have animals, with their labels, and rolls them up per oblast", async () => {
    const { brovary, irpin, lviv, yalta, empty } = await corpus();
    const counts = await galleryRepo(db).facetCounts({ filters: NO_FILTERS, now: NOW });

    const byCity = new Map(counts.cities.map((c) => [c.cityId, c.count]));
    expect(byCity).toEqual(
      new Map([
        [brovary.id, 2],
        [irpin.id, 1],
        [lviv.id, 3],
        [yalta.id, 1],
      ]),
    );
    expect(byCity.has(empty.id)).toBe(false);
    expect(counts.cities.find((c) => c.cityId === brovary.id)?.city.regionId).toBe(KYIV_OBL);
    expect(new Map(counts.regions.map((r) => [r.regionId, r.count]))).toEqual(
      new Map([
        [KYIV_OBL, 3],
        [LVIV_OBL, 3],
        [CRIMEA, 1],
      ]),
    );
  });

  it("offers Crimea like any region, and its animals count in the tallies and the list alike", async () => {
    const { yalta } = await corpus();
    const counts = await galleryRepo(db).facetCounts({ filters: NO_FILTERS, now: NOW });
    expect(counts.regions.find((r) => r.regionId === CRIMEA)?.count).toBe(1);
    expect(counts.cities.find((c) => c.cityId === yalta.id)?.count).toBe(1);
    expect(await total({ ...NO_FILTERS, regions: regionsOf(CRIMEA) })).toBe(1);
    // Seven discoverable animals in all, and the size tally agrees with what the list shows.
    expect(Object.values(counts.sizes).reduce((sum, n) => sum + n, 0)).toBe(7);
    expect(await total(NO_FILTERS)).toBe(7);
  });

  it("relaxes both location dimensions, so a pick in one oblast does not zero the others", async () => {
    const { brovary, lviv } = await corpus();
    const counts = await galleryRepo(db).facetCounts({
      filters: { ...NO_FILTERS, regions: regionsOf(KYIV_OBL), cities: citiesOf(brovary.id) },
      now: NOW,
    });
    expect(new Map(counts.cities.map((c) => [c.cityId, c.count])).get(lviv.id)).toBe(3);
    expect(new Map(counts.regions.map((r) => [r.regionId, r.count])).get(KYIV_OBL)).toBe(3);
  });

  it("gives every option the total the list reports with that option chosen alone", async () => {
    const { brovary, irpin, lviv } = await corpus();
    const filters: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };
    const counts = await galleryRepo(db).facetCounts({ filters, now: NOW });

    for (const city of [brovary, irpin, lviv]) {
      expect(counts.cities.find((c) => c.cityId === city.id)?.count).toBe(
        await total({ ...filters, cities: citiesOf(city.id) }),
      );
    }
    for (const region of counts.regions) {
      expect(region.count).toBe(await total({ ...filters, regions: regionsOf(region.regionId) }));
    }
  });
});

describe("cityRepo.resolveTokens and findByIds", () => {
  it("resolves a current slug, a former slug and a legacy id, and degrades an unknown token", async () => {
    const { brovary } = await corpus();
    await db
      .insert(citySlugAliases)
      .values({ slug: "brovary-old", cityId: brovary.id, reason: "legacy" });

    const resolved = await cityRepo(db).resolveTokens([
      "brovary-test",
      "brovary-old",
      brovary.id,
      "nowhere",
    ]);
    const byToken = new Map(resolved.map((r) => [r.token, r]));

    expect(byToken.get("brovary-test")?.via).toBe("slug");
    expect(byToken.get("brovary-old")?.via).toBe("alias");
    expect(byToken.get(brovary.id)?.via).toBe("id");
    for (const token of ["brovary-test", "brovary-old", brovary.id]) {
      expect(byToken.get(token)?.city?.id).toBe(brovary.id);
    }
    expect(byToken.get("nowhere")).toEqual({ token: "nowhere", city: null, via: null });
  });

  it("reads cities by id, by primary key, and nothing for an empty list", async () => {
    const { brovary, lviv } = await corpus();
    const found = await cityRepo(db).findByIds([brovary.id, lviv.id]);
    expect(found.map((c) => c.id).sort()).toEqual([brovary.id, lviv.id].sort());
    expect(await cityRepo(db).findByIds([])).toEqual([]);
  });
});
