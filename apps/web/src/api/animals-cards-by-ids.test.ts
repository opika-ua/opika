import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { type AnimalFixtureOverrides, makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

  const animal = makeAnimal({ shelterId: shelter.id, ...animalOverrides });
  await animalRepo(h.db).insert(animal, city.id);
  return { city, shelter, animal };
}

/**
 * DR1-Q2 (S8): the saved page's batch read. Its own file, not folded into
 * `api.test.ts` — the "nothing logged about which ids were asked for"
 * requirement needs a `console` spy active for the whole describe block,
 * which would otherwise mask a real `console.error` from an unrelated test
 * elsewhere in that much larger file.
 */
describe("animals.cardsByIds", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns an empty list for an empty request", async () => {
    const res = await h.call("animals.cardsByIds", { animalIds: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("returns an available card for a published, verified animal", async () => {
    const { animal } = await seedFeedAnimal();
    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    expect(res.status).toBe(200);
    const body = res.body as { items: { kind: string; animalId: string; card?: unknown }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.kind).toBe("available");
    expect(body.items[0]?.animalId).toBe(animal.id);
    expect(body.items[0]?.card).toHaveProperty("id", animal.id);
  });

  it("returns unavailable for an adopted animal — no reason, but its name", async () => {
    const { animal } = await seedFeedAnimal({
      listing: { kind: "adopted", adoptedAt: new Date("2026-08-01T00:00:00Z") },
    });
    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const body = res.body as { items: Record<string, unknown>[] };
    expect(body.items).toEqual([{ kind: "unavailable", animalId: animal.id, name: animal.name }]);
  });

  it("returns unavailable for a withdrawn animal", async () => {
    const { animal } = await seedFeedAnimal({
      listing: {
        kind: "withdrawn",
        reason: { code: "adopted_elsewhere", note: null },
        withdrawnAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const body = res.body as { items: Record<string, unknown>[] };
    expect(body.items).toEqual([{ kind: "unavailable", animalId: animal.id, name: animal.name }]);
  });

  it("returns unavailable with the name once a verified shelter is suspended — it was once public", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      verification: {
        status: "suspended",
        suspendedAt: new Date("2026-08-01T00:00:00Z"),
        suspendedBy: "00000000-0000-4000-8000-000000000099" as never,
        reason: { code: "unresponsive", note: null },
        priorState: {
          status: "verified",
          verifiedAt: new Date("2026-07-01T00:00:00Z"),
          verifiedBy: "00000000-0000-4000-8000-000000000099" as never,
        },
        evidence: { items: [], submittedAt: new Date("2026-06-01T00:00:00Z") },
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

    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const body = res.body as { items: Record<string, unknown>[] };
    expect(body.items).toEqual([{ kind: "unavailable", animalId: animal.id, name: animal.name }]);
  });

  it("returns unavailable with no name for an id that was never real", async () => {
    const res = await h.call("animals.cardsByIds", {
      animalIds: ["00000000-0000-4000-8000-000000000000"],
    });
    const body = res.body as { items: Record<string, unknown>[] };
    expect(body.items).toEqual([
      { kind: "unavailable", animalId: "00000000-0000-4000-8000-000000000000", name: null },
    ]);
  });

  /**
   * Review of 529a6cc, finding 4: the earlier version returned a draft's real
   * name to any caller, even though a draft — never published — was never
   * shown to anyone. A draft has no `publicLocation`/listing to leak, but its
   * name alone is enough to let a probe confirm a shelter's unpublished animal
   * exists before it ever goes live.
   */
  it("returns unavailable with no name for a draft — never public, regardless of the shelter", async () => {
    const { animal } = await seedFeedAnimal({ listing: { kind: "draft" } });
    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const body = res.body as { items: Record<string, unknown>[] };
    expect(body.items).toEqual([{ kind: "unavailable", animalId: animal.id, name: null }]);
  });

  it("returns unavailable with no name for a listed animal whose shelter was never verified", async () => {
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
    // A real, reachable state, not a fixture-only one (review of 3fce3b7,
    // finding 2): a pending shelter's admins can publish a card from day
    // one, before the shelter has ever been verified.
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(h.db).insert(animal, city.id);

    const res = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const body = res.body as { items: Record<string, unknown>[] };
    expect(body.items).toEqual([{ kind: "unavailable", animalId: animal.id, name: null }]);
  });

  it("answers one entry per requested id, in the order asked, mixing available and unavailable", async () => {
    const { animal: a1 } = await seedFeedAnimal();
    const { animal: a2 } = await seedFeedAnimal({
      listing: { kind: "adopted", adoptedAt: new Date("2026-08-01T00:00:00Z") },
    });
    const { animal: a3 } = await seedFeedAnimal();

    const res = await h.call("animals.cardsByIds", { animalIds: [a2.id, a1.id, a3.id] });
    const body = res.body as { items: { kind: string; animalId: string }[] };
    expect(body.items.map((item) => [item.animalId, item.kind])).toEqual([
      [a2.id, "unavailable"],
      [a1.id, "available"],
      [a3.id, "available"],
    ]);
  });

  it("refuses more than 200 ids — a validation error, not a query", async () => {
    const tooMany = Array.from(
      { length: 201 },
      (_, i) => `00000000-0000-4000-8000-${i.toString().padStart(12, "0")}`,
    );
    const res = await h.call("animals.cardsByIds", { animalIds: tooMany });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("gives the identical answer with and without a session cookie — the saved list is never tied to one", async () => {
    const { animal } = await seedFeedAnimal();
    const withoutCookie = await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    const res = await h.call("session.bootstrap", {});
    const cookie = h.extractSessionCookie(res.headers);
    expect(cookie).toBeTruthy();
    const withCookie = await h.call(
      "animals.cardsByIds",
      { animalIds: [animal.id] },
      { cookie: cookie as string },
    );
    expect(withoutCookie.body).toEqual(withCookie.body);
  });

  it("never logs anything — his spec, verbatim: nothing stored or logged about which ids were asked for", async () => {
    const { animal } = await seedFeedAnimal();
    await h.call("animals.cardsByIds", { animalIds: [animal.id] });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
