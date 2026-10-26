import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { variantObjectKey } from "../src/image-pipeline/variants";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { adopterToRow, animalToRowWithCity, revealToRow } from "../src/repos/mappers";
import {
  afterDeleted,
  recordScan,
  referencedObjectKeys,
  referencedStorageKeys,
  SQL_BATCH_SIZE,
  stillUnreferenced,
  trackedUnreferencedObjects,
} from "../src/repos/r2-cleanup-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { adopters } from "../src/schema/adopters";
import { animals } from "../src/schema/animals";
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

describe("SQL_BATCH_SIZE", () => {
  it("stays well under Postgres's 65535 bind-parameter limit at this file's worst per-row rate (Tier 1 review, PR #200, note 7/9)", () => {
    // recordScan's INSERT binds 2 parameters per row (objectKey,
    // firstSeenUnreferencedAt) — the most of any statement this file
    // chunks. A batch size that still crosses the real limit, even at a
    // lower per-row rate than today's, defeats the whole point of
    // chunking; this is the guard a mutation like "bump it to 1,000,000"
    // should trip, which the row-count tests alone don't (they only prove
    // the chunking loop is correct, not that the chunk size itself is sane).
    const WORST_CASE_PARAMS_PER_ROW = 2;
    expect(SQL_BATCH_SIZE * WORST_CASE_PARAMS_PER_ROW).toBeLessThan(65_535);
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

  it("tracks across more than one SQL batch (Tier 1 review, PR #200, note 9)", async () => {
    // Postgres binds at most 65535 parameters per statement; this proves
    // the chunking loop actually accumulates across batches rather than
    // silently dropping everything past the first one.
    const keys = Array.from({ length: 1500 }, (_, i) => `animals/batch-${i}/card.webp`);

    const tracked = await recordScan(db, keys, NOW);
    expect(tracked).toEqual({ newlyTracked: 1500, cleared: 0 });
    expect(await trackedUnreferencedObjects(db)).toHaveLength(1500);
  }, 30_000);

  it("clears across more than one SQL batch", async () => {
    const storageKeys = Array.from({ length: 150 }, (_, a) =>
      Array.from({ length: 10 }, (_, p) => `animals/batch-${a}-${p}`),
    ).flat(); // 150 x 10 (MAX_ANIMAL_PHOTOS) = 1500
    const objectKeys = storageKeys.map((sk) => variantObjectKey(sk, "card"));

    await recordScan(db, objectKeys, NOW); // tracked while nothing references them yet
    expect(await trackedUnreferencedObjects(db)).toHaveLength(1500);

    // Now make every one of them referenced, 10 photos per animal, sharing
    // one city/shelter to keep the fixture setup itself fast — what this
    // test measures is the repo's own batching, not fixture insert speed.
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
    });
    await shelterRepo(db).insert(shelter);
    for (let a = 0; a < 150; a++) {
      const animalPhotos = storageKeys.slice(a * 10, a * 10 + 10);
      const animal = makeAnimal({
        shelterId: shelter.id,
        photos: animalPhotos.map(photo) as never,
      });
      await animalRepo(db).insert(animal, city.id as never);
    }

    const cleared = await recordScan(db, objectKeys, new Date(NOW.getTime() + 60_000));
    expect(cleared).toEqual({ newlyTracked: 0, cleared: 1500 });
    expect(await trackedUnreferencedObjects(db)).toEqual([]);
  }, 60_000);
});

describe("stillUnreferenced", () => {
  it("re-derives fresh: a candidate that became referenced since the scan is filtered out", async () => {
    const key1 = variantObjectKey("animals/a/1", "card");
    const key2 = variantObjectKey("animals/a/2", "card");
    await insertAnimalWithPhotos(["animals/a/1"]); // key1 is now referenced

    expect(await stillUnreferenced(db, [key1, key2])).toEqual([key2]);
  });

  it("protects any object under a referenced photo's own path, not just the three known variants (Tier 1 review, PR #200, note 6)", async () => {
    await insertAnimalWithPhotos(["animals/a/1"]);
    // Neither a known variant name nor the .webp extension — exactly the
    // shape a future variant or a format migration would produce. The old
    // implementation (parsing a fixed variant/extension regex out of the
    // key) would have missed this; the parent-path check doesn't need to
    // know what the object is called, only where it sits.
    const futureVariant = "animals/a/1/hero.avif";
    const unrelatedOrphan = "animals/orphan/1/card.webp";

    expect(await stillUnreferenced(db, [futureVariant, unrelatedOrphan])).toEqual([
      unrelatedOrphan,
    ]);
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

  it("clears tracking rows across more than one SQL batch (Tier 1 review, PR #200, note 9)", async () => {
    const keys = Array.from({ length: 1500 }, (_, i) => `animals/deleted-${i}/card.webp`);
    await recordScan(db, keys, NOW);
    expect(await trackedUnreferencedObjects(db)).toHaveLength(1500);

    const result = await afterDeleted(db, keys);

    expect(result.snapshotsNulled).toBe(0); // no reveals in this test, just the tracking table
    expect(await trackedUnreferencedObjects(db)).toEqual([]);
  }, 30_000);

  it("nulls reveal snapshots across more than one SQL batch (round 3 Tier 1 delta review, finding 8 — " +
    "the 1500-row afterDeleted test above exercises only the tracking-table DELETE chunking, never " +
    "the reveal-snapshot UPDATE chunking, since it has no reveals at all)", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
    });
    await shelterRepo(db).insert(shelter);

    const count = SQL_BATCH_SIZE + 100;
    const storageKeys = Array.from({ length: count }, (_, i) => `animals/snap-${i}/1`);
    const animalRows = Array.from({ length: count }, () =>
      animalToRowWithCity(makeAnimal({ shelterId: shelter.id, photos: [] }), city.id),
    );
    await db.insert(animals).values(animalRows);

    const adopterRows = Array.from({ length: count }, () => adopterToRow(makeAdopter()));
    await db.insert(adopters).values(adopterRows);

    const revealRows = storageKeys.map((storageKey, i) =>
      revealToRow(
        makeReveal({
          adopterId: adopterRows[i]?.id as never,
          animalId: animalRows[i]?.id as never,
          shelterId: shelter.id,
          animalSnapshot: {
            name: "Бровко",
            primaryPhoto: { storageKey, width: 800, height: 1000, alt: null },
          },
        }),
      ),
    );
    await db.insert(reveals).values(revealRows);

    const deletedObjectKeys = storageKeys.map((storageKey) => variantObjectKey(storageKey, "card"));
    const result = await afterDeleted(db, deletedObjectKeys);

    expect(result.snapshotsNulled).toBe(count);
    const rows = await db.select().from(reveals);
    expect(rows).toHaveLength(count);
    for (const row of rows) {
      expect((row.animalSnapshot as { primaryPhoto: unknown }).primaryPhoto).toBeNull();
    }
  }, 60_000);
});
