import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FULL_RESET_TABLES, RESET_EXCLUDED_TABLES } from "../src/full-reset";

/**
 * `db:full-reset` empties every application data table in one `TRUNCATE`.
 * This is what makes "every" a tested claim rather than a hand-typed list
 * that silently stops matching the schema: it scans every `pgTable("name",
 * ...)` call under `packages/db/src/schema` and asserts the discovered set
 * of real table names is covered exactly once, by `FULL_RESET_TABLES`
 * (reset) or `RESET_EXCLUDED_TABLES` (kept, with why). A table in neither —
 * new, renamed, or just missed — fails this test by name, forcing whoever
 * added it to say which it is.
 */
const SCHEMA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "schema");
const PG_TABLE_CALL = /pgTable\(\s*"([a-z_]+)"/g;

function realTableNames(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(SCHEMA_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name === "index.ts") continue;
    const text = readFileSync(join(SCHEMA_DIR, entry.name), "utf8");
    for (const match of text.matchAll(PG_TABLE_CALL)) {
      const name = match[1];
      if (name) names.push(name);
    }
  }
  return names.sort();
}

describe("db:full-reset covers every real table exactly once", () => {
  it("matches the schema's own pgTable names, with none left uncovered or covered twice", () => {
    const actual = realTableNames();
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

  it("finds at least one real table — proof the scan itself isn't silently matching nothing", () => {
    expect(realTableNames().length).toBeGreaterThan(10);
  });
});
