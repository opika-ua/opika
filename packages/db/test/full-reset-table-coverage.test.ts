import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FULL_RESET_TABLES, RESET_EXCLUDED_TABLES } from "../src/full-reset";
import { executeRows } from "../src/raw-rows";
import { setupTestDatabase } from "../src/test-utils/index";

/**
 * `db:full-reset` empties every application data table in one `TRUNCATE`.
 * This is what makes "every" a tested claim rather than a hand-typed list
 * that silently stops matching the schema: it asks the real, migrated
 * database which tables actually exist and asserts the discovered set is
 * covered exactly once, by `FULL_RESET_TABLES` (reset) or
 * `RESET_EXCLUDED_TABLES` (kept, with why). A table in neither - new,
 * renamed, or just missed - fails this test by name, forcing whoever added
 * it to say which it is.
 *
 * Queries `information_schema.tables`, not a regex over `packages/db/src/
 * schema`'s source files (Tier 1 review finding 2, PR #199): a regex scan
 * missed table names with digits (`[a-z_]+` has no `0-9`), single-quoted
 * `pgTable('name', ...)` calls, and any schema file outside the one
 * directory it read non-recursively - three independently confirmed gaps,
 * each one a real table this test would have let through uncovered. The
 * database itself has none of those blind spots: it is asked what tables
 * exist, not asked to be parsed correctly.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

async function realTableNames(): Promise<string[]> {
  const rows = await executeRows<{ table_name: string }>(
    db,
    sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
  );
  return rows.map((row) => row.table_name).sort();
}

describe("db:full-reset covers every real table exactly once", () => {
  it("matches the migrated database's own tables, with none left uncovered or covered twice", async () => {
    const actual = await realTableNames();
    const covered = [
      ...FULL_RESET_TABLES,
      ...RESET_EXCLUDED_TABLES.map((entry) => entry.table),
    ].sort();
    expect(covered).toEqual(actual);
    // Not a tautology: two lists each matching the schema separately could
    // still overlap each other. No table may be both reset and kept.
    const overlap = FULL_RESET_TABLES.filter((table) =>
      RESET_EXCLUDED_TABLES.some((entry) => entry.table === table),
    );
    expect(overlap).toEqual([]);
  });

  it("names a real reason for every excluded table, not a placeholder", () => {
    for (const entry of RESET_EXCLUDED_TABLES) {
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

  it("finds at least one real table - proof the query itself isn't silently matching nothing", async () => {
    expect((await realTableNames()).length).toBeGreaterThan(10);
  });

  it("never sees drizzle's own migrations table - it lives in a different schema", async () => {
    expect(await realTableNames()).not.toContain("__drizzle_migrations");
  });
});
