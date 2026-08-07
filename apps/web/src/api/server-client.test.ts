import { cityRepo, shelterRepo } from "@opika/db/repos";
import { makeCity, makeShelter } from "@opika/db/test";
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

    const view = await anonymousRouterClient(h.db).shelters.byId({ shelterId: shelter.id });

    // The whole point of routing Server Components through the contract
    // rather than calling shelterRepo directly: what a page renders is the
    // picked view, not the domain object the repository returns.
    expect(Object.keys(view).sort()).toEqual([
      "createdAt",
      "description",
      "displayName",
      "donation",
      "id",
      "publicLocation",
      "verification",
    ]);
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
