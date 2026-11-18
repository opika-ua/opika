/**
 * GDPR photo retention (`docs/gdpr-analysis.md`) - the orchestration
 * `r2-cleanup.ts` (the CLI) and `apps/web`'s `/api/cron/r2-cleanup` cron both
 * call. Split out from `r2-cleanup.ts` on purpose: that file also imports
 * `prod-guard.ts` for its CLI's own guard, and `prod-guard.ts`'s
 * `productionEndpoint` does a dynamic `readFileSync` that Next.js's build
 * traces by walking the whole repository - harmless for a Node CLI script,
 * but importing it (even transitively, through `image-pipeline/server.ts`'s
 * re-export) into anything the web app's route handlers reach drags that
 * trace into the deployed bundle. This file has no such import, so
 * `server.ts` re-exports from here, never from `r2-cleanup.ts` itself.
 */
import { isPastGracePeriod, R2_CLEANUP_GRACE_PERIOD_DAYS } from "@opika/domain";
import type { Database } from "./client";
import type { R2CleanupClient } from "./image-pipeline/r2-cleanup-client";
import {
  SHELTER_LOGO_KEY_PATTERN,
  SHELTER_LOGO_PREFIX,
  storageKeyFromObjectKey,
  storageKeyFromSourceObjectKey,
} from "./image-pipeline/variants";
import {
  afterDeleted,
  ownersPresent,
  recordScan,
  stillUnreferenced,
  trackedUnreferencedObjects,
} from "./repos/r2-cleanup-repo";

/** The animal-photo namespace - `isRealPhotoKey`'s own bound. */
export const ANIMAL_PHOTO_PREFIX = "animals/";

/** The two prefixes `ListObjectsV2` is called with (pet card PR 4 added the second) - the broader `shelters/` prefix still needs `isKeyOwnedByThisJob` to narrow it to logo-shaped keys before anything is tracked; see that function. */
export const CLEANUP_PREFIXES = [ANIMAL_PHOTO_PREFIX, SHELTER_LOGO_PREFIX] as const;

/**
 * Whether a real bucket object key is one this job is allowed to act on -
 * everything under `animals/` (the whole namespace is photo variants, by
 * construction - `isRealPhotoKey`'s own assumption), or a logo-shaped key
 * under `shelters/` specifically (`SHELTER_LOGO_KEY_PATTERN`). Scanning has
 * to list the broader `shelters/` prefix (R2 takes one literal prefix per
 * call, and shelter ids vary), so this filter is what actually narrows the
 * job to `shelters/*\/logo/` rather than all of `shelters/` - without it,
 * verification evidence or any other object under a shelter's own path
 * would look unreferenced and be deleted (Tier 1 review, PR #220, finding
 * 1 - the STOP this function fixes).
 */
function isKeyOwnedByThisJob(objectKey: string): boolean {
  return objectKey.startsWith(ANIMAL_PHOTO_PREFIX) || SHELTER_LOGO_KEY_PATTERN.test(objectKey);
}

/**
 * Matches `r2-cleanup-client.ts`'s own `DELETE_BATCH_SIZE` - the re-check
 * below runs once per batch at this same size, so "before each batch"
 * means the same batch the real R2 call makes, not an arbitrary smaller
 * slice (Tier 1 review, PR #200, finding re: "re-checking before each
 * batch" never actually being built, only documented as accepted).
 */
const DELETE_BATCH_SIZE = 1000;

/**
 * Blast-radius cap: at most this many distinct photos or logos due in one run whose animal or
 * shelter still exists, else nothing is deleted; only the CLI's `--max-photos` raises it. A day of
 * ~100 photos or crops (crop-frame Q4), counted in photos so no format change moves it (owner,
 * 2026-11-16). It is also the per-run budget (P0-4): photos whose row is gone (a deleted
 * application or draft) never trip it, and a run deletes at most this many photos in all, the
 * rest staying tracked for the next run.
 */
export const DEFAULT_MAX_PHOTOS_PER_RUN = 100;

/**
 * The photos among these keys, each with its objects. A variant or a kept source belongs to the
 * photo whose folder holds it; any other key (or a second source in one folder) is a photo of its
 * own, so an object of no known shape can only tighten the cap, never loosen it.
 */
export function photoGroupsOf(objectKeys: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const sourced = new Set<string>();
  const add = (group: string, key: string) => {
    const keys = groups.get(group);
    if (keys === undefined) groups.set(group, [key]);
    else keys.push(key);
  };
  for (const key of new Set(objectKeys)) {
    const variantOf = storageKeyFromObjectKey(key);
    if (variantOf !== null) {
      add(`photo:${variantOf}`, key);
      continue;
    }
    const sourceOf = storageKeyFromSourceObjectKey(key);
    if (sourceOf !== null && !sourced.has(sourceOf)) {
      sourced.add(sourceOf);
      add(`photo:${sourceOf}`, key);
      continue;
    }
    add(`alone:${key}`, key);
  }
  return groups;
}

/** How many photos the cap counts among these keys (`photoGroupsOf`). */
export function photosAmong(objectKeys: readonly string[]): number {
  return photoGroupsOf(objectKeys).size;
}

const ANIMAL_OWNER = /^(?:photo|alone):animals\/([^/]+)\/./;
const SHELTER_OWNER = /^(?:photo|alone):shelters\/([^/]+)\/logo\//;

/** The row a photo group hangs off, read from its path; null for a key of no known shape. */
export function photoOwnerOf(
  group: string,
): { kind: "animal"; id: string } | { kind: "shelter"; id: string } | null {
  const animal = ANIMAL_OWNER.exec(group)?.[1];
  if (animal !== undefined) return { kind: "animal", id: animal };
  const shelter = SHELTER_OWNER.exec(group)?.[1];
  return shelter === undefined ? null : { kind: "shelter", id: shelter };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type R2CleanupReport = {
  scanned: number;
  newlyTracked: number;
  clearedBack: number;
  dueForDeletion: readonly string[];
  /** `photosAmong(dueForDeletion)`, printed so a dry run shows it too. */
  duePhotos: number;
  /** Of `duePhotos`, those whose animal or shelter row is gone: the budget's, never the cap's. */
  orphanedPhotos: number;
  /** Due but over this run's budget: still tracked, for the next run. */
  deferred: readonly string[];
  deferredPhotos: number;
  deleted: readonly string[];
  failed: readonly { key: string; message: string }[];
  snapshotsNulled: number;
  /** Set when a commit run found more due photos of existing rows than the cap; nothing was deleted. */
  capTripped: { photos: number; objects: number; cap: number } | null;
};

/**
 * One full run. Always scans and records (bookkeeping, idempotent, never
 * destructive - see `recordScan`'s own doc comment), so a dry run's report
 * of what's due is accurate rather than stale. Deletes for real only when
 * `commit`, and re-checks right before deleting (`stillUnreferenced`) -
 * Oleksii's own requirement, "re-checking before each batch," so a key
 * referenced again since the scan is never deleted. "Each batch" is this
 * file's own `DELETE_BATCH_SIZE` chunk, matching `r2-cleanup-client.ts`'s
 * own real network batch - the re-check and the delete for one chunk
 * happen back to back before the next chunk's re-check even starts,
 * narrowing the race window to one chunk's own round trip rather than the
 * whole run's (Tier 1 review, PR #200: an earlier version of this comment
 * accepted a single up-front check as good enough at this product's real
 * volume, which a delta review correctly read as *documenting* the gap
 * Oleksii's own confirmation asked to have closed, not closing it).
 */
export async function runR2Cleanup(
  db: Database,
  r2: R2CleanupClient,
  now: Date,
  options: { commit: boolean; graceDays: number | undefined; maxPhotos?: number | undefined },
): Promise<R2CleanupReport> {
  const graceDays = options.graceDays ?? R2_CLEANUP_GRACE_PERIOD_DAYS;
  const maxPhotos = options.maxPhotos ?? DEFAULT_MAX_PHOTOS_PER_RUN;
  // `n > NaN` is false: a cap that isn't a positive whole number would let everything through.
  if (!Number.isInteger(maxPhotos) || maxPhotos < 1) {
    throw new Error("The clean-up's photo cap must be a positive whole number");
  }
  // One listing call per prefix - R2's own ListObjectsV2 takes exactly one
  // prefix, so the two namespaces can't be scanned in a single call. The
  // shelters/ listing is broader than what this job owns, so it's narrowed
  // by isKeyOwnedByThisJob before anything downstream ever sees it.
  const perPrefix = await Promise.all(CLEANUP_PREFIXES.map((prefix) => r2.listObjectKeys(prefix)));
  const bucketKeys = perPrefix.flat().filter(isKeyOwnedByThisJob);
  const { newlyTracked, cleared } = await recordScan(db, bucketKeys, now);

  const tracked = await trackedUnreferencedObjects(db);
  const firstSeen = new Map(tracked.map((row) => [row.objectKey, row.firstSeenUnreferencedAt]));
  const due = tracked
    .filter((row) => isPastGracePeriod(row.firstSeenUnreferencedAt, now, graceDays))
    .map((row) => row.objectKey);
  const plan = await budgetPlan(db, due, firstSeen, maxPhotos);
  const base = {
    scanned: bucketKeys.length,
    newlyTracked,
    clearedBack: cleared,
    dueForDeletion: due,
    duePhotos: plan.photos,
    orphanedPhotos: plan.orphanedPhotos,
  };

  if (!options.commit || due.length === 0) {
    return {
      ...base,
      deferred: plan.deferred,
      deferredPhotos: plan.deferredPhotos,
      deleted: [],
      failed: [],
      snapshotsNulled: 0,
      capTripped: null,
    };
  }

  if (plan.livePhotos > maxPhotos) {
    return {
      ...base,
      deferred: [],
      deferredPhotos: 0,
      deleted: [],
      failed: [],
      snapshotsNulled: 0,
      capTripped: { photos: plan.livePhotos, objects: plan.liveObjects, cap: maxPhotos },
    };
  }

  let deleted: string[] = [];
  let failed: { key: string; message: string }[] = [];
  let snapshotsNulled = 0;
  for (const batch of chunk(plan.toDelete, DELETE_BATCH_SIZE)) {
    const stillDueInBatch = await stillUnreferenced(db, batch);
    const batchResult = await r2.deleteObjects(stillDueInBatch);
    const batchNulled = await afterDeleted(db, batchResult.deleted);
    deleted = deleted.concat(batchResult.deleted);
    failed = failed.concat(batchResult.failed);
    snapshotsNulled += batchNulled.snapshotsNulled;
  }

  return {
    ...base,
    deferred: plan.deferred,
    deferredPhotos: plan.deferredPhotos,
    deleted,
    failed,
    snapshotsNulled,
    capTripped: null,
  };
}

/**
 * Which due photos this run deletes (P0-4). Photos of a row that still exists come first and are
 * what the cap counts: a burst of them means something unexpected, so the run stops. Photos whose
 * row is gone follow, oldest first, until the run has `budget` photos; the rest wait for later
 * runs. A key of no known shape counts as a live row's, so it can only tighten the stop.
 */
async function budgetPlan(
  db: Database,
  due: readonly string[],
  firstSeen: ReadonlyMap<string, Date>,
  budget: number,
) {
  const groups = [...photoGroupsOf(due)];
  const present = await ownersPresent(
    db,
    groups.map(([group]) => photoOwnerOf(group)).filter((owner) => owner !== null),
  );
  const isLive = (group: string) => {
    const owner = photoOwnerOf(group);
    return owner === null || present[owner.kind].has(owner.id);
  };
  const oldest = (keys: readonly string[]) =>
    Math.min(...keys.map((key) => firstSeen.get(key)?.getTime() ?? Number.POSITIVE_INFINITY));
  const live = groups.filter(([group]) => isLive(group));
  const orphaned = groups
    .filter(([group]) => !isLive(group))
    .sort(([a, aKeys], [b, bKeys]) => oldest(aKeys) - oldest(bKeys) || a.localeCompare(b));
  const ordered = [...live, ...orphaned];
  const taken = ordered.slice(0, budget);
  const left = ordered.slice(budget);
  return {
    photos: groups.length,
    livePhotos: live.length,
    liveObjects: live.reduce((n, [, keys]) => n + keys.length, 0),
    orphanedPhotos: orphaned.length,
    toDelete: taken.flatMap(([, keys]) => keys),
    deferred: left.flatMap(([, keys]) => keys),
    deferredPhotos: left.length,
  };
}

export function formatReport(
  report: R2CleanupReport,
  heading: "Would delete" | "Deleted",
): string[] {
  const lines = [
    `Bucket objects scanned (${CLEANUP_PREFIXES.join(", ")}): ${report.scanned}`,
    `Newly tracked as unreferenced: ${report.newlyTracked}`,
    `Referenced again, untracked: ${report.clearedBack}`,
    `Past the grace period (${heading}): ${report.dueForDeletion.length}`,
    `Photos and logos among them: ${report.duePhotos}`,
    `Of those, whose animal or shelter still exists (what the cap counts): ${report.duePhotos - report.orphanedPhotos}`,
  ];
  for (const key of report.dueForDeletion) lines.push(`  ${key}`);
  if (report.deferredPhotos > 0) {
    lines.push(
      `Over this run's budget, left tracked for the next run: ${report.deferredPhotos} photos (${report.deferred.length} objects)`,
    );
  }
  if (report.capTripped !== null) {
    const { photos, objects, cap } = report.capTripped;
    lines.push(
      `REFUSED: ${photos} photos (${objects} objects) are due, over the cap of ${cap} photos per run. Nothing was deleted. Check why before raising it (--max-photos <n>).`,
    );
  }
  if (heading === "Deleted") {
    lines.push(`Deleted: ${report.deleted.length}`);
    lines.push(`Reveal snapshots nulled: ${report.snapshotsNulled}`);
    if (report.failed.length > 0) {
      lines.push(`Failed (left in place, left tracked): ${report.failed.length}`);
      for (const { key, message } of report.failed) lines.push(`  ${key}: ${message}`);
    }
  }
  return lines;
}
