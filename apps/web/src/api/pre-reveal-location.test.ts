import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { animalPublicLocationOf, NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * What a browser actually receives, before and after a reveal, through the
 * served router (`implement(contract)`, oRPC's output stripping, the real
 * handlers): Oleksii, 2026-10-14 (inbox EM-Q10, answer (a)), verbatim: "Stop
 * sending district and fuzzed coordinates in public responses before a
 * reveal (exact address after a reveal stays, per decision #2)."; and
 * 2026-10-15 (inbox EM-B6, answer 5, decision EM-D1), verbatim: "Exact address
 * in the reveal response: (b). Stop sending it, along with district and
 * coordinates. Decision #2 changes: the exact address never leaves the server
 * for adopters; the meeting place is agreed with the shelter (matches the
 * live copy). Record it as my decision; contract test that no reveal or
 * public response contains it."
 *
 * The contract-side walk (`packages/contracts/src/pre-reveal-location.test.ts`)
 * proves the schemas can't carry them; this proves the JSON doesn't, which
 * also catches a handler or a serializer adding something the schema walk
 * can't see. The fixtures carry a real street address, postcode and district
 * on the shelter and a district on a fostered animal, so a pass can't come
 * from the fields merely being null.
 */
const DECISION =
  "re-adding a district, coordinates or the exact address to any adopter-facing response, " +
  "before or after a reveal, needs an explicit decision (inbox EM-Q10; EM-B6 / EM-D1)";

const FORBIDDEN_KEY =
  /"(district|coordinates|lat|lng|latitude|longitude|approximate|center|centroid|precisionMetres|exactAddress|line1|line2|postalCode|street)"\s*:/g;

const STREET = "вул. Тестова 1";
const POSTCODE = "01001";

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
      line1: STREET,
      line2: null,
      postalCode: POSTCODE,
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
  for (const leaked of [
    SHELTER_DISTRICT,
    FOSTER_DISTRICT,
    String(EXACT.lat),
    "50.40",
    STREET,
    POSTCODE,
  ]) {
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

  it("the scan sees the keys where they exist: the shelter's own record, as stored", async () => {
    const { shelter } = await seed();
    const stored = JSON.stringify(shelter);
    const keys = [...stored.matchAll(FORBIDDEN_KEY)].map((m) => m[1]);
    expect(keys).toEqual(
      expect.arrayContaining(["exactAddress", "line1", "postalCode", "district", "coordinates"]),
    );
    for (const value of [STREET, POSTCODE, SHELTER_DISTRICT]) expect(stored).toContain(value);
  });
});

describe("served reveal responses carry contacts and the city, never the address (EM-D1)", () => {
  it("animals.reveal, its idempotent repeat, and reveals.listMine", async () => {
    const { city, shelter, atShelter, fostered } = await seed();
    const boot = await h.call("session.bootstrap", {});
    const cookie = h.extractSessionCookie(boot.headers);
    if (cookie === null) throw new Error("no session cookie");

    for (const animal of [atShelter, fostered]) {
      const reveal = await h.call("animals.reveal", { animalId: animal.id }, { cookie });
      expectCityOnly("animals.reveal", reveal);
      // The second call returns the stored reveal (the idempotent path).
      expectCityOnly(
        "animals.reveal (repeat)",
        await h.call("animals.reveal", { animalId: animal.id }, { cookie }),
      );
      // What a reveal is for still arrives: the shelter's name, its channels, its city.
      const body = reveal.body as Record<string, Record<string, unknown>>;
      expect(body.shelterContact).toEqual({
        source: "current",
        displayName: shelter.displayName,
        contact: JSON.parse(JSON.stringify(shelter.contact)),
      });
      expect(body.shelterAtFirstReveal?.publicLocation).toEqual({ cityId: city.id });
    }

    const mine = await h.call("reveals.listMine", { cursor: null, limit: 20 }, { cookie });
    expectCityOnly("reveals.listMine", mine);
    const items = (mine.body as { items: Record<string, object>[] }).items;
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(Object.keys(item.shelterContact ?? {}).sort()).toEqual([
        "contact",
        "displayName",
        "source",
      ]);
      expect(Object.keys(item.shelterAtFirstReveal ?? {}).sort()).toEqual(
        ["donation", "publicLocation", "shelterId", "verificationStatusAtReveal"].sort(),
      );
    }
  });
});
