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
 * So a raw `.execute` outside `raw-rows.ts` may only be called as a whole
 * statement whose result is discarded: `await <name>.execute(…);`, the `await`
 * opening the statement (nothing before it but `;`, `{`, `}` or the file
 * start) and nothing after the call's closing parenthesis but `;`. Anything
 * else is refused: assigned, destructured, returned, passed on, wrapped in
 * another call (`Array.from(\n  await db.execute(…),\n)`, which is how Biome
 * formats #112's own read once its argument is long), chained (`.then(…)`), or
 * `.execute` named without being called (`const run = db.execute`, `.bind`).
 * A receiver that isn't a plain name path (`(tx as Db).execute`) is refused
 * too, rather than followed.
 *
 * The check reads the source with comments and string contents blanked, not
 * line by line, so it sees the call's real context however Biome wraps it. A
 * lexer rather than a parser: TypeScript 7 (this repo's) has no in-process
 * parser to import (its package exports only its version; `unstable/sync`
 * drives the native binary over IPC), and a parser package would be a new
 * dependency for one test. A scan rather than a Biome rule: Biome 2's
 * recommended set has nothing that can say "the result of this call is used",
 * and a GritQL plugin for one pattern is more machinery than this file. A scan
 * also covers `apps/` and `packages/` in one place, as
 * `apps/web/src/kabinet/no-self-serve-yet.test.ts` does for its own rule.
 *
 * Out of scope, by what they run against: `*.test.ts(x)` and `*.harness.ts`
 * files, whose databases are local only (`setupTestDatabase` refuses any
 * other), so postgres-js's array is the shape they really get. `neon-smoke.ts`
 * is not a test file and is scanned: it runs on neon-http. It guards against
 * accident (the shapes code actually takes), not evasion: `const { execute } =
 * db` and `db["execute"]` are not followed. Being a lexer, it also takes JSX
 * text in a `.tsx` file as code; a quote there is closed at the end of its line.
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

const IDENTIFIER_CHAR = /[\w$]/;
// After one of these (or nothing), a `/` opens a regular expression, not a division.
// `<` and `>` are left out so that JSX's `</p>` and `/>` stay code.
const REGEX_MAY_FOLLOW = new Set([..."(,=:[!&|?{};+-*%~^"]);

/**
 * The source with every comment, and every string's and template's text,
 * replaced by spaces (newlines kept), so offsets and line numbers still match.
 * A template's `${…}` stays code. A quote left open (JSX text) closes at the
 * end of its line, so one apostrophe can't swallow the rest of the file.
 */
function codeOnly(source: string): string {
  const out = [...source];
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  // One entry per open template expression: the `{` depth at which its `}` closes it.
  const templateDepths: number[] = [];
  let depth = 0;
  let i = 0;

  const scanTemplateText = () => {
    // `i` is just past a backtick, or just past the `}` closing a `${…}`.
    const start = i;
    while (i < source.length) {
      if (source[i] === "\\") i += 2;
      else if (source[i] === "`") {
        blank(start, i);
        i++;
        return;
      } else if (source[i] === "$" && source[i + 1] === "{") {
        blank(start, i);
        i += 2;
        depth++;
        templateDepths.push(depth);
        return;
      } else i++;
    }
    blank(start, i);
  };

  const previousCodeChar = (before: number) => {
    let k = before - 1;
    while (k >= 0 && /\s/.test(out[k] ?? "")) k--;
    return k < 0 ? "" : (out[k] ?? "");
  };

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === "'" || c === '"') {
      const start = i++;
      while (i < source.length && source[i] !== c && source[i] !== "\n") {
        i += source[i] === "\\" ? 2 : 1;
      }
      blank(start + 1, i);
      if (source[i] === c) i++;
    } else if (c === "`") {
      i++;
      scanTemplateText();
    } else if (c === "/" && REGEX_MAY_FOLLOW.has(previousCodeChar(i) || ";")) {
      const start = i++;
      let inClass = false;
      while (i < source.length && source[i] !== "\n") {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === "/" && !inClass) break;
        if (source[i] === "[") inClass = true;
        else if (source[i] === "]") inClass = false;
        i++;
      }
      blank(start + 1, i);
      i++;
    } else if (c === "{") {
      depth++;
      i++;
    } else if (c === "}") {
      if (templateDepths.at(-1) === depth) {
        templateDepths.pop();
        depth--;
        i++;
        scanTemplateText();
      } else {
        depth--;
        i++;
      }
    } else i++;
  }
  return out.join("");
}

const skipSpaceBack = (code: string, from: number) => {
  let k = from;
  while (k >= 0 && /\s/.test(code[k] ?? "")) k--;
  return k;
};
const skipSpaceForward = (code: string, from: number) => {
  let k = from;
  while (k < code.length && /\s/.test(code[k] ?? "")) k++;
  return k;
};

/**
 * Whether the `.execute` whose dot is at `dot` is preceded by `await <name>`
 * opening a statement: `<name>` a plain path (`db`, `this.db`, `db\n  .`), and
 * before the `await` only `;`, `{`, `}` or the file start.
 */
function opensStatementWithAwait(code: string, dot: number): boolean {
  let k = dot - 1;
  if (code[k] === "?") k--;
  for (;;) {
    k = skipSpaceBack(code, k);
    const end = k;
    while (k >= 0 && IDENTIFIER_CHAR.test(code[k] ?? "")) k--;
    if (k === end) return false;
    k = skipSpaceBack(code, k);
    if (code[k] === ".") {
      k--;
      if (code[k] === "?") k--;
      continue;
    }
    break;
  }
  const awaitEnd = k;
  while (k >= 0 && IDENTIFIER_CHAR.test(code[k] ?? "")) k--;
  if (code.slice(k + 1, awaitEnd + 1) !== "await") return false;
  k = skipSpaceBack(code, k);
  return k < 0 || ";{}".includes(code[k] ?? "");
}

/**
 * Where the call starting right after `execute` ends (just past its closing
 * parenthesis), skipping a type argument list; `null` if `execute` isn't called.
 */
function endOfCall(code: string, afterName: number): number | null {
  let k = skipSpaceForward(code, afterName);
  if (code[k] === "<") {
    let angles = 0;
    for (; k < code.length; k++) {
      if (code[k] === "<") angles++;
      else if (code[k] === ">" && code[k - 1] !== "=") angles--;
      if (angles === 0) break;
    }
    k = skipSpaceForward(code, k + 1);
  }
  if (code[k] !== "(") return null;
  let parens = 0;
  for (; k < code.length; k++) {
    if (code[k] === "(") parens++;
    else if (code[k] === ")") parens--;
    if (parens === 0) return k + 1;
  }
  return null;
}

/** Line numbers (1-based) of raw `.execute` uses that aren't a discarded statement. */
function rawExecuteReadsIn(source: string): number[] {
  const code = codeOnly(source);
  const lineOf = (offset: number) => source.slice(0, offset).split("\n").length;
  return [...code.matchAll(/\.\s*execute\b/g)].flatMap((match) => {
    const dot = match.index;
    const end = endOfCall(code, dot + match[0].length);
    if (end === null || !opensStatementWithAwait(code, dot)) return [lineOf(dot)];
    // Nothing chained on, and nothing around it: the statement ends with the call.
    return code[skipSpaceForward(code, end)] === ";" ? [] : [lineOf(dot)];
  });
}

describe("rawExecuteReadsIn", () => {
  it("refuses the reads that broke in production, and every other use of the result", () => {
    // `relaxationCounts` before #166, verbatim in shape.
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
    expect(rawExecuteReadsIn("  const r = await db\n    .execute(sql`SELECT 1`);")).toEqual([2]);
  });

  it("refuses #112's read as Biome formats it, with the await opening a line inside a call", () => {
    // `biome format` output for `const rows = Array.from(await db.execute<…>(sql`…`));`
    // once the line is too long: the `await` starts its own line, which the
    // line-based scan before RX-F1 took for a statement.
    const wrappedByBiome = [
      "export async function counts(db: Database, base: SQL) {",
      "  const rows = Array.from(",
      "    await db.execute<Record<string, string | number>>(",
      "      sql`SELECT count(*) AS current FROM ${animals} WHERE ${base} AND ${animals.species} = 'cat'`,",
      "    ),",
      "  );",
      "  return rows[0];",
      "}",
    ].join("\n");
    expect(rawExecuteReadsIn(wrappedByBiome)).toEqual([3]);
    // `biome format` breaks a long assignment after its `=`: the call then
    // stands alone on its line and ends in `;`, so only what precedes the
    // `await` shows the result is kept.
    const assignmentBrokenByBiome = [
      "  const relaxationCountRows =",
      "    await transactionScopedDatabase.execute<Record<string, number>>(relaxationCountsQuery);",
      "  const { rows: relaxationCountRowsForTheCurrentFilter } =",
      "    await transactionScopedDatabase.execute(q);",
    ].join("\n");
    expect(rawExecuteReadsIn(assignmentBrokenByBiome)).toEqual([2, 4]);
    expect(
      rawExecuteReadsIn("  return [\n    await db.execute(sql`SELECT 1`),\n    other,\n  ];"),
    ).toEqual([2]);
  });

  it("refuses a read chained on the call, on its own line or a later one", () => {
    expect(
      rawExecuteReadsIn("  await db.execute(sql`SELECT 1`).then((result) => keep(result));"),
    ).toEqual([1]);
    expect(
      rawExecuteReadsIn(
        "  await db\n    .execute(sql`SELECT count(*) FROM animals`)\n    .then((result) => keep(result));",
      ),
    ).toEqual([2]);
  });

  it("refuses execute named without being called, so it can't be read under another name", () => {
    expect(rawExecuteReadsIn("  const run = db.execute;")).toEqual([1]);
    expect(rawExecuteReadsIn("  const run = db.execute.bind(db);")).toEqual([1]);
  });

  it("allows a statement that discards the result, and prose or strings about execute", () => {
    expect(rawExecuteReadsIn("  await db.execute(sql`TRUNCATE animals CASCADE`);")).toEqual([]);
    expect(rawExecuteReadsIn("    await db.execute(\n      sql`ANALYZE animals`,\n    );")).toEqual(
      [],
    );
    expect(
      rawExecuteReadsIn(
        "async function f() {\n  await this.db.execute(sql`SET x = ${(() => 1)()}`);\n  await db.execute<never>(q);\n}",
      ),
    ).toEqual([]);
    expect(rawExecuteReadsIn(" * a raw `db.execute()` returns `{ rows }` on neon-http")).toEqual(
      [],
    );
    expect(rawExecuteReadsIn("  // const rows = await db.execute(q);")).toEqual([]);
    expect(rawExecuteReadsIn("  /* const rows = await db.execute(q); */")).toEqual([]);
    expect(rawExecuteReadsIn('  throw new Error("never read db.execute(q) as an array");')).toEqual(
      [],
    );
    expect(rawExecuteReadsIn("  const hint = `const rows = await db.execute(q)`;")).toEqual([]);
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
    // And the lexer still sees the two discarded statements as code: a desync
    // that blanked them would hide any read after them the same way.
    const discarded = ["packages/db/src/seed.ts", "packages/db/src/test-utils/setup.ts"];
    for (const path of discarded) {
      const code = codeOnly(readFileSync(join(REPO_ROOT, path), "utf8"));
      expect(code, path).toMatch(/await db\.execute\(/);
    }

    const offences = files.flatMap((path) =>
      rawExecuteReadsIn(readFileSync(join(REPO_ROOT, path), "utf8")).map(
        (line) => `${path}:${line}`,
      ),
    );
    expect(
      offences,
      "a raw db.execute() result is used outside executeRows (src/raw-rows.ts): on neon-http it is { rows }, not an array; use a typed .select(), or executeRows",
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
