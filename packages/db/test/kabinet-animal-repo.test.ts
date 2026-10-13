import type { Animal, AnimalListingState } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
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

async function seeded(): Promise<{ animal: Animal; cityId: string }> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id });
  await animalRepo(db).insert(animal, city.id);
  return { animal, cityId: city.id };
}

const confirmedAt = (listing: AnimalListingState) =>
  listing.kind === "published" || listing.kind === "reserved" ? listing.confirmedAt : null;

describe("kabinetAnimalRepo.writeListingIf", () => {
  it("writes the listing and its derived columns, never last_updated_at", async () => {
    const { animal } = await seeded();
    const at = new Date("2026-10-13T10:00:00.000Z");
    const next = { ...animal.listing, confirmedAt: at, undoable: null } as AnimalListingState;
    expect(await kabinetAnimalRepo(db).writeListingIf(animal.id, next, animal.listing)).toEqual({
      kind: "ok",
    });
    const after = await animalRepo(db).findById(animal.id);
    expect(after && confirmedAt(after.listing)).toEqual(at);
    expect(after?.lastUpdatedAt).toEqual(animal.lastUpdatedAt);
    const [row] = await db.query.animals.findMany({ where: (t, { eq }) => eq(t.id, animal.id) });
    expect(row?.lastConfirmedAt).toEqual(at);
  });

  /** The listing is its own compare-and-set token: a move planned on an older listing writes nothing. */
  it("refuses when the stored listing is no longer the one the move was planned on", async () => {
    const { animal } = await seeded();
    const first = {
      ...animal.listing,
      confirmedAt: new Date("2026-10-13T10:00:00.000Z"),
    } as AnimalListingState;
    await kabinetAnimalRepo(db).writeListingIf(animal.id, first, animal.listing);

    const stale = {
      ...animal.listing,
      confirmedAt: new Date("2026-10-13T11:00:00.000Z"),
    } as AnimalListingState;
    expect(await kabinetAnimalRepo(db).writeListingIf(animal.id, stale, animal.listing)).toEqual({
      kind: "conflict",
    });
    const after = await animalRepo(db).findById(animal.id);
    expect(after && confirmedAt(after.listing)).toEqual(new Date("2026-10-13T10:00:00.000Z"));
  });
});

describe("kabinetAnimalRepo.writeEditIf", () => {
  /** Disjoint from listing moves: an edit planned before a confirm can't write the old listing back. */
  it("never writes the listing, even when handed an older one", async () => {
    const { animal, cityId } = await seeded();
    const confirmed = {
      ...animal.listing,
      confirmedAt: new Date("2026-10-13T10:00:00.000Z"),
    } as AnimalListingState;
    await kabinetAnimalRepo(db).writeListingIf(animal.id, confirmed, animal.listing);

    const edited: Animal = {
      ...animal,
      name: "Нове",
      lastUpdatedAt: new Date("2026-10-13T12:00:00.000Z"),
    };
    expect(
      await kabinetAnimalRepo(db).writeEditIf(edited, cityId as never, animal.lastUpdatedAt),
    ).toEqual({
      kind: "ok",
    });
    const after = await animalRepo(db).findById(animal.id);
    expect(after?.name).toBe("Нове");
    expect(after && confirmedAt(after.listing)).toEqual(new Date("2026-10-13T10:00:00.000Z"));
  });

  it("refuses an edit from a stale read", async () => {
    const { animal, cityId } = await seeded();
    const edited: Animal = { ...animal, name: "Нове", lastUpdatedAt: new Date() };
    expect(
      await kabinetAnimalRepo(db).writeEditIf(edited, cityId as never, new Date("2020-01-01")),
    ).toEqual({ kind: "conflict" });
  });
});
