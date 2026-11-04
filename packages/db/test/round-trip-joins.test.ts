import {
  type Animal,
  type AnimalId,
  type City,
  type CityId,
  EVERYONE_SCOPE,
  type FeedFilters,
  type GalleryScope,
  type GallerySort,
  NO_FILTERS,
  type Shelter,
  type ShelterId,
} from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import { shelters } from "../src/schema/shelters";
import { makeAnimal, setupTestDatabase } from "../src/test-utils/index";
import { seedPerf } from "../src/tools/perf-seed";
import { type PerfPick, pickPerfData } from "../src/tools/perf-support";

/**
 * The statements that read a card's animal, shelter and city together (JOINs) must answer exactly
 * what the sequential reads they replaced answered, on a corpus with every listing kind, pending
 * and suspended shelters, a shelter with no animals and a fostered animal in another city.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
let pick: PerfPick;
let fosterId: AnimalId;
let fosterCity: CityId;
const NOW = new Date();
const UNKNOWN_ANIMAL = "00000000-0000-4000-8000-000000000000" as AnimalId;

beforeAll(async () => {
  const setup = await setupTestDatabase();
  db = setup.db;
  cleanup = setup.cleanup;
  await seedPerf(db);
  pick = await pickPerfData(db);
  // A fostered animal: its own city differs from its shelter's, and the card names the foster city.
  const [shelterRow] = await db
    .select()
    .from(shelters)
    .where(eq(shelters.id, pick.busyShelter as ShelterId));
  const other = (await db.select({ city: animals.cityId }).from(animals)).find(
    (r) => r.city !== shelterRow?.cityId,
  );
  fosterCity = other?.city as CityId;
  const foster = makeAnimal({
    shelterId: pick.busyShelter as ShelterId,
    name: "Тимчасова",
    publicLocation: { precision: "city", cityId: fosterCity, district: null },
  });
  await animalRepo(db).insert(foster, fosterCity);
  fosterId = foster.id;
  // Past the sitemap's 2,000 bound (the perf corpus has 1,819 public animals), so the cap is real.
  const homeCity = shelterRow?.cityId as CityId;
  await animalRepo(db).insertMany(
    Array.from({ length: 450 }, (_, i) => ({
      animal: makeAnimal({ shelterId: pick.busyShelter as ShelterId, name: `Додаткова ${i}` }),
      cityId: homeCity,
    })),
  );
}, 180_000);
afterAll(async () => cleanup?.());

/** What a card names about its shelter, from the full row: the reference projection. */
const shelterView = (s: Shelter) => ({
  id: s.id,
  displayName: s.displayName,
  logo: s.logo,
  publicLocation: s.publicLocation,
  verification: s.verification.status === "verified" ? "verified" : "unverified",
  availability:
    s.verification.status === "verified"
      ? "open"
      : s.verification.status === "paused"
        ? "paused"
        : "unreachable",
});
const cityView = (c: City) => ({
  id: c.id,
  slug: c.slug,
  kind: c.kind,
  nameScope: c.nameScope,
  regionId: c.regionId,
  name: { uk: c.name.uk },
  district: c.district,
});
const cardCityId = (animal: Animal, shelter: Shelter): CityId =>
  animal.publicLocation?.cityId ?? shelter.publicLocation.cityId;

type Case = {
  name: string;
  filters: () => FeedFilters;
  scope: () => GalleryScope;
  sort: GallerySort;
  page: number;
};
const one = <T>(v: T): { kind: "oneOf"; values: readonly [T, ...T[]] } => ({
  kind: "oneOf",
  values: [v],
});
const everyone = (name: string, sort: GallerySort, page: number, filters: () => FeedFilters) =>
  ({ name, filters, scope: () => EVERYONE_SCOPE, sort, page }) satisfies Case;
const inShelter = (name: string, shelterId: () => string, page: number) =>
  ({
    name,
    filters: () => NO_FILTERS,
    scope: () => ({ kind: "shelter", shelterId: shelterId() as ShelterId }),
    sort: "freshest",
    page,
  }) satisfies Case;

const CASES: Case[] = [
  everyone("unfiltered", "freshest", 1, () => NO_FILTERS),
  everyone("page 3", "freshest", 3, () => NO_FILTERS),
  everyone("past the end", "freshest", 9999, () => NO_FILTERS),
  everyone("longest waiting", "longest_waiting", 2, () => NO_FILTERS),
  everyone("city", "freshest", 1, () => ({ ...NO_FILTERS, cities: one(pick.cityId as CityId) })),
  everyone("foster city", "freshest", 1, () => ({ ...NO_FILTERS, cities: one(fosterCity) })),
  everyone("species and size, longest waiting", "longest_waiting", 1, () => ({
    ...NO_FILTERS,
    species: one("dog" as const),
    sizes: one("large" as const),
  })),
  everyone("no match", "freshest", 1, () => ({ ...NO_FILTERS, cities: one("ua-none" as CityId) })),
  inShelter("busiest shelter", () => pick.busyShelter as string, 2),
  inShelter("shelter with no animals", () => pick.emptyShelter as string, 1),
];

describe("galleryRepo.listCards equals list + shelters + cities", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const opts = {
        filters: c.filters(),
        scope: c.scope(),
        sort: c.sort,
        page: c.page,
        pageSize: 24,
        now: NOW,
      };
      const [old, joined] = await Promise.all([
        galleryRepo(db).list(opts),
        galleryRepo(db).listCards(opts),
      ]);
      const shelterRows = await shelterRepo(db).findByIds([
        ...new Set(old.items.map((a) => a.shelterId)),
      ]);
      const shelterById = new Map(shelterRows.map((s) => [s.id, s]));
      const cityRows = await cityRepo(db).findByIds(
        old.items.map((a) => cardCityId(a, shelterById.get(a.shelterId) as Shelter)),
      );
      const cityById = new Map(cityRows.map((r) => [r.id, r]));

      expect({ ...joined, items: undefined }).toEqual({ ...old, items: undefined });
      expect(joined.items.map((i) => i.animal)).toEqual(old.items);
      expect(joined.items.map((i) => i.shelter)).toEqual(
        old.items.map((a) => shelterView(shelterById.get(a.shelterId) as Shelter)),
      );
      expect(joined.items.map((i) => i.city)).toEqual(
        old.items.map((a) => {
          const city = cityById.get(cardCityId(a, shelterById.get(a.shelterId) as Shelter));
          return city ? cityView(city) : null;
        }),
      );
    });
  }

  it("the corpus exercised the cases (a guard on the fixtures)", async () => {
    const page = await galleryRepo(db).listCards({
      filters: { ...NO_FILTERS, cities: one(fosterCity) },
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 500,
      now: NOW,
    });
    expect(page.items.some((i) => i.animal.id === fosterId && i.city?.id === fosterCity)).toBe(
      true,
    );
    const empty = await galleryRepo(db).listCards({
      filters: NO_FILTERS,
      scope: { kind: "shelter", shelterId: pick.emptyShelter as ShelterId },
      sort: "freshest",
      page: 1,
      pageSize: 24,
      now: NOW,
    });
    expect(empty.items).toEqual([]);
  });

  it("carries no column the public views do not name", async () => {
    const page = await galleryRepo(db).listCards({
      filters: NO_FILTERS,
      scope: EVERYONE_SCOPE,
      sort: "freshest",
      page: 1,
      pageSize: 3,
      now: NOW,
    });
    const first = page.items[0];
    expect(Object.keys(first?.shelter ?? {}).sort()).toEqual(
      ["availability", "displayName", "id", "logo", "publicLocation", "verification"].sort(),
    );
    expect(Object.keys(first?.city ?? {}).sort()).toEqual(
      ["district", "id", "kind", "name", "nameScope", "regionId", "slug"].sort(),
    );
  });
});

describe("animalRepo.findWithShelterById equals findById + shelter findById", () => {
  it("answers the same for every listing kind, a pending shelter and an unknown id", async () => {
    const rows = await db
      .select({ id: animals.id, kind: animals.listingKind, shelterId: animals.shelterId })
      .from(animals);
    const byKind = new Map<string, AnimalId>();
    for (const r of rows) if (!byKind.has(r.kind)) byKind.set(r.kind, r.id);
    expect([...byKind.keys()]).toEqual(
      expect.arrayContaining(["adopted", "draft", "published", "reserved", "withdrawn"]),
    );
    const ids = [...byKind.values(), fosterId, UNKNOWN_ANIMAL];
    // An animal at a shelter that is not verified.
    const pending = await db
      .select({ id: shelters.id })
      .from(shelters)
      .where(eq(shelters.verificationStatus, "pending"));
    const atPending = rows.find((r) => r.shelterId === pending[0]?.id);
    expect(atPending).toBeTruthy();
    if (atPending) ids.push(atPending.id);
    for (const id of ids) {
      const old = await animalRepo(db).findById(id);
      const oldShelter = old ? await shelterRepo(db).findById(old.shelterId) : null;
      const joined = await animalRepo(db).findWithShelterById(id);
      expect(joined?.animal ?? null).toEqual(old);
      expect(joined?.shelter ?? null).toEqual(oldShelter ? shelterView(oldShelter) : null);
    }
  });
});

describe("animalRepo.findCardsByIds equals findByIds + shelters + cities", () => {
  it("answers the same for a mix of kinds, a foster animal and unknown ids", async () => {
    const rows = await db.select({ id: animals.id, kind: animals.listingKind }).from(animals);
    const mix = ["published", "reserved", "draft", "adopted", "withdrawn"].flatMap((kind) =>
      rows
        .filter((r) => r.kind === kind)
        .slice(0, 3)
        .map((r) => r.id),
    );
    mix.push(fosterId, UNKNOWN_ANIMAL);
    const old = await animalRepo(db).findByIds(mix);
    const shelterRows = await shelterRepo(db).findByIds([...new Set(old.map((a) => a.shelterId))]);
    const shelterById = new Map(shelterRows.map((s) => [s.id, s]));
    const cityRows = await cityRepo(db).findByIds(
      old.map((a) => cardCityId(a, shelterById.get(a.shelterId) as Shelter)),
    );
    const cityById = new Map(cityRows.map((c) => [c.id, c]));
    const joined = await animalRepo(db).findCardsByIds(mix);
    const byId = <T extends { id: string }>(xs: readonly T[]) =>
      [...xs].sort((a, b) => a.id.localeCompare(b.id));

    expect(byId(joined.map((j) => j.animal))).toEqual(byId(old));
    for (const j of joined) {
      const shelter = shelterById.get(j.animal.shelterId) as Shelter;
      expect(j.shelter).toEqual(shelterView(shelter));
      const city = cityById.get(cardCityId(j.animal, shelter));
      expect(j.city).toEqual(city ? cityView(city) : null);
    }
    expect(await animalRepo(db).findCardsByIds([])).toEqual([]);
  });
});

describe("galleryRepo.sitemapRows equals the gallery's pages walked 50 at a time", () => {
  it("names the same animals and shelters in the same order", async () => {
    const walked: { id: string; shelterId: string }[] = [];
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const result = await galleryRepo(db).list({
        filters: NO_FILTERS,
        scope: EVERYONE_SCOPE,
        sort: "freshest",
        page,
        pageSize: 50,
        now: NOW,
      });
      totalPages = result.totalPages;
      for (const a of result.items) walked.push({ id: a.id, shelterId: a.shelterId });
    }
    const rows = await galleryRepo(db).sitemapRows({ now: NOW });
    // More than 2,000 public animals exist here; both the walk and the one statement stop at the bound.
    expect(rows).toHaveLength(2000);
    expect(walked).toHaveLength(2000);
    const few = await galleryRepo(db).sitemapRows({ now: NOW, limit: 7 });
    expect(few.map((r) => r.id)).toEqual(rows.slice(0, 7).map((r) => r.id));
    // A limit above the bound never lifts it.
    expect(await galleryRepo(db).sitemapRows({ now: NOW, limit: 99999 })).toHaveLength(2000);
    expect(rows.map((r) => ({ id: r.id, shelterId: r.shelterId }))).toEqual(walked);
  });
});

describe("the card's verified/unverified comes from the verification_status column", () => {
  it("equals the verification jsonb's status for every shelter, in every state the corpus holds", async () => {
    const rows = await db
      .select({ id: shelters.id, column: shelters.verificationStatus })
      .from(shelters);
    const states = new Set<string>();
    for (const row of rows) {
      const shelter = await shelterRepo(db).findById(row.id);
      expect(row.column).toBe(shelter?.verification.status);
      states.add(row.column);
    }
    expect([...states]).toEqual(expect.arrayContaining(["verified", "pending", "suspended"]));
  });
});
