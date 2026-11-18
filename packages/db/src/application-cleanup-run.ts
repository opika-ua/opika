/**
 * The daily clean-up of applications (D8, §14 Q4, P0-3): every application `dueApplications`
 * selects (`cleanupVerdictOf`'s SQL twin) goes through the one deletion service, which re-checks
 * it inside its own transaction. Database rows only: the photos leave R2 through the R2 clean-up
 * job, the only deleter of R2 objects. Shared by the CLI (`application-cleanup.ts`) and the
 * scheduled route; no `prod-guard` import here, for the same bundling reason as `r2-cleanup-run.ts`.
 */
import type { Database } from "./client";
import {
  type ApplicationDeletionOutcome,
  applicationDeletionRepo,
  type DueApplication,
} from "./repos/application-deletion-repo";

/** At most this many deletions a run; the rest wait for the next day's (a bad day can't cascade). */
export const APPLICATION_DELETIONS_PER_RUN = 50;

export type ApplicationCleanupReport = {
  due: readonly DueApplication[];
  /** Due, but over this run's cap: left as they are for the next run. */
  deferred: readonly DueApplication[];
  deleted: readonly { shelterId: string; reason: DueApplication["reason"]; photoKeys: number }[];
  /** Selected, then found no longer due inside the transaction: nothing was written. */
  notDue: readonly DueApplication[];
  /** Ids and an error class only: a database message can carry values. */
  failed: readonly (DueApplication & { error: string })[];
};

/** A dry run selects and deletes nothing; a commit deletes each due row, one transaction each. */
export async function runApplicationCleanup(
  db: Database,
  now: Date,
  options: { commit: boolean; maxDeletions?: number },
): Promise<ApplicationCleanupReport> {
  const cap = options.maxDeletions ?? APPLICATION_DELETIONS_PER_RUN;
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error("The application clean-up's cap must be a positive whole number");
  }
  const repo = applicationDeletionRepo(db);
  const due = await repo.dueApplications(now);
  const deferred = due.slice(cap);
  if (!options.commit) return { due, deferred, deleted: [], notDue: [], failed: [] };
  const deleted: ApplicationCleanupReport["deleted"][number][] = [];
  const notDue: DueApplication[] = [];
  const failed: ApplicationCleanupReport["failed"][number][] = [];
  for (const row of due.slice(0, cap)) {
    let outcome: ApplicationDeletionOutcome;
    try {
      outcome = await repo.deleteApplication(row.shelterId, row.reason, now);
    } catch (error) {
      failed.push({ ...row, error: error instanceof Error ? error.name : "unknown" });
      continue;
    }
    if (outcome.kind === "deleted") {
      deleted.push({ shelterId: row.shelterId, reason: row.reason, photoKeys: outcome.photoKeys });
    } else {
      notDue.push(row);
    }
  }
  return { due, deferred, deleted, notDue, failed };
}

/** What a run prints: ids and reasons, never a name or an address. */
export function formatApplicationCleanupReport(
  report: ApplicationCleanupReport,
  commit: boolean,
): string[] {
  const lines = [`Due for deletion: ${report.due.length}`];
  for (const row of report.due) lines.push(`  ${row.shelterId} ${row.reason}`);
  if (report.deferred.length > 0) {
    lines.push(`Over this run's cap, left for the next run: ${report.deferred.length}`);
  }
  if (!commit) return lines;
  lines.push(`Deleted: ${report.deleted.length}`);
  lines.push(
    `Photos unlinked (the R2 clean-up removes them): ${report.deleted.reduce((n, row) => n + row.photoKeys, 0)}`,
  );
  if (report.notDue.length > 0) {
    lines.push(`No longer due, left as they are: ${report.notDue.length}`);
    for (const row of report.notDue) lines.push(`  ${row.shelterId} ${row.reason}`);
  }
  if (report.failed.length > 0) {
    lines.push(`Failed, nothing written for them: ${report.failed.length}`);
    for (const row of report.failed) lines.push(`  ${row.shelterId} ${row.reason} ${row.error}`);
  }
  return lines;
}
