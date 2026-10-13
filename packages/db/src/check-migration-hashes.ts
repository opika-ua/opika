import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDatabase } from "./client";

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

export type HashCheck =
  | { tag: string; status: "match" }
  | { tag: string; status: "mismatch"; recorded: string; committed: string }
  | { tag: string; status: "not_applied" };

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
  return committed.map(({ tag, when, hash }) => {
    const found = byWhen.get(when);
    if (found === undefined) return { tag, status: "not_applied" };
    return found === hash
      ? { tag, status: "match" }
      : { tag, status: "mismatch", recorded: found, committed: hash };
  });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = createDatabase(url);
  const result = await db.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`);
  // postgres-js returns an array, neon-http `{ rows }` (standing constraints, R1).
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    hash: string;
    created_at: number | string;
  }[];
  const checks = compareHashes(committedHashes(), rows);
  for (const check of checks) {
    console.log(
      check.status === "mismatch"
        ? `MISMATCH  ${check.tag}  recorded ${check.recorded.slice(0, 12)}… committed ${check.committed.slice(0, 12)}…`
        : `${check.status === "match" ? "match    " : "not run  "} ${check.tag}`,
    );
  }
  process.exit(checks.some((check) => check.status === "mismatch") ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
