import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Node, SourceFile } from "typescript/unstable/ast";
import {
  isArrowFunction,
  isClassDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isPropertyAssignment,
  isSetAccessorDeclaration,
  isSourceFile,
  isVariableDeclaration,
  isVariableStatement,
} from "typescript/unstable/ast/is";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API } from "typescript/unstable/sync";

/**
 * Anchors for the source-scan guards: a site is pinned by file, enclosing symbol, trimmed line
 * text and occurrence within that symbol, never by line number, so an edit above a site no
 * longer breaks CI while a new, removed or re-homed site still does.
 */
export interface Anchor {
  file: string;
  /** Dotted path of the named declarations around the site, e.g. `kabinetAnimalRepo.writeListingIf`. */
  symbol: string;
  text: string;
  /** 0-based index among identical `text` lines in the same symbol; omitted means 0. */
  occurrence?: number;
}

/** A found site. `line` only locates it in a failure message; it is never compared. */
export interface Site extends Required<Anchor> {
  line: number;
}

export const MODULE_SYMBOL = "<module>";

export function* sourceFiles(dir: string, extensions: RegExp = /\.ts$/): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path, extensions);
    else if (entry.isFile() && extensions.test(path) && !/\.test\.tsx?$/.test(path)) yield path;
  }
}

/** Every line matching `pattern` in each of `sources` (name to text), anchored to its symbol. */
export function sitesIn(sources: ReadonlyMap<string, string>, pattern: RegExp): Site[] {
  const matches = new Map<string, { line: number; character: number; text: string }[]>();
  for (const [file, source] of sources) {
    const found = source.split("\n").flatMap((lineText, index) => {
      const match = pattern.exec(lineText);
      return match ? [{ line: index, character: match.index, text: lineText.trim() }] : [];
    });
    if (found.length > 0) matches.set(file, found);
  }
  if (matches.size === 0) return [];

  const parsed = parse(new Map([...matches.keys()].map((file) => [file, sources.get(file) ?? ""])));
  const sites: Site[] = [];
  for (const [file, found] of matches) {
    const sourceFile = parsed.get(file);
    if (sourceFile === undefined) throw new Error(`${file}: the compiler parsed nothing`);
    const seen = new Map<string, number>();
    for (const { line, character, text } of found) {
      const position = sourceFile.getPositionOfLineAndCharacter(line, character);
      const symbol = enclosingSymbol(sourceFile, position);
      const key = `${symbol}\u0000${text}`;
      const occurrence = seen.get(key) ?? 0;
      seen.set(key, occurrence + 1);
      sites.push({ file, symbol, text, occurrence, line: line + 1 });
    }
  }
  return sites;
}

/** `sitesIn` over every non-test source file under `root`, each named by `name(path)`. */
export function scanSites(
  root: string,
  pattern: RegExp,
  name: (path: string) => string,
  extensions?: RegExp,
): Site[] {
  const sources = new Map<string, string>();
  for (const path of sourceFiles(root, extensions))
    sources.set(name(path), readFileSync(path, "utf8"));
  return sitesIn(sources, pattern);
}

// Same approach as apps/web/test/source-ast.ts: TypeScript 7 parses only in its native process,
// so the texts go in through a virtual file system and nothing is resolved or type-checked.
function parse(texts: ReadonlyMap<string, string>): Map<string, SourceFile> {
  const virtualPaths = new Map<string, string>();
  const files: Record<string, string> = {};
  let index = 0;
  for (const [key, text] of texts) {
    const path = `/parsed/${index++}${extname(key)}`;
    virtualPaths.set(key, path);
    files[path] = text;
  }
  files["/parsed/tsconfig.json"] = JSON.stringify({
    compilerOptions: { jsx: "preserve", noEmit: true, noLib: true, noResolve: true, types: [] },
    files: [...virtualPaths.values()],
  });
  const api = new API({ cwd: "/parsed", fs: createVirtualFileSystem(files) });
  try {
    const project = api
      .updateSnapshot({ openProjects: ["/parsed/tsconfig.json"] })
      .getProject("/parsed/tsconfig.json");
    if (project === undefined) throw new Error("the compiler opened no project");
    const out = new Map<string, SourceFile>();
    for (const [key, path] of virtualPaths) {
      const sourceFile = project.program.getSourceFile(path);
      if (sourceFile === undefined) throw new Error(`${key}: the compiler parsed nothing`);
      // A partial tree would anchor sites to the wrong symbol, so a parse error fails the scan.
      const errors = project.program.getSyntacticDiagnostics(path);
      if (errors.length > 0) {
        throw new Error(`${key}: does not parse (${errors.map((e) => e.text).join("; ")})`);
      }
      out.set(key, sourceFile);
    }
    return out;
  } finally {
    api.close();
  }
}

function enclosingSymbol(sourceFile: SourceFile, position: number): string {
  const names: string[] = [];
  let node: Node = sourceFile;
  for (;;) {
    const child: Node | undefined = node.forEachChild((c) =>
      c.getStart(sourceFile) <= position && position < c.end ? c : undefined,
    );
    if (child === undefined) break;
    const name = declarationName(child);
    if (name !== undefined) names.push(name);
    node = child;
  }
  return names.length > 0 ? names.join(".") : MODULE_SYMBOL;
}

const isFunctionLike = (node: Node | undefined): boolean =>
  node !== undefined && (isArrowFunction(node) || isFunctionExpression(node));

// A local const counts only when it holds a function: renaming a query's result variable must
// not move an anchor, but a module-level schema or a named helper is a real identity.
function declarationName(node: Node): string | undefined {
  if (
    isFunctionDeclaration(node) ||
    isClassDeclaration(node) ||
    isMethodDeclaration(node) ||
    isGetAccessorDeclaration(node) ||
    isSetAccessorDeclaration(node)
  ) {
    return node.name?.getText();
  }
  if (isVariableDeclaration(node) && isIdentifier(node.name)) {
    const statement = node.parent.parent;
    const atModuleLevel = isVariableStatement(statement) && isSourceFile(statement.parent);
    return atModuleLevel || isFunctionLike(node.initializer) ? node.name.getText() : undefined;
  }
  if (isPropertyAssignment(node) && isFunctionLike(node.initializer)) return node.name.getText();
  return undefined;
}

const keyOf = (a: Anchor): string => [a.file, a.symbol, a.occurrence ?? 0, a.text].join("\u0000");
const describeAnchor = (a: Anchor, line?: number): string =>
  `${a.file}${line === undefined ? "" : `:${line}`} in ${a.symbol}` +
  `${(a.occurrence ?? 0) > 0 ? ` #${a.occurrence}` : ""}: ${a.text}`;

/**
 * Exact comparison. `unexpected` names each found site no anchor covers (with its line, for the
 * reader); `missing` names each anchor nothing matched. Both empty means the list is exact.
 */
export function compareSites(
  actual: ReadonlyArray<Site>,
  expected: ReadonlyArray<Anchor>,
): { unexpected: string[]; missing: string[] } {
  const expectedKeys = new Set<string>();
  for (const anchor of expected) {
    const key = keyOf(anchor);
    if (expectedKeys.has(key)) throw new Error(`duplicate anchor: ${describeAnchor(anchor)}`);
    expectedKeys.add(key);
  }
  const actualKeys = new Set(actual.map(keyOf));
  return {
    unexpected: actual
      .filter((site) => !expectedKeys.has(keyOf(site)))
      .map((site) => describeAnchor(site, site.line)),
    missing: expected
      .filter((anchor) => !actualKeys.has(keyOf(anchor)))
      .map((a) => describeAnchor(a)),
  };
}
