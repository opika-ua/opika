import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { animalPublicLocationOf, NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * What a browser actually receives before a reveal, through the served router
 * (`implement(contract)`, oRPC's output stripping, the real handlers):
 * Oleksii, 2026-10-14 (inbox EM-Q10, answer (a)), verbatim: "Stop sending
 * district and fuzzed coordinates in public responses before a reveal (exact
 * address after a reveal stays, per decision #2)."
 *
 * The contract-side walk (`packages/contracts/src/pre-reveal-location.test.ts`)
 * proves the schemas can't carry them; this proves the JSON doesn't, which
 * also catches a handler or a serializer adding something the schema walk
 * can't see. The fixtures carry a real district on the shelter and on a
 * fostered animal, so a pass can't come from the fields merely being null.
 */
const DECISION =
  "re-adding a district or coordinates to a pre-reveal response needs an explicit decision " +
  "(Oleksii, 2026-10-14, inbox EM-Q10)";

const FORBIDDEN_KEY =
  /"(district|coordinates|lat|lng|latitude|longitude|approximate|center|centroid|precisionMetres|exactAddress)"\s*:/g;

const SHELTER_DISTRICT = "Голосіївський";
const FOSTER_DISTRICT = "Оболонський";
const EXACT = { lat: 50.4012345, lng: 30.5212345 };

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

async function seed() {
  const city = makeCity();
  await cityRepo(h.db).insert(city);
  const shelter = makeShelter({
    exactAddress: {
      line1: "вул. Тестова 1",
      line2: null,
      postalCode: "01001",
      cityId: city.id,
      district: { uk: SHELTER_DISTRICT, en: null },
      coordinates: EXACT,
    },
  });
  await shelterRepo(h.db).insert(shelter);
  const atShelter = makeAnimal({ shelterId: shelter.id });
  await animalRepo(h.db).insert(atShelter, city.id);
  const fostered = makeAnimal({
    shelterId: shelter.id,
    publicLocation: animalPublicLocationOf(city.id, { uk: FOSTER_DISTRICT, en: null }),
  });
  await animalRepo(h.db).insert(fostered, city.id);
  return { city, shelter, atShelter, fostered };
}

function expectCityOnly(name: string, res: { status: number; raw: string }) {
  expect(res.status, `${name}: ${res.raw.slice(0, 200)}`).toBe(200);
  expect(
    [...res.raw.matchAll(FORBIDDEN_KEY)].map((m) => m[1]),
    `${name}: ${DECISION}`,
  ).toEqual([]);
  for (const leaked of [SHELTER_DISTRICT, FOSTER_DISTRICT, String(EXACT.lat), "50.40"]) {
    expect(res.raw, `${name} carries "${leaked}": ${DECISION}`).not.toContain(leaked);
  }
}

describe("served pre-reveal responses carry the city only (EM-Q10)", () => {
  it("feed.list, gallery.list, animals.byId, shelters.byId and cities.list", async () => {
    const { city, shelter, atShelter, fostered } = await seed();

    const feed = await h.call("feed.list", { filters: NO_FILTERS, cursor: null, limit: 20 });
    expectCityOnly("feed.list", feed);
    const gallery = await h.call("gallery.list", { filters: NO_FILTERS });
    expectCityOnly("gallery.list", gallery);
    for (const animal of [atShelter, fostered]) {
      expectCityOnly("animals.byId", await h.call("animals.byId", { animalId: animal.id }));
    }
    expectCityOnly("shelters.byId", await h.call("shelters.byId", { shelterId: shelter.id }));
    expectCityOnly("cities.list", await h.call("cities.list", {}));

    // The city itself does arrive, for both kinds of animal: the check above
    // is not passing on an empty or failed response.
    const items = (feed.body as { items: { id: string; publicLocation: unknown }[] }).items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === fostered.id)?.publicLocation).toEqual({ cityId: city.id });
    expect(items.find((i) => i.id === atShelter.id)?.publicLocation).toBeNull();
    expect(feed.raw).toContain(`"publicLocation":{"cityId":"${city.id}"}`);
  });

  it("the scan sees the keys where they belong: a reveal still carries the exact address", async () => {
    const { atShelter } = await seed();
    const boot = await h.call("session.bootstrap", {});
    const cookie = h.extractSessionCookie(boot.headers);
    if (cookie === null) throw new Error("no session cookie");
    const reveal = await h.call("animals.reveal", { animalId: atShelter.id }, { cookie });
    expect(reveal.status).toBe(200);
    const keys = [...reveal.raw.matchAll(FORBIDDEN_KEY)].map((m) => m[1]);
    expect(keys).toEqual(expect.arrayContaining(["exactAddress", "district", "coordinates"]));
    expect(reveal.raw).toContain(SHELTER_DISTRICT);
  });
});
