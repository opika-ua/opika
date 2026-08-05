import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { filtersFingerprint, NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encodeFeedCursor, encodeRevealCursor } from "./cursor.js";
import { createTestHarness, type TestHarness } from "./test-harness.js";

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

  it("an invalid cookie does not authenticate", async () => {
    const res = await h.call("session.bootstrap", {}, { cookie: "session=bogus" });
    expect(res.status).toBe(200);
    // Should mint a fresh session since the old one was invalid
    const cookie = h.extractSessionCookie(res.headers);
    expect(cookie).toBeTruthy();
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
