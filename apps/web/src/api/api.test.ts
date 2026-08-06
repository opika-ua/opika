import { animalRepo, cityRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeReveal, makeShelter } from "@opika/db/test";
import { type AdopterId, filtersFingerprint, NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encodeFeedCursor, encodeRevealCursor } from "./cursor";
import { createTestHarness, type TestHarness } from "./test-harness";

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});

afterAll(async () => {
  await h.cleanup();
});

beforeEach(async () => {
  await h.truncate();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert the response is an oRPC error with the given code. */
function expectError(res: { status: number; body: unknown }, code: string) {
  expect(res.status).toBeGreaterThanOrEqual(400);
  const body = res.body as Record<string, unknown>;
  expect(body).toHaveProperty("code", code);
  expect(body).toHaveProperty("defined", true);
}

/** Bootstrap a session and return the cookie string for replay. */
async function bootstrap(): Promise<string> {
  const res = await h.call("session.bootstrap", {});
  expect(res.status).toBe(200);
  const cookie = h.extractSessionCookie(res.headers);
  expect(cookie).toBeTruthy();
  return cookie!;
}

/**
 * Insert a city, verified shelter, and published animal.
 *
 * The shelter gets a proper publicLocation via makeShelter's default
 * (uses publicLocationOf). The animal's publicLocation stays null —
 * valid per the schema — and the denormalised city_id column is set
 * via the second arg to animalRepo.insert.
 */
async function seedFeedAnimal(animalOverrides?: Partial<Parameters<typeof makeAnimal>[0]>) {
  const city = makeCity();
  await cityRepo(h.db).insert(city);

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
  await shelterRepo(h.db).insert(shelter);

  const animal = makeAnimal({
    shelterId: shelter.id,
    ...animalOverrides,
  });
  await animalRepo(h.db).insert(animal, city.id);

  return { city, shelter, animal };
}

// ---------------------------------------------------------------------------
// 1. Session bootstrap & cookie round-trip
// ---------------------------------------------------------------------------

describe("session", () => {
  it("bootstrap returns an adopter and sets a session cookie", async () => {
    const res = await h.call("session.bootstrap", {});
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("adopter");
    expect((body.adopter as Record<string, unknown>).isAnonymous).toBe(true);

    const cookie = h.extractSessionCookie(res.headers);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/^session=/);
  });

  it("a replayed cookie returns the same adopter", async () => {
    const cookie = await bootstrap();

    const res2 = await h.call("session.bootstrap", {}, { cookie });
    expect(res2.status).toBe(200);
    const body2 = res2.body as Record<string, unknown>;
    const adopter2 = body2.adopter as Record<string, unknown>;
    expect(adopter2.isAnonymous).toBe(true);

    // The adopter id should be stable
    const res1 = await h.call("session.bootstrap", {}, { cookie });
    const body1 = res1.body as Record<string, unknown>;
    expect((body1.adopter as Record<string, unknown>).id).toBe(adopter2.id);
  });

  it("absolute expiry rejects a session older than 30 days", async () => {
    const cookie = await bootstrap();

    // 30 days + 1 second later, session should be expired
    const thirtyDaysLater = new Date("2026-08-01T12:00:00Z");
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    thirtyDaysLater.setSeconds(thirtyDaysLater.getSeconds() + 1);

    // Authenticated endpoint should reject
    const { animal } = await seedFeedAnimal();
    const res = await h.call(
      "animals.reveal",
      { animalId: animal.id },
      { cookie, now: thirtyDaysLater },
    );
    expectError(res, "UNAUTHENTICATED");
  });

  it("idle expiry rejects a session idle for more than 7 days", async () => {
    const cookie = await bootstrap();

    // 7 days + 1 second without activity
    const sevenDaysLater = new Date("2026-08-01T12:00:00Z");
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    sevenDaysLater.setSeconds(sevenDaysLater.getSeconds() + 1);

    const { animal } = await seedFeedAnimal();
    const res = await h.call(
      "animals.reveal",
      { animalId: animal.id },
      { cookie, now: sevenDaysLater },
    );
    expectError(res, "UNAUTHENTICATED");
  });

  it("bootstrap mints a fresh session when the cookie is unknown", async () => {
    // An unknown cookie triggers get-or-reject inside validateSession (returns
    // { ok: false }), and bootstrap is the sole endpoint that responds by
    // minting. This is NOT the old deviceSessionId vulnerability — 256-bit
    // hashed tokens can't collide — but it means bootstrap MUST be per-IP rate
    // limited because unauthenticated callers can create unbounded adopter rows.
    const res = await h.call("session.bootstrap", {}, { cookie: "session=bogus" });
    expect(res.status).toBe(200);
    const cookie = h.extractSessionCookie(res.headers);
    expect(cookie).toBeTruthy();

    // The new session should work
    const res2 = await h.call("session.bootstrap", {}, { cookie: cookie! });
    expect(res2.status).toBe(200);
    const body2 = res2.body as Record<string, unknown>;
    expect(body2).toHaveProperty("adopter");
  });
});

// ---------------------------------------------------------------------------
// 2. Cursor signing & stability
// ---------------------------------------------------------------------------

describe("feed cursor", () => {
  it("a valid cursor round-trips through the feed", async () => {
    const { city, shelter } = await (async () => {
      const city = makeCity();
      await cityRepo(h.db).insert(city);
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
      await shelterRepo(h.db).insert(shelter);
      return { city, shelter };
    })();

    // Insert enough animals to get a nextCursor
    for (let i = 0; i < 3; i++) {
      const animal = makeAnimal({
        shelterId: shelter.id,
        lastUpdatedAt: new Date(`2026-07-${String(28 - i).padStart(2, "0")}T12:00:00Z`),
      });
      await animalRepo(h.db).insert(animal, city.id);
    }

    const res1 = await h.call("feed.list", {
      filters: NO_FILTERS,
      cursor: null,
      limit: 2,
    });
    expect(res1.status).toBe(200);
    const body1 = res1.body as { items: unknown[]; nextCursor: string | null };
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).toBeTruthy();

    // Use the cursor to get the next page
    const res2 = await h.call("feed.list", {
      filters: NO_FILTERS,
      cursor: body1.nextCursor,
      limit: 2,
    });
    expect(res2.status).toBe(200);
    const body2 = res2.body as { items: unknown[]; nextCursor: string | null };
    expect(body2.items).toHaveLength(1);
  });

  it("a tampered feed cursor is rejected", async () => {
    const cursor = encodeFeedCursor(
      { lastUpdatedAt: new Date("2026-08-01T12:00:00Z"), id: "fake-id" },
      filtersFingerprint(NO_FILTERS),
      h.cursorSecret,
    );
    const tampered = `${cursor.slice(0, -1)}${cursor.at(-1) === "A" ? "B" : "A"}`;

    const res = await h.call("feed.list", {
      filters: NO_FILTERS,
      cursor: tampered,
      limit: 20,
    });
    expectError(res, "INVALID_CURSOR");
  });

  it("a feed cursor used with different filters is rejected", async () => {
    const cursor = encodeFeedCursor(
      { lastUpdatedAt: new Date("2026-08-01T12:00:00Z"), id: "fake-id" },
      filtersFingerprint({ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } }),
      h.cursorSecret,
    );

    const res = await h.call("feed.list", {
      filters: NO_FILTERS,
      cursor,
      limit: 20,
    });
    expectError(res, "INVALID_CURSOR");
  });

  it("a reveal cursor cannot be used as a feed cursor", async () => {
    const cursor = encodeRevealCursor(
      { lastUpdatedAt: new Date("2026-08-01T12:00:00Z"), id: "fake-id" },
      h.cursorSecret,
    );

    const res = await h.call("feed.list", {
      filters: NO_FILTERS,
      cursor,
      limit: 20,
    });
    expectError(res, "INVALID_CURSOR");
  });
});

// ---------------------------------------------------------------------------
// 3. Reveal cursor signing
// ---------------------------------------------------------------------------

describe("reveal cursor", () => {
  it("a tampered reveal cursor is rejected", async () => {
    const cookie = await bootstrap();

    const cursor = encodeRevealCursor(
      { lastUpdatedAt: new Date("2026-08-01T12:00:00Z"), id: "fake-id" },
      h.cursorSecret,
    );
    const tampered = `${cursor.slice(0, -1)}${cursor.at(-1) === "A" ? "B" : "A"}`;

    const res = await h.call("reveals.listMine", { cursor: tampered, limit: 20 }, { cookie });
    expectError(res, "INVALID_CURSOR");
  });
});

// ---------------------------------------------------------------------------
// 4. Feed filter correctness
// ---------------------------------------------------------------------------

describe("feed filters", () => {
  it("species filter excludes non-matching animals", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
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
    await shelterRepo(h.db).insert(shelter);

    const dog = makeAnimal({ shelterId: shelter.id, species: "dog" as const });
    const cat = makeAnimal({ shelterId: shelter.id, species: "cat" as const });
    await animalRepo(h.db).insert(dog, city.id);
    await animalRepo(h.db).insert(cat, city.id);

    const res = await h.call("feed.list", {
      filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
      cursor: null,
      limit: 50,
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ id: string; species: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.species).toBe("cat");
  });
});

// ---------------------------------------------------------------------------
// 5. Reveal
// ---------------------------------------------------------------------------

describe("reveal", () => {
  it("returns a shelter snapshot with exact address", async () => {
    const cookie = await bootstrap();
    const { animal } = await seedFeedAnimal();

    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("animalId", animal.id);
    expect(body).toHaveProperty("shelterSnapshot");
    const snapshot = body.shelterSnapshot as Record<string, unknown>;
    expect(snapshot).toHaveProperty("exactAddress");
    expect(snapshot).toHaveProperty("contact");
  });

  it("is idempotent — second reveal returns the same id", async () => {
    const cookie = await bootstrap();
    const { animal } = await seedFeedAnimal();

    const res1 = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    const res2 = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect((res1.body as Record<string, unknown>).id).toBe(
      (res2.body as Record<string, unknown>).id,
    );
  });

  it("requires authentication", async () => {
    const { animal } = await seedFeedAnimal();
    const res = await h.call("animals.reveal", { animalId: animal.id });
    expectError(res, "UNAUTHENTICATED");
  });
});

// ---------------------------------------------------------------------------
// 6. Swipes require authentication
// ---------------------------------------------------------------------------

describe("swipes", () => {
  it("requires authentication", async () => {
    const { animal } = await seedFeedAnimal();
    const res = await h.call("swipes.record", {
      animalId: animal.id,
      direction: "interested",
      at: new Date("2026-08-01T12:00:00Z"),
    });
    expectError(res, "UNAUTHENTICATED");
  });
});

// ---------------------------------------------------------------------------
// 7. Reveal rate limit
// ---------------------------------------------------------------------------

describe("reveal rate limit", () => {
  it("returns RATE_LIMITED after 30 reveals in 24h", async () => {
    const cookie = await bootstrap();

    // Bootstrap to discover adopterId
    const bootstrapRes = await h.call("session.bootstrap", {}, { cookie });
    const adopterId = (
      (bootstrapRes.body as Record<string, unknown>).adopter as Record<string, unknown>
    ).id as AdopterId;

    // Seed one animal for the 31st reveal attempt
    const { animal: targetAnimal, shelter, city } = await seedFeedAnimal();

    // Insert 30 reveals directly via the repo (each for a different animal)
    const reveals = revealRepo(h.db);
    for (let i = 0; i < 30; i++) {
      const animal = makeAnimal({ shelterId: shelter.id });
      await animalRepo(h.db).insert(animal, city.id);

      const reveal = makeReveal({
        adopterId,
        animalId: animal.id,
        shelterId: shelter.id,
        revealedAt: new Date("2026-08-01T11:00:00Z"),
      });
      await reveals.insert(reveal);
    }

    // 31st reveal via the API should be rate-limited
    const res = await h.call("animals.reveal", { animalId: targetAnimal.id }, { cookie });
    expectError(res, "RATE_LIMITED");
  });
});

// ---------------------------------------------------------------------------
// 8. Cursor stability across inserts
// ---------------------------------------------------------------------------

describe("cursor stability", () => {
  it("a new insert does not cause duplicates or skips across pages", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
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
    await shelterRepo(h.db).insert(shelter);

    // Insert 4 animals with distinct timestamps
    const timestamps = [
      new Date("2026-07-28T12:00:00Z"),
      new Date("2026-07-27T12:00:00Z"),
      new Date("2026-07-26T12:00:00Z"),
      new Date("2026-07-25T12:00:00Z"),
    ];
    const seededIds: string[] = [];
    for (const ts of timestamps) {
      const animal = makeAnimal({ shelterId: shelter.id, lastUpdatedAt: ts });
      await animalRepo(h.db).insert(animal, city.id);
      seededIds.push(animal.id);
    }

    // Fetch page 1 (limit 2)
    const res1 = await h.call("feed.list", { filters: NO_FILTERS, cursor: null, limit: 2 });
    expect(res1.status).toBe(200);
    const body1 = res1.body as { items: Array<{ id: string }>; nextCursor: string | null };
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).toBeTruthy();
    const page1Ids = body1.items.map((i) => i.id);

    // Insert a NEW animal whose timestamp falls on the FIRST page (newer
    // than anything already seen). This must not cause duplicates on page 2.
    const newAnimal = makeAnimal({
      shelterId: shelter.id,
      lastUpdatedAt: new Date("2026-07-29T12:00:00Z"),
    });
    await animalRepo(h.db).insert(newAnimal, city.id);

    // Fetch page 2 using the cursor from page 1
    const res2 = await h.call("feed.list", {
      filters: NO_FILTERS,
      cursor: body1.nextCursor,
      limit: 10,
    });
    expect(res2.status).toBe(200);
    const body2 = res2.body as { items: Array<{ id: string }>; nextCursor: string | null };
    const page2Ids = body2.items.map((i) => i.id);

    // No id from page 1 should appear in page 2
    for (const id of page1Ids) {
      expect(page2Ids).not.toContain(id);
    }

    // All original seeded IDs that weren't on page 1 should be on page 2
    const remainingOriginals = seededIds.filter((id) => !page1Ids.includes(id));
    for (const id of remainingOriginals) {
      expect(page2Ids).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Filter coverage: city, size, age, multi-filter
// ---------------------------------------------------------------------------

describe("feed filters — city", () => {
  it("city filter returns only animals in the selected city", async () => {
    const city1 = makeCity({ name: { uk: "Київ", en: null } });
    const city2 = makeCity({ name: { uk: "Львів", en: null } });
    await cityRepo(h.db).insert(city1);
    await cityRepo(h.db).insert(city2);

    const shelter1 = makeShelter({
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId: city1.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    const shelter2 = makeShelter({
      exactAddress: {
        line1: "вул. Тестова 2",
        line2: null,
        postalCode: "79000",
        cityId: city2.id,
        district: null,
        coordinates: { lat: 49.84, lng: 24.03 },
      },
    });
    await shelterRepo(h.db).insert(shelter1);
    await shelterRepo(h.db).insert(shelter2);

    const a1 = makeAnimal({ shelterId: shelter1.id });
    const a2 = makeAnimal({ shelterId: shelter2.id });
    await animalRepo(h.db).insert(a1, city1.id);
    await animalRepo(h.db).insert(a2, city2.id);

    const res = await h.call("feed.list", {
      filters: { ...NO_FILTERS, cities: { kind: "oneOf", values: [city1.id] } },
      cursor: null,
      limit: 50,
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(a1.id);
  });
});

describe("feed filters — size", () => {
  it("size filter returns only matching animals", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
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
    await shelterRepo(h.db).insert(shelter);

    const small = makeAnimal({ shelterId: shelter.id, size: "small" });
    const large = makeAnimal({ shelterId: shelter.id, size: "large" });
    await animalRepo(h.db).insert(small, city.id);
    await animalRepo(h.db).insert(large, city.id);

    const res = await h.call("feed.list", {
      filters: { ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } },
      cursor: null,
      limit: 50,
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ id: string; size: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(small.id);
  });
});

describe("feed filters — age", () => {
  it("age filter returns only animals in the selected bucket", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
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
    await shelterRepo(h.db).insert(shelter);

    // "now" is 2026-08-01. A baby is <1yr, so born after 2025-08-01.
    // A senior is 8yr+, so born before 2018-08-01.
    const baby = makeAnimal({
      shelterId: shelter.id,
      age: { kind: "birth_date", date: new Date("2026-03-01"), precision: "day" as const },
    });
    const senior = makeAnimal({
      shelterId: shelter.id,
      age: { kind: "birth_date", date: new Date("2016-01-01"), precision: "day" as const },
    });
    await animalRepo(h.db).insert(baby, city.id);
    await animalRepo(h.db).insert(senior, city.id);

    const res = await h.call("feed.list", {
      filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: ["baby"] } },
      cursor: null,
      limit: 50,
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ id: string; ageBucket: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(baby.id);
    expect(body.items[0]?.ageBucket).toBe("baby");
  });
});

describe("feed filters — multi-filter combination", () => {
  it("species + size returns only animals matching both", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
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
    await shelterRepo(h.db).insert(shelter);

    const smallDog = makeAnimal({ shelterId: shelter.id, species: "dog" as const, size: "small" });
    const largeDog = makeAnimal({ shelterId: shelter.id, species: "dog" as const, size: "large" });
    const smallCat = makeAnimal({ shelterId: shelter.id, species: "cat" as const, size: "small" });
    await animalRepo(h.db).insert(smallDog, city.id);
    await animalRepo(h.db).insert(largeDog, city.id);
    await animalRepo(h.db).insert(smallCat, city.id);

    const res = await h.call("feed.list", {
      filters: {
        ...NO_FILTERS,
        species: { kind: "oneOf", values: ["dog"] },
        sizes: { kind: "oneOf", values: ["small"] },
      },
      cursor: null,
      limit: 50,
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(smallDog.id);
  });
});
