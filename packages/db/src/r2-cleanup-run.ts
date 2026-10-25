/**
 * GDPR photo retention (`docs/gdpr-analysis.md`) — the orchestration
 * `r2-cleanup.ts` (the CLI) and `apps/web`'s `/api/cron/r2-cleanup` cron both
 * call. Split out from `r2-cleanup.ts` on purpose: that file also imports
 * `prod-guard.ts` for its CLI's own guard, and `prod-guard.ts`'s
 * `productionEndpoint` does a dynamic `readFileSync` that Next.js's build
 * traces by walking the whole repository — harmless for a Node CLI script,
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

/** The one namespace this job ever touches — `isRealPhotoKey`'s own bound. */
export const ANIMAL_PHOTO_PREFIX = "animals/";

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
 * destructive — see `recordScan`'s own doc comment), so a dry run's report
 * of what's due is accurate rather than stale. Deletes for real only when
 * `commit`, and re-checks every candidate right before deleting
 * (`stillUnreferenced`) — Oleksii's own requirement, so a key referenced
 * again since the scan is never deleted.
 *
 * The re-check runs once, against the whole `due` list, not once per
 * network batch inside `r2.deleteObjects` (which still chunks its own
 * calls at 1000 keys). At this product's real volume — tens of photos a
 * day, not thousands — the gap between the one check and the last of a
 * few delete calls is seconds, not the minutes it would take for the
 * narrower race (a photo re-referenced mid-run, after the check but before
 * its own batch) to matter in practice. Narrowing this to a per-batch
 * check would mean `runR2Cleanup` orchestrating `deleteObjects`'s own
 * chunking rather than treating it as one call — a reasonable future
 * tightening, not done here (Tier 1 review, PR #200, note 7).
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

  const stillDue = await stillUnreferenced(db, due);
  const { deleted, failed } = await r2.deleteObjects(stillDue);
  const { snapshotsNulled } = await afterDeleted(db, deleted);

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
