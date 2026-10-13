import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDatabase } from "./client";
import { databaseTargetLine, databaseTargetOf } from "./prod-guard";

/**
 * `pnpm db:check-hashes`: read-only. For every migration in the committed
 * journal, compares the hash drizzle recorded on the target database
 * (`drizzle.__drizzle_migrations`, keyed by the journal entry's `when`) with
 * the sha256 of the committed `.sql` file, which is how drizzle computes it.
 *
 * Oleksii's rule for a migration that has been frozen and rehearsed: the hash
 * on the rehearsal branch must match the committed file, so a branch can't
 * have run a different 0011 than the one that ships. It writes nothing.
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");

type JournalEntry = { tag: string; when: number };

/**
 * One line of the report. `unknown` and `skipped` are failures as much as a
 * mismatch: a regenerated migration gets a new journal `when`, so a branch
 * that ran the old file shows its row as `unknown` and the new file as not
 * applied; and a migration missing while a later one ran means the branch's
 * history isn't the committed one (review of f842808, finding 1).
 */
export type HashCheck =
  | { tag: string; status: "match" }
  | { tag: string; status: "mismatch"; recorded: string; committed: string }
  | { tag: string; status: "not_applied" }
  | { tag: string; status: "skipped" }
  | { tag: null; status: "unknown"; recorded: string; createdAt: number };

export const isFailure = (check: HashCheck): boolean =>
  check.status === "mismatch" || check.status === "unknown" || check.status === "skipped";

export function committedHashes(
  dir = MIGRATIONS_DIR,
): { tag: string; when: number; hash: string }[] {
  const journal = JSON.parse(readFileSync(resolve(dir, "meta/_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries.map((entry) => ({
    tag: entry.tag,
    when: entry.when,
    hash: createHash("sha256")
      .update(readFileSync(resolve(dir, `${entry.tag}.sql`)).toString())
      .digest("hex"),
  }));
}

export function compareHashes(
  committed: { tag: string; when: number; hash: string }[],
  recorded: { hash: string; created_at: number | string }[],
): HashCheck[] {
  const byWhen = new Map(recorded.map((row) => [Number(row.created_at), row.hash]));
  const lastApplied = committed.reduce(
    (last, entry, index) => (byWhen.has(entry.when) ? index : last),
    -1,
  );
  const checks: HashCheck[] = committed.map(({ tag, when, hash }, index) => {
    const found = byWhen.get(when);
    if (found === undefined)
      return { tag, status: index < lastApplied ? "skipped" : "not_applied" };
    return found === hash
      ? { tag, status: "match" }
      : { tag, status: "mismatch", recorded: found, committed: hash };
  });
  const known = new Set(committed.map((entry) => entry.when));
  for (const row of recorded) {
    const createdAt = Number(row.created_at);
    if (!known.has(createdAt))
      checks.push({ tag: null, status: "unknown", recorded: row.hash, createdAt });
  }
  return checks;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  // First, before connecting: a pasted report proves which database it came
  // from only if the target is part of it (Oleksii, 2026-10-13).
  console.log(databaseTargetLine(url));
  if (databaseTargetOf(url).kind === "unparseable") process.exit(1);
  const db = createDatabase(url);
  const result = await db.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`);
  // postgres-js returns an array, neon-http `{ rows }` (standing constraints, R1).
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    hash: string;
    created_at: number | string;
  }[];
  const checks = compareHashes(committedHashes(), rows);
  for (const check of checks) {
    switch (check.status) {
      case "match":
        console.log(`match     ${check.tag}`);
        break;
      case "not_applied":
        console.log(`not run   ${check.tag}`);
        break;
      case "skipped":
        console.log(`SKIPPED   ${check.tag}  (a later migration ran, this one didn't)`);
        break;
      case "mismatch":
        console.log(
          `MISMATCH  ${check.tag}  recorded ${check.recorded.slice(0, 12)}… committed ${check.committed.slice(0, 12)}…`,
        );
        break;
      case "unknown":
        console.log(
          `UNKNOWN   recorded ${check.recorded.slice(0, 12)}… at ${check.createdAt}: matches no committed migration (regenerated after it ran?)`,
        );
        break; /* v8 ignore next 4 -- exists so the compiler rejects an unhandled status; unreachable at runtime */
      default: {
        const unreachable: never = check;
        throw new Error(`Unhandled check ${JSON.stringify(unreachable)}`);
      }
    }
  }
  process.exit(checks.some(isFailure) ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
