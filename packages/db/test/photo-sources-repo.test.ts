import { randomUUID } from "node:crypto";
import {
  type Animal,
  type AnimalPhoto,
  type CityId,
  frameOfUnits,
  PhotoFrameSchema,
  type PhotoFrameUnits,
  type PhotoFraming,
  type ShelterAdminId,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { removeDemoCorpus } from "../src/demo-remove";
import { IMAGE_VARIANT_NAMES, variantObjectKey } from "../src/image-pipeline/variants";
import { executeRows } from "../src/raw-rows";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { type AnimalHistoryRow, kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { type PhotoSource, photoSourcesRepo } from "../src/repos/photo-sources-repo";
import { recordScan, trackedUnreferencedObjects } from "../src/repos/r2-cleanup-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animalPhotoSources } from "../src/schema/animal-photo-sources";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";
import { refusalOf } from "./neon-smoke-verified-data";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const AT = new Date("2026-11-12T09:00:00.000Z");
const ACTOR = {
  kind: "shelter_admin",
  shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
} as const;
const FRAMED: PhotoFraming = { kind: "frame", frame: { x: 0.1, y: 0.05, w: 0.6, h: 0.75 } };

const photoOf = (storageKey: string): AnimalPhoto => ({
  storageKey,
  width: 1600,
  height: 2000,
  alt: null,
});
const sourceOf = (storageKey: string, framing: PhotoFraming = { kind: "attention" }) =>
  ({
    storageKey,
    sourceObjectKey: `${storageKey}/source-${randomUUID()}.webp`,
    origin: "upload",
    width: 1600,
    height: 2000,
    framing,
  }) satisfies PhotoSource;

let cityId: CityId;
beforeEach(async () => {
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

async function insertShelter(): Promise<ShelterId> {
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
  });
  await shelterRepo(db).insert(shelter);
  return shelter.id;
}

/** An animal with `count` photos under its own keys, each with a recorded source. */
async function withSources(
  count: number,
  shelterId?: ShelterId,
  listing?: Animal["listing"],
): Promise<{ animal: Animal; keys: string[]; sources: PhotoSource[] }> {
  const owner = shelterId ?? (await insertShelter());
  const draft = makeAnimal({ shelterId: owner, ...(listing ? { listing } : {}) });
  const keys = Array.from({ length: count }, () => `animals/${draft.id}/${randomUUID()}`);
  const animal: Animal = { ...draft, photos: keys.map(photoOf) };
  await animalRepo(db).insert(animal, cityId);
  const sources = keys.map((key) => sourceOf(key));
  expect(await photoSourcesRepo(db).insertForAnimal(animal.id, sources, AT)).toBe(count);
  return { animal, keys, sources };
}

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

const write = (
  animal: Animal,
  next: readonly string[],
  expected: readonly string[],
  source?: PhotoSource,
) =>
  kabinetAnimalRepo(db).writePhotosIf(
    animal.id,
    { next: next.map(photoOf), expected: expected.map(photoOf) },
    { next: animal.listing, expected: animal.listing },
    AT,
    photosLine(animal),
    source === undefined ? { kind: "none" } : { kind: "record", source },
  );

const storedKeys = async (): Promise<string[]> =>
  (await db.select({ key: animalPhotoSources.storageKey }).from(animalPhotoSources))
    .map((row) => row.key)
    .sort();
const historyCount = async (animal: Animal) =>
  (await kabinetShelterRepo(db).historyOf(animal.shelterId)).length;

describe("migration 0027: animal_photo_sources", () => {
  it("its one foreign key is animals(id) ON DELETE CASCADE, indexed, and no column names a person", async () => {
    const fks = await executeRows<{ target: string; confdeltype: string }>(
      db,
      sql`SELECT confrelid::regclass::text AS target, confdeltype FROM pg_constraint
          WHERE conrelid = 'animal_photo_sources'::regclass AND contype = 'f'`,
    );
    expect(fks).toEqual([{ target: "animals", confdeltype: "c" }]);
    const indexes = await executeRows<{ indexdef: string }>(
      db,
      sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'animal_photo_sources_animal_idx'`,
    );
    expect(indexes[0]?.indexdef).toContain("(animal_id)");
    const columns = await executeRows<{ column_name: string }>(
      db,
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'animal_photo_sources' ORDER BY column_name`,
    );
    // An account erasure has nothing to remove here: no user id, address or name.
    expect(columns.map((c) => c.column_name)).toEqual([
      "animal_id",
      "created_at",
      "frame_h",
      "frame_w",
      "frame_x",
      "frame_y",
      "source_height",
      "source_object_key",
      "source_origin",
      "source_width",
      "storage_key",
    ]);
  });

  describe("its CHECKs", () => {
    let animalId: Animal["id"];
    let key: string;
    beforeEach(async () => {
      const { animal } = await withSources(0);
      animalId = animal.id;
      key = `animals/${animal.id}/${randomUUID()}`;
    });

    const insert = (row: Partial<typeof animalPhotoSources.$inferInsert>) =>
      db.insert(animalPhotoSources).values({
        storageKey: key,
        animalId,
        sourceObjectKey: `${key}/source-${randomUUID()}.webp`,
        sourceOrigin: "upload",
        sourceWidth: 1600,
        sourceHeight: 2000,
        frameX: null,
        frameY: null,
        frameW: null,
        frameH: null,
        createdAt: AT,
        ...row,
      });
    const outcome = async (row: Partial<typeof animalPhotoSources.$inferInsert>) => {
      try {
        await insert(row);
        return "accepted";
      } catch (error) {
        return refusalOf(error);
      }
    };

    it("accept a row with no frame and one with a frame inside the source", async () => {
      expect(await outcome({})).toBe("accepted");
      await db.delete(animalPhotoSources);
      expect(await outcome({ frameX: 0, frameY: 0, frameW: 10_000, frameH: 10_000 })).toBe(
        "accepted",
      );
    });

    it("refuse a half-set frame, x + w past 10 000, a zero width and a negative edge", async () => {
      const FRAME = "animal_photo_sources_frame_check";
      expect(await outcome({ frameX: null, frameY: 0, frameW: 8000, frameH: 10_000 })).toBe(FRAME);
      expect(await outcome({ frameX: 0, frameY: 0, frameW: 8000, frameH: null })).toBe(FRAME);
      expect(await outcome({ frameX: 2001, frameY: 0, frameW: 8000, frameH: 10_000 })).toBe(FRAME);
      expect(await outcome({ frameX: 0, frameY: 1, frameW: 8000, frameH: 10_000 })).toBe(FRAME);
      expect(await outcome({ frameX: 0, frameY: 0, frameW: 0, frameH: 10_000 })).toBe(FRAME);
      expect(await outcome({ frameX: -1, frameY: 0, frameW: 8000, frameH: 10_000 })).toBe(FRAME);
    });

    it("refuse a source key that is not an unguessable direct child of its photo's key", async () => {
      const KEY = "animal_photo_sources_object_key_check";
      const id = randomUUID();
      for (const sourceObjectKey of [
        `animals/${animalId}/${randomUUID()}/source-${id}.webp`,
        `${key}/nested/source-${id}.webp`,
        `${key}/source-1.webp`,
        `${key}/source-${id}.jpg`,
        `${key}/card.webp`,
        `${key}source-${id}.webp`,
      ]) {
        expect(await outcome({ sourceObjectKey })).toBe(KEY);
      }
    });

    it("refuse an unknown origin and a size that is not positive", async () => {
      expect(await outcome({ sourceOrigin: "original" as never })).toBe(
        "animal_photo_sources_origin_check",
      );
      expect(await outcome({ sourceWidth: 0 })).toBe("animal_photo_sources_size_check");
      expect(await outcome({ sourceHeight: -5 })).toBe("animal_photo_sources_size_check");
    });

    it("refuse exactly the frames PhotoFrameSchema refuses, on the stored units", async () => {
      const cases: PhotoFrameUnits[] = [
        { x: 0, y: 0, w: 10_000, h: 10_000 },
        { x: 5000, y: 0, w: 5000, h: 10_000 },
        { x: 5001, y: 0, w: 5000, h: 10_000 },
        { x: 0, y: 9999, w: 1, h: 1 },
        { x: 0, y: 9999, w: 1, h: 2 },
        { x: 0, y: 0, w: 0, h: 1 },
        { x: 0, y: 0, w: 1, h: 0 },
        { x: -1, y: 0, w: 1, h: 1 },
        { x: 0, y: 0, w: 10_001, h: 1 },
      ];
      for (const units of cases) {
        await db.delete(animalPhotoSources);
        const database = await outcome({
          frameX: units.x,
          frameY: units.y,
          frameW: units.w,
          frameH: units.h,
        });
        const schema = PhotoFrameSchema.safeParse(frameOfUnits(units)).success;
        expect({ units, accepted: database === "accepted" }).toEqual({ units, accepted: schema });
      }
    });
  });
});

describe("writePhotosIf with sources (crop-frame shape §5)", () => {
  it("an add records the new photo's source with the photo and its history line", async () => {
    const { animal, keys } = await withSources(1);
    const added = `animals/${animal.id}/${randomUUID()}`;
    const before = await historyCount(animal);

    expect(await write(animal, [...keys, added], keys, sourceOf(added))).toEqual({ kind: "ok" });

    expect(await storedKeys()).toEqual([...keys, added].sort());
    const [row] = (await photoSourcesRepo(db).listForAnimal(animal.id, animal.shelterId)).filter(
      (s) => s.storageKey === added,
    );
    expect(row).toMatchObject({ origin: "upload", width: 1600, height: 2000 });
    expect(row?.framing).toEqual({ kind: "attention" });
    expect(await historyCount(animal)).toBe(before + 1);
  });

  it("a lost race writes no photo, no source row and no history line", async () => {
    const { animal, keys } = await withSources(1);
    const added = `animals/${animal.id}/${randomUUID()}`;
    const before = await historyCount(animal);

    const stale = [...keys, `animals/${animal.id}/${randomUUID()}`];
    expect(await write(animal, [...keys, added], stale, sourceOf(added))).toEqual({
      kind: "conflict",
    });

    expect(await storedKeys()).toEqual([...keys].sort());
    expect((await animalRepo(db).findById(animal.id))?.photos.map((p) => p.storageKey)).toEqual(
      keys,
    );
    expect(await historyCount(animal)).toBe(before);
  });

  it("a crop swaps the key in place: the old key's row goes and the framed new row comes", async () => {
    const { animal, keys } = await withSources(2);
    const [first, second] = keys as [string, string];
    const cropped = `animals/${animal.id}/${randomUUID()}`;

    expect(await write(animal, [first, cropped], keys, sourceOf(cropped, FRAMED))).toEqual({
      kind: "ok",
    });

    expect(await storedKeys()).toEqual([first, cropped].sort());
    expect(await storedKeys()).not.toContain(second);
    const listed = await photoSourcesRepo(db).listForAnimal(animal.id, animal.shelterId);
    expect(listed.find((s) => s.storageKey === cropped)?.framing).toEqual(FRAMED);
  });

  it("a crop that loses its race leaves the old row and adds none", async () => {
    const { animal, keys } = await withSources(2);
    const [first] = keys as [string, string];
    const cropped = `animals/${animal.id}/${randomUUID()}`;

    expect(await write(animal, [first, cropped], [first], sourceOf(cropped, FRAMED))).toEqual({
      kind: "conflict",
    });

    expect(await storedKeys()).toEqual([...keys].sort());
  });

  it("a reorder keeps every row; a removal deletes the removed photo's row", async () => {
    const { animal, keys } = await withSources(2);
    const [first, second] = keys as [string, string];

    expect(await write(animal, [second, first], keys)).toEqual({ kind: "ok" });
    expect(await storedKeys()).toEqual([...keys].sort());

    expect(await write(animal, [second], [second, first])).toEqual({ kind: "ok" });
    expect(await storedKeys()).toEqual([second]);
  });

  it("removing every photo leaves the animal no rows", async () => {
    const { animal, keys } = await withSources(3);
    expect(await write(animal, [], keys)).toEqual({ kind: "ok" });
    expect(await storedKeys()).toEqual([]);
  });

  it("never touches another animal's rows", async () => {
    const shelterId = await insertShelter();
    const mine = await withSources(1, shelterId);
    const other = await withSources(2, shelterId);

    expect(await write(mine.animal, [], mine.keys)).toEqual({ kind: "ok" });

    expect(await storedKeys()).toEqual([...other.keys].sort());
  });

  it("refuses, before writing anything, a source for a photo the write does not add", async () => {
    const { animal, keys } = await withSources(1);
    const [kept] = keys as [string];
    const before = await historyCount(animal);
    const elsewhere = `animals/${animal.id}/${randomUUID()}`;

    await expect(write(animal, keys, keys, sourceOf(kept, FRAMED))).rejects.toThrow(
      "a source is recorded only for a photo this write adds",
    );
    await expect(write(animal, [], keys, sourceOf(elsewhere))).rejects.toThrow(
      "a source is recorded only for a photo this write adds",
    );

    expect(await storedKeys()).toEqual([kept]);
    expect(await historyCount(animal)).toBe(before);
  });
});

describe("photoSourcesRepo.listForAnimal", () => {
  it("reads integer frames back as fractions, and an unframed row as attention", async () => {
    const { animal, keys } = await withSources(1);
    const framed = `animals/${animal.id}/${randomUUID()}`;
    await write(animal, [...keys, framed], keys, sourceOf(framed, FRAMED));

    const [stored] = await db
      .select()
      .from(animalPhotoSources)
      .where(eq(animalPhotoSources.storageKey, framed));
    expect([stored?.frameX, stored?.frameY, stored?.frameW, stored?.frameH]).toEqual([
      1000, 500, 6000, 7500,
    ]);
    const listed = await photoSourcesRepo(db).listForAnimal(animal.id, animal.shelterId);
    expect(listed.map((s) => [s.storageKey, s.framing])).toEqual(
      [
        [keys[0], { kind: "attention" }],
        [framed, FRAMED],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });

  it("reads nothing for another shelter's id, exactly like a missing animal", async () => {
    const { animal } = await withSources(2);
    const otherShelter = await insertShelter();
    expect(await photoSourcesRepo(db).listForAnimal(animal.id, otherShelter)).toEqual([]);
    expect(
      await photoSourcesRepo(db).listForAnimal(randomUUID() as Animal["id"], animal.shelterId),
    ).toEqual([]);
  });

  it("never returns a row whose photo has left the animal's list", async () => {
    const { animal, keys } = await withSources(1);
    const gone = `animals/${animal.id}/${randomUUID()}`;
    await db.insert(animalPhotoSources).values({
      storageKey: gone,
      animalId: animal.id,
      sourceObjectKey: `${gone}/source-${randomUUID()}.webp`,
      sourceOrigin: "detail_variant",
      sourceWidth: 1120,
      sourceHeight: 1400,
      createdAt: AT,
    });
    const listed = await photoSourcesRepo(db).listForAnimal(animal.id, animal.shelterId);
    expect(listed.map((s) => s.storageKey)).toEqual(keys);
  });
});

describe("photoSourcesRepo.insertForAnimal", () => {
  it("writes rows only for the animal's own photos, in one statement, and counts them", async () => {
    const { animal, keys } = await withSources(0);
    expect(keys).toEqual([]);
    const own = `animals/${animal.id}/${randomUUID()}`;
    await animalRepo(db).update({ ...animal, photos: [photoOf(own)] }, cityId);
    const notAPhoto = `animals/${animal.id}/${randomUUID()}`;

    expect(
      await photoSourcesRepo(db).insertForAnimal(
        animal.id,
        [sourceOf(own, FRAMED), sourceOf(notAPhoto)],
        AT,
      ),
    ).toBe(1);
    expect(await storedKeys()).toEqual([own]);
    expect(await photoSourcesRepo(db).insertForAnimal(animal.id, [], AT)).toBe(0);
  });
});

describe("every deletion path leaves no source row behind", () => {
  it("deleting a draft cascades to its rows", async () => {
    const { animal } = await withSources(2, undefined, { kind: "draft" });
    expect(
      await kabinetAnimalRepo(db).deleteDraftIf(animal.id, animal.version, {
        id: randomUUID(),
        entry: {
          kind: "animal_deleted",
          at: AT,
          actor: ACTOR,
          animalId: animal.id,
          animalName: animal.name,
        },
      }),
    ).toEqual({ kind: "ok" });
    expect(await storedKeys()).toEqual([]);
  });

  it("a shelter leaving (demo:remove --shelter) takes its animals' rows, and only theirs", async () => {
    const leaving = await insertShelter();
    const staying = await insertShelter();
    await withSources(2, leaving);
    const kept = await withSources(1, staying);

    const result = await removeDemoCorpus(db, testOnlyLocationPolicy("seed"), {
      kind: "shelters",
      ids: [leaving],
    });

    expect(result.kind).toBe("removed");
    expect(await storedKeys()).toEqual(kept.keys);
  });
});

describe("the R2 clean-up and source objects", () => {
  const objectsOf = (source: PhotoSource) => [
    ...IMAGE_VARIANT_NAMES.map((variant) => variantObjectKey(source.storageKey, variant)),
    source.sourceObjectKey,
  ];
  const tracked = async () =>
    (await trackedUnreferencedObjects(db)).map((row) => row.objectKey).sort();

  it("never tracks a source object while its photo is referenced", async () => {
    const { sources } = await withSources(1);
    const [source] = sources as [PhotoSource];
    expect(await recordScan(db, objectsOf(source), AT)).toEqual({ newlyTracked: 0, cleared: 0 });
  });

  it("tracks it with the variants once the photo leaves the list, a leftover row or not", async () => {
    const { animal, keys, sources } = await withSources(2);
    const [removed, stale] = sources as [PhotoSource, PhotoSource];
    expect(await write(animal, [], keys)).toEqual({ kind: "ok" });
    // A row no write path leaves behind, inserted directly: the clean-up must not read it.
    await db.insert(animalPhotoSources).values({
      storageKey: stale.storageKey,
      animalId: animal.id,
      sourceObjectKey: stale.sourceObjectKey,
      sourceOrigin: "upload",
      sourceWidth: 1600,
      sourceHeight: 2000,
      createdAt: AT,
    });

    const objects = [...objectsOf(removed), ...objectsOf(stale)];
    expect(await recordScan(db, objects, AT)).toEqual({
      newlyTracked: objects.length,
      cleared: 0,
    });
    expect(await tracked()).toEqual([...objects].sort());
  });
});
