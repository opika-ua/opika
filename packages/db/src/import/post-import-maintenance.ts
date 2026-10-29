import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { executeRows } from "../raw-rows";

/** The two GIN trigram indexes `cities.search` reads; both are named here, never taken from input. */
export const TRIGRAM_INDEXES = [
  "cities_search_name_trgm_idx",
  "cities_search_latin_trgm_idx",
] as const;

export type StatisticsRefresh = { kind: "refreshed" } | { kind: "failed"; message: string };
export type PendingListMerge =
  | { index: (typeof TRIGRAM_INDEXES)[number]; kind: "merged"; pages: number }
  | { index: (typeof TRIGRAM_INDEXES)[number]; kind: "failed"; message: string };
export type PostImportMaintenance = {
  statistics: StatisticsRefresh;
  pendingLists: readonly PendingListMerge[];
};
export type VerifyTiming = { attempts: number; waitMs: number };

const DEFAULT_VERIFY: VerifyTiming = { attempts: 6, waitMs: 500 };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "unknown error");
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * What a bulk import leaves behind, repaired right after the data commit so a re-import never
 * depends on autovacuum's timing: planner statistics (`ANALYZE`) and the GIN indexes' pending
 * lists. Rows inserted into a GIN index sit in an unmerged pending list, and the planner charges
 * for scanning it: the trigram branches of `cities.search` then cost more than a Seq Scan and run
 * as one (an `ANALYZE` alone does not change that). Neither step changes data, each is its own
 * single statement (neon-http runs one per request, outside any batch), and each failure is a
 * value for the CLI to print as a WARNING: the commit stands.
 */
export async function runPostImportMaintenance(
  db: Database,
  verify: VerifyTiming = DEFAULT_VERIFY,
): Promise<PostImportMaintenance> {
  const statistics = await refreshStatistics(db, verify);
  const pendingLists: PendingListMerge[] = [];
  for (const index of TRIGRAM_INDEXES) pendingLists.push(await mergePendingList(db, index));
  return { statistics, pendingLists };
}

/**
 * Postgres only WARNs when the role may not analyze a table ("permission denied ... skipping"),
 * and the driver hands no notice back, so success is read from the catalog: `last_analyze` must
 * have reached the time the step began (the database's clock, so skew cannot lie). The statistics
 * view can trail the command by a moment, so the read is repeated briefly before it is believed.
 */
async function refreshStatistics(db: Database, verify: VerifyTiming): Promise<StatisticsRefresh> {
  try {
    const [clock] = await executeRows<{ started: string }>(
      db,
      sql`SELECT clock_timestamp()::text AS started`,
    );
    await db.execute(sql`ANALYZE cities`);
    for (let attempt = 1; attempt <= verify.attempts; attempt++) {
      const [seen] = await executeRows<{ analyzed: boolean | null }>(
        db,
        sql`SELECT (last_analyze >= ${clock?.started}::timestamptz) AS analyzed FROM pg_stat_user_tables WHERE relname = 'cities' AND schemaname = 'public'`,
      );
      if (seen?.analyzed === true) return { kind: "refreshed" };
      if (attempt < verify.attempts) await sleep(verify.waitMs);
    }
    return {
      kind: "failed",
      message:
        "ANALYZE returned but cities.last_analyze did not move (the role may not be allowed to analyze it)",
    };
  } catch (error) {
    return { kind: "failed", message: messageOf(error) };
  }
}

async function mergePendingList(
  db: Database,
  index: (typeof TRIGRAM_INDEXES)[number],
): Promise<PendingListMerge> {
  try {
    const [row] = await executeRows<{ pages: string | number }>(
      db,
      sql`SELECT gin_clean_pending_list(${sql.raw(`'${index}'::regclass`)}) AS pages`,
    );
    return { index, kind: "merged", pages: Number(row?.pages ?? 0) };
  } catch (error) {
    return { index, kind: "failed", message: messageOf(error) };
  }
}

/** The CLI's lines: one per step; a step that failed is a WARNING and never an exit code. */
export function maintenanceLines(maintenance: PostImportMaintenance | null): string[] {
  if (maintenance === null) {
    return ["WARNING: post-import maintenance did not run. Run VACUUM cities by hand."];
  }
  const lines: string[] = [];
  const { statistics } = maintenance;
  lines.push(
    statistics.kind === "refreshed"
      ? "Planner statistics refreshed: ANALYZE cities"
      : `WARNING: the data is committed, but ANALYZE cities did not take effect (${statistics.message}). Planner statistics may be stale: run it by hand.`,
  );
  for (const step of maintenance.pendingLists) {
    lines.push(
      step.kind === "merged"
        ? `GIN pending list merged: ${step.index}, ${step.pages} pages cleaned`
        : `WARNING: the data is committed, but merging the pending list of ${step.index} failed (${step.message}). The trigram search can run as a Seq Scan until it is merged: run VACUUM cities by hand.`,
    );
  }
  return lines;
}
