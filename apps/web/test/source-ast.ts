import { extname } from "node:path";
import type { Node, SourceFile } from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API } from "typescript/unstable/sync";

/**
 * Source text parsed by the TypeScript compiler (`typescript`, already in the catalog), for the
 * scans that read imports and classes (F8-F2; Oleksii, 2026-10-21, verbatim: "For note 4’s scan,
 * use the TypeScript compiler API that’s already in the repo (typescript) to read imports. No new
 * dependency").
 *
 * Why a parser and not a pattern: a pattern can't tell code from a string or a comment, so a `/*`
 * inside a string hid a real import, and `x as Error` read as an import alias (the review of
 * 72b8a3b, notes 4 and 5). The parser decides what is a string, a comment and an import exactly as
 * the build does.
 *
 * TypeScript 7 parses in its native process; this module starts it, hands it the texts through a
 * virtual file system (never the disk, so a test can parse text no file holds), and closes it.
 * Nothing is resolved or type-checked: each file is only parsed.
 */

/** The extensions the compiler parses as code; each text keeps its own, so `.tsx` parses as JSX. */
const PARSED = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

/**
 * `read(sourceFile, key)` for each of `texts` (keyed by any label, a path usually), parsed by the
 * compiler. Throws when a key's extension isn't code, or when any text doesn't parse: a scan over
 * a file the compiler can't read would see a partial tree, so it fails instead of passing.
 */
export function readParsed<T>(
  texts: ReadonlyMap<string, string>,
  read: (sourceFile: SourceFile, key: string) => T,
): Map<string, T> {
  const virtualPaths = new Map<string, string>();
  const files: Record<string, string> = {};
  let index = 0;
  for (const [key, text] of texts) {
    const extension = extname(key);
    if (!PARSED.has(extension)) throw new Error(`${key}: not a code file the compiler parses`);
    const path = `/parsed/${index++}${extension}`;
    virtualPaths.set(key, path);
    files[path] = text;
  }
  files["/parsed/tsconfig.json"] = JSON.stringify({
    compilerOptions: {
      allowJs: true,
      jsx: "preserve",
      noEmit: true,
      noLib: true,
      noResolve: true,
      types: [],
    },
    files: [...virtualPaths.values()],
  });

  const api = new API({ cwd: "/parsed", fs: createVirtualFileSystem(files) });
  try {
    const project = api
      .updateSnapshot({ openProjects: ["/parsed/tsconfig.json"] })
      .getProject("/parsed/tsconfig.json");
    if (project === undefined) throw new Error("the compiler opened no project");
    const out = new Map<string, T>();
    for (const [key, path] of virtualPaths) {
      const sourceFile = project.program.getSourceFile(path);
      if (sourceFile === undefined) throw new Error(`${key}: the compiler parsed nothing`);
      const errors = project.program.getSyntacticDiagnostics(path);
      if (errors.length > 0) {
        throw new Error(`${key}: does not parse (${errors.map((e) => e.text).join("; ")})`);
      }
      out.set(key, read(sourceFile, key));
    }
    return out;
  } finally {
    api.close();
  }
}

/** Every node under `root`, `root` included, depth first in source order. */
export function* nodesOf(root: Node): Generator<Node> {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    yield node;
    const children: Node[] = [];
    node.forEachChild((child) => {
      children.push(child);
    });
    stack.push(...children.reverse());
  }
}
