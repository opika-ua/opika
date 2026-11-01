/**
 * `everServed:backfill`: re-runs migration 0015's backfill on its own, for the
 * one window that migration can't close by itself.
 *
 * Additive migrations run before the merge that deploys their code (so the
 * new column exists before anything references it). Between that migration
 * and the deploy, the live app has none of S8-F5's three write hooks - a card
 * that newly becomes visible in that window (a shelter approved, a card
 * published to an already-verified shelter) keeps `everServedAt` null, and
 * would misreport "never served" once it later becomes invisible again.
 *
 * The fix is to run the same backfill again after the deploy lands. It is
 * idempotent by construction, not by a special case added for this script:
 * it sets `everServedAt` only on rows that are, right now, both currently
 * discoverable (`buildDiscoverabilityPredicate`, the live query every
 * adopter-facing surface runs - imported, not copied, so a predicate change
 * updates this script automatically) and still null. A row the hooks already
 * stamped is excluded by that second condition, so a repeat run matches
 * nothing from the first one; a run with no gap-window activity reports 0.
 *
 * Residual gap this does NOT close: a card that becomes visible and then
 * invisible again entirely inside the window before this script's one
 * post-deploy run - e.g. published to a verified shelter, then withdrawn,
 * both before the backfill runs - is never caught, because the predicate only
 * matches rows that are *currently* visible. Closing that would need the
 * hooks themselves live during the gap, which is what the deploy is for; this
 * script narrows the gap to "between merge and the one post-deploy run", not
 * to zero. Named here rather than glossed over (PR #196).
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root
 * `.env.local`, as for every production-aware script):
 *   pnpm --filter @opika/db everServed:backfill --expect ep-…             dry run
 *   pnpm --filter @opika/db everServed:backfill --expect ep-… --commit    applies
 *   … --prod                                                              when the target is production
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, count, isNull, sql } from "drizzle-orm";
import { createDatabase, type Database } from "./client";
import { assertProductionWriteAllowed, databaseTargetLine, expectedTargetOf } from "./prod-guard";
import { buildDiscoverabilityPredicate } from "./repos/feed-predicate";
import { animals } from "./schema/animals";

/** Rows the backfill would still set: currently discoverable, `everServedAt` still null. */
const candidateWhere = () => and(isNull(animals.everServedAt), ...buildDiscoverabilityPredicate());

export async function countBackfillCandidates(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(animals).where(candidateWhere());
  return row?.n ?? 0;
}

/** Sets `everServedAt` on every candidate row; returns how many it set. */
export async function runBackfill(db: Database): Promise<number> {
  const rows = await db
    .update(animals)
    .set({ everServedAt: sql`now()` })
    .where(candidateWhere())
    .returning({ id: animals.id });
  return rows.length;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const at = process.argv.indexOf("--expect");
  const expected = expectedTargetOf(url, at > -1 ? process.argv[at + 1] : undefined);
  if (expected.kind === "refused") {
    console.error(`REFUSED: ${expected.reason}. Nothing was run.`);
    process.exit(1);
  }
  const commit = process.argv.includes("--commit");
  assertProductionWriteAllowed(url, process.argv, process.env, commit ? "write" : "read");
  console.log(databaseTargetLine(url));

  const db = createDatabase(url);
  const before = await countBackfillCandidates(db);
  console.log(`Candidates (currently visible, everServedAt still null): ${before}`);
  if (!commit) {
    console.log("Dry run only. Re-run with --commit to set them.");
    process.exit(0);
  }
  const set = await runBackfill(db);
  console.log(`Set: ${set}`);
  const after = await countBackfillCandidates(db);
  console.log(`Remaining candidates: ${after} (expected 0)`);
  process.exit(after === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
