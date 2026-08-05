import { DEFAULT_SEEN_SET_POLICY, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adopterRepo } from "../src/repos/adopter-repo.js";
import { animalRepo } from "../src/repos/animal-repo.js";
import { cityRepo } from "../src/repos/city-repo.js";
import { feedRepo } from "../src/repos/feed-repo.js";
import { revealRepo } from "../src/repos/reveal-repo.js";
import { shelterRepo } from "../src/repos/shelter-repo.js";
import { swipeRepo } from "../src/repos/swipe-repo.js";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  makeSwipe,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index.js";

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

  it("lists all cities", async () => {
    const cities = cityRepo(db);
    const c1 = makeCity({ name: { uk: "Харків", en: null } });
    const c2 = makeCity({ name: { uk: "Дніпро", en: null } });

    await cities.insertMany([c1, c2]);
    const list = await cities.listAll();

    expect(list).toHaveLength(2);
    expect(list.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
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

  it("updates a shelter", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const updated = { ...shelter, displayName: "Нова назва" };
    await shelters.update(updated);

    const found = await shelters.findById(shelter.id);
    expect(found?.displayName).toBe("Нова назва");
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

describe("swipeRepo", () => {
  it("records a swipe and retrieves by adopter", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animals = animalRepo(db);
    const adopters = adopterRepo(db);
    const swipesRepo = swipeRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const adopter = makeAdopter();
    await adopters.insert(adopter);

    const swipe = makeSwipe({
      adopterId: adopter.id,
      animalId: animal.id,
      direction: "interested",
      at: new Date("2026-08-01T12:00:00Z"),
    });
    const isNew = await swipesRepo.record(swipe);
    expect(isNew).toBe(true);

    const list = await swipesRepo.findByAdopterId(adopter.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.direction).toBe("interested");
  });

  it("upserts on duplicate", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animals = animalRepo(db);
    const adopters = adopterRepo(db);
    const swipesRepo = swipeRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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
    const adopter = makeAdopter();
    await adopters.insert(adopter);

    const swipe1 = makeSwipe({
      adopterId: adopter.id,
      animalId: animal.id,
      direction: "pass",
    });
    await swipesRepo.record(swipe1);

    const swipe2 = makeSwipe({
      adopterId: adopter.id,
      animalId: animal.id,
      direction: "interested",
    });
    await swipesRepo.record(swipe2);

    const list = await swipesRepo.findByAdopterId(adopter.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.direction).toBe("interested");
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
});

describe("feedRepo", () => {
  async function seedFeed(opts: { animalCount: number; species?: "dog" | "cat" }) {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animalsR = animalRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const animalList = Array.from({ length: opts.animalCount }, (_, i) =>
      makeAnimal({
        shelterId: shelter.id,
        species: opts.species ?? "dog",
        name: `Тест ${i}`,
        lastUpdatedAt: new Date(`2026-08-01T${String(12 - i).padStart(2, "0")}:00:00Z`),
      }),
    );
    await animalsR.insertMany(animalList.map((a) => ({ animal: a, cityId: city.id })));

    return { city, shelter, animals: animalList };
  }

  it("returns a page of discoverable animals, newest first", async () => {
    const { animals: seeded } = await seedFeed({ animalCount: 5 });
    const feed = feedRepo(db);

    const page = await feed.list({
      filters: NO_FILTERS,
      cursor: null,
      limit: 10,
      adopterId: null,
      now: new Date("2026-08-01T12:00:00Z"),
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });

    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
    // Newest first: the first seeded animal has the latest lastUpdatedAt
    expect(page.items[0]?.id).toBe(seeded[0]?.id);
  });

  it("paginates with keyset cursor", async () => {
    await seedFeed({ animalCount: 5 });
    const feed = feedRepo(db);
    const now = new Date("2026-08-01T12:00:00Z");

    const page1 = await feed.list({
      filters: NO_FILTERS,
      cursor: null,
      limit: 2,
      adopterId: null,
      now,
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });

    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await feed.list({
      filters: NO_FILTERS,
      cursor: page1.nextCursor,
      limit: 2,
      adopterId: null,
      now,
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });

    expect(page2.items).toHaveLength(2);
    // No overlap between pages
    const ids1 = new Set(page1.items.map((a) => a.id));
    for (const item of page2.items) {
      expect(ids1.has(item.id)).toBe(false);
    }
  });

  it("filters by species", async () => {
    const cities = cityRepo(db);
    const shelters = shelterRepo(db);
    const animalsR = animalRepo(db);
    const feed = feedRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const dog = makeAnimal({ shelterId: shelter.id, species: "dog" });
    const cat = makeAnimal({
      shelterId: shelter.id,
      species: "cat",
      name: "Мурка",
      lastUpdatedAt: new Date("2026-08-01T11:00:00Z"),
    });
    await animalsR.insertMany([
      { animal: dog, cityId: city.id },
      { animal: cat, cityId: city.id },
    ]);

    const filters: FeedFilters = {
      ...NO_FILTERS,
      species: { kind: "oneOf", values: ["cat"] },
    };

    const page = await feed.list({
      filters,
      cursor: null,
      limit: 10,
      adopterId: null,
      now: new Date("2026-08-01T12:00:00Z"),
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.species).toBe("cat");
  });

  it("excludes animals from non-verified shelters", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animalsR = animalRepo(db);
    const feed = feedRepo(db);

    const city = makeCity();
    await cities.insert(city);

    const mkShelter = (verification: { status: string }) =>
      makeShelter({
        publicLocation: {
          cityId: city.id,
          district: null,
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
        verification: {
          status: "pending",
          submittedAt: new Date(),
          evidence: { items: [], submittedAt: new Date() },
        } as never,
        ...verification,
      });

    const verifiedShelter = mkShelter({
      status: "verified",
    });
    // Override with actual verified verification
    const verified = makeShelter({
      id: verifiedShelter.id,
      publicLocation: verifiedShelter.publicLocation,
      exactAddress: verifiedShelter.exactAddress,
    });
    await sheltersR.insert(verified);

    const pendingShelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
        approximate: { center: { lat: 50.46, lng: 30.53 }, precisionMetres: 1000 } as never,
      },
      exactAddress: {
        line1: "вул. Тестова 2",
        line2: null,
        postalCode: "01002",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.46, lng: 30.53 },
      },
      verification: {
        status: "pending",
        submittedAt: new Date(),
        evidence: { items: [], submittedAt: new Date() },
      },
    });
    await sheltersR.insert(pendingShelter);

    const animalFromVerified = makeAnimal({ shelterId: verified.id });
    const animalFromPending = makeAnimal({ shelterId: pendingShelter.id, name: "Мурка" });
    await animalsR.insertMany([
      { animal: animalFromVerified, cityId: city.id },
      { animal: animalFromPending, cityId: city.id },
    ]);

    const page = await feed.list({
      filters: NO_FILTERS,
      cursor: null,
      limit: 10,
      adopterId: null,
      now: new Date("2026-08-01T12:00:00Z"),
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.shelterId).toBe(verified.id);
  });

  it("excludes swiped animals from the feed", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animalsR = animalRepo(db);
    const adopters = adopterRepo(db);
    const swipesR = swipeRepo(db);
    const feed = feedRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const a1 = makeAnimal({ shelterId: shelter.id });
    const a2 = makeAnimal({
      shelterId: shelter.id,
      name: "Мурка",
      lastUpdatedAt: new Date("2026-08-01T11:00:00Z"),
    });
    await animalsR.insertMany([
      { animal: a1, cityId: city.id },
      { animal: a2, cityId: city.id },
    ]);

    const adopter = makeAdopter();
    await adopters.insert(adopter);

    // Swipe on a1 as "interested"
    await swipesR.record(
      makeSwipe({
        adopterId: adopter.id,
        animalId: a1.id,
        direction: "interested",
      }),
    );

    const now = new Date("2026-08-01T12:00:00Z");
    const page = await feed.list({
      filters: NO_FILTERS,
      cursor: null,
      limit: 10,
      adopterId: adopter.id,
      now,
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(a2.id);
  });

  it("re-shows a passed animal after reshowAfterDays expires", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animalsR = animalRepo(db);
    const adopters = adopterRepo(db);
    const swipesR = swipeRepo(db);
    const feed = feedRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const a1 = makeAnimal({ shelterId: shelter.id });
    await animalsR.insert(a1, city.id);

    const adopter = makeAdopter();
    await adopters.insert(adopter);

    // Pass on a1 31 days ago
    const thirtyOneDaysAgo = new Date("2026-07-01T12:00:00Z");
    await swipesR.record(
      makeSwipe({
        adopterId: adopter.id,
        animalId: a1.id,
        direction: "pass",
        at: thirtyOneDaysAgo,
      }),
    );

    const now = new Date("2026-08-01T12:00:00Z");
    const policy = { maxTracked: 1000, reshowAfterDays: 30 };

    // After 31 days, the passed animal should reappear
    const page = await feed.list({
      filters: NO_FILTERS,
      cursor: null,
      limit: 10,
      adopterId: adopter.id,
      now,
      seenSetPolicy: policy,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(a1.id);
  });

  it("excludes a recently passed animal within reshowAfterDays", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animalsR = animalRepo(db);
    const adopters = adopterRepo(db);
    const swipesR = swipeRepo(db);
    const feed = feedRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const a1 = makeAnimal({ shelterId: shelter.id });
    await animalsR.insert(a1, city.id);

    const adopter = makeAdopter();
    await adopters.insert(adopter);

    // Pass on a1 10 days ago (within the 30-day window)
    const tenDaysAgo = new Date("2026-07-22T12:00:00Z");
    await swipesR.record(
      makeSwipe({
        adopterId: adopter.id,
        animalId: a1.id,
        direction: "pass",
        at: tenDaysAgo,
      }),
    );

    const now = new Date("2026-08-01T12:00:00Z");
    const policy = { maxTracked: 1000, reshowAfterDays: 30 };

    // Within 30 days, the passed animal should still be excluded
    const page = await feed.list({
      filters: NO_FILTERS,
      cursor: null,
      limit: 10,
      adopterId: adopter.id,
      now,
      seenSetPolicy: policy,
    });

    expect(page.items).toHaveLength(0);
  });

  it("excludes non-discoverable listings", async () => {
    const cities = cityRepo(db);
    const sheltersR = shelterRepo(db);
    const animalsR = animalRepo(db);
    const feed = feedRepo(db);

    const city = makeCity();
    await cities.insert(city);
    const shelter = makeShelter({
      publicLocation: {
        cityId: city.id,
        district: null,
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

    const published = makeAnimal({ shelterId: shelter.id });
    const draft = makeAnimal({
      shelterId: shelter.id,
      name: "Чернуня",
      listing: { kind: "draft" },
      lastUpdatedAt: new Date("2026-08-01T11:00:00Z"),
    });
    const adopted = makeAnimal({
      shelterId: shelter.id,
      name: "Рудий",
      listing: { kind: "adopted", adoptedAt: new Date() },
      lastUpdatedAt: new Date("2026-08-01T10:00:00Z"),
    });
    await animalsR.insertMany([
      { animal: published, cityId: city.id },
      { animal: draft, cityId: city.id },
      { animal: adopted, cityId: city.id },
    ]);

    const page = await feed.list({
      filters: NO_FILTERS,
      cursor: null,
      limit: 10,
      adopterId: null,
      now: new Date("2026-08-01T12:00:00Z"),
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.listing.kind).toBe("published");
  });
});
