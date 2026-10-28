import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `apps/web/src`, the only tree the UI guards read. */
export const SRC_ROOT = resolve(fileURLToPath(import.meta.url), "../..");

export interface SourceLine {
  /** Path relative to `apps/web/src`, forward slashes. */
  file: string;
  line: number;
  text: string;
  /** Inside a line or block comment (JSX `{/* ... *\/}` included): carries no live class or colour. */
  comment: boolean;
}

const GUARDS_DIR = "guards/";

/** Tests and the guards themselves write the forbidden strings on purpose. */
function isScanned(file: string): boolean {
  return (
    /\.tsx?$/.test(file) &&
    !/\.(test|harness)\.tsx?$/.test(file) &&
    !file.startsWith(GUARDS_DIR) &&
    !file.endsWith(".d.ts")
  );
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(relative(SRC_ROOT, full).replaceAll("\\", "/"));
  }
}

/**
 * Line-level only: a line is a comment if it starts one (`//`, `/*`, `{/*`, `*`) or sits inside a
 * block opened on an earlier line. Code after a closing `*\/` on the same line is not examined.
 */
function markComments(file: string, texts: string[]): SourceLine[] {
  let inBlock = false;
  return texts.map((text, index) => {
    const t = text.trim();
    let comment = inBlock;
    if (!inBlock) {
      if (t.startsWith("//") || t.startsWith("*")) comment = true;
      else if (t.startsWith("/*") || t.startsWith("{/*")) {
        comment = true;
        inBlock = !t.includes("*/");
      }
    } else if (t.includes("*/")) {
      inBlock = false;
    }
    return { file, line: index + 1, text, comment };
  });
}

let cache: { file: string; lines: SourceLine[] }[] | undefined;

/** Every non-test `.ts`/`.tsx` file under `apps/web/src`, split into lines, read once per run. */
export function sourceFiles(): { file: string; lines: SourceLine[] }[] {
  if (cache !== undefined) return cache;
  const files: string[] = [];
  walk(SRC_ROOT, files);
  cache = files
    .filter(isScanned)
    .sort()
    .map((file) => ({
      file,
      lines: markComments(file, readFileSync(join(SRC_ROOT, file), "utf8").split("\n")),
    }));
  return cache;
}

export interface Hit {
  file: string;
  line: number;
  match: string;
}

/** Matches of `pattern` on non-comment lines, per file. */
export function hitsByFile(pattern: RegExp): Map<string, Hit[]> {
  const result = new Map<string, Hit[]>();
  for (const { file, lines } of sourceFiles()) {
    const hits: Hit[] = [];
    for (const { line, text, comment } of lines) {
      if (comment) continue;
      for (const m of text.matchAll(pattern)) hits.push({ file, line, match: m[0] });
    }
    if (hits.length > 0) result.set(file, hits);
  }
  return result;
}

/** Files whose first statement is the `"use client"` directive. */
export function clientFiles(): string[] {
  return sourceFiles()
    .filter(({ lines }) => {
      const first = lines.find(({ text, comment }) => text.trim() !== "" && !comment);
      return first !== undefined && /^["']use client["'];?$/.test(first.text.trim());
    })
    .map(({ file }) => file);
}

/** Reads cleanly in a failure message: `path:line  match`. */
export function formatHits(hits: Hit[]): string {
  return hits.map((h) => `  apps/web/src/${h.file}:${h.line}  ${h.match}`).join("\n");
}
