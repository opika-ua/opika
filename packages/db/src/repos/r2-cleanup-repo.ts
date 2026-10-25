import { inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  IMAGE_VARIANT_NAMES,
  storageKeyFromObjectKey,
  variantObjectKey,
} from "../image-pipeline/variants";
import { executeRows } from "../raw-rows";
import { r2UnreferencedObjects } from "../schema/r2-cleanup";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`): the one source of "this
 * photo is referenced" — every `storageKey` in any `animals.photos` row,
 * any listing state (draft/published/reserved/adopted/withdrawn all count).
 *
 * `reveals.animal_snapshot.primaryPhoto` is deliberately **not** read here.
 * Oleksii, 2026-10-25: "check whether [it] is displayed anywhere today. If
 * not, don't count it as a reference" — traced every consumer of
 * `ContactRevealView`; `reveals.listMine` has a handler but no route or
 * component anywhere calls it, so nothing renders it. A snapshot's
 * `primaryPhoto` can therefore end up pointing at a deleted object — that's
 * `nullDanglingSnapshotsFor` below, not a reason to protect the object.
 *
 * Raw SQL (`jsonb_array_elements`), not a typed `.select()` chain: pulling
 * one field out of every element of a jsonb array has no natural Drizzle
 * builder expression. Read through `executeRows`, not a raw `.execute()`
 * destructure (standing constraints, R1 — the two drivers this repo runs
 * return a raw result in different shapes).
 */
export async function referencedStorageKeys(db: Database): Promise<Set<string>> {
  const rows = await executeRows<{ storage_key: string }>(
    db,
    sql`
      SELECT DISTINCT photo->>'storageKey' AS storage_key
      FROM "animals", jsonb_array_elements("animals"."photos") AS photo
    `,
  );
  return new Set(rows.map((row) => row.storage_key));
}

/** Every real R2 object key (all three variants) a currently-referenced storage key derives to. */
export async function referencedObjectKeys(db: Database): Promise<Set<string>> {
  const storageKeys = await referencedStorageKeys(db);
  const objectKeys = new Set<string>();
  for (const storageKey of storageKeys) {
    for (const variant of IMAGE_VARIANT_NAMES)
      objectKeys.add(variantObjectKey(storageKey, variant));
  }
  return objectKeys;
}

/**
 * One scan's worth of bookkeeping against the tracking table
 * (`r2_unreferenced_objects`): every `bucketObjectKeys` entry not in the
 * referenced set is marked first-seen-unreferenced-now, unless already
 * tracked (`onConflictDoNothing` — a key's own first-seen instant is never
 * pushed later by a later scan); every *tracked* key that is now referenced
 * again is untracked (self-healing, no write-path hook needed — a photo
 * removed, then re-added before the next scan, simply never gets a row,
 * and a row that was already written gets deleted the next time this runs).
 * Idempotent: a re-run with the same inputs changes nothing further.
 *
 * `bucketObjectKeys` must be the *complete* listing for this run (every
 * page of a paginated `ListObjectsV2`, collected by the caller first) — a
 * partial page would make every untracked-but-still-unreferenced key on
 * the missing pages look "referenced again" and get wrongly cleared.
 */
export async function recordScan(
  db: Database,
  bucketObjectKeys: readonly string[],
  now: Date,
): Promise<{ newlyTracked: number; cleared: number }> {
  const referenced = await referencedObjectKeys(db);
  const unreferenced = bucketObjectKeys.filter((key) => !referenced.has(key));

  const tracked =
    unreferenced.length === 0
      ? []
      : await db
          .insert(r2UnreferencedObjects)
          .values(unreferenced.map((objectKey) => ({ objectKey, firstSeenUnreferencedAt: now })))
          .onConflictDoNothing()
          .returning({ objectKey: r2UnreferencedObjects.objectKey });

  const cleared =
    referenced.size === 0
      ? []
      : await db
          .delete(r2UnreferencedObjects)
          .where(inArray(r2UnreferencedObjects.objectKey, [...referenced]))
          .returning({ objectKey: r2UnreferencedObjects.objectKey });

  return { newlyTracked: tracked.length, cleared: cleared.length };
}

/** Every tracked key, with how long it's been tracked — the caller applies the grace period (`isPastGracePeriod`, `@opika/domain`). */
export async function trackedUnreferencedObjects(
  db: Database,
): Promise<{ objectKey: string; firstSeenUnreferencedAt: Date }[]> {
  return db.select().from(r2UnreferencedObjects);
}

/**
 * Re-derives the referenced set fresh and filters a candidate batch down to
 * keys still actually unreferenced — the re-check Oleksii required right
 * before each batch's delete, so a key referenced again since the scan is
 * skipped, never deleted.
 */
export async function stillUnreferenced(
  db: Database,
  candidateObjectKeys: readonly string[],
): Promise<string[]> {
  const referenced = await referencedObjectKeys(db);
  return candidateObjectKeys.filter((key) => !referenced.has(key));
}

/**
 * After a real R2 delete confirms these keys are gone: clears their
 * tracking rows, and nulls any `reveals.animal_snapshot.primaryPhoto` whose
 * `storageKey` matches one of them — Oleksii, 2026-10-25: "when its object
 * is deleted, set that snapshot's primaryPhoto to null in the same run (so
 * nothing points at a missing file)." Grouped by `storageKey`, not
 * `objectKey`: a snapshot names a photo, not a variant, and all three of a
 * photo's variants are always deleted together (the reference check above
 * is keyed on `storageKey` too), so this runs once per photo, not three
 * times.
 */
export async function afterDeleted(
  db: Database,
  deletedObjectKeys: readonly string[],
): Promise<{ snapshotsNulled: number }> {
  if (deletedObjectKeys.length === 0) return { snapshotsNulled: 0 };
  await db
    .delete(r2UnreferencedObjects)
    .where(inArray(r2UnreferencedObjects.objectKey, [...deletedObjectKeys]));

  const storageKeys = [
    ...new Set(
      deletedObjectKeys
        .map((key) => storageKeyFromObjectKey(key))
        .filter((key): key is string => key !== null),
    ),
  ];
  if (storageKeys.length === 0) return { snapshotsNulled: 0 };

  // Scalar parameters only, never an array binding — the two drivers this
  // repo runs (postgres-js locally, neon-http in production) aren't proven
  // to bind a JS array into `ANY($1)`/`unnest($1)` identically (standing
  // constraints, R1), so each storage key gets its own `OR`'d equality
  // instead, exactly like every other multi-value raw-SQL match in this
  // package (`admin-erasure-repo.ts`'s own `kindList`, built the same way).
  const matchesAStorageKey = sql.join(
    storageKeys.map(
      (key) => sql`lower("animal_snapshot"->'primaryPhoto'->>'storageKey') = lower(${key})`,
    ),
    sql` OR `,
  );
  const rows = await executeRows<{ id: string }>(
    db,
    sql`
      UPDATE "reveals"
      SET "animal_snapshot" = jsonb_set("animal_snapshot", '{primaryPhoto}', 'null'::jsonb)
      WHERE ${matchesAStorageKey}
      RETURNING "id"
    `,
  );
  return { snapshotsNulled: rows.length };
}
