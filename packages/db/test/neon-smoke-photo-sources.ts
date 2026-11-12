import { randomUUID } from "node:crypto";
import type {
  Animal,
  AnimalPhoto,
  CityId,
  PhotoFraming,
  ShelterAdminId,
  ShelterId,
} from "@opika/domain";
import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { IMAGE_VARIANT_NAMES, variantObjectKey } from "../src/image-pipeline/variants";
import { executeRows } from "../src/raw-rows";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { type AnimalHistoryRow, kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { type PhotoSource, photoSourcesRepo } from "../src/repos/photo-sources-repo";
import { recordScan } from "../src/repos/r2-cleanup-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animalPhotoSources } from "../src/schema/animal-photo-sources";
import { r2UnreferencedObjects } from "../src/schema/r2-cleanup";
import { makeAnimal, makeCity, makeShelter } from "../src/test-utils/index";
import { outcomeOf } from "./neon-smoke-verified-data";

type Outcome = { name: string; ok: boolean; detail: string };

const FRAMED: PhotoFraming = { kind: "frame", frame: { x: 0.1, y: 0.05, w: 0.6, h: 0.75 } };
const ACTOR = {
  kind: "shelter_admin",
  shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
} as const;

/**
 * Migration 0027 and the photo write on Neon's driver: the catalog, the CHECKs, the combined
 * compare-and-set (photo key, source row, history line) on a match and on a conflict, the cascade
 * and the clean-up's reference set. Rows stay on the child branch, which is thrown away; the
 * clean-up tracking rows it creates are deleted at the end.
 */
export async function runPhotoSourcesSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const now = new Date();
  const sources = photoSourcesRepo(db);
  const kabinet = kabinetAnimalRepo(db);
  const trackedKeys: string[] = [];

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const tag = randomUUID().slice(0, 6);
  const insertShelter = async (label: string): Promise<ShelterId> => {
    const shelter = makeShelter({
      displayName: `Смоук джерела фото ${label} ${tag}`,
      publicLocation: { precision: "city", cityId: city.id, district: null },
    });
    await shelterRepo(db).insert(shelter);
    return shelter.id;
  };
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
  const withSources = async (shelterId: ShelterId, count: number, listing?: Animal["listing"]) => {
    const base = makeAnimal({ shelterId, ...(listing ? { listing } : {}) });
    const keys = Array.from({ length: count }, () => `animals/${base.id}/${randomUUID()}`);
    const animal: Animal = { ...base, photos: keys.map(photoOf) };
    await animalRepo(db).insert(animal, city.id);
    const recorded = keys.map((key) => sourceOf(key));
    const inserted = await sources.insertForAnimal(animal.id, recorded, now);
    return { animal, keys, recorded, inserted };
  };
  const photosLine = (animal: Animal): AnimalHistoryRow<"animal_edited"> => ({
    id: randomUUID(),
    entry: {
      kind: "animal_edited",
      at: now,
      actor: ACTOR,
      animalId: animal.id,
      animalName: animal.name,
      fields: ["photos"],
    },
  });
  const write = (animal: Animal, next: string[], expected: string[], source?: PhotoSource) =>
    kabinet.writePhotosIf(
      animal.id,
      { next: next.map(photoOf), expected: expected.map(photoOf) },
      { next: animal.listing, expected: animal.listing },
      now,
      photosLine(animal),
      source === undefined ? { kind: "none" } : { kind: "record", source },
    );
  const rowsOf = async (animal: Animal) =>
    (
      await db
        .select({ key: animalPhotoSources.storageKey })
        .from(animalPhotoSources)
        .where(eq(animalPhotoSources.animalId, animal.id))
    )
      .map((row) => row.key)
      .sort();
  const historyCount = async (shelterId: ShelterId) =>
    (await kabinetShelterRepo(db).historyOf(shelterId)).length;
  const photoKeysOf = async (animal: Animal) =>
    (await animalRepo(db).findById(animal.id))?.photos.map((p) => p.storageKey) ?? [];

  try {
    const fks = await executeRows<{ target: string; confdeltype: string }>(
      db,
      sql`SELECT confrelid::regclass::text AS target, confdeltype FROM pg_constraint
          WHERE conrelid = 'animal_photo_sources'::regclass AND contype = 'f'`,
    );
    const index = await executeRows<{ indexdef: string }>(
      db,
      sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'animal_photo_sources_animal_idx'`,
    );
    check(
      "0027: animal_photo_sources' one foreign key is animals(id) ON DELETE CASCADE, and animal_id is indexed",
      fks.length === 1 &&
        fks[0]?.target === "animals" &&
        fks[0]?.confdeltype === "c" &&
        (index[0]?.indexdef ?? "").includes("(animal_id)"),
      `${fks.map((fk) => `${fk.target} ${fk.confdeltype}`).join(", ")}; index ${index.length}`,
    );

    const shelterId = await insertShelter("A");
    const roundTrip = await withSources(shelterId, 1);
    const framedKey = `animals/${roundTrip.animal.id}/${randomUUID()}`;
    const framedWrite = await write(
      roundTrip.animal,
      [...roundTrip.keys, framedKey],
      roundTrip.keys,
      sourceOf(framedKey, FRAMED),
    );
    const listed = await sources.listForAnimal(roundTrip.animal.id, shelterId);
    const [raw] = await db
      .select()
      .from(animalPhotoSources)
      .where(eq(animalPhotoSources.storageKey, framedKey));
    const rawFrame = [raw?.frameX, raw?.frameY, raw?.frameW, raw?.frameH];
    const plain = listed.find((s) => s.storageKey === roundTrip.keys[0]);
    const framed = listed.find((s) => s.storageKey === framedKey);
    check(
      "0027: an unframed row and a framed row round-trip (frame 1000, 500, 6000, 7500 as numbers; width and height as numbers)",
      roundTrip.inserted === 1 &&
        framedWrite.kind === "ok" &&
        rawFrame.every((n) => typeof n === "number") &&
        JSON.stringify(rawFrame) === "[1000,500,6000,7500]" &&
        typeof raw?.sourceWidth === "number" &&
        plain?.framing.kind === "attention" &&
        JSON.stringify(framed?.framing) === JSON.stringify(FRAMED),
      `inserted ${roundTrip.inserted}, write ${framedWrite.kind}, raw ${JSON.stringify(rawFrame)}, listed ${listed.length}`,
    );

    const checkKey = `animals/${roundTrip.animal.id}/${randomUUID()}`;
    const rawInsert = (row: Partial<typeof animalPhotoSources.$inferInsert>) =>
      outcomeOf(async () => {
        await db.insert(animalPhotoSources).values({
          storageKey: checkKey,
          animalId: roundTrip.animal.id,
          sourceObjectKey: `${checkKey}/source-${randomUUID()}.webp`,
          sourceOrigin: "upload",
          sourceWidth: 1600,
          sourceHeight: 2000,
          createdAt: now,
          ...row,
        });
      });
    const halfSet = await rawInsert({ frameX: null, frameY: 0, frameW: 8000, frameH: 10_000 });
    const pastEdge = await rawInsert({ frameX: 2001, frameY: 0, frameW: 8000, frameH: 10_000 });
    const zeroWide = await rawInsert({ frameX: 0, frameY: 0, frameW: 0, frameH: 10_000 });
    check(
      "0027: animal_photo_sources_frame_check refuses a half-set frame, x + w = 10001 and w = 0",
      [halfSet, pastEdge, zeroWide].every((o) => o === "animal_photo_sources_frame_check"),
      `${halfSet}, ${pastEdge}, ${zeroWide}`,
    );
    const otherKey = await rawInsert({
      sourceObjectKey: `animals/${roundTrip.animal.id}/${randomUUID()}/source-${randomUUID()}.webp`,
    });
    const nested = await rawInsert({
      sourceObjectKey: `${checkKey}/nested/source-${randomUUID()}.webp`,
    });
    check(
      "0027: animal_photo_sources_object_key_check refuses a source under another key and one nested deeper",
      otherKey === "animal_photo_sources_object_key_check" &&
        nested === "animal_photo_sources_object_key_check",
      `${otherKey}, ${nested}`,
    );
    const origin = await rawInsert({ sourceOrigin: "original" as never });
    check(
      "0027: animal_photo_sources_origin_check refuses an origin other than upload or detail_variant",
      origin === "animal_photo_sources_origin_check",
      origin,
    );

    const crop = await withSources(shelterId, 2);
    const [first, second] = crop.keys as [string, string];
    const cropped = `animals/${crop.animal.id}/${randomUUID()}`;
    const beforeCrop = await historyCount(shelterId);
    const cropWrite = await write(
      crop.animal,
      [first, cropped],
      crop.keys,
      sourceOf(cropped, FRAMED),
    );
    const afterCrop = await historyCount(shelterId);
    const cropRows = await rowsOf(crop.animal);
    const cropPhotos = await photoKeysOf(crop.animal);
    check(
      "0027: a crop's one statement swaps the photo key, deletes the old row, inserts the framed row and one history line",
      cropWrite.kind === "ok" &&
        JSON.stringify(cropPhotos) === JSON.stringify([first, cropped]) &&
        JSON.stringify(cropRows) === JSON.stringify([first, cropped].sort()) &&
        afterCrop === beforeCrop + 1,
      `write ${cropWrite.kind}, photos ${cropPhotos.length}, rows ${cropRows.length} (old row ${cropRows.includes(second) ? "kept" : "gone"}), history +${afterCrop - beforeCrop}`,
    );

    const lostKey = `animals/${crop.animal.id}/${randomUUID()}`;
    const lostWrite = await write(
      crop.animal,
      [first, lostKey],
      crop.keys,
      sourceOf(lostKey, FRAMED),
    );
    const afterLost = await historyCount(shelterId);
    const lostRows = await rowsOf(crop.animal);
    const lostPhotos = await photoKeysOf(crop.animal);
    check(
      "0027: a crop planned on a stale photo list writes no photo, no source row and no history line",
      lostWrite.kind === "conflict" &&
        JSON.stringify(lostPhotos) === JSON.stringify([first, cropped]) &&
        JSON.stringify(lostRows) === JSON.stringify(cropRows) &&
        afterLost === afterCrop,
      `write ${lostWrite.kind}, rows ${lostRows.length}, history +${afterLost - afterCrop}`,
    );

    const neighbour = await withSources(shelterId, 1);
    const removal = await write(crop.animal, [cropped], [first, cropped]);
    const afterRemoval = await rowsOf(crop.animal);
    const neighbourRows = await rowsOf(neighbour.animal);
    check(
      "0027: removing a photo deletes its source row and leaves another animal's rows",
      removal.kind === "ok" &&
        JSON.stringify(afterRemoval) === JSON.stringify([cropped]) &&
        JSON.stringify(neighbourRows) === JSON.stringify(neighbour.keys),
      `write ${removal.kind}, rows ${afterRemoval.length}, neighbour rows ${neighbourRows.length}`,
    );

    const otherShelter = await insertShelter("B");
    const foreign = await sources.listForAnimal(crop.animal.id, otherShelter);
    const own = await sources.listForAnimal(crop.animal.id, shelterId);
    check(
      "0027: listForAnimal reads an animal's sources for its own shelter only",
      foreign.length === 0 && own.length === 1,
      `other shelter ${foreign.length}, own ${own.length}`,
    );

    const draft = await withSources(shelterId, 2, { kind: "draft" });
    const deleted = await kabinet.deleteDraftIf(draft.animal.id, draft.animal.version, {
      id: randomUUID(),
      entry: {
        kind: "animal_deleted",
        at: now,
        actor: ACTOR,
        animalId: draft.animal.id,
        animalName: draft.animal.name,
      },
    });
    const draftRows = await rowsOf(draft.animal);
    check(
      "0027: deleting a draft with two source rows cascades them",
      draft.inserted === 2 && deleted.kind === "ok" && draftRows.length === 0,
      `inserted ${draft.inserted}, delete ${deleted.kind}, rows left ${draftRows.length}`,
    );

    const scanned = await withSources(shelterId, 1);
    const [kept] = scanned.recorded as [PhotoSource];
    const objects = [
      ...IMAGE_VARIANT_NAMES.map((variant) => variantObjectKey(kept.storageKey, variant)),
      kept.sourceObjectKey,
    ];
    trackedKeys.push(...objects);
    const whileReferenced = await recordScan(db, objects, now);
    await write(scanned.animal, [], scanned.keys);
    const afterRemove = await recordScan(db, objects, now);
    check(
      "0027: recordScan leaves a source object under a referenced key untracked, and tracks it with the variants once the photo is removed",
      whileReferenced.newlyTracked === 0 && afterRemove.newlyTracked === objects.length,
      `referenced: ${whileReferenced.newlyTracked} tracked; removed: ${afterRemove.newlyTracked} of ${objects.length} tracked`,
    );
  } finally {
    // Delete failures must not hide a failed check above, so this runs whatever happened.
    if (trackedKeys.length > 0) {
      await db
        .delete(r2UnreferencedObjects)
        .where(inArray(r2UnreferencedObjects.objectKey, trackedKeys));
    }
  }

  return out;
}
