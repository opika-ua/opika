import { randomUUID } from "node:crypto";
import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handlePublicRpc } from "./public-rpc-route";
import type { RateLimiter } from "./rate-limit";
import { anonymousRouterClient } from "./server-client";
import { createTestHarness, rpcRequestInit, type TestHarness } from "./test-harness";

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

async function seedOneCityTwoDogsOneCat() {
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
  for (const [species, size] of [
    ["dog", "small"],
    ["dog", "large"],
    ["cat", "small"],
  ] as const) {
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter.id, species, size }), city.id);
  }
  return city;
}

describe("gallery.facetCounts", () => {
  it("is on the Server Component path and answers option ids and counts only", async () => {
    const city = await seedOneCityTwoDogsOneCat();

    const counts = await anonymousRouterClient(h.db).gallery.facetCounts({
      filters: {
        ...NO_FILTERS,
        species: { kind: "oneOf", values: ["dog"] },
        sizes: { kind: "oneOf", values: ["small"] },
      },
    });

    expect(counts).toEqual({
      cities: [{ cityId: city.id, count: 1 }],
      ages: { baby: 0, young: 1, adult: 0, senior: 0 },
      sizes: { small: 1, medium: 0, large: 1 },
      sexes: { male: 1, female: 0, unknown: 0 },
    });
  });

  it("serves the same answer over the public HTTP route", async () => {
    await seedOneCityTwoDogsOneCat();
    const input = { filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } } };

    const viaHttp = await h.call("gallery.facetCounts", input);
    const inProcess = await anonymousRouterClient(h.db).gallery.facetCounts(input as never);

    expect(viaHttp.status).toBe(200);
    expect(viaHttp.body).toEqual(inProcess);
  });

  // Review of #250, note 1: every count column repeats every other filter, so
  // a value list repeated thousands of times went past Postgres's 65,535
  // parameters (a 500). Deduped at the boundary, it answers like one value.
  it("answers a value repeated 10,000 times exactly as the value once, with no 500", async () => {
    await seedOneCityTwoDogsOneCat();
    const once = { filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: ["young"] } } };
    const repeated = {
      filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: Array(10_000).fill("young") } },
    };

    const facets = await h.call("gallery.facetCounts", repeated);
    expect(facets.status).toBe(200);
    expect(facets.body).toEqual((await h.call("gallery.facetCounts", once)).body);

    const list = await h.call("gallery.list", repeated);
    expect(list.status).toBe(200);
    expect((list.body as { totalMatching: number }).totalMatching).toBe(
      ((await h.call("gallery.list", once)).body as { totalMatching: number }).totalMatching,
    );
  });

  // Cities have no fixed universe, so dedupe can't shrink distinct ids; what
  // the 64 KB body cap admits (~1,600 ids) stays far under the parameter limit.
  it("answers 2,000 distinct unknown cities without a 500", async () => {
    await seedOneCityTwoDogsOneCat();
    const cities = Array.from({ length: 2_000 }, () => randomUUID());
    const res = await h.call("gallery.facetCounts", {
      filters: { ...NO_FILTERS, cities: { kind: "oneOf", values: cities } },
    });
    expect(res.status).toBe(200);
    expect((res.body as { sizes: Record<string, number> }).sizes).toEqual({
      small: 0,
      medium: 0,
      large: 0,
    });
  });

  // The route's per-IP limiter is the budget `gallery.list` spends; it runs
  // before routing, so the new procedure cannot sit outside it.
  it("spends the same per-IP API budget as gallery.list", async () => {
    const allows: RateLimiter = { check: async () => true };
    let checks = 0;
    const counting: RateLimiter = {
      check: async () => {
        checks += 1;
        return checks <= 1;
      },
    };
    const deps = (apiLimiter: RateLimiter) => ({
      db: () => h.db,
      ip: "203.0.113.9",
      now: new Date(),
      apiLimiter,
      perIp: { adopterMints: allows, newShelterReveals: allows },
    });
    const request = (procedure: string) =>
      new Request(`https://opika.example/api/rpc/gallery/${procedure}`, {
        method: "POST",
        ...rpcRequestInit({ filters: NO_FILTERS }),
      });

    expect((await handlePublicRpc(request("facetCounts"), deps(counting))).status).toBe(200);
    // The one unit is spent: the next call, to either procedure, is refused.
    expect((await handlePublicRpc(request("list"), deps(counting))).status).toBe(429);
    expect((await handlePublicRpc(request("facetCounts"), deps(counting))).status).toBe(429);
    expect(checks).toBe(3);
  });
});
