import { cityRepo } from "@opika/db/repos";
import { makeCity } from "@opika/db/test";
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
});
