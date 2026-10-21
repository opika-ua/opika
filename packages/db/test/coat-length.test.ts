import { randomUUID } from "node:crypto";
import {
  type CityId,
  type CoatLength,
  DEFAULT_SEEN_SET_POLICY,
  EVERYONE_SCOPE,
  type FeedFilters,
  type ListedAnimal,
  NO_FILTERS,
  type ShelterAdminId,
} from "@opika/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { feedRepo } from "../src/repos/feed-repo";
import { galleryRepo } from "../src/repos/gallery-repo";
import { kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * Fur (DR1, S2; migration 0014) at the database: the column holds short, long
 * or nothing on any listing kind, and the shared filter predicate the deck,
 * the gallery and the relaxation counts all use leaves unrecorded fur out
 * while a fur filter is on (DR1-D11). Local Postgres; the SQL changed, so
 * Oleksii's real-Neon smoke is still owed before merge.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-08-05T12:00:00.000Z");

async function place(): Promise<{ shelterId: ListedAnimal["shelterId"]; cityId: CityId }> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  return { shelterId: shelter.id, cityId: city.id };
}

/** 3 short, 2 long and 4 unrecorded published animals, at distinct confirmation times. */
async function seedFur(): Promise<Record<"short" | "long" | "unrecorded", ListedAnimal[]>> {
  const { shelterId, cityId } = await place();
  let hour = 0;
  const make = (coatLength: CoatLength | null, count: number): ListedAnimal[] =>
    Array.from({ length: count }, () => {
      hour += 1;
      const at = new Date(NOW.getTime() - hour * 3_600_000);
      return makeAnimal({
        shelterId,
        coatLength,
        listing: { kind: "published", publishedAt: at, confirmedAt: at, undoable: null },
      });
    });
  const corpus = { short: make("short", 3), long: make("long", 2), unrecorded: make(null, 4) };
  await animalRepo(db).insertMany(
    [...corpus.short, ...corpus.long, ...corpus.unrecorded].map((animal) => ({ animal, cityId })),
  );
  return corpus;
}

const furFilter = (values: readonly [CoatLength, ...CoatLength[]]): FeedFilters => ({
  ...NO_FILTERS,
  coatLengths: { kind: "oneOf", values },
});

const ids = (animals: readonly { id: string }[]): string[] => animals.map((a) => a.id).sort();

describe("animals.coat_length (migration 0014)", () => {
  it("is a nullable text column with no default, so no existing row gained a value", async () => {
    const rows = await db.execute<{
      is_nullable: string;
      column_default: string | null;
      data_type: string;
    }>(
      sql`SELECT is_nullable, column_default, data_type FROM information_schema.columns
          WHERE table_name = 'animals' AND column_name = 'coat_length'`,
    );
    expect(Array.from(rows)).toEqual([
      { is_nullable: "YES", column_default: null, data_type: "text" },
    ]);
  });

  it("round-trips short, long and unrecorded on a published animal", async () => {
    const corpus = await seedFur();
    for (const [expected, animals] of [
      ["short", corpus.short],
      ["long", corpus.long],
      [null, corpus.unrecorded],
    ] as const) {
      for (const animal of animals) {
        expect((await animalRepo(db).findById(animal.id))?.coatLength).toBe(expected);
      }
    }
  });
});

describe("the fur filter in the shared predicate (DR1-D11)", () => {
  it("the gallery lists only the chosen fur, never an unrecorded one", async () => {
    const corpus = await seedFur();
    const list = (filters: FeedFilters) =>
      galleryRepo(db).list({
        filters,
        scope: EVERYONE_SCOPE,
        sort: "freshest",
        page: 1,
        pageSize: 24,
        now: NOW,
      });

    expect(ids((await list(furFilter(["long"]))).items)).toEqual(ids(corpus.long));
    expect(ids((await list(furFilter(["short"]))).items)).toEqual(ids(corpus.short));
    expect((await list(NO_FILTERS)).totalMatching).toBe(9);
  });

  it("the deck serves only the chosen fur", async () => {
    const corpus = await seedFur();
    const page = await feedRepo(db).list({
      filters: furFilter(["short"]),
      cursor: null,
      limit: 20,
      adopterId: null,
      now: NOW,
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    });
    expect(ids(page.items)).toEqual(ids(corpus.short));
  });

  it("the fur relaxation is the unfiltered count minus the filtered one, unrecorded included", async () => {
    await seedFur();
    const counts = await galleryRepo(db).relaxationCounts({
      filters: furFilter(["long"]),
      now: NOW,
    });
    expect(counts.current).toBe(2);
    expect(counts.relaxations).toEqual([{ dimension: "coatLengths", additional: 9 - 2 }]);
  });

  it("relaxes fur alongside another dimension, each from the same predicate", async () => {
    await seedFur();
    const counts = await galleryRepo(db).relaxationCounts({
      filters: { ...furFilter(["short"]), species: { kind: "oneOf", values: ["cat"] } },
      now: NOW,
    });
    // Every fixture animal is a dog: no cat matches, dropping the species
    // filter shows the 3 short-haired dogs, dropping fur shows no cat at all.
    expect(counts.current).toBe(0);
    expect(new Map(counts.relaxations.map((r) => [r.dimension, r.additional]))).toEqual(
      new Map([
        ["species", 3],
        ["coatLengths", 0],
      ]),
    );
  });
});

describe("writeEditIf and fur", () => {
  const editedLine = (animalId: string) => ({
    id: randomUUID(),
    entry: {
      kind: "animal_edited" as const,
      at: NOW,
      actor: {
        kind: "shelter_admin" as const,
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      },
      animalId: animalId as never,
      animalName: "Ластівка",
      fields: ["name" as const],
    },
  });

  it("records fur on a published animal and clears it again, with no draft condition", async () => {
    const { shelterId, cityId } = await place();
    const listed = makeAnimal({ shelterId, coatLength: null });
    await animalRepo(db).insert(listed, cityId);
    const repo = kabinetAnimalRepo(db);

    expect(
      await repo.writeEditIf({ ...listed, coatLength: "long" }, cityId, 0, editedLine(listed.id)),
    ).toEqual({ kind: "ok" });
    expect((await animalRepo(db).findById(listed.id))?.coatLength).toBe("long");

    // Unrecorded is a complete answer (DR1-D10), so clearing it is not a
    // listing-fact null and lands on a published row.
    expect(
      await repo.writeEditIf(
        { ...listed, coatLength: null, version: 1 },
        cityId,
        1,
        editedLine(listed.id),
      ),
    ).toEqual({ kind: "ok" });
    const after = await animalRepo(db).findById(listed.id);
    expect(after?.coatLength).toBeNull();
    expect(after?.listing.kind).toBe("published");
  });
});
