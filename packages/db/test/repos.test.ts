import { EVERYONE_SCOPE, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals as animalsTable } from "../src/schema/animals";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

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

describe("cityRepo", () => {
  it("inserts and finds a city by id", async () => {
    const cities = cityRepo(db);
    const city = makeCity({ name: { uk: "Харків", en: { text: "Kharkiv", provenance: "human" } } });

    await cities.insert(city);
    const found = await cities.findById(city.id);

    expect(found).toEqual(city);
  });

  it("returns null for non-existent city", async () => {
    const cities = cityRepo(db);
    const found = await cities.findById("00000000-0000-0000-0000-000000000000" as never);
    expect(found).toBeNull();
  });
});

describe("shelterRepo", () => {
  it("round-trips a shelter through insert and find", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: {
          center: { lat: 50.45, lng: 30.52 },
          precisionMetres: 1000,
        } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelters.insert(shelter);
    const found = await shelters.findById(shelter.id);

    expect(found).toEqual(shelter);
  });

  /** Pet card PR 3a (migration 0018): the new `logo` JSONB column, set. */
  it("round-trips a shelter with a logo set", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: {
          center: { lat: 50.45, lng: 30.52 },
          precisionMetres: 1000,
        } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
      logo: { storageKey: "shelters/test/logo/abc123", width: 160, height: 160 },
    });
    await shelters.insert(shelter);
    const found = await shelters.findById(shelter.id);

    expect(found?.logo).toEqual(shelter.logo);
  });

  it("exposes exactly its three methods: no unaudited whole-row update, and any addition a conscious one", () => {
    // RG-Q12: a full-row write that skips the `version` bump is the one path
    // that could slip past the kabinet's compare-and-set. Keys, not a type
    // check, so re-adding any write method under another name also trips it.
    expect(Object.keys(shelterRepo(db)).sort()).toEqual(["findById", "findByIds", "insert"]);
  });
});

describe("animalRepo", () => {
  it("round-trips an animal through insert and find", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animals = animalRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelters.insert(shelter);

    const animal = makeAnimal({ shelterId: shelter.id });
    await animals.insert(animal, city.id);

    const found = await animals.findById(animal.id);
    expect(found).toEqual(animal);
  });

  it("finds animals by shelter id", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animals = animalRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelters.insert(shelter);

    const a1 = makeAnimal({ shelterId: shelter.id });
    const a2 = makeAnimal({ shelterId: shelter.id, name: "Мурка", species: "cat" });
    await animals.insertMany([
      { animal: a1, cityId: city.id },
      { animal: a2, cityId: city.id },
    ]);

    const list = await animals.findByShelterId(shelter.id);
    expect(list).toHaveLength(2);
  });

  it("derives wait_anchor_at on every write, including an update that changes it", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animals = animalRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelters.insert(shelter);

    const publishedAt = new Date("2026-03-01T10:00:00.000Z");
    const animal = makeAnimal({
      shelterId: shelter.id,
      listing: { kind: "published", publishedAt, confirmedAt: publishedAt, undoable: null },
    });
    await animals.insert(animal, city.id);

    const anchorOf = async (id: string): Promise<Date | null> => {
      const rows = await db
        .select({ waitAnchorAt: animalsTable.waitAnchorAt })
        .from(animalsTable)
        .where(eq(animalsTable.id, id as never));
      return rows[0]?.waitAnchorAt ?? null;
    };

    expect(await anchorOf(animal.id)).toEqual(publishedAt);

    // The transition the column exists for: reserving must not move the anchor.
    await animals.update(
      {
        ...animal,
        listing: {
          kind: "reserved",
          since: new Date("2026-08-01T10:00:00.000Z"),
          publishedAt,
          confirmedAt: publishedAt,
          undoable: null,
        },
      },
      city.id,
    );
    expect(await anchorOf(animal.id)).toEqual(publishedAt);

    // ...and leaving the discoverable kinds clears it, rather than leaving a
    // stale anchor behind for a partial index to keep serving.
    await animals.update(
      { ...animal, listing: { kind: "adopted", adoptedAt: new Date("2026-08-05T10:00:00.000Z") } },
      city.id,
    );
    expect(await anchorOf(animal.id)).toBeNull();
  });
});

describe("adopterRepo", () => {
  it("round-trips an adopter through insert and find", async () => {
    const adopters = adopterRepo(db);
    const adopter = makeAdopter();

    await adopters.insert(adopter);
    const found = await adopters.findById(adopter.id);

    expect(found).toEqual(adopter);
  });

  it("finds by device session id", async () => {
    const adopters = adopterRepo(db);
    const adopter = makeAdopter();

    await adopters.insert(adopter);
    const sessionId = adopter.identity.kind === "anonymous" ? adopter.identity.deviceSessionId : "";
    const found = await adopters.findByDeviceSessionId(sessionId);

    expect(found?.id).toBe(adopter.id);
  });
});

describe("revealRepo", () => {
  it("round-trips a reveal", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animals = animalRepo(db);
    const adopters = adopterRepo(db);
    const reveals = revealRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await sheltersR.insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animals.insert(animal, city.id);
    const adopter = makeAdopter();
    await adopters.insert(adopter);

    const reveal = makeReveal({
      adopterId: adopter.id,
      animalId: animal.id,
      shelterId: shelter.id,
    });
    await reveals.insert(reveal);

    const found = await reveals.findById(reveal.id);
    expect(found).toEqual(reveal);
  });

  it("finds by adopter and animal", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animals = animalRepo(db);
    const adopters = adopterRepo(db);
    const reveals = revealRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await sheltersR.insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animals.insert(animal, city.id);
    const adopter = makeAdopter();
    await adopters.insert(adopter);

    const reveal = makeReveal({
      adopterId: adopter.id,
      animalId: animal.id,
      shelterId: shelter.id,
    });
    await reveals.insert(reveal);

    const found = await reveals.findByAdopterAndAnimal(adopter.id, animal.id);
    expect(found?.id).toBe(reveal.id);
  });

  /**
   * The keyset predicate has two branches - a strict `revealed_at <` and an
   * `=` plus `id <` tiebreaker. Three reveals share a timestamp so the tie
   * straddles the page boundary at limit 2, which is the only arrangement
   * that exercises the second branch: a tie contained entirely within one
   * page passes even with the tiebreaker missing.
   */
  it("paginates by keyset without duplicates or skips, including on tied timestamps", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animals = animalRepo(db);
    const adopters = adopterRepo(db);
    const reveals = revealRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await sheltersR.insert(shelter);
    const adopter = makeAdopter();
    await adopters.insert(adopter);

    // Three reveals at 12:00, so the tie spans the boundary at limit 2.
    const timestamps = [
      "2026-08-01T12:00:00Z",
      "2026-08-01T12:00:00Z",
      "2026-08-01T12:00:00Z",
      "2026-08-01T10:00:00Z",
    ];
    const inserted = [];
    for (const ts of timestamps) {
      const animal = makeAnimal({ shelterId: shelter.id });
      await animals.insert(animal, city.id);
      const reveal = makeReveal({
        adopterId: adopter.id,
        animalId: animal.id,
        shelterId: shelter.id,
        revealedAt: new Date(ts),
      });
      await reveals.insert(reveal);
      inserted.push(reveal);
    }

    const all = await reveals.listByAdopter(adopter.id, { limit: 10 });
    expect(all).toHaveLength(4);

    const page1 = await reveals.listByAdopter(adopter.id, { limit: 2 });
    const last = page1[page1.length - 1];
    if (!last) throw new Error("expected a first page");

    const page2 = await reveals.listByAdopter(adopter.id, {
      limit: 2,
      cursor: { revealedAt: last.revealedAt, id: last.id },
    });

    const paged = [...page1, ...page2].map((r) => r.id);
    expect(paged).toEqual(all.map((r) => r.id));
    expect(new Set(paged).size).toBe(4);
    expect(new Set(paged)).toEqual(new Set(inserted.map((r) => r.id)));
  });
});

describe("galleryRepo city filter", () => {
  it("fostered animal appears under foster city, not shelter city", async () => {
    const citiesR = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animalsR = animalRepo(db);

    const shelterCity = makeCity({
      name: { uk: "Харків", en: { text: "Kharkiv", provenance: "human" } },
    });
    const fosterCity = makeCity({
      name: { uk: "Дніпро", en: { text: "Dnipro", provenance: "human" } },
    });
    await citiesR.insertMany([shelterCity, fosterCity]);

    const shelter = makeShelter({
      publicLocation: {
        cityId: shelterCity.id,
        district: null,
        precision: "fuzzed_address",
        approximate: { center: { lat: 49.99, lng: 36.23 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "61000",
        cityId: shelterCity.id,
        district: null,
        coordinates: { lat: 49.99, lng: 36.23 },
      },
    });
    await sheltersR.insert(shelter);

    // Animal at the shelter (no foster location)
    const atShelter = makeAnimal({ shelterId: shelter.id, name: "Бровко" });
    // Animal fostered in a different city
    const fostered = makeAnimal({
      shelterId: shelter.id,
      name: "Мурка",
      publicLocation: {
        precision: "city",
        cityId: fosterCity.id,
        district: null,
      },
      lastUpdatedAt: new Date("2026-08-01T11:00:00Z"),
    });

    await animalsR.insert(atShelter, shelterCity.id);
    await animalsR.insert(fostered, fosterCity.id);

    const filterByShelterCity: FeedFilters = {
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [shelterCity.id] },
    };
    const filterByFosterCity: FeedFilters = {
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [fosterCity.id] },
    };
    const now = new Date("2026-08-01T12:00:00Z");

    const shelterCityPage = await galleryRepo(db).list({
      filters: filterByShelterCity,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 10,
      now,
    });
    expect(shelterCityPage.items).toHaveLength(1);
    expect(shelterCityPage.items[0]?.id).toBe(atShelter.id);

    const fosterCityPage = await galleryRepo(db).list({
      filters: filterByFosterCity,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 10,
      now,
    });
    expect(fosterCityPage.items).toHaveLength(1);
    expect(fosterCityPage.items[0]?.id).toBe(fostered.id);
  });
});
