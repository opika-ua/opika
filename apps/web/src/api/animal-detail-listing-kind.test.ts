import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeDraftAnimal, makeShelter } from "@opika/db/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => h.cleanup());
beforeEach(async () => h.truncate());

async function seed(animals: ReturnType<typeof makeAnimal>[]) {
  const city = makeCity();
  await cityRepo(h.db).insert(city);
  const base = makeShelter();
  const shelter = makeShelter({ exactAddress: { ...base.exactAddress, cityId: city.id } });
  await shelterRepo(h.db).insert(shelter);
  for (const animal of animals) {
    await animalRepo(h.db).insert({ ...animal, shelterId: shelter.id }, city.id);
  }
  return { shelter, city };
}

const AT = new Date("2026-10-01T00:00:00.000Z").toISOString();

describe("animals.byId carries the listing kind and nothing else of the listing", () => {
  it("a published animal answers published, a reserved one reserved", async () => {
    const published = makeAnimal({ name: "Вільна" });
    const reserved = makeAnimal({
      name: "Домовляються",
      listing: {
        kind: "reserved",
        since: AT,
        publishedAt: AT,
        confirmedAt: AT,
        undoable: null,
      } as never,
    });
    await seed([published, reserved]);

    const a = await h.call("animals.byId", { animalId: published.id });
    const b = await h.call("animals.byId", { animalId: reserved.id });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect((a.body as { listingKind: string }).listingKind).toBe("published");
    expect((b.body as { listingKind: string }).listingKind).toBe("reserved");
  });

  it("never serialises the reservation's timestamps or the listing object", async () => {
    const reserved = makeAnimal({
      listing: {
        kind: "reserved",
        since: "2026-09-17T08:30:00.000Z",
        publishedAt: "2026-08-03T07:45:00.000Z",
        confirmedAt: AT,
        undoable: null,
      } as never,
    });
    await seed([reserved]);
    const res = await h.call("animals.byId", { animalId: reserved.id });
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("2026-09-17");
    expect(json).not.toContain("2026-08-03");
    expect(res.body).not.toHaveProperty("listing");
  });

  it("a draft is still NOT_FOUND (a non-public kind is unreachable here)", async () => {
    const draft = makeDraftAnimal({ name: "Чернетка" });
    await seed([draft as never]);
    expect((await h.call("animals.byId", { animalId: draft.id })).status).toBe(404);
  });
});
