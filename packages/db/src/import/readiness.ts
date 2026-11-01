import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The production import's readiness gate: once ~29.7k settlements are in `cities`, any code that
 * reads the whole city list would ship them all to a browser or the app. The gate is a source-tree
 * scan, run by the importer's own CLI before it touches a production target, so the import cannot
 * be pointed at production by a checkout that still contains such a read.
 *
 * It looks for the two names the full-list reads had (the city repo's list-everything method and
 * the removed public list procedure), written here in pieces so that a repository-wide search for
 * them stays empty. A different repo's method of the same name is flagged too: the cost of that
 * false positive is one refused run with the file and line in the message; the cost of a miss is
 * the whole list on the wire.
 */

const pattern = (...parts: string[]) => new RegExp(parts.join(""));

const FORBIDDEN = [
  { label: ["list", "All"].join(""), expression: pattern("list", "All") },
  { label: ["cities", ".list"].join(""), expression: pattern("cities", "\\.list") },
] as const;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".vercel",
  ".git",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  // Test code: it may name a removed read to assert it is gone.
  "test",
  "tests",
  "__tests__",
]);
const TEST_FILE = /\.(?:test|spec|harness)\.[cm]?[jt]sx?$/;
const MAX_BYTES = 2_000_000;

/** `packages/` and `apps/` are searched under the repository root, which is five levels up from here. */
export const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const SCANNED_TOP_LEVEL = ["packages", "apps"] as const;

export type ReadinessFinding = { file: string; line: number; name: string };

export type ReadinessScan =
  | { kind: "clear"; filesScanned: number }
  | { kind: "blocked"; findings: readonly ReadinessFinding[]; filesScanned: number }
  /** Nothing proved the tree clean, so nothing may be assumed: this refuses like a finding does. */
  | { kind: "unscannable"; reason: string };

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // A symlink could lead out of the tree or loop; the tracked sources are plain files.
    if (entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* sourceFiles(path);
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(extname(entry.name)) &&
      !TEST_FILE.test(entry.name)
    ) {
      yield path;
    }
  }
}

export function scanFullListReads(root: string = REPO_ROOT): ReadinessScan {
  const findings: ReadinessFinding[] = [];
  let filesScanned = 0;
  try {
    for (const top of SCANNED_TOP_LEVEL) {
      const directory = resolve(root, top);
      // A missing directory is not a clean one: an empty scan would otherwise pass anywhere.
      if (!statSync(directory).isDirectory()) throw new Error(`${top} is not a directory`);
      for (const file of sourceFiles(directory)) {
        if (statSync(file).size > MAX_BYTES) continue;
        filesScanned += 1;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((text, index) => {
          for (const { label, expression } of FORBIDDEN) {
            if (expression.test(text)) {
              findings.push({
                file: relative(root, file).split("\\").join("/"),
                line: index + 1,
                name: label,
              });
            }
          }
        });
      }
    }
  } catch (error) {
    return {
      kind: "unscannable",
      reason: error instanceof Error ? error.message : "the source tree could not be read",
    };
  }
  if (filesScanned === 0) return { kind: "unscannable", reason: "no source files were found" };
  return findings.length > 0
    ? { kind: "blocked", findings, filesScanned }
    : { kind: "clear", filesScanned };
}

/** Why a scan that is not clear stops the production import: what was found and where, exactly. */
export function readinessRefusal(scan: Exclude<ReadinessScan, { kind: "clear" }>): string {
  if (scan.kind === "unscannable") {
    return `the readiness scan could not read the source tree (${scan.reason}), so it cannot show that nothing in the app reads the full city list; run the import from a full checkout of the repository`;
  }
  const shown = scan.findings
    .slice(0, 10)
    .map((f) => `${f.file}:${f.line} (${f.name})`)
    .join(", ");
  const more = scan.findings.length > 10 ? `, and ${scan.findings.length - 10} more` : "";
  return `the app still reads the full city list: ${scan.findings.length} reference(s) to the removed full-list reads in non-test source (${shown}${more}). With ~29.7k settlements imported, each of those would send the whole table to a browser or the app. Remove them first; the production import refuses until the scan is clear`;
}
