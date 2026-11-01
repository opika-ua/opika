import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { citySlugAliases } from "@opika/db/schema";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { animalPublicLocationOf, NO_FILTERS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

/**
 * The public place lookups that replaced the whole-settlement-list read (nationwide N3): what each
 * answers, how far each is capped, and that the labels ride with the responses that mention a
 * city. The scan for leaked keys is `pre-reveal-location.test.ts`'s; the SQL is the db package's.
 */

async function seedPlaces() {
  const brovary = makeCity({
    name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } },
    slug: "brovary-kyivska" as never,
    district: { uk: "Броварський район" },
  });
  const irpin = makeCity({
    name: { uk: "Ірпінь", en: { text: "Irpin", provenance: "human" } },
    slug: "irpin-kyivska" as never,
  });
  await cityRepo(h.db).insert(brovary);
  await cityRepo(h.db).insert(irpin);
  const shelter = makeShelter({
    publicLocation: {
      cityId: brovary.id,
      district: null,
      precision: "fuzzed_address",
      approximate: { center: { lat: 50.5, lng: 30.7 }, precisionMetres: 1000 } as never,
    },
  });
  await shelterRepo(h.db).insert(shelter);
  const atShelter = makeAnimal({ shelterId: shelter.id });
  const fostered = makeAnimal({
    shelterId: shelter.id,
    publicLocation: animalPublicLocationOf(irpin.id, { uk: "Центр", en: null }),
  });
  await animalRepo(h.db).insert(atShelter, brovary.id);
  await animalRepo(h.db).insert(fostered, irpin.id);
  return { brovary, irpin, shelter, atShelter, fostered };
}

describe("cities.byIds", () => {
  it("answers a public label per city, with the oblast's short form and the raion, and nothing finer", async () => {
    const { brovary } = await seedPlaces();
    const res = await h.call("cities.byIds", { ids: [brovary.id] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: brovary.id,
        slug: "brovary-kyivska",
        kind: "city",
        nameScope: "unique_in_ukraine",
        regionId: brovary.regionId,
        name: "Бровари",
        regionShort: "Київська обл.",
        raion: "Броварський район",
      },
    ]);
  });

  it("reads nothing for no ids, and refuses more than fifty", async () => {
    expect((await h.call("cities.byIds", { ids: [] })).body).toEqual([]);
    const tooMany = Array.from({ length: 51 }, () => "c1000000-0000-4000-8000-000000000001");
    expect((await h.call("cities.byIds", { ids: tooMany })).status).toBeGreaterThanOrEqual(400);
  });
});

describe("cities.resolveTokens", () => {
  it("resolves a current slug, a former slug and a legacy id, and degrades an unknown token", async () => {
    const { brovary } = await seedPlaces();
    await h.db
      .insert(citySlugAliases)
      .values({ slug: "brovary", cityId: brovary.id, reason: "legacy" });

    const res = await h.call("cities.resolveTokens", {
      tokens: ["brovary-kyivska", "brovary", brovary.id, "atlantis"],
    });
    const byToken = new Map(
      (res.body as { token: string; city: { id: string } | null; via: string | null }[]).map(
        (entry) => [entry.token, entry],
      ),
    );

    expect(byToken.get("brovary-kyivska")).toMatchObject({ via: "slug", city: { id: brovary.id } });
    expect(byToken.get("brovary")).toMatchObject({ via: "alias", city: { id: brovary.id } });
    expect(byToken.get(brovary.id)).toMatchObject({ via: "id", city: { id: brovary.id } });
    expect(byToken.get("atlantis")).toEqual({ token: "atlantis", city: null, via: null });
  });

  it("refuses more than thirty tokens: the page caps them, the API holds the line", async () => {
    const tokens = Array.from({ length: 31 }, (_, i) => `place-${i}`);
    expect((await h.call("cities.resolveTokens", { tokens })).status).toBeGreaterThanOrEqual(400);
  });
});

describe("regions.list", () => {
  it("answers the 27 first-level units from the constant, with next-door ids and no codes", async () => {
    const res = await h.call("regions.list", {});
    const regions = res.body as { id: string; slug: string; neighbours: string[] }[];

    expect(res.status).toBe(200);
    expect(regions).toHaveLength(27);
    const kyivska = regions.find((r) => r.slug === "kyivska");
    expect(kyivska).toMatchObject({ label: "Київська", short: "Київська обл." });
    // Neighbours are ids of regions in the same list.
    const ids = new Set(regions.map((r) => r.id));
    for (const region of regions) for (const n of region.neighbours) expect(ids.has(n)).toBe(true);
    expect(res.raw).not.toContain("UA32");
  });
});

describe("the labels that ride with a response", () => {
  it("gallery.list names the shelter's city and a fostered animal's city, each once", async () => {
    const { brovary, irpin } = await seedPlaces();
    const res = await h.call("gallery.list", { filters: NO_FILTERS });
    const labels = (res.body as { cityLabels: { id: string }[] }).cityLabels;

    expect(labels.map((l) => l.id).sort()).toEqual([brovary.id, irpin.id].sort());
  });

  it("feed.list names the cities of the page's cards", async () => {
    const { brovary, irpin } = await seedPlaces();
    const res = await h.call("feed.list", { filters: NO_FILTERS, cursor: null, limit: 20 });
    const labels = (res.body as { cityLabels: { id: string }[] }).cityLabels;

    expect(labels.map((l) => l.id).sort()).toEqual([brovary.id, irpin.id].sort());
  });

  it("animals.cardsByIds names the cities of the available cards only", async () => {
    const { brovary, atShelter } = await seedPlaces();
    const gone = "99999999-9999-4999-8999-999999999999";
    const res = await h.call("animals.cardsByIds", { animalIds: [atShelter.id, gone] });
    const body = res.body as { items: { kind: string }[]; cityLabels: { id: string }[] };

    expect(body.items.map((i) => i.kind)).toEqual(["available", "unavailable"]);
    expect(body.cityLabels.map((l) => l.id)).toEqual([brovary.id]);
  });
});
