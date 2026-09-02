import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "./server-client";
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

describe("anonymousRouterClient", () => {
  it("calls a real procedure in-process and returns real data", async () => {
    const city = makeCity({ name: { uk: "Бровари", en: null } });
    await cityRepo(h.db).insert(city);

    const client = anonymousRouterClient(h.db);
    const cities = await client.cities.list({});

    expect(cities).toHaveLength(1);
    expect(cities[0]).toEqual({ id: city.id, name: city.name, centroid: city.centroid });
  });

  it("goes through the same router the HTTP route serves, not a parallel path", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);

    const viaInProcess = await anonymousRouterClient(h.db).cities.list({});
    const viaHttp = await h.call("cities.list", {});

    expect(viaHttp.status).toBe(200);
    expect(viaInProcess).toEqual(viaHttp.body);
  });

  it("withholds the exact address and contact details a reveal would carry", async () => {
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
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter.id }), city.id);

    const page = await anonymousRouterClient(h.db).gallery.list({
      filters: NO_FILTERS,
      page: 1,
      pageSize: 24,
    });

    // The whole point of routing Server Components through the contract
    // rather than calling the repositories directly: what a page renders is
    // the picked view, not the domain objects the repositories return.
    expect(page.items).toHaveLength(1);
    expect(Object.keys(page.items[0]?.shelter ?? {}).sort()).toEqual([
      "displayName",
      "freshnessSentence",
      "id",
      "publicLocation",
      "verification",
    ]);
    expect(JSON.stringify(page.items[0]?.shelter)).not.toContain("вул. Тестова");
  });

  it("also exposes gallery.relaxationCounts — V2's no-match state, read-only same as gallery.list", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      publicLocation: {
        precision: "fuzzed_address",
        cityId: city.id,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
    });
    await shelterRepo(h.db).insert(shelter);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter.id, species: "dog" }), city.id);

    const result = await anonymousRouterClient(h.db).gallery.relaxationCounts({
      filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
    });

    expect(result.current).toBe(0);
    expect(result.relaxations).toEqual([{ dimension: "species", additional: 1 }]);
  });

  /**
   * F1 put `animals.byId` and `shelters.byId` on this path, which changes the
   * shape of the guard below rather than duplicating it: `animals` is now a
   * legitimately-defined namespace, so its mere presence proves nothing. What
   * must stay absent from it is `reveal` — the one procedure that needs an
   * `adopterId` a Server Component render never has, and the only one that
   * discloses an exact address and contact details.
   */
  it("exposes animals.byId but never animals.reveal, whose adopterId this path cannot supply", () => {
    const client = anonymousRouterClient(h.db);

    expect(Reflect.get(client.animals, "byId")).toBeDefined();
    expect(Reflect.get(client.animals, "reveal")).toBeUndefined();
  });

  it("animals.byId and shelters.byId withhold the contact details a reveal would carry", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      exactAddress: {
        line1: "вул. Прихована 7",
        line2: null,
        postalCode: "01001",
        cityId: city.id,
        district: null,
        coordinates: { lat: 50.45, lng: 30.52 },
      },
      contact: {
        primary: { kind: "phone", e164: "+380670000001" },
        additional: [],
      },
    });
    await shelterRepo(h.db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(h.db).insert(animal, city.id);

    const client = anonymousRouterClient(h.db);
    const detail = await client.animals.byId({ animalId: animal.id });
    const publicShelter = await client.shelters.byId({ shelterId: shelter.id });

    // Asserted as a full key set rather than "does not contain X": `pick`
    // is deny-by-default and this is the assertion that keeps it that way,
    // so a field added to `Shelter` shows up here as a failure instead of
    // travelling silently to a page that never asked for it.
    expect(Object.keys(publicShelter).sort()).toEqual([
      "createdAt",
      "description",
      "displayName",
      "donation",
      "id",
      "publicLocation",
      "verification",
    ]);
    expect(Object.keys(detail.shelter).sort()).toEqual([
      "displayName",
      "freshnessSentence",
      "id",
      "publicLocation",
      "verification",
    ]);

    const rendered = JSON.stringify([detail, publicShelter]);
    expect(rendered).not.toContain("вул. Прихована");
    expect(rendered).not.toContain("+380670000001");
  });

  /**
   * This path throws `setCookies` away — a Server Component cannot write a
   * cookie. `session.bootstrap` inserts an adopter row and a session row
   * before it queues its Set-Cookie, so exposing it here would mint an
   * orphan adopter on every render and report success. The surface is
   * picked, not omitted, so the guard survives a procedure being added to
   * the router later.
   */
  it("does not expose the session namespace, whose Set-Cookie this path would discard", () => {
    const client = anonymousRouterClient(h.db);

    // Fails if the whole `router` is ever passed to createRouterClient again:
    // the proxy would answer with a nested client rather than undefined.
    expect(Reflect.get(client, "session")).toBeUndefined();
    expect(Reflect.get(client, "cities")).toBeDefined();
  });
});
