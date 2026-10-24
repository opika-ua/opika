import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "./client";
import { assertProductionWriteAllowed, databaseTargetLine, expectedTargetOf } from "./prod-guard";
import { executeRows } from "./raw-rows";

/**
 * `db:full-reset`: the final-dress-rehearsal-to-real-launch reset
 * (`docs/launch-sequence.md`'s first code step, after Oleksii's own Neon
 * backup branch). Empties every application data table in one
 * `TRUNCATE … CASCADE` statement: shelters, animals, their history, swipes,
 * reveals, every `auth_*` table, support sessions. Keeps the schema and
 * drizzle's own migrations table — `db:check-hashes` matches, unchanged,
 * before and after a reset — and keeps `cities` (see `RESET_EXCLUDED_TABLES`
 * below): reference data a shelter can't be onboarded without, not
 * application data this reset is about.
 *
 * Replaces the demo-only wipe this repo was building toward launch, on
 * Oleksii's own instruction (2026-10-24, inbox): a full reset, not a
 * demo-only one, run once, personally, right after his own dress rehearsal
 * as a real shelter through the real kabinet flow — so no demo data and no
 * rehearsal data ever coexists with real data. `demo:remove`
 * (`demo-remove.ts`) stays in the repo for its own narrower, repeatable use
 * (removing one shelter, or the seed range, without wiping everything);
 * this script is not built on top of it — a full `TRUNCATE` has no use for
 * demo:remove's shelter-targeting or its per-row delete-with-returning
 * machinery, so sharing code there would only couple two things that solve
 * different problems.
 *
 * `--commit` is the only way this writes anything; without it, this is a
 * read-only report of what's there. There is deliberately no "refuse unless
 * a real shelter already exists" guard, unlike `demo:remove`'s own
 * `no_real_shelter` check — this script's whole purpose is the moment
 * *before* any real shelter exists, between the dress rehearsal and the
 * first real onboarding.
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root
 * `.env.local`, as for every production-aware script):
 *   pnpm --filter @opika/db db:full-reset --expect ep-…             dry run (counts only)
 *   pnpm --filter @opika/db db:full-reset --expect ep-… --commit    truncates
 *   … --prod                                                        when the target is production
 */

/**
 * Every table this reset empties — a plain literal list, but one
 * `test/full-reset-table-coverage.test.ts` checks independently against the
 * schema's own `pgTable("…")` calls, so a new table fails that test by name
 * (uncovered) rather than silently never being truncated.
 */
export const FULL_RESET_TABLES = [
  "support_sessions",
  "invitation_created_users",
  "shelter_history",
  "super_admins",
  "auth_invitation",
  "auth_member",
  "auth_session",
  "auth_account",
  "auth_verification",
  "auth_organization",
  "auth_user",
  "sessions",
  "reveals",
  "swipes",
  "animals",
  "adopters",
  "shelters",
] as const;
export type FullResetTable = (typeof FULL_RESET_TABLES)[number];

/**
 * Every table the scan knows about but this reset deliberately does not
 * touch, with why — so a table that should stay is a decision the coverage
 * test can see, not a silent gap in `FULL_RESET_TABLES`.
 */
export const RESET_EXCLUDED_TABLES: ReadonlyArray<{ table: string; why: string }> = [
  {
    table: "cities",
    why:
      "geography reference data, not application data — a shelter can't be " +
      "onboarded without it already existing, and it carries nothing personal " +
      "or user-generated",
  },
];

export type FullResetCounts = Record<FullResetTable, number>;

/**
 * One `SELECT COUNT(*)` per table. Table names are this file's own fixed
 * literal list, never external input. Reads through `executeRows`
 * (`raw-rows.ts`), not a raw `.execute()` destructure — the two drivers this
 * repo runs return raw results in different shapes (standing constraints,
 * R1), and `count(*)` arrives as a string on both, so it's parsed here
 * rather than trusted to already be a number.
 */
export async function countFullResetTables(db: Database): Promise<FullResetCounts> {
  const counts = {} as FullResetCounts;
  for (const table of FULL_RESET_TABLES) {
    const rows = await executeRows<{ n: string }>(
      db,
      sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${table}"`)}`,
    );
    counts[table] = Number(rows[0]?.n ?? 0);
  }
  return counts;
}

/** The one statement that empties every table in `FULL_RESET_TABLES`. Never touches `cities` or drizzle's own tables. */
export async function truncateFullReset(db: Database): Promise<void> {
  const list = FULL_RESET_TABLES.map((table) => `"${table}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${list} CASCADE`));
}

const pad = (label: string) => label.padEnd(24);

export function formatCounts(counts: FullResetCounts, heading: string): string[] {
  const lines = [`${heading}:`];
  for (const table of FULL_RESET_TABLES) lines.push(`  ${pad(table)}${counts[table]}`);
  return lines;
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
  console.log(commit ? "COMMIT" : "DRY RUN (nothing is deleted)");

  const db = createDatabase(url);
  const before = await countFullResetTables(db);
  for (const line of formatCounts(before, "Rows now")) console.log(line);
  console.log(
    `Kept (never touched by this script): ${RESET_EXCLUDED_TABLES.map((e) => e.table).join(", ")}`,
  );

  if (!commit) {
    console.log("\nDry run only. Re-run with --commit to truncate every table above.");
    process.exit(0);
  }

  await truncateFullReset(db);
  const after = await countFullResetTables(db);
  for (const line of formatCounts(after, "\nRows after TRUNCATE (expected: every one 0)")) {
    console.log(line);
  }
  const allZero = FULL_RESET_TABLES.every((table) => after[table] === 0);
  if (!allZero) {
    console.error(
      "ERROR: at least one table is not 0 after TRUNCATE. Investigate before continuing.",
    );
    process.exit(1);
  }
  console.log(
    "\nDone. Every application data table is empty; cities and the schema are untouched.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
