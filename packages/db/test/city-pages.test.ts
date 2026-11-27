import { randomUUID } from "node:crypto";
import { type CityId, type ModeratorId, NO_FILTERS, type ShelterVerification } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-11-18T12:00:00.000Z");
const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY);
const MOD = randomUUID() as ModeratorId;
const EVIDENCE = { items: [], submittedAt: daysBefore(30) };

const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: daysBefore(5),
  evidence: EVIDENCE,
};
const PAUSED: ShelterVerification = {
  status: "paused",
  verifiedAt: daysBefore(30),
  verifiedBy: MOD,
  pausedAt: daysBefore(2),
  pausedBy: { kind: "moderator", moderatorId: MOD },
  reason: { code: "relocation", note: null },
  evidence: EVIDENCE,
};

async function city(slug: string) {
  const row = makeCity({ slug: slug as never });
  await cityRepo(db).insert(row);
  return row.id;
}

async function shelterIn(cityId: CityId, extra: Parameters<typeof makeShelter>[0] = {}) {
  const shelter = makeShelter({
    publicLocation: {
      cityId,
      district: null,
      precision: "fuzzed_address",
      approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
    },
    ...extra,
  });
  await shelterRepo(db).insert(shelter);
  return shelter.id;
}

const pages = (cityIds?: readonly CityId[]) =>
  galleryRepo(db).cityPages({ now: NOW, ...(cityIds ? { cityIds } : {}) });

describe("galleryRepo.cityPages (SEO B3: a city page exists only with an indexable animal)", () => {
  it("lists a city with a verified shelter's published or reserved animal, with its species", async () => {
    const kyiv = await city("kyiv");
    const shelter = await shelterIn(kyiv);
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: shelter, species: "dog" }), cityId: kyiv },
      {
        animal: makeAnimal({
          shelterId: shelter,
          species: "cat",
          listing: {
            kind: "reserved",
            since: daysBefore(1),
            publishedAt: daysBefore(10),
            confirmedAt: daysBefore(10),
            undoable: null,
          },
        }),
        cityId: kyiv,
      },
    ]);

    const rows = await pages();
    expect(rows.map((row) => [row.slug, row.species])).toEqual([["kyiv", ["dog", "cat"]]]);
  });

  it("leaves out a city whose only animals belong to an early-listed or a paused shelter", async () => {
    const early = await city("early");
    const paused = await city("paused");
    const earlyShelter = await shelterIn(early, {
      verification: PENDING,
      earlyListingSince: daysBefore(3),
    });
    const pausedShelter = await shelterIn(paused, { verification: PAUSED });
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: earlyShelter }), cityId: early },
      { animal: makeAnimal({ shelterId: pausedShelter }), cityId: paused },
    ]);

    // The early-listed animal is in the gallery (any-listed), so the empty answer is the basis, not the fixture.
    const gallery = await galleryRepo(db).facetCounts({
      sort: "freshest",
      filters: NO_FILTERS,
      now: NOW,
    });
    expect(gallery.cities.map((entry) => entry.cityId)).toEqual([early]);
    expect(await pages()).toEqual([]);
  });

  it("leaves out a city whose only animals are adopted or drafts", async () => {
    const lviv = await city("lviv");
    const shelter = await shelterIn(lviv);
    await animalRepo(db).insertMany([
      {
        animal: makeAnimal({ shelterId: shelter, listing: { kind: "adopted", adoptedAt: NOW } }),
        cityId: lviv,
      },
      { animal: makeAnimal({ shelterId: shelter, listing: { kind: "draft" } }), cityId: lviv },
    ]);
    expect(await pages()).toEqual([]);
  });

  it("puts up the city an animal is fostered in (its effective city), not only the shelter's", async () => {
    const kyiv = await city("kyiv");
    const irpin = await city("irpin");
    const shelter = await shelterIn(kyiv);
    await animalRepo(db).insert(makeAnimal({ shelterId: shelter }), irpin);

    expect((await pages()).map((row) => row.slug)).toEqual(["irpin"]);
  });

  it("lastModified is the newest update among the city's indexable animals only", async () => {
    const kyiv = await city("kyiv");
    const verified = await shelterIn(kyiv);
    const early = await shelterIn(kyiv, {
      verification: PENDING,
      earlyListingSince: daysBefore(3),
    });
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: verified, lastUpdatedAt: daysBefore(9) }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: verified, lastUpdatedAt: daysBefore(4) }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: early, lastUpdatedAt: daysBefore(1) }), cityId: kyiv },
    ]);

    const [row] = await pages();
    expect(row?.lastModified.toISOString()).toBe(daysBefore(4).toISOString());
  });

  it("narrows to the cities asked about, and asks nothing for an empty list", async () => {
    const kyiv = await city("kyiv");
    const lviv = await city("lviv");
    const shelter = await shelterIn(kyiv);
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: shelter }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: shelter }), cityId: lviv },
    ]);

    expect((await pages([lviv])).map((row) => row.slug)).toEqual(["lviv"]);
    expect(await pages([])).toEqual([]);
    expect((await pages()).map((row) => row.slug)).toEqual(["kyiv", "lviv"]);
  });
});

describe("galleryRepo.facetCounts' hasPage: the same rule, riding the facet grouping", () => {
  it("is true only for a city with a verified shelter's listed animal, whatever the filters", async () => {
    const kyiv = await city("kyiv");
    const irpin = await city("irpin");
    const early = await city("early");
    const paused = await city("paused");
    const verified = await shelterIn(kyiv);
    const earlyShelter = await shelterIn(early, {
      verification: PENDING,
      earlyListingSince: daysBefore(3),
    });
    const pausedShelter = await shelterIn(paused, { verification: PAUSED });
    await animalRepo(db).insertMany([
      // Fostered: the page belongs to Irpin, the effective city, not Kyiv.
      { animal: makeAnimal({ shelterId: verified, species: "dog" }), cityId: irpin },
      { animal: makeAnimal({ shelterId: earlyShelter }), cityId: early },
      { animal: makeAnimal({ shelterId: earlyShelter }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: pausedShelter }), cityId: paused },
    ]);

    const counts = await galleryRepo(db).facetCounts({
      sort: "freshest",
      filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
      now: NOW,
    });
    const hasPage = Object.fromEntries(
      counts.cities.map((entry) => [entry.city.slug, entry.hasPage]),
    );
    // The paused shelter's city is not in the gallery at all; the early-listed ones are, page-less.
    expect(hasPage).toEqual({ early: false, irpin: true, kyiv: false });
  });
});

describe("galleryRepo.facetCounts' indexableBySpecies: the species pages' threshold", () => {
  const facets = (
    filters: Parameters<ReturnType<typeof galleryRepo>["facetCounts"]>[0]["filters"] = NO_FILTERS,
    extra: Partial<Parameters<ReturnType<typeof galleryRepo>["facetCounts"]>[0]> = {},
  ) => galleryRepo(db).facetCounts({ sort: "freshest", filters, now: NOW, ...extra });

  it("counts a verified shelter's listed dogs and cats, fostered or reserved, across cities", async () => {
    const kyiv = await city("kyiv");
    const irpin = await city("irpin");
    const shelter = await shelterIn(kyiv);
    const reserved = {
      kind: "reserved",
      since: daysBefore(1),
      publishedAt: daysBefore(10),
      confirmedAt: daysBefore(10),
      undoable: null,
    } as const;
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: shelter, species: "dog" }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: shelter, species: "dog" }), cityId: irpin },
      {
        animal: makeAnimal({ shelterId: shelter, species: "cat", listing: reserved }),
        cityId: kyiv,
      },
    ]);

    expect((await facets()).indexableBySpecies).toEqual({ dog: 2, cat: 1 });
  });

  it("does not count a shelter under review (early-listed), though its animals are in the gallery", async () => {
    const kyiv = await city("kyiv");
    const verified = await shelterIn(kyiv);
    const underReview = await shelterIn(kyiv, {
      verification: PENDING,
      earlyListingSince: daysBefore(3),
    });
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: verified, species: "dog" }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: underReview, species: "dog" }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: underReview, species: "cat" }), cityId: kyiv },
    ]);

    const counts = await facets();
    // The gallery lists all three; only the verified shelter's dog counts towards a species page.
    expect(counts.species).toEqual({ dog: 2, cat: 1 });
    expect(counts.indexableBySpecies).toEqual({ dog: 1, cat: 0 });
  });

  it("does not count a paused shelter's animals, an adopted animal or a draft", async () => {
    const kyiv = await city("kyiv");
    const verified = await shelterIn(kyiv);
    const paused = await shelterIn(kyiv, { verification: PAUSED });
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: paused, species: "dog" }), cityId: kyiv },
      {
        animal: makeAnimal({
          shelterId: verified,
          species: "dog",
          listing: { kind: "adopted", adoptedAt: NOW },
        }),
        cityId: kyiv,
      },
      {
        animal: makeAnimal({ shelterId: verified, species: "cat", listing: { kind: "draft" } }),
        cityId: kyiv,
      },
    ]);

    expect((await facets()).indexableBySpecies).toEqual({ dog: 0, cat: 0 });
  });

  it("ignores the active filters and the sort", async () => {
    const kyiv = await city("kyiv");
    const lviv = await city("lviv");
    const shelter = await shelterIn(kyiv);
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: shelter, species: "dog" }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: shelter, species: "dog" }), cityId: lviv },
      { animal: makeAnimal({ shelterId: shelter, species: "cat" }), cityId: lviv },
    ]);

    const unfiltered = (await facets()).indexableBySpecies;
    expect(unfiltered).toEqual({ dog: 2, cat: 1 });
    const filtered = await facets({
      ...NO_FILTERS,
      species: { kind: "oneOf", values: ["cat"] },
      cities: { kind: "oneOf", values: [lviv] },
      ages: { kind: "oneOf", values: ["senior"] },
    });
    expect(filtered.indexableBySpecies).toEqual(unfiltered);
    expect((await facets(NO_FILTERS, { sort: "longest_waiting" })).indexableBySpecies).toEqual(
      unfiltered,
    );
  });

  it("under a shelter scope counts that shelter's animals only, like hasPage", async () => {
    const kyiv = await city("kyiv");
    const one = await shelterIn(kyiv);
    const other = await shelterIn(kyiv);
    await animalRepo(db).insertMany([
      { animal: makeAnimal({ shelterId: one, species: "dog" }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: other, species: "dog" }), cityId: kyiv },
      { animal: makeAnimal({ shelterId: other, species: "cat" }), cityId: kyiv },
    ]);

    const scoped = await facets(NO_FILTERS, { scope: { kind: "shelter", shelterId: one } });
    expect(scoped.indexableBySpecies).toEqual({ dog: 1, cat: 0 });
  });
});
