import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeDraftAnimal, makeShelter } from "@opika/db/test";
import { NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * F-B2's footer sentence, Oleksii's, verbatim: «Ті, хто шукає тварину, цю
 * чернетку не бачать.» It is true only if a draft, including one with nothing
 * but a name and a species (K-Q5), is refused by every adopter-facing
 * surface. Each is checked here through the served router, against a
 * published animal of the same shelter that each surface does show, so a
 * pass can't come from an empty or failed response.
 */

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => h.cleanup());
beforeEach(async () => h.truncate());

async function seed() {
  const city = makeCity();
  await cityRepo(h.db).insert(city);
  const base = makeShelter();
  const shelter = makeShelter({ exactAddress: { ...base.exactAddress, cityId: city.id } });
  await shelterRepo(h.db).insert(shelter);
  const visible = makeAnimal({ shelterId: shelter.id, name: "Видима" });
  // A photo, so the draft lacks only facts: nothing about it but its listing hides it.
  const draft = makeDraftAnimal({
    shelterId: shelter.id,
    name: "Чернетка",
    photos: [{ storageKey: "animals/d/1", width: 800, height: 1000, alt: null }],
  });
  await animalRepo(h.db).insert(visible, city.id);
  await animalRepo(h.db).insert(draft, city.id);
  return { visible, draft };
}

async function adopterCookie(): Promise<string> {
  const res = await h.call("session.bootstrap", {});
  const cookie = h.extractSessionCookie(res.headers);
  if (!cookie) throw new Error("no session cookie");
  return cookie;
}

const codeOf = (body: unknown) => (body as { code?: string }).code;
const idsOf = (body: unknown) => (body as { items: { id: string }[] }).items.map((item) => item.id);

describe("a name-and-species draft is on no adopter-facing surface (F-B2)", () => {
  it("feed.list shows the published animal and not the draft", async () => {
    const { visible, draft } = await seed();
    const res = await h.call("feed.list", { filters: NO_FILTERS, cursor: null, limit: 20 });
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(visible.id);
    expect(idsOf(res.body)).not.toContain(draft.id);
  });

  it("gallery.list shows the published animal and not the draft", async () => {
    const { visible, draft } = await seed();
    const res = await h.call("gallery.list", { filters: NO_FILTERS });
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(visible.id);
    expect(idsOf(res.body)).not.toContain(draft.id);
  });

  it("animals.byId answers the published animal and NOT_FOUND for the draft", async () => {
    const { visible, draft } = await seed();
    expect((await h.call("animals.byId", { animalId: visible.id })).status).toBe(200);
    const res = await h.call("animals.byId", { animalId: draft.id });
    expect(res.status).toBe(404);
    expect(codeOf(res.body)).toBe("NOT_FOUND");
    expect(JSON.stringify(res.body)).not.toContain("Чернетка");
  });

  it("swipes.record refuses the draft (NOT_FOUND) and records the published animal", async () => {
    const { visible, draft } = await seed();
    const cookie = await adopterCookie();
    const at = new Date("2026-08-01T12:00:00Z");
    expect(
      (await h.call("swipes.record", { animalId: visible.id, direction: "pass", at }, { cookie }))
        .status,
    ).toBe(200);
    const res = await h.call(
      "swipes.record",
      { animalId: draft.id, direction: "interested", at },
      { cookie },
    );
    expect(res.status).toBe(404);
    expect(codeOf(res.body)).toBe("NOT_FOUND");
  });

  it("animals.reveal refuses the draft (ANIMAL_NOT_AVAILABLE) and reveals the published animal", async () => {
    const { visible, draft } = await seed();
    const cookie = await adopterCookie();
    expect((await h.call("animals.reveal", { animalId: visible.id }, { cookie })).status).toBe(200);
    const res = await h.call("animals.reveal", { animalId: draft.id }, { cookie });
    expect(res.status).toBe(404);
    expect(codeOf(res.body)).toBe("ANIMAL_NOT_AVAILABLE");
  });
});
