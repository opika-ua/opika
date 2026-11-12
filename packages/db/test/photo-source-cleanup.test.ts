import { randomUUID } from "node:crypto";
import {
  type Animal,
  type AnimalPhoto,
  type CityId,
  type ModeratorId,
  type PhotoFraming,
  type ShelterAdminId,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatPlan, planDemoRemoval, removeDemoCorpus } from "../src/demo-remove";
import type { R2CleanupClient } from "../src/image-pipeline/r2-cleanup-client";
import type { ImageStorageClient } from "../src/image-pipeline/r2-client";
import { storePhoto } from "../src/image-pipeline/upload-animal-photo";
import {
  IMAGE_VARIANTS,
  type ImageVariantName,
  photoSourceObjectKeyFor,
} from "../src/image-pipeline/variants";
import { DEFAULT_MAX_DELETE_PER_RUN, runR2Cleanup } from "../src/r2-cleanup-run";
import { executeRows } from "../src/raw-rows";
import { erasableIf, eraseUsersAndScrubHistory } from "../src/repos/admin-erasure-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { type AnimalHistoryRow, kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { type PhotoSource, photoSourcesRepo } from "../src/repos/photo-sources-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animalPhotoSources } from "../src/schema/animal-photo-sources";
import { authMember, authOrganization, authUser } from "../src/schema/auth";
import { shelters } from "../src/schema/shelters";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * Crop frame, owner's condition 3: a kept source is deleted exactly when its photo's variants are.
 * Each path end to end: `storePhoto`'s objects, the path, the clean-up on day 0 and day 8.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const DAY_0 = new Date("2026-11-12T04:00:00.000Z");
const DAYS = 24 * 60 * 60 * 1000;
const DAY_8 = new Date(DAY_0.getTime() + 8 * DAYS);
const ACTOR = {
  kind: "shelter_admin",
  shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
} as const;

/** A bucket both writers and the clean-up see: `storePhoto` puts, the job lists and deletes. */
function bucket() {
  const objects = new Set<string>();
  const storage: ImageStorageClient = {
    async put(key) {
      objects.add(key);
    },
    async get() {
      throw new Error("not read here");
    },
  };
  const r2: R2CleanupClient = {
    async listObjectKeys(prefix) {
      return [...objects].filter((key) => key.startsWith(prefix));
    },
    async deleteObjects(keys) {
      const deleted = keys.filter((key) => objects.delete(key));
      return { deleted, failed: [] };
    },
  };
  return { objects, storage, r2 };
}
type Bucket = ReturnType<typeof bucket>;

const VARIANT_BYTES = Object.fromEntries(
  Object.keys(IMAGE_VARIANTS).map((name) => [name, Buffer.from([1])]),
) as Record<ImageVariantName, Buffer>;

/** One photo as an upload or a crop stores it: five variants and a kept source, plus its row. */
async function stored(
  store: Bucket,
  animalId: string,
  framing: PhotoFraming = { kind: "attention" },
): Promise<{ photo: AnimalPhoto; source: PhotoSource; objects: string[] }> {
  const storageKey = `animals/${animalId}/${randomUUID()}`;
  const sourceObjectKey = photoSourceObjectKeyFor(storageKey, randomUUID());
  const before = new Set(store.objects);
  await storePhoto(store.storage, storageKey, VARIANT_BYTES, {
    objectKey: sourceObjectKey,
    bytes: Buffer.from([2]),
  });
  return {
    photo: { storageKey, width: 1600, height: 1200, alt: null },
    source: {
      storageKey,
      sourceObjectKey,
      origin: "upload",
      width: 1600,
      height: 1200,
      framing,
    },
    objects: [...store.objects].filter((key) => !before.has(key)).sort(),
  };
}

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

/** An animal whose photos were each stored with their source, rows recorded. */
async function animalWith(
  store: Bucket,
  count: number,
  listing?: Animal["listing"],
  shelterId?: ShelterId,
) {
  const draft = makeAnimal({
    shelterId: shelterId ?? (await insertShelter()),
    ...(listing ? { listing } : {}),
  });
  const photos = [];
  for (let i = 0; i < count; i += 1) photos.push(await stored(store, draft.id));
  const animal: Animal = { ...draft, photos: photos.map((p) => p.photo) };
  await animalRepo(db).insert(animal, cityId);
  await photoSourcesRepo(db).insertForAnimal(
    animal.id,
    photos.map((p) => p.source),
    DAY_0,
  );
  return { animal, photos };
}

const photosLine = (animal: Animal): AnimalHistoryRow<"animal_edited"> => ({
  id: randomUUID(),
  entry: {
    kind: "animal_edited",
    at: DAY_0,
    actor: ACTOR,
    animalId: animal.id,
    animalName: animal.name,
    fields: ["photos"],
  },
});

/** The job on `from` (tracks what is unreferenced) and 8 days later (deletes it): what it deleted. */
async function sweep(store: Bucket, from = DAY_0): Promise<string[]> {
  const first = await runR2Cleanup(db, store.r2, from, { commit: true, graceDays: undefined });
  expect(first.deleted, "nothing goes inside the grace period").toEqual([]);
  const later = await runR2Cleanup(db, store.r2, new Date(from.getTime() + 8 * DAYS), {
    commit: true,
    graceDays: undefined,
  });
  expect(later.capTripped).toBeNull();
  return [...later.deleted].sort();
}

const sourceRowsOf = (animalIds: readonly string[]) =>
  db
    .select()
    .from(animalPhotoSources)
    .where(inArray(animalPhotoSources.animalId, animalIds as never));

describe("a photo's source goes with its photo, through the clean-up job only (condition 3)", () => {
  it("photo removed: its variants and its source go; the other photo's six stay", async () => {
    const store = bucket();
    const { animal, photos } = await animalWith(store, 2);
    const [removed, kept] = photos as [(typeof photos)[0], (typeof photos)[0]];
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        animal.id,
        { next: [kept.photo], expected: animal.photos },
        { next: animal.listing, expected: animal.listing },
        DAY_0,
        photosLine(animal),
      ),
    ).toEqual({ kind: "ok" });

    expect(await sweep(store)).toEqual(removed.objects);
    expect(removed.objects).toContain(removed.source.sourceObjectKey);
    expect([...store.objects].sort()).toEqual(kept.objects);
  });

  it("photo cropped: the old key's variants and source go; the new key's six stay", async () => {
    const store = bucket();
    const { animal, photos } = await animalWith(store, 1);
    const [old] = photos as [(typeof photos)[0]];
    const cropped = await stored(store, animal.id, {
      kind: "frame",
      frame: { x: 0.25, y: 0, w: 0.5, h: 0.5 },
    });
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        animal.id,
        { next: [cropped.photo], expected: animal.photos },
        { next: animal.listing, expected: animal.listing },
        DAY_0,
        photosLine(animal),
        { kind: "record", source: cropped.source },
      ),
    ).toEqual({ kind: "ok" });

    expect(await sweep(store)).toEqual(old.objects);
    expect([...store.objects].sort()).toEqual(cropped.objects);
  });

  it("animal deleted (a never-published draft): every photo's six go", async () => {
    const store = bucket();
    const { animal, photos } = await animalWith(store, 2, { kind: "draft" });
    expect(
      await kabinetAnimalRepo(db).deleteDraftIf(animal.id, animal.version, {
        id: randomUUID(),
        entry: {
          kind: "animal_deleted",
          at: DAY_0,
          actor: ACTOR,
          animalId: animal.id,
          animalName: animal.name,
        },
      }),
    ).toEqual({ kind: "ok" });

    expect(await sweep(store)).toEqual(photos.flatMap((p) => p.objects).sort());
    expect(store.objects.size).toBe(0);
  });

  it("shelter leaving (demo:remove --shelter): its animals' six per photo go, listed first; another shelter's stay", async () => {
    const store = bucket();
    const leaving = await insertShelter();
    const staying = await insertShelter();
    const gone = await animalWith(store, 2, undefined, leaving);
    const kept = await animalWith(store, 1, undefined, staying);
    const target = { kind: "shelters", ids: [leaving] } as const;
    const policy = testOnlyLocationPolicy("seed");

    // The dry run lists every object the clean-up will take, sources included, and the rows.
    const plan = await planDemoRemoval(db, policy, target);
    const goneObjects = gone.photos.flatMap((p) => p.objects).sort();
    expect([...plan.photoObjectKeys].sort()).toEqual(goneObjects);
    expect(plan.cascades.animal_photo_sources).toBe(2);
    expect(formatPlan(plan, "Would delete").join("\n")).toContain(
      gone.photos[0]?.source.sourceObjectKey,
    );

    expect((await removeDemoCorpus(db, policy, target)).kind).toBe("removed");
    // No row outlives the leaving shelter's animals; the staying one keeps its own.
    expect(await sourceRowsOf([gone.animal.id])).toEqual([]);
    expect(await sourceRowsOf([kept.animal.id])).toHaveLength(1);

    expect(await sweep(store)).toEqual(goneObjects);
    expect([...store.objects].sort()).toEqual(kept.photos.flatMap((p) => p.objects).sort());
  });

  /**
   * Condition 3's erasure path: it removes the account, not the shelter's photos. The source names
   * no one, so it stays with its photo and goes when the photo is removed (/pro: «разом із фото»).
   */
  it("admin erasure: the account goes; the photo's six objects and its source row stay, naming no one, until the photo is removed", async () => {
    const store = bucket();
    const shelterId = await insertShelter();
    const organizationId = randomUUID();
    await db.insert(authOrganization).values({
      id: organizationId,
      name: "Тестовий притулок",
      slug: `test-${organizationId}`,
      logo: null,
      createdAt: DAY_0,
      metadata: null,
    });
    await db
      .update(shelters)
      .set({ organizationId })
      .where(eq(shelters.id, shelterId as never));
    const admin = { id: randomUUID(), name: "Erased Admin", email: "erased-admin@example.org" };
    await db.insert(authUser).values({
      ...admin,
      emailVerified: true,
      image: null,
      createdAt: DAY_0,
      updatedAt: DAY_0,
    });
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId: admin.id,
      role: "admin",
      createdAt: DAY_0,
    });
    const { animal, photos } = await animalWith(store, 1, undefined, shelterId);
    const [photo] = photos as [(typeof photos)[0]];

    // registry.admins.remove's own two steps: the membership goes (recorded), then the erasure.
    expect(
      await kabinetInvitationRepo(db).removeMember({
        organizationId,
        userId: admin.id,
        history: {
          id: randomUUID(),
          shelterId,
          entry: {
            kind: "admin_removed",
            at: DAY_0,
            moderatorId: randomUUID() as ModeratorId,
            email: admin.email,
            wasPending: false,
          },
        },
      }),
    ).toBe(true);
    expect((await eraseUsersAndScrubHistory(db, erasableIf(admin.id, DAY_0))).erasedCount).toBe(1);

    // (a) the account is gone.
    expect(await db.select().from(authUser).where(eq(authUser.id, admin.id))).toEqual([]);
    // (b) the photo is untouched: the job, past the grace period, takes none of its six objects.
    expect(await sweep(store)).toEqual([]);
    expect([...store.objects].sort()).toEqual(photo.objects);
    // (c) its source row is still there, and nothing in it is the person's.
    const columns = await executeRows<{ column_name: string }>(
      db,
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'animal_photo_sources'`,
    );
    expect(columns.map((c) => c.column_name).sort()).toEqual(
      [
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
      ].sort(),
    );
    const rows = await executeRows<Record<string, unknown>>(
      db,
      sql`SELECT * FROM "animal_photo_sources" WHERE "animal_id" = ${animal.id}`,
    );
    expect(rows.map((row) => row.source_object_key)).toEqual([photo.source.sourceObjectKey]);
    for (const value of Object.values(rows[0] ?? {})) {
      for (const personal of Object.values(admin)) expect(String(value)).not.toContain(personal);
    }

    // Then the photo is removed: all six go together, the kept copy included, and its row with them.
    const later = new Date(DAY_8.getTime() + DAYS);
    expect(
      await kabinetAnimalRepo(db).writePhotosIf(
        animal.id,
        { next: [], expected: animal.photos },
        { next: animal.listing, expected: animal.listing },
        later,
        photosLine(animal),
      ),
    ).toEqual({ kind: "ok" });
    expect(await sweep(store, later)).toEqual(photo.objects);
    expect(photo.objects).toContain(photo.source.sourceObjectKey);
    expect(store.objects.size).toBe(0);
    expect(await sourceRowsOf([animal.id])).toEqual([]);
  });

  it("a photo still on its card keeps its source, whatever happens to rows: nothing is swept", async () => {
    const store = bucket();
    await animalWith(store, 2);
    expect(await sweep(store)).toEqual([]);
    expect(store.objects.size).toBe(12);
  });
});

describe("the clean-up cap (owner, crop-frame Q4)", () => {
  it("is 600: one photo or one crop leaves six objects, so a day of 100 fits", async () => {
    const store = bucket();
    const { objects } = await stored(store, randomUUID());
    expect(objects).toHaveLength(6);
    expect(DEFAULT_MAX_DELETE_PER_RUN).toBe(600);
    expect(DEFAULT_MAX_DELETE_PER_RUN).toBe(100 * objects.length);
  });
});
