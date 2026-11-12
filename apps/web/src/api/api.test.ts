import { animalRepo, cityRepo, kabinetShelterRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import { animals } from "@opika/db/schema";
import {
  type AnimalFixtureOverrides,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
} from "@opika/db/test";
import { type AdopterId, NO_FILTERS, transition } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encodeRevealCursor } from "./cursor";
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
/**
 * `expectedStatus`, added 2026-09-10 (O-20): optional so this file's many
 * existing call sites don't all need touching at once, but every call this
 * row itself adds passes it. Before O-20, every one of this app's custom
 * error codes except `NOT_FOUND` (which happens to collide with an oRPC
 * *common* code of the same name) answered a bare `500` regardless of the
 * code thrown - `res.status >= 400` alone would have stayed green through
 * that entire regression, since 500 is still `>= 400`. Asserting the real
 * status a client receives, not merely "some error happened," is the actual
 * guard.
 */
function expectError(
  res: { status: number; body: unknown },
  code: string,
  expectedStatus?: number,
) {
  if (expectedStatus !== undefined) {
    expect(res.status, `expected HTTP ${expectedStatus} for ${code}, got ${res.status}`).toBe(
      expectedStatus,
    );
  } else {
    expect(res.status).toBeGreaterThanOrEqual(400);
  }
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
 * (uses publicLocationOf). The animal's publicLocation stays null -
 * valid per the schema - and the denormalised city_id column is set
 * via the second arg to animalRepo.insert.
 */
async function seedFeedAnimal(animalOverrides?: AnimalFixtureOverrides) {
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
    expectError(res, "UNAUTHENTICATED", 401);
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
    // minting. This is NOT the old deviceSessionId vulnerability - 256-bit
    // hashed tokens can't collide - but it means bootstrap MUST be per-IP rate
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
// 3. Reveal cursor signing
// ---------------------------------------------------------------------------

describe("reveal cursor", () => {
  it("a tampered reveal cursor is rejected", async () => {
    const cookie = await bootstrap();

    const cursor = encodeRevealCursor(
      { at: new Date("2026-08-01T12:00:00Z"), id: "fake-id" },
      h.cursorSecret,
    );
    const tampered = `${cursor.slice(0, -1)}${cursor.at(-1) === "A" ? "B" : "A"}`;

    const res = await h.call("reveals.listMine", { cursor: tampered, limit: 20 }, { cookie });
    expectError(res, "INVALID_CURSOR");
  });
});

// ---------------------------------------------------------------------------
// 5. Reveal
// ---------------------------------------------------------------------------

describe("reveal", () => {
  it("returns the shelter's contact and never the exact address (EM-D1)", async () => {
    const cookie = await bootstrap();
    const { animal } = await seedFeedAnimal();

    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("animalId", animal.id);
    expect(body).toHaveProperty("shelterContact.contact");
    expect(body).toHaveProperty("shelterAtFirstReveal");
    expect(body.shelterAtFirstReveal).not.toHaveProperty("exactAddress");
    expect(JSON.stringify(body)).not.toContain("exactAddress");
  });

  it("is idempotent - second reveal returns the same id", async () => {
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

  /**
   * O-20 coverage gap, found by the reviewer 2026-09-11: `ANIMAL_NOT_AVAILABLE`
   * and `SHELTER_NOT_VISIBLE` both changed status 500 -> 404 in the same row as
   * RATE_LIMITED/UNAUTHENTICATED/INVALID_CURSOR, but neither had a test here at
   * all - a status regression on either would have stayed green.
   */
  it("answers ANIMAL_NOT_AVAILABLE, at 404, for an adopted animal", async () => {
    const cookie = await bootstrap();
    const { animal } = await seedFeedAnimal({
      listing: { kind: "adopted", adoptedAt: new Date("2026-08-01T00:00:00Z") },
    });

    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expectError(res, "ANIMAL_NOT_AVAILABLE", 404);
  });

  /**
   * No cache sits in front of a reveal: the animal is read live, so a page or list served a moment
   * earlier cannot make a since-adopted animal revealable (PR A, round-trip work).
   */
  it("checks the animal's status live: adopted after its page and the gallery were served", async () => {
    const cookie = await bootstrap();
    const { animal } = await seedFeedAnimal();
    const seen = await h.call("animals.byId", { animalId: animal.id });
    expect(seen.status).toBe(200);
    const listed = await h.call("gallery.list", {
      filters: NO_FILTERS,
      sort: "freshest",
      page: 1,
      pageSize: 24,
      scope: { kind: "everyone" },
    });
    expect((listed.body as { items: { id: string }[] }).items.map((i) => i.id)).toContain(
      animal.id,
    );

    await h.db.update(animals).set({
      listingKind: "adopted",
      listing: { kind: "adopted", adoptedAt: new Date("2026-08-01T00:00:00Z") },
      waitAnchorAt: null,
      lastConfirmedAt: null,
    });

    expectError(
      await h.call("animals.reveal", { animalId: animal.id }, { cookie }),
      "ANIMAL_NOT_AVAILABLE",
      404,
    );
    expectError(await h.call("animals.byId", { animalId: animal.id }), "NOT_FOUND", 404);
  });

  it("answers SHELTER_NOT_VISIBLE, at 404, once the shelter is no longer verified", async () => {
    const cookie = await bootstrap();
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      verification: {
        status: "pending",
        submittedAt: new Date("2026-08-01T00:00:00Z"),
        evidence: { items: [], submittedAt: new Date("2026-08-01T00:00:00Z") },
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
    await shelterRepo(h.db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(h.db).insert(animal, city.id);

    const res = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expectError(res, "SHELTER_NOT_VISIBLE", 404);
  });
});

// ---------------------------------------------------------------------------
// 7. Reveal rate limit
// ---------------------------------------------------------------------------

describe("reveal rate limit", () => {
  // The test harness's `h.call` defaults `now` to 2026-08-01T12:00:00Z when
  // no override is passed (see test-harness.ts) - these two constants are
  // relative to that default.
  /** Comfortably inside the 24h window. */
  const WITHIN_WINDOW = new Date("2026-08-01T11:00:00Z");
  /** Comfortably outside it (>24h before the harness's default `now`). */
  const OUTSIDE_WINDOW = new Date("2026-07-30T11:00:00Z");

  async function bootstrapAdopter(): Promise<{ cookie: string; adopterId: AdopterId }> {
    const cookie = await bootstrap();
    const bootstrapRes = await h.call("session.bootstrap", {}, { cookie });
    const adopterId = (
      (bootstrapRes.body as Record<string, unknown>).adopter as Record<string, unknown>
    ).id as AdopterId;
    return { cookie, adopterId };
  }

  /** Insert one shelter (in `cityId`) with one animal; does not reveal it. */
  async function insertShelterWithAnimal(cityId: (typeof city)["id"]) {
    const shelter = makeShelter({
      exactAddress: {
        line1: "вул. Тестова 1",
        line2: null,
        postalCode: "01001",
        cityId,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
    });
    await shelterRepo(h.db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(h.db).insert(animal, cityId);
    return { shelter, animal };
  }

  let city: ReturnType<typeof makeCity>;
  beforeEach(async () => {
    city = makeCity();
    await cityRepo(h.db).insert(city);
  });

  /**
   * Seed `count` distinct shelters, each with one animal already revealed by
   * `adopterId` at `revealedAt` - building blocks for the tests below.
   * Distinct shelters, not distinct animals at one shelter, because the
   * budget counts `COUNT(DISTINCT shelter_id)` (2026-09-10 correction -
   * contacts are scrapeable per shelter, not per animal).
   */
  async function seedDistinctRevealedShelters(
    adopterId: AdopterId,
    count: number,
    revealedAt: Date = WITHIN_WINDOW,
  ) {
    const reveals = revealRepo(h.db);
    const shelters = [];
    for (let i = 0; i < count; i++) {
      const { shelter, animal } = await insertShelterWithAnimal(city.id);
      await reveals.insert(
        makeReveal({ adopterId, animalId: animal.id, shelterId: shelter.id, revealedAt }),
      );
      shelters.push(shelter);
    }
    return shelters;
  }

  it("returns RATE_LIMITED after 30 distinct shelters revealed in 24h", async () => {
    const { cookie, adopterId } = await bootstrapAdopter();
    await seedDistinctRevealedShelters(adopterId, 30);

    // A 31st, genuinely new shelter should be rate-limited.
    const { animal: newAnimal } = await insertShelterWithAnimal(city.id);
    const res = await h.call("animals.reveal", { animalId: newAnimal.id }, { cookie });
    expectError(res, "RATE_LIMITED", 429);
  });

  it("does not rate-limit at 29 distinct shelters - the boundary is exactly 30, not 29", async () => {
    const { cookie, adopterId } = await bootstrapAdopter();
    await seedDistinctRevealedShelters(adopterId, 29);

    const { animal: thirtiethAnimal } = await insertShelterWithAnimal(city.id);
    const res = await h.call("animals.reveal", { animalId: thirtiethAnimal.id }, { cookie });
    expect(
      res.status,
      `the 30th distinct shelter must still succeed - the cap is exactly 30, got ${res.status}`,
    ).toBe(200);
  });

  it("does not charge the budget for a repeat reveal of an already-revealed shelter", async () => {
    const { cookie, adopterId } = await bootstrapAdopter();
    const shelters = await seedDistinctRevealedShelters(adopterId, 30);

    // A second, different animal at an already-revealed shelter costs
    // nothing - the device already has that shelter's contact details.
    const alreadyRevealedShelter = shelters[0]!;
    const secondAnimal = makeAnimal({ shelterId: alreadyRevealedShelter.id });
    await animalRepo(h.db).insert(secondAnimal, city.id);

    const res = await h.call("animals.reveal", { animalId: secondAnimal.id }, { cookie });
    expect(
      res.status,
      `re-revealing an already-counted shelter at the 30-shelter cap must be free, got ${res.status}`,
    ).toBe(200);
  });

  /**
   * The actual behaviour change, isolated from the free-re-reveal
   * short-circuit above (which never reaches the distinct-count query at
   * all): many reveal *rows* against a few shelters must not exhaust the
   * budget the way many reveal rows against many shelters does. 5 distinct
   * shelters, revealed 10 times each via 10 different animals apiece, is 50
   * reveal rows - well past a row-count cap of 30 - but only 5 distinct
   * shelters, so a 6th, genuinely new shelter must still succeed. Would not
   * be caught by the boundary test above: 30 shelters revealed once each has
   * row-count == distinct-count == 30, so a regression to plain `count()`
   * still passes that test.
   */
  it("counts distinct shelters, not reveal rows - many repeats of a few shelters stay well under budget", async () => {
    const { cookie, adopterId } = await bootstrapAdopter();
    const reveals = revealRepo(h.db);

    for (let s = 0; s < 5; s++) {
      const { shelter } = await insertShelterWithAnimal(city.id);
      for (let a = 0; a < 10; a++) {
        const animal = makeAnimal({ shelterId: shelter.id });
        await animalRepo(h.db).insert(animal, city.id);
        await reveals.insert(
          makeReveal({
            adopterId,
            animalId: animal.id,
            shelterId: shelter.id,
            revealedAt: WITHIN_WINDOW,
          }),
        );
      }
    }

    const { animal: newAnimal } = await insertShelterWithAnimal(city.id);
    const res = await h.call("animals.reveal", { animalId: newAnimal.id }, { cookie });
    expect(
      res.status,
      "50 reveal rows across only 5 shelters must not exhaust a 30-shelter budget",
    ).toBe(200);
  });

  it("does not count reveals from outside the 24h window toward the budget", async () => {
    const { cookie, adopterId } = await bootstrapAdopter();
    // 30 distinct shelters, all revealed >24h before the call's `now` - none
    // of these should count toward the current window's budget.
    await seedDistinctRevealedShelters(adopterId, 30, OUTSIDE_WINDOW);

    const { animal: newAnimal } = await insertShelterWithAnimal(city.id);
    const res = await h.call("animals.reveal", { animalId: newAnimal.id }, { cookie });
    expect(
      res.status,
      "30 shelters revealed >24h ago must not count toward the current window's budget",
    ).toBe(200);
  });

  it("does not grant a free re-reveal for a shelter last revealed outside the window", async () => {
    const { cookie, adopterId } = await bootstrapAdopter();
    // 29 shelters revealed *within* the window, plus one more this same
    // adopter revealed >24h ago (outside it) - the old one must not count
    // as "already revealed" for the free-re-reveal check below.
    await seedDistinctRevealedShelters(adopterId, 29);
    const [oldShelter] = await seedDistinctRevealedShelters(adopterId, 1, OUTSIDE_WINDOW);

    // A 30th *within-window* shelter brings the adopter to the cap.
    const { animal: thirtiethAnimal } = await insertShelterWithAnimal(city.id);
    const capRes = await h.call("animals.reveal", { animalId: thirtiethAnimal.id }, { cookie });
    expect(capRes.status, "setup: the 30th within-window shelter must succeed").toBe(200);

    // A second, different animal at oldShelter - its only reveal was outside
    // the window, so this must NOT be free, and the adopter is now at the
    // 30-shelter cap, so it must be rate-limited.
    const secondOldAnimal = makeAnimal({ shelterId: oldShelter!.id });
    await animalRepo(h.db).insert(secondOldAnimal, city.id);
    const res = await h.call("animals.reveal", { animalId: secondOldAnimal.id }, { cookie });
    expectError(res, "RATE_LIMITED", 429);
  });

  it("does not treat another adopter's revealed shelter as this adopter's free re-reveal", async () => {
    const adopterA = await bootstrapAdopter();
    const adopterB = await bootstrapAdopter();

    // Adopter B is already at the 30-shelter cap.
    await seedDistinctRevealedShelters(adopterB.adopterId, 30);

    // Only adopter A has revealed this shelter.
    const { shelter: sharedShelter, animal: animalForA } = await insertShelterWithAnimal(city.id);
    await revealRepo(h.db).insert(
      makeReveal({
        adopterId: adopterA.adopterId,
        animalId: animalForA.id,
        shelterId: sharedShelter.id,
        revealedAt: WITHIN_WINDOW,
      }),
    );

    // B reveals a different animal at that same shelter - B has never
    // revealed this shelter themself, so it must count against B's own
    // (already exhausted) budget, not ride free on A's history.
    const animalForB = makeAnimal({ shelterId: sharedShelter.id });
    await animalRepo(h.db).insert(animalForB, city.id);
    const res = await h.call(
      "animals.reveal",
      { animalId: animalForB.id },
      { cookie: adopterB.cookie },
    );
    expectError(res, "RATE_LIMITED", 429);
  });
});

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

describe("gallery.list", () => {
  const NOW = new Date("2026-08-01T12:00:00Z");
  const daysBefore = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

  /** Four animals whose edit order and publication order are different. */
  async function seedGalleryCorpus() {
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

    // Edited recently, published long ago - a shelter tending an old listing,
    // which is the case that makes `last_updated_at` the wrong wait column.
    const oldTimer = makeAnimal({
      shelterId: shelter.id,
      name: "Старожил",
      lastUpdatedAt: daysBefore(1),
      listing: {
        kind: "published",
        publishedAt: daysBefore(200),
        confirmedAt: daysBefore(1),
        undoable: null,
      },
    });
    const middling = makeAnimal({
      shelterId: shelter.id,
      name: "Середній",
      lastUpdatedAt: daysBefore(40),
      listing: {
        kind: "published",
        publishedAt: daysBefore(60),
        confirmedAt: daysBefore(40),
        undoable: null,
      },
    });
    const newcomer = makeAnimal({
      shelterId: shelter.id,
      name: "Новенький",
      lastUpdatedAt: daysBefore(2),
      listing: {
        kind: "published",
        publishedAt: daysBefore(3),
        confirmedAt: daysBefore(2),
        undoable: null,
      },
    });
    for (const animal of [oldTimer, middling, newcomer]) {
      await animalRepo(h.db).insert(animal, city.id);
    }
    return { city, shelter, oldTimer, middling, newcomer };
  }

  it("returns a page with totals and the same card view the deck uses", async () => {
    const { oldTimer } = await seedGalleryCorpus();

    const res = await h.call("gallery.list", { filters: NO_FILTERS }, { now: NOW });
    expect(res.status).toBe(200);
    const body = res.body as {
      items: Array<Record<string, unknown>>;
      totalMatching: number;
      totalShelters: number;
      totalPages: number;
      page: number;
    };

    expect(body.totalMatching).toBe(3);
    expect(body.totalShelters).toBe(1);
    expect(body.totalPages).toBe(1);
    expect(body.page).toBe(1);
    expect(body.items).toHaveLength(3);

    const card = body.items.find((item) => item.id === oldTimer.id);
    expect(card).toBeDefined();
    expect(card).toHaveProperty("ageBucket");
    expect(card).toHaveProperty("freshness");
    // `implement(contract)` strips anything the view does not declare; these
    // are the fields that would be a leak, not merely noise.
    expect(card).not.toHaveProperty("listing");
    expect(card?.shelter).not.toHaveProperty("exactAddress");
    expect(card?.shelter).not.toHaveProperty("contact");
  });

  it("returns the sorted order the query produced, not a re-ranked one", async () => {
    // A gallery handler that re-ranked its page with `scoreAnimal`, whose dominant
    // term is freshness, would return
    // longest-waiting in something close to freshest order. Старожил is first
    // by wait and first by freshness; Новенький and Середній are the pair that
    // separate the two orderings.
    const { oldTimer, middling, newcomer } = await seedGalleryCorpus();

    const waiting = await h.call(
      "gallery.list",
      { filters: NO_FILTERS, sort: "longest_waiting" },
      { now: NOW },
    );
    const freshest = await h.call(
      "gallery.list",
      { filters: NO_FILTERS, sort: "freshest" },
      { now: NOW },
    );

    const names = (res: { body: unknown }) =>
      (res.body as { items: Array<{ name: string }> }).items.map((item) => item.name);

    expect(names(waiting)).toEqual([oldTimer.name, middling.name, newcomer.name]);
    expect(names(freshest)).toEqual([oldTimer.name, newcomer.name, middling.name]);
    // If either had been re-scored, both would have come back in the same
    // freshness-driven order.
    expect(names(waiting)).not.toEqual(names(freshest));
  });

  it("is reproducible as the clock advances", async () => {
    // The property Phase E's definition of done rests on - "shares a URL that
    // reproduces exactly what they saw". Score is a function of freshness
    // decay, so a re-ranked page would drift between these two calls.
    await seedGalleryCorpus();

    const early = await h.call(
      "gallery.list",
      { filters: NO_FILTERS, sort: "longest_waiting" },
      { now: NOW },
    );
    const later = await h.call(
      "gallery.list",
      { filters: NO_FILTERS, sort: "longest_waiting" },
      { now: new Date(NOW.getTime() + 45 * 86_400_000) },
    );

    const ids = (res: { body: unknown }) =>
      (res.body as { items: Array<{ id: string }> }).items.map((item) => item.id);
    expect(ids(later)).toEqual(ids(early));
  });

  it("serves the last real page for a page number that has gone stale", async () => {
    await seedGalleryCorpus();

    const res = await h.call(
      "gallery.list",
      { filters: NO_FILTERS, page: 9, pageSize: 2 },
      { now: NOW },
    );

    expect(res.status).toBe(200);
    const body = res.body as {
      items: unknown[];
      totalMatching: number;
      totalPages: number;
      page: number;
    };
    // A 200 carrying the last valid page, not a 404 and not a bounce to 1 -
    // the link is stale, not broken.
    expect(body.totalMatching).toBe(3);
    expect(body.totalPages).toBe(2);
    expect(body.page).toBe(2);
    expect(body.items).toHaveLength(1);
  });

  it("rejects a page number beyond any that could exist", async () => {
    const res = await h.call("gallery.list", { filters: NO_FILTERS, page: 10_000 }, { now: NOW });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  describe("scoped to one shelter (the shelter page, DR1-D4)", () => {
    async function seedTwoShelters() {
      const corpus = await seedGalleryCorpus();
      const other = makeShelter({
        displayName: "Інший притулок",
        exactAddress: {
          line1: "вул. Тестова 2",
          line2: null,
          postalCode: "01001",
          cityId: corpus.city.id,
          district: null,
          coordinates: { lat: 50.45, lng: 30.52 },
        },
      });
      await shelterRepo(h.db).insert(other);
      const elsewhere = makeAnimal({ shelterId: other.id, name: "Чужий" });
      await animalRepo(h.db).insert(elsewhere, corpus.city.id);
      return { ...corpus, other, elsewhere };
    }

    const body = (res: { body: unknown }) =>
      res.body as { items: Array<{ name: string }>; totalMatching: number; totalShelters: number };

    it("serves only that shelter's animals; no scope still serves everyone", async () => {
      const { shelter, oldTimer, middling, newcomer } = await seedTwoShelters();

      const scoped = await h.call(
        "gallery.list",
        { filters: NO_FILTERS, scope: { kind: "shelter", shelterId: shelter.id } },
        { now: NOW },
      );
      const everyone = await h.call("gallery.list", { filters: NO_FILTERS }, { now: NOW });

      expect(scoped.status).toBe(200);
      expect(body(scoped).items.map((item) => item.name)).toEqual([
        oldTimer.name,
        newcomer.name,
        middling.name,
      ]);
      expect(body(scoped).totalShelters).toBe(1);
      expect(everyone.status).toBe(200);
      expect(body(everyone).totalMatching).toBe(4);
      expect(body(everyone).totalShelters).toBe(2);
    });

    it("answers an unknown shelter with an empty page, not an error", async () => {
      await seedTwoShelters();

      const res = await h.call(
        "gallery.list",
        {
          filters: NO_FILTERS,
          scope: { kind: "shelter", shelterId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
        },
        { now: NOW },
      );

      expect(res.status).toBe(200);
      expect(body(res).items).toEqual([]);
      expect(body(res).totalMatching).toBe(0);
    });

    it("refuses a shelter id that isn't a UUID", async () => {
      const res = await h.call(
        "gallery.list",
        { filters: NO_FILTERS, scope: { kind: "shelter", shelterId: "42" } },
        { now: NOW },
      );

      expect(res.status).toBe(400);
    });
  });
});

/**
 * Age as a declared range (owner, 2026-11-12): the span is aged on the server's clock, like the
 * bucket, so a device with a wrong date can't make an animal younger. The older kinds send null
 * and keep their bucket word.
 */
describe("a declared range on the public views", () => {
  const NOW = new Date("2026-08-01T12:00:00Z");
  const TWO_YEARS_ON = new Date(NOW.getTime() + 2 * 365.2425 * 86_400_000);
  const declaredAt = new Date("2026-07-01T00:00:00Z");

  async function seedThreeKinds() {
    const {
      city,
      shelter,
      animal: ranged,
    } = await seedFeedAnimal({
      name: "Діапазон",
      age: { kind: "declared_range", range: "1_2", declaredAt },
    });
    const bucketed = makeAnimal({
      shelterId: shelter.id,
      name: "Кошик",
      age: { kind: "declared_bucket", bucket: "young", declaredAt },
    });
    const born = makeAnimal({
      shelterId: shelter.id,
      name: "Народжений",
      age: { kind: "birth_date", date: new Date("2025-01-01T00:00:00Z"), precision: "day" },
    });
    await animalRepo(h.db).insert(bucketed, city.id);
    await animalRepo(h.db).insert(born, city.id);
    return { ranged };
  }

  const ageOf = async (now: Date) => {
    const res = await h.call("gallery.list", { filters: NO_FILTERS }, { now });
    const items = (res.body as { items: { name: string; ageBucket: string; ageSpan: unknown }[] })
      .items;
    return Object.fromEntries(items.map((item) => [item.name, [item.ageBucket, item.ageSpan]]));
  };

  it("the gallery sends a range's span as of the request's now; the older kinds send null", async () => {
    await seedThreeKinds();
    expect(await ageOf(NOW)).toEqual({
      Діапазон: ["young", { kind: "between", from: 1, to: 2 }],
      Кошик: ["young", null],
      Народжений: ["young", null],
    });
    expect((await ageOf(TWO_YEARS_ON)).Діапазон).toEqual([
      "adult",
      { kind: "between", from: 3, to: 4 },
    ]);
  });

  it("the animal page and the saved cards send the same span", async () => {
    const { ranged } = await seedThreeKinds();
    const page = await h.call("animals.byId", { animalId: ranged.id }, { now: TWO_YEARS_ON });
    expect((page.body as { ageSpan: unknown }).ageSpan).toEqual({
      kind: "between",
      from: 3,
      to: 4,
    });
    const cards = await h.call("animals.cardsByIds", { animalIds: [ranged.id] }, { now: NOW });
    expect(
      (cards.body as { items: { card?: { ageSpan: unknown } }[] }).items[0]?.card?.ageSpan,
    ).toEqual({ kind: "between", from: 1, to: 2 });
  });
});

describe("gallery.relaxationCounts", () => {
  it("reports the gain from dropping each applied filter, and nothing for the rest", async () => {
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

    const smallCat = makeAnimal({ shelterId: shelter.id, species: "cat" as const, size: "small" });
    const largeCat = makeAnimal({ shelterId: shelter.id, species: "cat" as const, size: "large" });
    const smallDog = makeAnimal({ shelterId: shelter.id, species: "dog" as const, size: "small" });
    for (const animal of [smallCat, largeCat, smallDog]) {
      await animalRepo(h.db).insert(animal, city.id);
    }

    const res = await h.call("gallery.relaxationCounts", {
      filters: {
        ...NO_FILTERS,
        species: { kind: "oneOf", values: ["cat"] },
        sizes: { kind: "oneOf", values: ["small"] },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      current: number;
      relaxations: Array<{ dimension: string; additional: number }>;
    };

    expect(body.current).toBe(1);
    // Only the two constrained dimensions; no "+0" row for cities or ages.
    expect(body.relaxations.map((r) => r.dimension).sort()).toEqual(["sizes", "species"]);
    expect(body.relaxations.find((r) => r.dimension === "sizes")?.additional).toBe(1);
    expect(body.relaxations.find((r) => r.dimension === "species")?.additional).toBe(1);
  });
});

/**
 * K4-B4 (Oleksii, verbatim: "Reveal views and «Мої запити» show the shelter's
 * CURRENT contacts; the snapshot stays stored as the record. Then show
 * actions.liveOnSave.contacts as written. If the shelter is no longer visible
 * (paused/suspended/removed), keep today's behaviour for those views and tell
 * me what it is."), and K4-B5 (verbatim: "rename shelterSnapshot.contact.
 * While the shelter is visible it holds CURRENT contacts, and "snapshot" will
 * mislead whoever reads it next. The API has no outside consumers, so rename
 * it now (e.g. shelterContact, with the stored first-reveal snapshot clearly
 * named as the record).").
 */
describe("reveal views carry the shelter's current contacts, labelled (K4-B4, K4-B5)", () => {
  const NEW_CONTACT = {
    primary: { kind: "telegram" as const, handle: "new_number_shelter" },
    additional: [],
  };
  const ADMIN = "33333333-3333-4333-8333-333333333333";

  async function changeContact(shelter: Awaited<ReturnType<typeof seedFeedAnimal>>["shelter"]) {
    const result = await kabinetShelterRepo(h.db).applyAudited({
      shelterId: shelter.id,
      expectedVersion: shelter.version,
      change: { kind: "contact", contact: NEW_CONTACT },
      entry: {
        kind: "contact_changed",
        at: new Date(),
        actor: { kind: "shelter_admin", shelterAdminId: ADMIN as never },
        previous: shelter.contact,
        next: NEW_CONTACT,
      },
      historyId: crypto.randomUUID(),
      now: new Date(),
    });
    expect(result.kind).toBe("ok");
  }

  async function pause(shelterId: string, version: number) {
    const at = new Date();
    const stored = await shelterRepo(h.db).findById(shelterId as never);
    if (stored === null) throw new Error("no shelter");
    const event = {
      type: "pause" as const,
      at,
      actor: { kind: "shelter_admin" as const, shelterAdminId: ADMIN as never },
      reason: { code: "relocation" as const, note: null },
    };
    const moved = transition(stored.verification, event);
    if (moved.kind !== "ok") throw new Error(moved.kind);
    const result = await kabinetShelterRepo(h.db).applyAudited({
      shelterId: shelterId as never,
      expectedVersion: version,
      change: { kind: "verification", verification: moved.next },
      entry: { kind: "verification", event, from: "verified", to: "paused" },
      historyId: crypto.randomUUID(),
      now: at,
    });
    expect(result.kind).toBe("ok");
  }

  const shelterContactOf = (body: unknown) => (body as Record<string, unknown>).shelterContact;

  it("after a contact edit, a repeat reveal and «Мої запити» show the new contact as current; the stored first-reveal record doesn't change", async () => {
    const cookie = await bootstrap();
    const { animal, shelter } = await seedFeedAnimal();
    const first = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(first.status).toBe(200);
    expect(shelterContactOf(first.body)).toEqual({
      source: "current",
      displayName: shelter.displayName,
      contact: shelter.contact,
    });
    const revealId = (first.body as { id: string }).id;

    await changeContact(shelter);

    const again = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect((again.body as { id: string }).id).toBe(revealId);
    expect(shelterContactOf(again.body)).toEqual({
      source: "current",
      displayName: shelter.displayName,
      contact: NEW_CONTACT,
    });

    const list = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
    expect(list.status).toBe(200);
    const items = (list.body as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    expect(shelterContactOf(items[0])).toEqual({
      source: "current",
      displayName: shelter.displayName,
      contact: NEW_CONTACT,
    });

    const stored = await revealRepo(h.db).findById(revealId as never);
    expect(stored?.shelterSnapshot.contact).toEqual(shelter.contact);
  });

  it("a shelter no longer visible: the reveal is refused, «Мої запити» keeps the first-reveal record's contact, labelled so (today's behaviour)", async () => {
    const cookie = await bootstrap();
    const { animal, shelter } = await seedFeedAnimal();
    expect((await h.call("animals.reveal", { animalId: animal.id }, { cookie })).status).toBe(200);
    await changeContact(shelter);
    await pause(shelter.id, shelter.version + 1);

    // Refused before the stored reveal is even looked up.
    const again = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expectError(again, "SHELTER_PAUSED", 409);

    const list = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
    const items = (list.body as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    expect(shelterContactOf(items[0])).toEqual({
      source: "first_reveal",
      displayName: shelter.displayName,
      contact: shelter.contact,
    });
  });

  it("both views keep exactly their fields: no exact address, nothing new", async () => {
    const cookie = await bootstrap();
    const { animal } = await seedFeedAnimal();
    const reveal = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    const list = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
    for (const body of [reveal.body, (list.body as { items: unknown[] }).items[0]]) {
      const view = body as Record<string, unknown>;
      expect(Object.keys(view).sort()).toEqual([
        "animalId",
        "animalSnapshot",
        "id",
        "revealedAt",
        "shelterAtFirstReveal",
        "shelterContact",
        "shelterListing",
      ]);
      expect(Object.keys(view.shelterContact as object).sort()).toEqual([
        "contact",
        "displayName",
        "source",
      ]);
      expect(Object.keys(view.shelterAtFirstReveal as object).sort()).toEqual([
        "publicLocation",
        "shelterId",
        "verificationStatusAtReveal",
      ]);
    }
  });
});
/**
 * RUI4-F1: the shelter's name in a reveal view follows its contacts' rule
 * (K4-B4), in the same branch: the current name beside the current channels
 * while the shelter is visible, the first reveal's name beside the first
 * reveal's channels when it is not. Before, a repeat reveal after an operator
 * rename (R-UI 4, `display_name_changed`) named the shelter by the first
 * reveal's name over its current channels.
 */
describe("reveal views name the shelter from the same moment as its contacts (RUI4-F1)", () => {
  const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
  const ADMIN = "33333333-3333-4333-8333-333333333333";
  const OLD_NAME = "Притулок «Лапа»";
  const NEW_NAME = "Притулок «Лапа допомоги»";
  const NEW_CONTACT = {
    primary: { kind: "telegram" as const, handle: "lapa_new" },
    additional: [],
  };

  const shelterContactOf = (body: unknown) => (body as Record<string, unknown>).shelterContact;

  /** A verified shelter named OLD_NAME, with a published animal. */
  async function seedNamed() {
    const seeded = await seedFeedAnimal();
    await rename(seeded.shelter.id, 0, seeded.shelter.displayName, OLD_NAME);
    return { ...seeded, shelter: { ...seeded.shelter, displayName: OLD_NAME, version: 1 } };
  }

  /** The operator's rename, as `registry.shelters.updateProfile` writes it (R-UI 4). */
  async function rename(shelterId: string, expectedVersion: number, from: string, to: string) {
    const result = await kabinetShelterRepo(h.db).applyAudited({
      shelterId: shelterId as never,
      expectedVersion,
      change: { kind: "display_name", displayName: to },
      entry: {
        kind: "display_name_changed",
        at: new Date(),
        moderatorId: OPERATOR as never,
        from,
        to,
      },
      historyId: crypto.randomUUID(),
      now: new Date(),
    });
    expect(result.kind).toBe("ok");
  }

  async function changeContact(shelterId: string, expectedVersion: number, previous: unknown) {
    const result = await kabinetShelterRepo(h.db).applyAudited({
      shelterId: shelterId as never,
      expectedVersion,
      change: { kind: "contact", contact: NEW_CONTACT },
      entry: {
        kind: "contact_changed",
        at: new Date(),
        actor: { kind: "shelter_admin", shelterAdminId: ADMIN as never },
        previous: previous as never,
        next: NEW_CONTACT,
      },
      historyId: crypto.randomUUID(),
      now: new Date(),
    });
    expect(result.kind).toBe("ok");
  }

  /** Moves a verified shelter out of the feed: paused by its admin, or suspended by the operator. */
  async function hide(shelterId: string, expectedVersion: number, to: "paused" | "suspended") {
    const at = new Date();
    const stored = await shelterRepo(h.db).findById(shelterId as never);
    if (stored === null) throw new Error("no shelter");
    const event =
      to === "paused"
        ? {
            type: "pause" as const,
            at,
            actor: { kind: "shelter_admin" as const, shelterAdminId: ADMIN as never },
            reason: { code: "relocation" as const, note: null },
          }
        : {
            type: "suspend" as const,
            at,
            moderatorId: OPERATOR as never,
            reason: { code: "unresponsive" as const, note: null },
          };
    const moved = transition(stored.verification, event);
    if (moved.kind !== "ok") throw new Error(moved.kind);
    expect(moved.next.status).toBe(to);
    const result = await kabinetShelterRepo(h.db).applyAudited({
      shelterId: shelterId as never,
      expectedVersion,
      change: { kind: "verification", verification: moved.next },
      entry: { kind: "verification", event, from: "verified", to },
      historyId: crypto.randomUUID(),
      now: at,
    });
    expect(result.kind).toBe("ok");
  }

  it("a first reveal names the shelter as it is, and stores that name in the record", async () => {
    const cookie = await bootstrap();
    const { animal, shelter } = await seedNamed();

    const first = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(first.status).toBe(200);
    expect(shelterContactOf(first.body)).toEqual({
      source: "current",
      displayName: OLD_NAME,
      contact: shelter.contact,
    });
    const stored = await revealRepo(h.db).findById((first.body as { id: string }).id as never);
    expect(stored?.shelterSnapshot.displayName).toBe(OLD_NAME);
    expect(stored?.shelterSnapshot.contact).toEqual(shelter.contact);
  });

  it("after a rename, a repeat reveal and «Мої запити» show the new name with the current contacts; the record keeps the first name", async () => {
    const cookie = await bootstrap();
    const { animal, shelter } = await seedNamed();
    const first = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    const revealId = (first.body as { id: string }).id;

    await rename(shelter.id, shelter.version, OLD_NAME, NEW_NAME);

    const again = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    expect(again.status).toBe(200);
    expect((again.body as { id: string }).id).toBe(revealId);
    expect(shelterContactOf(again.body)).toEqual({
      source: "current",
      displayName: NEW_NAME,
      contact: shelter.contact,
    });
    // The old name reaches the view nowhere, the first-reveal object included.
    expect(JSON.stringify(again.body)).not.toContain(OLD_NAME);

    const list = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
    expect(list.status).toBe(200);
    const items = (list.body as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    expect(shelterContactOf(items[0])).toEqual({
      source: "current",
      displayName: NEW_NAME,
      contact: shelter.contact,
    });
    expect(JSON.stringify(items[0])).not.toContain(OLD_NAME);

    const stored = await revealRepo(h.db).findById(revealId as never);
    expect(stored?.shelterSnapshot.displayName).toBe(OLD_NAME);
  });

  it("renamed and with new contacts: the new name comes with the new contacts, never one without the other", async () => {
    const cookie = await bootstrap();
    const { animal, shelter } = await seedNamed();
    expect((await h.call("animals.reveal", { animalId: animal.id }, { cookie })).status).toBe(200);

    await rename(shelter.id, shelter.version, OLD_NAME, NEW_NAME);
    await changeContact(shelter.id, shelter.version + 1, shelter.contact);

    const again = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
    const list = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
    for (const view of [again.body, (list.body as { items: unknown[] }).items[0]]) {
      expect(shelterContactOf(view)).toEqual({
        source: "current",
        displayName: NEW_NAME,
        contact: NEW_CONTACT,
      });
    }
  });

  it.each(["paused", "suspended"] as const)(
    "renamed, then %s: the reveal is refused, and «Мої запити» keeps the first reveal's name with the first reveal's contacts (K4-B4's rule)",
    async (to) => {
      const cookie = await bootstrap();
      const { animal, shelter } = await seedNamed();
      expect((await h.call("animals.reveal", { animalId: animal.id }, { cookie })).status).toBe(
        200,
      );
      await rename(shelter.id, shelter.version, OLD_NAME, NEW_NAME);
      await changeContact(shelter.id, shelter.version + 1, shelter.contact);
      await hide(shelter.id, shelter.version + 2, to);

      const again = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
      // A pause is explained (the page shows it); a suspension stays an unexplained refusal.
      if (to === "paused") expectError(again, "SHELTER_PAUSED", 409);
      else expectError(again, "SHELTER_NOT_VISIBLE", 404);

      const list = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
      const items = (list.body as { items: unknown[] }).items;
      expect(items).toHaveLength(1);
      expect(shelterContactOf(items[0])).toEqual({
        source: "first_reveal",
        displayName: OLD_NAME,
        contact: shelter.contact,
      });
      expect(JSON.stringify(items[0])).not.toContain(NEW_NAME);
    },
  );
});
