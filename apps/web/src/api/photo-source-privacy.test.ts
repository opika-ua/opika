import { animalRepo, cityRepo, photoSourcesRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * Crop frame, owner's condition 1: no public response carries a kept source's key. Each public
 * procedure with an animal or photo, wire text searched (the schemas: `photo-storage-key-scan`).
 */
let h: TestHarness;
beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => h.cleanup());
beforeEach(async () => h.truncate());

const AT = new Date("2026-08-01T09:00:00Z");

async function animalWithKeptSources() {
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
  const draft = makeAnimal({ shelterId: shelter.id });
  const keys = [crypto.randomUUID(), crypto.randomUUID()].map((id) => `animals/${draft.id}/${id}`);
  const animal = {
    ...draft,
    photos: keys.map((storageKey) => ({ storageKey, width: 1600, height: 2000, alt: null })),
  };
  await animalRepo(h.db).insert(animal, city.id);
  const sources = keys.map((storageKey, i) => ({
    storageKey,
    sourceObjectKey: `${storageKey}/source-${crypto.randomUUID()}.webp`,
    origin: "upload" as const,
    width: 1600,
    height: 2000,
    framing:
      i === 0
        ? ({ kind: "frame", frame: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } } as const)
        : ({ kind: "attention" } as const),
  }));
  expect(await photoSourcesRepo(h.db).insertForAnimal(animal.id, sources, AT)).toBe(2);
  return { shelter, animal, sourceKeys: sources.map((source) => source.sourceObjectKey) };
}

describe("a photo's source key reaches no public response (crop frame, condition 1)", () => {
  it("animals.byId, gallery.list, cardsByIds, neighbours, shelters.byId, reveal and listMine", async () => {
    const { shelter, animal, sourceKeys } = await animalWithKeptSources();
    const bootstrap = await h.call("session.bootstrap", {});
    const cookie = h.extractSessionCookie(bootstrap.headers);
    if (cookie === null) throw new Error("bootstrap set no session cookie");

    const responses = {
      "animals.byId": await h.call("animals.byId", { animalId: animal.id }),
      "gallery.list": await h.call("gallery.list", {
        filters: NO_FILTERS,
        sort: "freshest",
        page: 1,
        pageSize: 24,
        scope: { kind: "everyone" },
      }),
      "animals.cardsByIds": await h.call("animals.cardsByIds", { animalIds: [animal.id] }),
      "animals.neighbours": await h.call("animals.neighbours", {
        animalId: animal.id,
        filters: NO_FILTERS,
      }),
      "shelters.byId": await h.call("shelters.byId", { shelterId: shelter.id }),
      "animals.reveal": await h.call("animals.reveal", { animalId: animal.id }, { cookie }),
      "reveals.listMine": await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie }),
    };

    for (const [path, response] of Object.entries(responses)) {
      expect(response.status, path).toBe(200);
      for (const key of sourceKeys) expect(response.raw, path).not.toContain(key);
      expect(response.raw, path).not.toMatch(/source-[0-9a-f]{8}-/);
    }
    // The photos themselves do reach the public: the check above would pass on an empty answer.
    expect(responses["animals.byId"].raw).toContain(animal.photos[0]?.storageKey);
    expect(responses["gallery.list"].raw).toContain(animal.photos[0]?.storageKey);
    expect(responses["animals.reveal"].raw).toContain(animal.photos[0]?.storageKey);
  });
});
