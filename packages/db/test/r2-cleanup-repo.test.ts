import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { variantObjectKey } from "../src/image-pipeline/variants";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import {
  afterDeleted,
  recordScan,
  referencedObjectKeys,
  referencedStorageKeys,
  stillUnreferenced,
  trackedUnreferencedObjects,
} from "../src/repos/r2-cleanup-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { reveals } from "../src/schema/reveals";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). Every test here uses a
 * real, migrated local database — jsonb array extraction and raw multi-row
 * writes have no meaningful unit-level equivalent.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-25T10:00:00.000Z");
const photo = (storageKey: string) => ({ storageKey, width: 800, height: 1000, alt: null });

async function insertAnimalWithPhotos(storageKeys: string[]) {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id, photos: storageKeys.map(photo) as never });
  await animalRepo(db).insert(animal, city.id as never);
  return { shelter, animal };
}

/** A real reveal row, foreign keys and all, with the given primaryPhoto storage key. */
async function insertRevealWithPrimaryPhoto(storageKey: string) {
  const { shelter, animal } = await insertAnimalWithPhotos([]);
  const adopter = makeAdopter();
  await adopterRepo(db).insert(adopter);
  const reveal = makeReveal({
    adopterId: adopter.id,
    animalId: animal.id,
    shelterId: shelter.id,
    animalSnapshot: { name: "Бровко", primaryPhoto: photo(storageKey) },
  });
  await revealRepo(db).insert(reveal);
  return reveal;
}

describe("referencedStorageKeys / referencedObjectKeys", () => {
  it("finds every storageKey across every animal, and derives all three variants per key", async () => {
    await insertAnimalWithPhotos(["animals/a/1", "animals/a/2"]);

    const storageKeys = await referencedStorageKeys(db);
    expect([...storageKeys].sort()).toEqual(["animals/a/1", "animals/a/2"]);

    const objectKeys = await referencedObjectKeys(db);
    expect([...objectKeys].sort()).toEqual(
      [
        variantObjectKey("animals/a/1", "card"),
        variantObjectKey("animals/a/1", "detail"),
        variantObjectKey("animals/a/1", "thumb"),
        variantObjectKey("animals/a/2", "card"),
        variantObjectKey("animals/a/2", "detail"),
        variantObjectKey("animals/a/2", "thumb"),
      ].sort(),
    );
  });

  it("is empty when nothing has any photos", async () => {
    expect(await referencedStorageKeys(db)).toEqual(new Set());
  });
});

describe("recordScan", () => {
  it("tracks a bucket key not in the referenced set, leaves a referenced one alone", async () => {
    await insertAnimalWithPhotos(["animals/a/1"]);
    const referencedKey = variantObjectKey("animals/a/1", "card");
    const orphanKey = variantObjectKey("animals/orphan/1", "card");

    const result = await recordScan(db, [referencedKey, orphanKey], NOW);

    expect(result).toEqual({ newlyTracked: 1, cleared: 0 });
    const tracked = await trackedUnreferencedObjects(db);
    expect(tracked).toEqual([{ objectKey: orphanKey, firstSeenUnreferencedAt: NOW }]);
  });

  it("is idempotent: a second scan with the same input changes nothing", async () => {
    const orphanKey = variantObjectKey("animals/orphan/1", "card");
    await recordScan(db, [orphanKey], NOW);

    const second = await recordScan(db, [orphanKey], new Date(NOW.getTime() + 60_000));

    expect(second).toEqual({ newlyTracked: 0, cleared: 0 });
    const tracked = await trackedUnreferencedObjects(db);
    // The first-seen instant is NOW, not the second scan's later time.
    expect(tracked).toEqual([{ objectKey: orphanKey, firstSeenUnreferencedAt: NOW }]);
  });

  it("self-heals: a tracked key referenced again on a later scan is untracked, no write-path hook needed", async () => {
    const key = variantObjectKey("animals/a/1", "card");
    await recordScan(db, [key], NOW); // tracked while nothing references it yet
    expect(await trackedUnreferencedObjects(db)).toHaveLength(1);

    await insertAnimalWithPhotos(["animals/a/1"]); // now it's referenced

    const result = await recordScan(db, [key], new Date(NOW.getTime() + 60_000));
    expect(result).toEqual({ newlyTracked: 0, cleared: 1 });
    expect(await trackedUnreferencedObjects(db)).toEqual([]);
  });
});

describe("stillUnreferenced", () => {
  it("re-derives fresh: a candidate that became referenced since the scan is filtered out", async () => {
    const key1 = variantObjectKey("animals/a/1", "card");
    const key2 = variantObjectKey("animals/a/2", "card");
    await insertAnimalWithPhotos(["animals/a/1"]); // key1 is now referenced

    expect(await stillUnreferenced(db, [key1, key2])).toEqual([key2]);
  });
});

describe("afterDeleted", () => {
  it("clears the tracking rows for the deleted keys", async () => {
    const key = variantObjectKey("animals/a/1", "card");
    await recordScan(db, [key], NOW);
    expect(await trackedUnreferencedObjects(db)).toHaveLength(1);

    await afterDeleted(db, [key]);

    expect(await trackedUnreferencedObjects(db)).toEqual([]);
  });

  it("nulls a reveal's primaryPhoto when its storage key's object is deleted, case-insensitively", async () => {
    await insertRevealWithPrimaryPhoto("animals/A/1");

    const result = await afterDeleted(db, [variantObjectKey("animals/a/1", "card")]);

    expect(result).toEqual({ snapshotsNulled: 1 });
    const [row] = await db.select().from(reveals);
    expect((row?.animalSnapshot as { primaryPhoto: unknown } | undefined)?.primaryPhoto).toBeNull();
  });

  it("leaves a reveal with a different storage key untouched", async () => {
    await insertRevealWithPrimaryPhoto("animals/other/1");

    const result = await afterDeleted(db, [variantObjectKey("animals/a/1", "card")]);

    expect(result).toEqual({ snapshotsNulled: 0 });
    const [row] = await db.select().from(reveals);
    expect(
      (row?.animalSnapshot as { primaryPhoto: { storageKey: string } | null } | undefined)
        ?.primaryPhoto?.storageKey,
    ).toBe("animals/other/1");
  });

  it("does nothing on an empty list", async () => {
    expect(await afterDeleted(db, [])).toEqual({ snapshotsNulled: 0 });
  });
});
