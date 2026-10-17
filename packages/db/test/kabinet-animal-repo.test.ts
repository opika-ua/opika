import { randomUUID } from "node:crypto";
import type {
  Animal,
  AnimalListingState,
  ShelterAdminId,
  ShelterHistoryEntry,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import {
  type AnimalHistoryRow,
  kabinetAnimalRepo,
  type ListingMoveHistory,
} from "../src/repos/kabinet-animal-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { swipeRepo } from "../src/repos/swipe-repo";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeShelter,
  makeSwipe,
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

const ACTOR = {
  kind: "shelter_admin",
  shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
} as const;
const AT = new Date("2026-10-13T09:00:00.000Z");

const historyOf = (animal: Animal): Promise<ShelterHistoryEntry[]> =>
  kabinetShelterRepo(db).historyOf(animal.shelterId);

const editedLine = (animal: Animal): AnimalHistoryRow<"animal_edited"> => ({
  id: randomUUID(),
  entry: {
    kind: "animal_edited",
    at: AT,
    actor: ACTOR,
    animalId: animal.id,
    animalName: "Нове",
    fields: ["name"],
  },
});
const movedLine = (
  animal: Animal,
  from: AnimalListingState["kind"],
  to: AnimalListingState["kind"],
): ListingMoveHistory => ({
  kind: "recorded",
  row: {
    id: randomUUID(),
    entry: {
      kind: "animal_listing_changed",
      at: AT,
      actor: ACTOR,
      animalId: animal.id,
      animalName: animal.name,
      event: { type: "restore_to_draft" },
      from,
      to,
    },
  },
});
const CONFIRMATION: ListingMoveHistory = { kind: "not_recorded", because: "confirmation" };
const deletedLine = (animal: Animal): AnimalHistoryRow<"animal_deleted"> => ({
  id: randomUUID(),
  entry: {
    kind: "animal_deleted",
    at: AT,
    actor: ACTOR,
    animalId: animal.id,
    animalName: animal.name,
  },
});

const confirmedAt = (listing: AnimalListingState) =>
  listing.kind === "published" || listing.kind === "reserved" ? listing.confirmedAt : null;

describe("kabinetAnimalRepo.writeListingIf", () => {
  it("writes the listing and its derived columns, never last_updated_at", async () => {
    const { animal } = await seeded();
    const at = new Date("2026-10-13T10:00:00.000Z");
    const next = { ...animal.listing, confirmedAt: at, undoable: null } as AnimalListingState;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(animal.id, next, animal.listing, CONFIRMATION),
    ).toEqual({
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
    await kabinetAnimalRepo(db).writeListingIf(animal.id, first, animal.listing, CONFIRMATION);

    const stale = {
      ...animal.listing,
      confirmedAt: new Date("2026-10-13T11:00:00.000Z"),
    } as AnimalListingState;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(animal.id, stale, animal.listing, CONFIRMATION),
    ).toEqual({
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
    await kabinetAnimalRepo(db).writeListingIf(animal.id, confirmed, animal.listing, CONFIRMATION);

    const edited: Animal = {
      ...animal,
      name: "Нове",
      lastUpdatedAt: new Date("2026-10-13T12:00:00.000Z"),
    };
    expect(
      await kabinetAnimalRepo(db).writeEditIf(
        edited,
        cityId as never,
        animal.version,
        editedLine(animal),
      ),
    ).toEqual({
      kind: "ok",
    });
    const after = await animalRepo(db).findById(animal.id);
    expect(after?.name).toBe("Нове");
    // An edit bumps the guard by exactly one (S3-T6).
    expect(after?.version).toBe(animal.version + 1);
    expect(after && confirmedAt(after.listing)).toEqual(new Date("2026-10-13T10:00:00.000Z"));
  });

  it("refuses an edit from a stale read", async () => {
    const { animal, cityId } = await seeded();
    const edited: Animal = { ...animal, name: "Нове", lastUpdatedAt: new Date() };
    expect(
      await kabinetAnimalRepo(db).writeEditIf(
        edited,
        cityId as never,
        animal.version + 5,
        editedLine(animal),
      ),
    ).toEqual({ kind: "conflict" });
  });
});

describe("kabinetAnimalRepo.writePhotosIf (P-Q3)", () => {
  const photo = (id: string) => ({
    storageKey: `animals/x/${id}`,
    width: 800,
    height: 1000,
    alt: null,
  });
  const photosLine = (animal: Animal): AnimalHistoryRow<"animal_edited"> => ({
    id: randomUUID(),
    entry: {
      kind: "animal_edited",
      at: AT,
      actor: ACTOR,
      animalId: animal.id,
      animalName: animal.name,
      fields: ["photos"],
    },
  });

  async function withPhotos(): Promise<Animal> {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id, photos: [photo("a"), photo("b")] });
    await animalRepo(db).insert(animal, city.id);
    return animal;
  }

  it("writes photos and last_updated_at, never version or the listing, with one photos line", async () => {
    const animal = await withPhotos();
    const read = await animalRepo(db).findById(animal.id);
    if (read === null) throw new Error("seeded animal missing");
    const historyBefore = (await historyOf(animal)).length;

    const result = await kabinetAnimalRepo(db).writePhotosIf(
      animal.id,
      [photo("b"), photo("a")],
      read.photos,
      AT,
      photosLine(animal),
    );

    expect(result).toEqual({ kind: "ok" });
    const after = await animalRepo(db).findById(animal.id);
    expect(after?.photos.map((p) => p.storageKey)).toEqual(["animals/x/b", "animals/x/a"]);
    expect(after?.lastUpdatedAt).toEqual(AT);
    expect(after?.version).toBe(read.version);
    expect(after?.listing).toEqual(read.listing);
    const lines = (await historyOf(animal)).slice(historyBefore);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: "animal_edited", fields: ["photos"] });
  });

  it("a stale photo list writes nothing and records nothing", async () => {
    const animal = await withPhotos();
    const historyBefore = (await historyOf(animal)).length;

    const result = await kabinetAnimalRepo(db).writePhotosIf(
      animal.id,
      [photo("a")],
      [photo("a"), photo("c")],
      AT,
      photosLine(animal),
    );

    expect(result).toEqual({ kind: "conflict" });
    const after = await animalRepo(db).findById(animal.id);
    expect(after?.photos.map((p) => p.storageKey)).toEqual(["animals/x/a", "animals/x/b"]);
    expect((await historyOf(animal)).length).toBe(historyBefore);
  });

  it("the order is part of the token: the same photos in another order conflict", async () => {
    const animal = await withPhotos();
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        animal.id,
        [],
        [photo("b"), photo("a")],
        AT,
        photosLine(animal),
      ),
    ).toEqual({ kind: "conflict" });
  });
});

describe("first_published_at is never cleared (HS-Q9)", () => {
  const firstPublishedOf = async (id: string) => {
    const [row] = await db.query.animals.findMany({ where: (t, { eq }) => eq(t.id, id as never) });
    return row?.firstPublishedAt ?? null;
  };

  it("is set on insert of a published listing, and survives a listing move back to draft", async () => {
    const { animal } = await seeded();
    const published = animal.listing.kind === "published" ? animal.listing.publishedAt : null;
    expect(await firstPublishedOf(animal.id)).toEqual(published);
    await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      { kind: "draft" },
      animal.listing,
      movedLine(animal, "published", "draft"),
    );
    expect(await firstPublishedOf(animal.id)).toEqual(published);
  });

  it("survives a full-row update to a draft through animalRepo.update", async () => {
    const { animal, cityId } = await seeded();
    const published = animal.listing.kind === "published" ? animal.listing.publishedAt : null;
    await animalRepo(db).update({ ...animal, listing: { kind: "draft" } }, cityId as never);
    expect(await firstPublishedOf(animal.id)).toEqual(published);
  });
});

describe("kabinetAnimalRepo.deleteDraftIf (HS-Q9)", () => {
  /** The repo's own guard, independent of the handler's earlier check. */
  it("won't delete a draft whose first_published_at is set", async () => {
    const { animal } = await seeded();
    await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      { kind: "draft" },
      animal.listing,
      movedLine(animal, "published", "draft"),
    );
    expect(
      await kabinetAnimalRepo(db).deleteDraftIf(animal.id, animal.version, deletedLine(animal)),
    ).toEqual({
      kind: "not_deleted",
    });
    expect(await animalRepo(db).findById(animal.id)).not.toBeNull();
  });
});

/**
 * K-Q7: each shelter animal write records its history line in the write's own
 * statement. A refused write, by conflict or by the database, leaves neither
 * the change nor the line.
 */
describe("a shelter animal write and its history line are one statement (K-Q7)", () => {
  const kinds = async (animal: Animal) =>
    (await historyOf(animal)).map((entry) => entry.kind).filter((k) => k.startsWith("animal_"));

  it("insert records animal_created with the draft", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const draft = makeAnimal({ shelterId: shelter.id, listing: { kind: "draft" } });
    const line = {
      id: randomUUID(),
      entry: {
        kind: "animal_created",
        at: AT,
        actor: ACTOR,
        animalId: draft.id,
        animalName: draft.name,
      },
    } as const;
    await kabinetAnimalRepo(db).insert(draft, city.id as never, line);
    expect(await animalRepo(db).findById(draft.id)).not.toBeNull();
    expect(await historyOf(draft)).toEqual([line.entry]);
  });

  it("an edit records animal_edited; a stale edit records nothing", async () => {
    const { animal, cityId } = await seeded();
    const edited: Animal = { ...animal, name: "Нове", lastUpdatedAt: AT };
    const line = editedLine(animal);
    await kabinetAnimalRepo(db).writeEditIf(edited, cityId as never, animal.version, line);
    expect(await historyOf(animal)).toEqual([line.entry]);

    const stale = await kabinetAnimalRepo(db).writeEditIf(
      { ...animal, name: "Застаріле" },
      cityId as never,
      animal.version,
      editedLine(animal),
    );
    expect(stale).toEqual({ kind: "conflict" });
    expect(await kinds(animal)).toEqual(["animal_edited"]);
    expect((await animalRepo(db).findById(animal.id))?.name).toBe("Нове");
  });

  it("a recorded move writes its line; a conflicting one writes neither row nor line", async () => {
    const { animal } = await seeded();
    const line = movedLine(animal, "published", "draft");
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        animal.id,
        { kind: "draft" },
        animal.listing,
        line,
      ),
    ).toEqual({ kind: "ok" });
    expect(await historyOf(animal)).toEqual([line.kind === "recorded" ? line.row.entry : null]);

    // Planned on the published listing that is no longer there.
    const conflict = await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      { kind: "draft" },
      animal.listing,
      movedLine(animal, "published", "draft"),
    );
    expect(conflict).toEqual({ kind: "conflict" });
    expect(await kinds(animal)).toEqual(["animal_listing_changed"]);
  });

  /** S1: «Ще шукає» and its undo move the listing and record nothing. */
  it("a confirmation moves the listing and records no line", async () => {
    const { animal } = await seeded();
    const next = { ...animal.listing, confirmedAt: AT, undoable: null } as AnimalListingState;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(animal.id, next, animal.listing, CONFIRMATION),
    ).toEqual({ kind: "ok" });
    const after = await animalRepo(db).findById(animal.id);
    expect(after && confirmedAt(after.listing)).toEqual(AT);
    expect(await kinds(animal)).toEqual([]);
  });

  it("a deleted draft records animal_deleted; a refused one records nothing", async () => {
    const { animal, cityId } = await seeded();
    const draft = makeAnimal({ shelterId: animal.shelterId, listing: { kind: "draft" } });
    await animalRepo(db).insert(draft, cityId as never);
    const line = deletedLine(draft);
    expect(await kabinetAnimalRepo(db).deleteDraftIf(draft.id, draft.version, line)).toEqual({
      kind: "ok",
    });
    expect(await animalRepo(db).findById(draft.id)).toBeNull();
    expect(await historyOf(draft)).toEqual([line.entry]);

    // Once public: the repo's own guard refuses, and no line is written.
    await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      { kind: "draft" },
      animal.listing,
      CONFIRMATION,
    );
    expect(
      await kabinetAnimalRepo(db).deleteDraftIf(animal.id, animal.version, deletedLine(animal)),
    ).toEqual({ kind: "not_deleted" });
    expect(await kinds(animal)).toEqual(["animal_deleted"]);
  });

  /**
   * The delete runs inside a CTE now, and the foreign key is still checked:
   * 23503 still reaches the catch as `referenced`, and the line inserted by the
   * same statement goes with it.
   */
  it("a draft a swipe references comes back referenced, kept, with no line", async () => {
    const { animal, cityId } = await seeded();
    const draft = makeAnimal({ shelterId: animal.shelterId, listing: { kind: "draft" } });
    await animalRepo(db).insert(draft, cityId as never);
    const adopter = makeAdopter();
    await adopterRepo(db).insert(adopter);
    await swipeRepo(db).record(makeSwipe({ adopterId: adopter.id, animalId: draft.id, at: AT }));
    expect(
      await kabinetAnimalRepo(db).deleteDraftIf(draft.id, draft.version, deletedLine(draft)),
    ).toEqual({ kind: "referenced" });
    expect(await animalRepo(db).findById(draft.id)).not.toBeNull();
    expect(await kinds(draft)).toEqual([]);
  });
});
