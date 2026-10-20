import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { rowsOfRawResult } from "../src/raw-rows";

/**
 * No raw `db.execute()` result is read anywhere but `executeRows`
 * (`src/raw-rows.ts`).
 *
 * The defect class: postgres-js returns a raw result as an array, neon-http
 * (production, any `.neon.tech` host) as `{ rows, fields, … }`, and
 * `createDatabase` types both as one `Database`. A read that assumes the
 * array passes every local test and reads nothing in production —
 * `hasActiveSeenSet` (R1) and `gallery.relaxationCounts` (#112) both did,
 * the second offering no relaxation on any no-match screen.
 *
 * So a raw `.execute(` outside `raw-rows.ts` may only stand as a statement
 * whose result is discarded (`await db.execute(sql\`TRUNCATE …\`)`): assigned,
 * destructured, returned or passed on, it is refused. A scan rather than a
 * Biome rule: Biome 2's recommended set has nothing that can say "the result
 * of this call is used", and a GritQL plugin for one pattern is more machinery
 * than this file. A scan also covers `apps/` and `packages/` in one place, as
 * `apps/web/src/kabinet/no-self-serve-yet.test.ts` does for its own rule.
 *
 * Out of scope, by what they run against: `*.test.ts(x)` and `*.harness.ts`
 * files, whose databases are local only (`setupTestDatabase` refuses any
 * other), so postgres-js's array is the shape they really get. `neon-smoke.ts`
 * is not a test file and is scanned: it runs on neon-http. It guards against
 * accident (the shapes code actually takes), not against an aliased
 * `const run = db.execute`.
 */

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const SCAN_ROOTS = ["apps", "packages"];
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", "coverage", ".turbo"]);
const THE_ONE_READER = "packages/db/src/raw-rows.ts";

const isLocalOnlyTestFile = (path: string) => /\.(test\.tsx?|harness\.ts)$/.test(path);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return SKIPPED_DIRECTORIES.has(name) ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx|mts)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** Line numbers (1-based) of raw `.execute` calls whose result is used. */
function rawExecuteReadsIn(source: string): number[] {
  return source.split("\n").flatMap((line, index) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return [];
    if (!/\.execute\s*[<(]/.test(line)) return [];
    // The one shape that reads nothing: `await <receiver>.execute(` opening a statement.
    return /^\s*await\s+[\w$.]+\.execute\s*[<(]/.test(line) ? [] : [index + 1];
  });
}

describe("rawExecuteReadsIn", () => {
  it("refuses the reads that broke in production, and every other use of the result", () => {
    // `relaxationCounts` before this fix, verbatim in shape.
    const relaxationCountsBefore = [
      "      const rows = await db.execute<Record<string, string | number>>(",
      "        sql`SELECT ${sql.join(columns, sql`, `)} FROM ${animals} WHERE ${base}`,",
      "      );",
      "      const row = Array.from(rows as Iterable<Record<string, string | number>>)[0] ?? {};",
    ].join("\n");
    expect(rawExecuteReadsIn(relaxationCountsBefore)).toEqual([1]);
    expect(rawExecuteReadsIn("  const [row] = await watcher.execute<{ n: number }>(q);")).toEqual([
      1,
    ]);
    expect(rawExecuteReadsIn("  return db.execute(sql`SELECT 1`);")).toEqual([1]);
    expect(rawExecuteReadsIn("  const result = await db.execute (sql`SELECT 1`);")).toEqual([1]);
    expect(rawExecuteReadsIn("  rows.push(...(await tx.execute(q)));")).toEqual([1]);
  });

  it("allows a statement that discards the result, and prose about execute", () => {
    expect(rawExecuteReadsIn("  await db.execute(sql`TRUNCATE animals CASCADE`);")).toEqual([]);
    expect(rawExecuteReadsIn("    await db.execute(\n      sql`ANALYZE animals`,\n    );")).toEqual(
      [],
    );
    expect(rawExecuteReadsIn(" * a raw `db.execute()` returns `{ rows }` on neon-http")).toEqual(
      [],
    );
    expect(rawExecuteReadsIn("  // const rows = await db.execute(q);")).toEqual([]);
  });
});

describe("raw execute reads, across apps/ and packages/", () => {
  it("are made only through executeRows", () => {
    const files = SCAN_ROOTS.flatMap((root) => sourceFiles(join(REPO_ROOT, root)))
      .map((path) => relative(REPO_ROOT, path).split("\\").join("/"))
      .filter((path) => path !== THE_ONE_READER && !isLocalOnlyTestFile(path));
    // The scan saw the tree, not an empty directory: a wrong root would pass vacuously.
    expect(files).toContain("packages/db/src/repos/gallery-repo.ts");
    expect(files).toContain("packages/db/test/neon-smoke.ts");

    const offences = files.flatMap((path) =>
      rawExecuteReadsIn(readFileSync(join(REPO_ROOT, path), "utf8")).map(
        (line) => `${path}:${line}`,
      ),
    );
    expect(
      offences,
      "a raw db.execute() result is read outside executeRows (src/raw-rows.ts): on neon-http it is { rows }, not an array; use a typed .select(), or executeRows",
    ).toEqual([]);
  });
});

describe("rowsOfRawResult", () => {
  it("reads postgres-js's array and neon-http's { rows } as the same rows", () => {
    const rows = [{ n: "3" }, { n: "4" }];
    expect(rowsOfRawResult(rows)).toEqual(rows);
    expect(rowsOfRawResult({ rows, fields: [], rowCount: 2, command: "SELECT" })).toEqual(rows);
  });

  it("refuses any other shape rather than reading it as no rows", () => {
    expect(() => rowsOfRawResult({ fields: [] })).toThrow(/neither a row list nor/);
    expect(() => rowsOfRawResult(null)).toThrow(/neither a row list nor/);
  });
});
