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
  afterDeleted,
  recordScan,
  stillUnreferenced,
  trackedUnreferencedObjects,
} from "./repos/r2-cleanup-repo";

/** The one namespace this job ever touches - `isRealPhotoKey`'s own bound. */
export const ANIMAL_PHOTO_PREFIX = "animals/";

/**
 * Matches `r2-cleanup-client.ts`'s own `DELETE_BATCH_SIZE` - the re-check
 * below runs once per batch at this same size, so "before each batch"
 * means the same batch the real R2 call makes, not an arbitrary smaller
 * slice (Tier 1 review, PR #200, finding re: "re-checking before each
 * batch" never actually being built, only documented as accepted).
 */
const DELETE_BATCH_SIZE = 1000;

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
  deleted: readonly string[];
  failed: readonly { key: string; message: string }[];
  snapshotsNulled: number;
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
  options: { commit: boolean; graceDays: number | undefined },
): Promise<R2CleanupReport> {
  const graceDays = options.graceDays ?? R2_CLEANUP_GRACE_PERIOD_DAYS;
  const bucketKeys = await r2.listObjectKeys(ANIMAL_PHOTO_PREFIX);
  const { newlyTracked, cleared } = await recordScan(db, bucketKeys, now);

  const tracked = await trackedUnreferencedObjects(db);
  const due = tracked
    .filter((row) => isPastGracePeriod(row.firstSeenUnreferencedAt, now, graceDays))
    .map((row) => row.objectKey);

  if (!options.commit || due.length === 0) {
    return {
      scanned: bucketKeys.length,
      newlyTracked,
      clearedBack: cleared,
      dueForDeletion: due,
      deleted: [],
      failed: [],
      snapshotsNulled: 0,
    };
  }

  let deleted: string[] = [];
  let failed: { key: string; message: string }[] = [];
  let snapshotsNulled = 0;
  for (const batch of chunk(due, DELETE_BATCH_SIZE)) {
    const stillDueInBatch = await stillUnreferenced(db, batch);
    const batchResult = await r2.deleteObjects(stillDueInBatch);
    const batchNulled = await afterDeleted(db, batchResult.deleted);
    deleted = deleted.concat(batchResult.deleted);
    failed = failed.concat(batchResult.failed);
    snapshotsNulled += batchNulled.snapshotsNulled;
  }

  return {
    scanned: bucketKeys.length,
    newlyTracked,
    clearedBack: cleared,
    dueForDeletion: due,
    deleted,
    failed,
    snapshotsNulled,
  };
}

export function formatReport(
  report: R2CleanupReport,
  heading: "Would delete" | "Deleted",
): string[] {
  const lines = [
    `Bucket objects scanned (${ANIMAL_PHOTO_PREFIX}): ${report.scanned}`,
    `Newly tracked as unreferenced: ${report.newlyTracked}`,
    `Referenced again, untracked: ${report.clearedBack}`,
    `Past the grace period (${heading}): ${report.dueForDeletion.length}`,
  ];
  for (const key of report.dueForDeletion) lines.push(`  ${key}`);
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
