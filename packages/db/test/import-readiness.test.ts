import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readinessRefusal, scanFullListReads } from "../src/import/readiness";

/** The names are written in pieces so a repository-wide search for them stays empty. */
const LIST_ALL = ["list", "All"].join("");
const CITIES_LIST = ["cities", ".list"].join("");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A fixture tree with the two top-level folders the scan reads, plus the given files. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(resolve(tmpdir(), "opika-readiness-"));
  roots.push(root);
  mkdirSync(resolve(root, "packages"));
  mkdirSync(resolve(root, "apps"));
  writeFileSync(resolve(root, "packages/ok.ts"), "export const fine = 1;\n");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), text);
  }
  return root;
}

describe("scanFullListReads", () => {
  it("is clear on the current tree: nothing in non-test source reads the full city list", () => {
    const scan = scanFullListReads();
    expect(scan, JSON.stringify(scan)).toMatchObject({ kind: "clear" });
    // A scan that read nothing would also be "clear"; this one read the app and the packages.
    expect(scan.kind === "clear" && scan.filesScanned).toBeGreaterThan(500);
  });

  it("finds each removed read, with the file and the line", () => {
    const scan = scanFullListReads(
      tree({
        "apps/web/src/page.ts": `const a = 1;\nconst all = await cityRepo(db).${LIST_ALL}();\n`,
        "apps/web/src/client.tsx": `const rows = await client.${CITIES_LIST}({});\n`,
      }),
    );
    expect(scan.kind).toBe("blocked");
    if (scan.kind !== "blocked") return;
    expect(scan.findings).toEqual(
      expect.arrayContaining([
        { file: "apps/web/src/page.ts", line: 2, name: LIST_ALL },
        { file: "apps/web/src/client.tsx", line: 1, name: CITIES_LIST },
      ]),
    );
    const text = readinessRefusal(scan);
    expect(text).toContain("still reads the full city list");
    expect(text).toContain("apps/web/src/page.ts:2");
  });

  it("finds a read under packages too, in any source extension", () => {
    for (const path of ["packages/db/src/repo.ts", "packages/x/y.mjs", "apps/web/a/b.tsx"]) {
      const scan = scanFullListReads(tree({ [path]: `x.${LIST_ALL}();\n` }));
      expect(scan.kind, path).toBe("blocked");
    }
  });

  it("ignores test files, test folders, build output and node_modules", () => {
    const hit = `expect(x.${LIST_ALL}).toBeUndefined();\n`;
    const scan = scanFullListReads(
      tree({
        "apps/web/src/a.test.ts": hit,
        "apps/web/src/b.spec.tsx": hit,
        "apps/web/test/harness/c.harness.ts": hit,
        "packages/db/test/neon-smoke.ts": hit,
        "apps/web/.next/server/d.js": hit,
        "packages/db/node_modules/e/index.js": hit,
        "apps/web/src/readme.md": hit,
      }),
    );
    expect(scan).toMatchObject({ kind: "clear" });
  });

  it("does not follow a symlink out of the tree", (context) => {
    const outside = tree({ "packages/leak.ts": `${LIST_ALL}();\n` });
    const inside = tree({});
    try {
      symlinkSync(resolve(outside, "packages"), resolve(inside, "apps/link"), "junction");
    } catch (error) {
      // Creating a link needs a privilege some machines lack. Reported as SKIPPED with this
      // reason, never as a pass.
      context.skip(
        `cannot create a symlink here: ${error instanceof Error ? error.message : error}`,
      );
    }
    expect(scanFullListReads(inside)).toMatchObject({ kind: "clear" });
  });

  it("does not call a tree it could not read clear", () => {
    const missing = mkdtempSync(resolve(tmpdir(), "opika-readiness-"));
    roots.push(missing);
    expect(scanFullListReads(missing)).toMatchObject({ kind: "unscannable" });
    const empty = tree({});
    rmSync(resolve(empty, "packages/ok.ts"));
    expect(scanFullListReads(empty)).toEqual({
      kind: "unscannable",
      reason: "no source files were found",
    });
    expect(readinessRefusal({ kind: "unscannable", reason: "x" })).toContain(
      "could not read the source tree",
    );
  });
});
