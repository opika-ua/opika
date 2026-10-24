import { randomUUID } from "node:crypto";
import {
  type Animal,
  type AnimalListingState,
  type Shelter,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  transitionListing,
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

async function seeded(): Promise<{ animal: Animal; cityId: string; shelter: Shelter }> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id });
  await animalRepo(db).insert(animal, city.id);
  return { animal, cityId: city.id, shelter };
}

const ACTOR = {
  kind: "shelter_admin",
  shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
} as const;
const AT = new Date("2026-10-13T09:00:00.000Z");
const LATER = new Date("2026-10-13T11:00:00.000Z");

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
    const { animal, shelter } = await seeded();
    const at = new Date("2026-10-13T10:00:00.000Z");
    const next = { ...animal.listing, confirmedAt: at, undoable: null } as AnimalListingState;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        animal.id,
        next,
        animal.listing,
        shelter.verification,
        AT,
        CONFIRMATION,
      ),
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
    const { animal, shelter } = await seeded();
    const first = {
      ...animal.listing,
      confirmedAt: new Date("2026-10-13T10:00:00.000Z"),
    } as AnimalListingState;
    await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      first,
      animal.listing,
      shelter.verification,
      AT,
      CONFIRMATION,
    );

    const stale = {
      ...animal.listing,
      confirmedAt: new Date("2026-10-13T11:00:00.000Z"),
    } as AnimalListingState;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        animal.id,
        stale,
        animal.listing,
        shelter.verification,
        AT,
        CONFIRMATION,
      ),
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
    const { animal, cityId, shelter } = await seeded();
    const confirmed = {
      ...animal.listing,
      confirmedAt: new Date("2026-10-13T10:00:00.000Z"),
    } as AnimalListingState;
    await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      confirmed,
      animal.listing,
      shelter.verification,
      AT,
      CONFIRMATION,
    );

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

  it("writes photos, last_updated_at and the listing it is handed, never version, with one photos line", async () => {
    const animal = await withPhotos();
    const read = await animalRepo(db).findById(animal.id);
    if (read === null) throw new Error("seeded animal missing");
    const historyBefore = (await historyOf(animal)).length;

    const result = await kabinetAnimalRepo(db).writePhotosIf(
      animal.id,
      { next: [photo("b"), photo("a")], expected: read.photos },
      { next: read.listing, expected: read.listing },
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
      { next: [photo("a")], expected: [photo("a"), photo("c")] },
      { next: animal.listing, expected: animal.listing },
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
        { next: [], expected: [photo("b"), photo("a")] },
        { next: animal.listing, expected: animal.listing },
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
    const { animal, shelter } = await seeded();
    const published = animal.listing.kind === "published" ? animal.listing.publishedAt : null;
    expect(await firstPublishedOf(animal.id)).toEqual(published);
    await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      { kind: "draft" },
      animal.listing,
      shelter.verification,
      AT,
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
    const { animal, shelter } = await seeded();
    await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      { kind: "draft" },
      animal.listing,
      shelter.verification,
      AT,
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
    const { animal, shelter } = await seeded();
    const line = movedLine(animal, "published", "draft");
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        animal.id,
        { kind: "draft" },
        animal.listing,
        shelter.verification,
        AT,
        line,
      ),
    ).toEqual({ kind: "ok" });
    expect(await historyOf(animal)).toEqual([line.kind === "recorded" ? line.row.entry : null]);

    // Planned on the published listing that is no longer there.
    const conflict = await kabinetAnimalRepo(db).writeListingIf(
      animal.id,
      { kind: "draft" },
      animal.listing,
      shelter.verification,
      AT,
      movedLine(animal, "published", "draft"),
    );
    expect(conflict).toEqual({ kind: "conflict" });
    expect(await kinds(animal)).toEqual(["animal_listing_changed"]);
  });

  /** S1: «Ще шукає» and its undo move the listing and record nothing. */
  it("a confirmation moves the listing and records no line", async () => {
    const { animal, shelter } = await seeded();
    const next = { ...animal.listing, confirmedAt: AT, undoable: null } as AnimalListingState;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        animal.id,
        next,
        animal.listing,
        shelter.verification,
        AT,
        CONFIRMATION,
      ),
    ).toEqual({ kind: "ok" });
    const after = await animalRepo(db).findById(animal.id);
    expect(after && confirmedAt(after.listing)).toEqual(AT);
    expect(await kinds(animal)).toEqual([]);
  });

  it("a deleted draft records animal_deleted; a refused one records nothing", async () => {
    const { animal, cityId, shelter } = await seeded();
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
      shelter.verification,
      AT,
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

/**
 * K2's list (HS-T8: most recently edited first), its chip counts and N5's
 * stale cut, read at the repository: one shelter's rows only, keyset never
 * OFFSET, and the stale filter and count drawing on one predicate.
 */
describe("kabinetAnimalRepo.listPage, countsByKind and staleCount (K2)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date("2026-10-18T12:00:00.000Z");
  const STALE_BEFORE = new Date(NOW.getTime() - 31 * DAY);
  const edited = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
  const visible = (kind: "published" | "reserved", confirmedAt: Date): AnimalListingState =>
    kind === "published"
      ? { kind, publishedAt: confirmedAt, confirmedAt, undoable: null }
      : { kind, since: confirmedAt, publishedAt: confirmedAt, confirmedAt, undoable: null };

  /** One shelter's inventory, each kind present, with two rows tied on edit time. */
  async function inventory() {
    const { animal: first, cityId } = await seeded();
    const shelterId = first.shelterId;
    const add = async (overrides: Parameters<typeof makeAnimal>[0]) => {
      const animal = makeAnimal({ shelterId, ...overrides });
      await animalRepo(db).insert(animal, cityId as never);
      return animal;
    };
    // `seeded`'s own animal is published, confirmed and edited at the fixture's
    // date (2026-08-01): stale at this cut-off, and the oldest edit on the page.
    const staleShown = await add({
      lastUpdatedAt: edited(1),
      listing: visible("published", new Date(STALE_BEFORE.getTime() - DAY)),
    });
    const staleReserved = await add({
      lastUpdatedAt: edited(2),
      listing: visible("reserved", STALE_BEFORE),
    });
    const freshShown = await add({
      lastUpdatedAt: edited(2),
      listing: visible("published", new Date(STALE_BEFORE.getTime() + 1)),
    });
    const draft = await add({ lastUpdatedAt: edited(3), listing: { kind: "draft" } });
    const adopted = await add({
      lastUpdatedAt: edited(4),
      listing: { kind: "adopted", adoptedAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const withdrawn = await add({
      lastUpdatedAt: edited(5),
      listing: {
        kind: "withdrawn",
        withdrawnAt: new Date("2026-01-01T00:00:00.000Z"),
        reason: { code: "other", note: null },
      },
    });
    // Another shelter's stale card: never on this shelter's page, never in its counts.
    const other = await seeded();
    await animalRepo(db).insert(
      makeAnimal({
        shelterId: other.animal.shelterId,
        listing: visible("published", new Date("2026-01-01T00:00:00.000Z")),
      }),
      other.cityId as never,
    );
    return { shelterId, first, staleShown, staleReserved, freshShown, draft, adopted, withdrawn };
  }

  type Filter = Parameters<ReturnType<typeof kabinetAnimalRepo>["listPage"]>[0]["filter"];
  const pagedIds = async (shelterId: Animal["shelterId"], filter: Filter, limit: number) => {
    const ids: string[] = [];
    let after: Parameters<ReturnType<typeof kabinetAnimalRepo>["listPage"]>[0]["after"] = null;
    for (let page = 0; page < 20; page += 1) {
      const result = await kabinetAnimalRepo(db).listPage({ shelterId, filter, after, limit });
      expect(result.items.length).toBeLessThanOrEqual(limit);
      ids.push(...result.items.map((animal) => animal.id));
      after = result.next;
      if (after === null) return ids;
    }
    throw new Error("the keyset never ended");
  };

  /** Every row once, in (last_updated_at DESC, id DESC) order, the tie broken by id. */
  const byEditThenId = (animals: Animal[]) =>
    [...animals]
      .sort(
        (a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime() || (a.id < b.id ? 1 : -1),
      )
      .map((animal) => animal.id);

  it("pages one shelter's animals by last edit, every row exactly once, ties broken by id", async () => {
    const inv = await inventory();
    const all = [
      inv.first,
      inv.staleShown,
      inv.staleReserved,
      inv.freshShown,
      inv.draft,
      inv.adopted,
      inv.withdrawn,
    ];
    for (const limit of [1, 2, 3, 50]) {
      expect(await pagedIds(inv.shelterId, { kind: "all" }, limit), `pages of ${limit}`).toEqual(
        byEditThenId(all),
      );
    }
  });

  it("a listing filter pages that kind only", async () => {
    const inv = await inventory();
    expect(await pagedIds(inv.shelterId, { kind: "listing", listing: "published" }, 1)).toEqual(
      byEditThenId([inv.first, inv.staleShown, inv.freshShown]),
    );
    expect(await pagedIds(inv.shelterId, { kind: "listing", listing: "draft" }, 1)).toEqual([
      inv.draft.id,
    ]);
  });

  /**
   * N5: a visible card confirmed at or before the cut-off, published or
   * reserved, and nothing else. The filter's rows and the strip's count are
   * the same set.
   */
  it("the stale filter lists exactly what staleCount counts, at the same cut-off", async () => {
    const inv = await inventory();
    const filter = { kind: "stale", staleBefore: STALE_BEFORE } as const;
    const stale = await pagedIds(inv.shelterId, filter, 1);
    expect(stale).toEqual(byEditThenId([inv.first, inv.staleShown, inv.staleReserved]));
    expect(await kabinetAnimalRepo(db).staleCount(inv.shelterId, STALE_BEFORE)).toBe(stale.length);
  });

  it("counts every kind for this shelter only, zero where absent", async () => {
    const inv = await inventory();
    expect(await kabinetAnimalRepo(db).countsByKind(inv.shelterId)).toEqual({
      draft: 1,
      published: 3,
      reserved: 1,
      adopted: 1,
      withdrawn: 1,
    });
  });
});

/**
 * S8-F5, hook 1: `writeListingIf` is the only place `listing_kind` moves
 * out of `draft`. A publish stamps `everServedAt` immediately if the
 * shelter is already verified; if not, it's left for hook 2
 * (`kabinetShelterRepo.applyAuditedMany`) to stamp whenever that shelter
 * later actually becomes verified.
 */
describe("S8-F5: everServedAt (hook 1, writeListingIf's publish)", () => {
  const PENDING = {
    status: "pending" as const,
    submittedAt: new Date("2026-08-01T00:00:00.000Z"),
    evidence: { items: [], submittedAt: new Date("2026-08-01T00:00:00.000Z") },
  };

  async function draftAt(
    verification: typeof PENDING | ReturnType<typeof makeShelter>["verification"],
  ) {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      verification,
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const draft = makeAnimal({
      shelterId: shelter.id,
      listing: { kind: "draft" },
      everServedAt: null,
      photos: [{ storageKey: "animals/s8f5/a", width: 800, height: 1000, alt: null }],
    });
    await animalRepo(db).insert(draft, city.id);
    return { shelter, draft, cityId: city.id };
  }

  it("publishing at an already-verified shelter stamps everServedAt immediately", async () => {
    const { shelter, draft } = await draftAt(makeShelter().verification);
    const published = transitionListing(draft.listing, { type: "publish", at: AT });
    if (published.kind !== "ok") throw new Error("publish refused");
    await kabinetAnimalRepo(db).writeListingIf(
      draft.id,
      published.next,
      draft.listing,
      shelter.verification,
      AT,
      movedLine(draft, "draft", "published"),
      { kind: "publish", expectedVersion: draft.version },
    );
    expect((await animalRepo(db).findById(draft.id))?.everServedAt).toEqual(AT);
  });

  it("publishing at a pending (not yet verified) shelter leaves everServedAt null", async () => {
    const { shelter, draft } = await draftAt(PENDING);
    const published = transitionListing(draft.listing, { type: "publish", at: AT });
    if (published.kind !== "ok") throw new Error("publish refused");
    await kabinetAnimalRepo(db).writeListingIf(
      draft.id,
      published.next,
      draft.listing,
      shelter.verification,
      AT,
      movedLine(draft, "draft", "published"),
      { kind: "publish", expectedVersion: draft.version },
    );
    expect((await animalRepo(db).findById(draft.id))?.everServedAt).toBeNull();
  });

  it("a later move at the same still-unverified shelter doesn't retroactively set it", async () => {
    const { shelter, draft } = await draftAt(PENDING);
    const published = transitionListing(draft.listing, { type: "publish", at: AT });
    if (published.kind !== "ok") throw new Error("publish refused");
    await kabinetAnimalRepo(db).writeListingIf(
      draft.id,
      published.next,
      draft.listing,
      shelter.verification,
      AT,
      movedLine(draft, "draft", "published"),
      { kind: "publish", expectedVersion: draft.version },
    );
    const afterPublish = await animalRepo(db).findById(draft.id);
    if (!afterPublish) throw new Error("vanished");
    const confirmed = {
      ...afterPublish.listing,
      confirmedAt: LATER,
      undoable: null,
    } as AnimalListingState;
    await kabinetAnimalRepo(db).writeListingIf(
      draft.id,
      confirmed,
      afterPublish.listing,
      shelter.verification,
      LATER,
      CONFIRMATION,
    );
    expect((await animalRepo(db).findById(draft.id))?.everServedAt).toBeNull();
  });
});
