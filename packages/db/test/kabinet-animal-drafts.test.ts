import { randomUUID } from "node:crypto";
import {
  type AnimalListingState,
  type CityId,
  type DraftAnimal,
  type ListedAnimal,
  listingAfterPhotoChange,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  transitionListing,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import {
  type AnimalHistoryRow,
  isCheckViolation,
  kabinetAnimalRepo,
  type ListingMoveHistory,
} from "../src/repos/kabinet-animal-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { animalToRowWithCity, rowToAnimal, rowToDiscoverableAnimal } from "../src/repos/mappers";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * F-B1's storage (migration 0012) and the compare-and-sets K3 relies on:
 * the three CHECKs, the draft-only null guard on edits, the publish guard
 * (K3-T7) and RH-B7's photo write. Local Postgres; the same statements run on
 * Neon as `neon-smoke.ts` steps 27–31.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const ACTOR = {
  kind: "shelter_admin",
  shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
} as const;
const AT = new Date("2026-10-17T09:00:00.000Z");
const LATER = new Date("2026-10-17T10:00:00.000Z");
const PHOTO = (id: string) => ({
  storageKey: `animals/x/${id}`,
  width: 800,
  height: 1000,
  alt: null,
});

async function place(): Promise<{ shelterId: ListedAnimal["shelterId"]; cityId: CityId }> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  return { shelterId: shelter.id, cityId: city.id };
}

const historyOf = (shelterId: string): Promise<ShelterHistoryEntry[]> =>
  kabinetShelterRepo(db).historyOf(shelterId as never);

const editedLine = (
  animalId: string,
  fields: AnimalHistoryRow<"animal_edited">["entry"]["fields"],
): AnimalHistoryRow<"animal_edited"> => ({
  id: randomUUID(),
  entry: {
    kind: "animal_edited",
    at: AT,
    actor: ACTOR,
    animalId: animalId as never,
    animalName: "Ластівка",
    fields,
  },
});

const publishLine = (animalId: string): ListingMoveHistory => ({
  kind: "recorded",
  row: {
    id: randomUUID(),
    entry: {
      kind: "animal_listing_changed",
      at: AT,
      actor: ACTOR,
      animalId: animalId as never,
      animalName: "Ластівка",
      event: { type: "publish" },
      from: "draft",
      to: "published",
    },
  },
});

const publishedAt = (at: Date): AnimalListingState => {
  const result = transitionListing({ kind: "draft" }, { type: "publish", at });
  if (result.kind !== "ok") throw new Error("publish refused");
  return result.next;
};

/** The first error a promise rejects with, or null when it resolves. */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

describe("migration 0012's CHECKs refuse what the union refuses (23514)", () => {
  const rowOf = (animal: ListedAnimal | DraftAnimal, cityId: CityId) =>
    animalToRowWithCity(animal, cityId);

  it("a published row with no size", async () => {
    const { shelterId, cityId } = await place();
    const row = { ...rowOf(makeAnimal({ shelterId }), cityId), size: null };
    const error = await failureOf(db.insert(animals).values(row));
    expect(isCheckViolation(error)).toBe(true);
  });

  it.each([
    ["age", { age: null, ageAnchorAt: null }],
    ["description", { descriptionUk: null }],
  ] as const)("a reserved row with no %s", async (_fact, without) => {
    const { shelterId, cityId } = await place();
    const reserved = makeAnimal({
      shelterId,
      listing: { kind: "reserved", since: AT, publishedAt: AT, confirmedAt: AT, undoable: null },
    });
    const error = await failureOf(
      db.insert(animals).values({ ...rowOf(reserved, cityId), ...without }),
    );
    expect(isCheckViolation(error)).toBe(true);
  });

  it("an age with no anchor, even on a draft", async () => {
    const { shelterId, cityId } = await place();
    const row = {
      ...rowOf(makeAnimal({ shelterId, listing: { kind: "draft" } }), cityId),
      ageAnchorAt: null,
    };
    expect(isCheckViolation(await failureOf(db.insert(animals).values(row)))).toBe(true);
  });

  it("an English description with no Ukrainian, even on a draft", async () => {
    const { shelterId, cityId } = await place();
    const row = {
      ...rowOf(makeDraftAnimal({ shelterId }), cityId),
      descriptionEnText: "Calm, likes walks.",
      descriptionEnProvenance: "human" as const,
    };
    expect(isCheckViolation(await failureOf(db.insert(animals).values(row)))).toBe(true);
  });

  it("a name-and-species draft with every fact null goes in, and reads back as a draft with nulls", async () => {
    const { shelterId, cityId } = await place();
    const draft = makeDraftAnimal({ shelterId });
    await animalRepo(db).insert(draft, cityId);
    const [row] = await db.select().from(animals).where(eq(animals.id, draft.id));
    expect(row).toMatchObject({ size: null, age: null, ageAnchorAt: null, descriptionUk: null });
    expect(await animalRepo(db).findById(draft.id)).toEqual(draft);
  });

  it("is told apart from a foreign-key refusal", async () => {
    const { cityId } = await place();
    const orphan = rowOf(makeAnimal({ shelterId: randomUUID() as never }), cityId);
    const error = await failureOf(db.insert(animals).values(orphan));
    expect(error).not.toBeNull();
    expect(isCheckViolation(error)).toBe(false);
  });
});

describe("rowToAnimal on the union", () => {
  const rowFor = (animal: ListedAnimal | DraftAnimal) => ({
    ...animalToRowWithCity(animal, "city" as CityId),
    cityId: "city",
    waitAnchorAt: null,
    lastConfirmedAt: null,
    firstPublishedAt: null,
    publicLocation: null,
    descriptionEnText: null,
    descriptionEnProvenance: null,
  });

  it("throws on a listed row missing a fact (a row the CHECK can't hold)", () => {
    const row = { ...rowFor(makeAnimal()), size: null } as Parameters<typeof rowToAnimal>[0];
    expect(() => rowToAnimal(row)).toThrow(/published but lacks a listing fact/);
  });

  it("the public mapper throws on a draft row", () => {
    const row = rowFor(makeDraftAnimal()) as Parameters<typeof rowToAnimal>[0];
    expect(() => rowToDiscoverableAnimal(row)).toThrow(/draft; a public query returned/);
  });
});

describe("writeEditIf: a null is written only while the row is a draft", () => {
  it("clears a draft's description, with its line", async () => {
    const { shelterId, cityId } = await place();
    const draft = makeAnimal({ shelterId, listing: { kind: "draft" } }) as DraftAnimal;
    await animalRepo(db).insert(draft, cityId);
    const cleared: DraftAnimal = { ...draft, description: null, lastUpdatedAt: AT };
    expect(
      await kabinetAnimalRepo(db).writeEditIf(
        cleared,
        cityId,
        draft.version,
        editedLine(draft.id, ["description"]),
      ),
    ).toEqual({ kind: "ok" });
    expect((await animalRepo(db).findById(draft.id))?.description).toBeNull();
    expect(await historyOf(shelterId)).toHaveLength(1);
  });

  it("a clearing save planned on a draft that was published meanwhile writes nothing and records nothing", async () => {
    const { shelterId, cityId } = await place();
    const draft = makeAnimal({
      shelterId,
      listing: { kind: "draft" },
      photos: [PHOTO("a")],
    }) as DraftAnimal;
    await animalRepo(db).insert(draft, cityId);
    // The publish lands first (it compares on the same version the save read).
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        draft.id,
        publishedAt(AT),
        draft.listing,
        publishLine(draft.id),
        {
          kind: "publish",
          expectedVersion: draft.version,
        },
      ),
    ).toEqual({ kind: "ok" });
    const linesBefore = (await historyOf(shelterId)).length;
    const cleared: DraftAnimal = { ...draft, description: null, lastUpdatedAt: LATER };
    expect(
      await kabinetAnimalRepo(db).writeEditIf(
        cleared,
        cityId,
        draft.version,
        editedLine(draft.id, ["description"]),
      ),
    ).toEqual({ kind: "conflict" });
    const after = await animalRepo(db).findById(draft.id);
    expect(after?.listing.kind).toBe("published");
    expect(after?.description).toEqual(draft.description);
    expect((await historyOf(shelterId)).length).toBe(linesBefore);
  });

  it("a save writing no null still lands on a listed row (HS-T8: no listing condition)", async () => {
    const { shelterId, cityId } = await place();
    const listed = makeAnimal({ shelterId });
    await animalRepo(db).insert(listed, cityId);
    expect(
      await kabinetAnimalRepo(db).writeEditIf(
        { ...listed, name: "Нове", lastUpdatedAt: AT },
        cityId,
        listed.version,
        editedLine(listed.id, ["name"]),
      ),
    ).toEqual({ kind: "ok" });
  });
});

describe("the publish compare-and-set (K3-T7)", () => {
  async function completeDraft() {
    const { shelterId, cityId } = await place();
    const draft = makeAnimal({
      shelterId,
      listing: { kind: "draft" },
      photos: [PHOTO("a")],
    }) as DraftAnimal;
    await animalRepo(db).insert(draft, cityId);
    return { draft, shelterId, cityId };
  }

  it("publishes on the version and photos it read", async () => {
    const { draft, shelterId } = await completeDraft();
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        draft.id,
        publishedAt(AT),
        draft.listing,
        publishLine(draft.id),
        {
          kind: "publish",
          expectedVersion: draft.version,
        },
      ),
    ).toEqual({ kind: "ok" });
    expect((await animalRepo(db).findById(draft.id))?.listing.kind).toBe("published");
    expect(await historyOf(shelterId)).toHaveLength(1);
  });

  it("a publish planned before a description-clearing save writes nothing and records nothing", async () => {
    const { draft, shelterId, cityId } = await completeDraft();
    await kabinetAnimalRepo(db).writeEditIf(
      { ...draft, description: null, lastUpdatedAt: AT },
      cityId,
      draft.version,
      editedLine(draft.id, ["description"]),
    );
    const linesBefore = (await historyOf(shelterId)).length;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        draft.id,
        publishedAt(LATER),
        draft.listing,
        publishLine(draft.id),
        {
          kind: "publish",
          expectedVersion: draft.version,
        },
      ),
    ).toEqual({ kind: "conflict" });
    expect((await animalRepo(db).findById(draft.id))?.listing.kind).toBe("draft");
    expect((await historyOf(shelterId)).length).toBe(linesBefore);
  });

  it("a publish planned before a last-photo removal writes nothing (photo writes keep the version)", async () => {
    const { draft, shelterId } = await completeDraft();
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        draft.id,
        { next: [], expected: draft.photos },
        { next: draft.listing, expected: draft.listing },
        AT,
        editedLine(draft.id, ["photos"]),
      ),
    ).toEqual({ kind: "ok" });
    const linesBefore = (await historyOf(shelterId)).length;
    expect(
      await kabinetAnimalRepo(db).writeListingIf(
        draft.id,
        publishedAt(LATER),
        draft.listing,
        publishLine(draft.id),
        {
          kind: "publish",
          expectedVersion: draft.version,
        },
      ),
    ).toEqual({ kind: "conflict" });
    expect((await animalRepo(db).findById(draft.id))?.listing.kind).toBe("draft");
    expect((await historyOf(shelterId)).length).toBe(linesBefore);
  });

  it("a last-photo removal planned on the draft writes nothing once the publish has landed", async () => {
    const { draft, shelterId } = await completeDraft();
    await kabinetAnimalRepo(db).writeListingIf(
      draft.id,
      publishedAt(AT),
      draft.listing,
      publishLine(draft.id),
      {
        kind: "publish",
        expectedVersion: draft.version,
      },
    );
    const linesBefore = (await historyOf(shelterId)).length;
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        draft.id,
        { next: [], expected: draft.photos },
        { next: draft.listing, expected: draft.listing },
        LATER,
        editedLine(draft.id, ["photos"]),
      ),
    ).toEqual({ kind: "conflict" });
    const after = await animalRepo(db).findById(draft.id);
    expect(after?.photos).toHaveLength(1);
    expect((await historyOf(shelterId)).length).toBe(linesBefore);
  });

  it("a publish without its guard is refused before anything is written", async () => {
    const { draft } = await completeDraft();
    await expect(
      kabinetAnimalRepo(db).writeListingIf(
        draft.id,
        publishedAt(AT),
        draft.listing,
        publishLine(draft.id),
      ),
    ).rejects.toThrow(/must compare-and-set on version and photos/);
    expect((await animalRepo(db).findById(draft.id))?.listing.kind).toBe("draft");
  });

  it("the CHECK is the backstop: publishing an incomplete draft directly is a 23514", async () => {
    const { shelterId, cityId } = await place();
    const draft = makeDraftAnimal({ shelterId, photos: [PHOTO("a")] });
    await animalRepo(db).insert(draft, cityId);
    const error = await failureOf(
      kabinetAnimalRepo(db).writeListingIf(
        draft.id,
        publishedAt(AT),
        draft.listing,
        publishLine(draft.id),
        {
          kind: "publish",
          expectedVersion: draft.version,
        },
      ),
    );
    expect(isCheckViolation(error)).toBe(true);
    expect((await animalRepo(db).findById(draft.id))?.listing.kind).toBe("draft");
    expect(await historyOf(shelterId)).toEqual([]);
  });
});

/** RH-B7 (D4 option (i)): a photo change on a visible card moves the confirmation date. */
describe("writePhotosIf with the listing (RH-B7)", () => {
  const confirmationColumns = async (id: string) => {
    const [row] = await db
      .select({
        lastConfirmedAt: animals.lastConfirmedAt,
        listingConfirmedAt: sql<string | null>`${animals.listing}->>'confirmedAt'`,
        version: animals.version,
      })
      .from(animals)
      .where(eq(animals.id, id as never));
    return row;
  };

  it("on a published card moves listing.confirmedAt and last_confirmed_at together, version kept", async () => {
    const { shelterId, cityId } = await place();
    const animal = makeAnimal({ shelterId, photos: [PHOTO("a")] });
    await animalRepo(db).insert(animal, cityId);
    const next = listingAfterPhotoChange(animal.listing, LATER);
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        animal.id,
        { next: [PHOTO("a"), PHOTO("b")], expected: animal.photos },
        { next, expected: animal.listing },
        LATER,
        editedLine(animal.id, ["photos"]),
      ),
    ).toEqual({ kind: "ok" });
    const columns = await confirmationColumns(animal.id);
    expect(columns?.lastConfirmedAt).toEqual(LATER);
    expect(new Date(columns?.listingConfirmedAt ?? 0)).toEqual(LATER);
    expect(columns?.version).toBe(animal.version);
  });

  it("on a draft leaves last_confirmed_at null", async () => {
    const { shelterId, cityId } = await place();
    const draft = makeDraftAnimal({ shelterId });
    await animalRepo(db).insert(draft, cityId);
    await kabinetAnimalRepo(db).writePhotosIf(
      draft.id,
      { next: [PHOTO("a")], expected: [] },
      { next: listingAfterPhotoChange(draft.listing, LATER), expected: draft.listing },
      LATER,
      editedLine(draft.id, ["photos"]),
    );
    expect((await confirmationColumns(draft.id))?.lastConfirmedAt).toBeNull();
  });

  it("a listing changed since the read writes nothing and records nothing", async () => {
    const { shelterId, cityId } = await place();
    const animal = makeAnimal({ shelterId, photos: [PHOTO("a")] });
    await animalRepo(db).insert(animal, cityId);
    const confirmed = { ...animal.listing, confirmedAt: AT, undoable: null } as AnimalListingState;
    await kabinetAnimalRepo(db).writeListingIf(animal.id, confirmed, animal.listing, {
      kind: "not_recorded",
      because: "confirmation",
    });
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        animal.id,
        { next: [PHOTO("a"), PHOTO("b")], expected: animal.photos },
        { next: listingAfterPhotoChange(animal.listing, LATER), expected: animal.listing },
        LATER,
        editedLine(animal.id, ["photos"]),
      ),
    ).toEqual({ kind: "conflict" });
    expect((await animalRepo(db).findById(animal.id))?.photos).toHaveLength(1);
    expect(await historyOf(shelterId)).toEqual([]);
  });

  it("refuses to move the listing's kind", async () => {
    const { shelterId, cityId } = await place();
    const animal = makeAnimal({ shelterId, photos: [PHOTO("a")] });
    await animalRepo(db).insert(animal, cityId);
    await expect(
      kabinetAnimalRepo(db).writePhotosIf(
        animal.id,
        { next: [], expected: animal.photos },
        { next: { kind: "draft" }, expected: animal.listing },
        LATER,
        editedLine(animal.id, ["photos"]),
      ),
    ).rejects.toThrow(/never moves the listing's kind/);
  });
});
