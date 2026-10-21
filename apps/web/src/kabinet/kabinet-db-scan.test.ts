import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Node, SourceFile } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import {
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isNamespaceImport,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
} from "typescript/unstable/ast/is";
import { describe, expect, it } from "vitest";
import { nodesOf, readParsed } from "../../test/source-ast";

/**
 * F8-F1 (the PW1-F8 review's note 5, and the review of 78c888f, note 4): nothing the kabinet runs
 * holds the raw database. Each kabinet page, route and module reads through `kabinetDb()`
 * (`kabinet-db.ts`), whose query errors are cleaned, so a throw that reaches Next's log carries no
 * statement parameters.
 *
 * The scan walks the import closure from every kabinet entry point (its pages and routes, its own
 * modules, `proxy.ts`), following relative and `@/` imports, static and dynamic, into any
 * directory: a helper outside the kabinet's folders counts the same as a kabinet file. A module in
 * that closure fails the scan if it imports `src/api/db` (`getDb`), however spelled, or uses
 * `@opika/db`'s `createDatabase`, by name or through a namespace. Type-only imports load nothing
 * and are not followed. Tests are not entry points: they build their own databases.
 *
 * Imports are read from the TypeScript compiler's syntax tree, not by pattern (F8-F2, note 4;
 * `test/source-ast.ts`), so a string or a comment can neither hide an import nor fake one.
 */
const SRC = resolve(fileURLToPath(import.meta.url), "../..");
const RAW_DB_MODULE = join(SRC, "api/db.ts");

/** `tsconfig.json`'s one path alias. */
const ALIASES: ReadonlyArray<readonly [string, string]> = [["@/", SRC]];

/** Every kabinet surface: its pages, its routes (RPC, Better Auth's, the auth cleanup), its code. */
const ROOTS = [
  "app/kabinet",
  "app/api/kabinet",
  "app/api/auth",
  "app/api/cron/auth-cleanup",
  "kabinet",
  "features/kabinet",
];
const ENTRY_FILES = ["proxy.ts"];

/**
 * The justified exceptions: a module, every finding it may have, and why. Kept exact: an entry
 * whose module has a finding more or fewer, or that the walk no longer reaches, fails the test
 * too, so the list can't go stale or cover a finding added later. A non-literal `import()` or
 * `createRequire` in a reached module would need an entry here, proven the same way; none has one
 * today.
 */
const ALLOWED: Readonly<Record<string, { uses: readonly string[]; why: string }>> = {
  "kabinet/kabinet-db.ts": {
    uses: ["imports ../api/db"],
    why: "the one place the raw handle is wrapped",
  },
};
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);
const allowed = (offence: Offence) => {
  const entry = Object.hasOwn(ALLOWED, offence.key) ? ALLOWED[offence.key] : undefined;
  return entry !== undefined && sameList(entry.uses, offence.uses);
};

const SOURCE = /\.(?:ts|tsx)$/;
const TEST = /\.(?:test|harness)\.(?:ts|tsx)$/;

type FileSystem = { read: (path: string) => string; exists: (path: string) => boolean };
const disk: FileSystem = {
  read: (path) => readFileSync(path, "utf8"),
  exists: (path) => existsSync(path) && statSync(path).isFile(),
};

function sourcesUnder(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (SOURCE.test(name) && !TEST.test(name)) out.push(path);
    }
  };
  walk(join(SRC, root));
  return out;
}

/** How a module is named: by a statement, by a call, or only as a type (which loads nothing). */
type Load = { specifier: string; via: "import" | "export" | "import()" | "require" | "type" };

/** What the scan reads from one module's syntax tree. */
type ModuleFacts = {
  /** Every module it names, type-only ones included (`via: "type"`), in source order. */
  loads: readonly Load[];
  /** Whether an identifier `createDatabase` appears in its code (not a string or a comment). */
  namesCreateDatabase: boolean;
  /** Ways it loads a module the walk can't follow (`unfollowableLoadsIn`). */
  unfollowable: readonly string[];
  /** The module names the compiler itself collected, for the cross-check. */
  compilerImports: readonly string[];
};

/** A string literal's text, or a template literal's with nothing interpolated; else null. */
function literalText(node: Node | undefined): string | null {
  if (node === undefined) return null;
  return isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

const DB_PACKAGE = "@opika/db";

/**
 * `sourceFile`'s facts, read from the compiler's tree (F8-F2, note 4): a string or a comment is
 * never code, so neither can hide an import or fake one. Read: import declarations (a whole
 * `import type` names a type only), `export … from` (likewise `export type`), `import x =
 * require()`, `import()` and `require()` calls; and, failing closed, an `import()` or `require()`
 * of anything but a literal, any use of `createRequire`, and a namespace or dynamic load of
 * `@opika/db` (through which `createDatabase` can be reached by a computed name).
 */
function factsOf(sourceFile: SourceFile): ModuleFacts {
  const loads: Load[] = [];
  const unfollowable: string[] = [];
  let namesCreateDatabase = false;
  for (const node of nodesOf(sourceFile)) {
    if (isImportDeclaration(node)) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier === null) continue;
      const typeOnly = node.importClause?.phaseModifier === SyntaxKind.TypeKeyword;
      loads.push({ specifier, via: typeOnly ? "type" : "import" });
      const bindings = node.importClause?.namedBindings;
      if (!typeOnly && specifier === DB_PACKAGE && bindings && isNamespaceImport(bindings)) {
        unfollowable.push("a namespace import of @opika/db");
      }
    } else if (isExportDeclaration(node)) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== null) loads.push({ specifier, via: node.isTypeOnly ? "type" : "export" });
    } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
      const specifier = literalText(node.moduleReference.expression);
      if (specifier !== null) loads.push({ specifier, via: node.isTypeOnly ? "type" : "import" });
    } else if (isCallExpression(node)) {
      const callee = node.expression;
      const isImport = callee.kind === SyntaxKind.ImportKeyword;
      const isRequire = isIdentifier(callee) && callee.text === "require";
      if (!isImport && !isRequire) continue;
      const specifier = literalText(node.arguments[0]);
      if (specifier === null) {
        unfollowable.push(isImport ? "a non-literal import()" : "a non-literal require()");
        continue;
      }
      loads.push({ specifier, via: isImport ? "import()" : "require" });
      if (isImport && specifier === DB_PACKAGE) unfollowable.push("a dynamic import of @opika/db");
    } else if (isIdentifier(node)) {
      if (node.text === "createRequire") unfollowable.push("createRequire");
      if (node.text === "createDatabase") namesCreateDatabase = true;
    }
  }
  return {
    loads,
    namesCreateDatabase,
    unfollowable: [...new Set(unfollowable)],
    compilerImports: sourceFile.imports.map((node) => literalText(node) ?? "(not a literal)"),
  };
}

/** Each module's facts, parsed once per text: a detector check may give a path new text. */
const parsedFacts = new Map<string, { text: string; facts: ModuleFacts }>();

/** The facts of each of `paths`, parsing every one not yet parsed in one compiler run. */
function factsFor(paths: readonly string[], fs: FileSystem): Map<string, ModuleFacts> {
  const texts = new Map(paths.map((path) => [path, fs.read(path)] as const));
  const unparsed = new Map(
    [...texts].filter(([path, text]) => parsedFacts.get(path)?.text !== text),
  );
  if (unparsed.size > 0) {
    for (const [path, facts] of readParsed(unparsed, factsOf)) {
      parsedFacts.set(path, { text: unparsed.get(path) ?? "", facts });
    }
  }
  return new Map(
    paths.map((path) => {
      const parsed = parsedFacts.get(path);
      if (parsed === undefined) throw new Error(`${path}: not parsed`);
      return [path, parsed.facts] as const;
    }),
  );
}

/** The modules `facts` loads: everything it names except as a type only. */
const loadedSpecifiers = (facts: ModuleFacts) =>
  facts.loads.filter((load) => load.via !== "type").map((load) => load.specifier);

/** The file `specifier` names from `fromFile`, or null for a package. Throws when a local one names none. */
function resolveLocal(specifier: string, fromFile: string, fs: FileSystem): string | null {
  const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix));
  let base: string;
  if (alias !== undefined) base = join(alias[1], specifier.slice(alias[0].length));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  const found = candidates.find((candidate) => SOURCE.test(candidate) && fs.exists(candidate));
  if (found === undefined) {
    throw new Error(`${fromFile}: "${specifier}" resolves to none of ${candidates.join(", ")}`);
  }
  return found;
}

/**
 * Every module reachable from `entries` by loading imports; the raw module itself ends a path.
 * Walked a layer at a time, so each layer is parsed in one compiler run.
 */
function closureOf(entries: readonly string[], fs: FileSystem): Set<string> {
  const seen = new Set<string>();
  let layer = [...new Set(entries)].filter((file) => file !== RAW_DB_MODULE);
  while (layer.length > 0) {
    for (const file of layer) seen.add(file);
    const next = new Set<string>();
    for (const [file, facts] of factsFor(layer, fs)) {
      for (const specifier of loadedSpecifiers(facts)) {
        const target = resolveLocal(specifier, file, fs);
        if (target !== null && target !== RAW_DB_MODULE && !seen.has(target)) next.add(target);
      }
    }
    layer = [...next];
  }
  return seen;
}

/**
 * Every reason the module at `path` holds, or may hold, the raw database: all of them, not the
 * first, so a module on the allow-list can't gain a second finding unseen (F8-F2, note 3).
 */
function rawDatabaseUsesIn(path: string, facts: ModuleFacts, fs: FileSystem): string[] {
  const uses: string[] = [];
  for (const specifier of loadedSpecifiers(facts)) {
    if (resolveLocal(specifier, path, fs) === RAW_DB_MODULE) uses.push(`imports ${specifier}`);
  }
  const loadsDbPackage = loadedSpecifiers(facts).some(
    (specifier) => specifier === DB_PACKAGE || specifier.startsWith(`${DB_PACKAGE}/`),
  );
  if (loadsDbPackage && facts.namesCreateDatabase) uses.push("uses createDatabase");
  uses.push(...facts.unfollowable);
  return [...new Set(uses)];
}

const keyOf = (path: string) => relative(SRC, path).replaceAll("\\", "/");

type Offence = { key: string; uses: readonly string[] };

/** Each module among `modules` with a finding, and every finding it has. */
function offencesIn(modules: Iterable<string>, fs: FileSystem): Offence[] {
  return [...factsFor([...modules], fs)].flatMap(([path, facts]) => {
    const uses = rawDatabaseUsesIn(path, facts, fs);
    return uses.length === 0 ? [] : [{ key: keyOf(path), uses }];
  });
}

describe("the kabinet reaches the database only through kabinetDb()", () => {
  const entries = [...ROOTS.flatMap(sourcesUnder), ...ENTRY_FILES.map((file) => join(SRC, file))];
  const reached = closureOf(entries, disk);
  const reachedKeys = new Set([...reached].map(keyOf));
  const offences = offencesIn(reached, disk);

  it("starts from the kabinet's pages and routes, and walks out of its folders", () => {
    for (const known of [
      "app/kabinet/page.tsx",
      "app/kabinet/vkhid/page.tsx",
      "app/kabinet/vkhid/pidtverdzhennia/route.ts",
      "app/kabinet/prytulky/operator-request.ts",
      "app/kabinet/tvaryny/load.ts",
      "app/api/kabinet/[...rpc]/route.ts",
      "app/api/auth/[...all]/route.ts",
      "app/api/cron/auth-cleanup/route.ts",
      "kabinet/runtime.ts",
      "proxy.ts",
      // Outside the kabinet's folders: the walk follows helpers.
      "api/router-client.ts",
      "api/router.ts",
    ]) {
      expect([known, reachedKeys.has(known)]).toEqual([known, true]);
    }
  });

  it("no reached module imports getDb or createDatabase, beyond the allow-list", () => {
    expect(offences.filter((offence) => !allowed(offence))).toEqual([]);
  });

  it("every allow-list entry is still reached and still has exactly its findings, every one", () => {
    for (const [key, { uses }] of Object.entries(ALLOWED)) {
      expect([key, reachedKeys.has(key)]).toEqual([key, true]);
      expect([key, offences.filter((offence) => offence.key === key)]).toEqual([
        key,
        [{ key, uses }],
      ]);
    }
  });

  it("the public pages' default-handle client stays out of the kabinet's reach (F8-F1-D8)", () => {
    // `server-client.ts` defaults to `getDb()`; the kabinet's one caller uses `routerClientOver`.
    expect(reachedKeys.has("api/server-client.ts")).toBe(false);
  });

  it("reads, in every reached module, exactly the module names the compiler collects (F8-F2, note 4)", () => {
    // The compiler's own list (`SourceFile.imports`) holds import and export declarations,
    // `import()` and `import x = require()`; a `require()` call it collects in JavaScript only.
    const facts = factsFor([...reached], disk);
    expect(reached.size).toBeGreaterThan(100);
    for (const [path, moduleFacts] of facts) {
      const read = moduleFacts.loads
        .filter((load) => load.via !== "require")
        .map((load) => load.specifier);
      expect([keyOf(path), [...new Set(read)].sort()]).toEqual([
        keyOf(path),
        [...new Set(moduleFacts.compilerImports)].sort(),
      ]);
    }
  });
});

describe("the scan's detector", () => {
  const page = join(SRC, "app/kabinet/example/page.tsx");
  const helper = join(SRC, "lib/helper.ts");
  const wrapper = join(SRC, "kabinet/kabinet-db.ts");
  /** A small file system: the real one, plus the files given. */
  const withFiles = (files: Record<string, string>): FileSystem => ({
    read: (path) => files[path] ?? disk.read(path),
    exists: (path) => Object.hasOwn(files, path) || disk.exists(path),
  });
  const offencesFrom = (files: Record<string, string>) => {
    const fs = withFiles(files);
    return offencesIn(closureOf([page], fs), fs);
  };
  const usesFrom = (files: Record<string, string>) =>
    offencesFrom(files).flatMap((offence) => offence.uses);

  it("catches each way in: relative, the @/ alias, re-export, dynamic import, require, createDatabase named or through a namespace", () => {
    for (const [source, uses] of [
      ['import { getDb } from "../../../api/db";', ["imports ../../../api/db"]],
      ['import { getDb as kabinetDb } from "@/api/db";', ["imports @/api/db"]],
      ['export { getDb } from "@/api/db";', ["imports @/api/db"]],
      ['const { getDb } = await import("../../../api/db");', ["imports ../../../api/db"]],
      ['const { getDb } = require("@/api/db");', ["imports @/api/db"]],
      ['import db = require("@/api/db");', ["imports @/api/db"]],
      ['import { createDatabase } from "@opika/db";', ["uses createDatabase"]],
      [
        'import * as m from "@opika/db";\nconst db = m.createDatabase(url);',
        ["uses createDatabase", "a namespace import of @opika/db"],
      ],
      // The review of 73d03fa, finding 5.
      ['/* c */ import { getDb } from "@/api/db";', ["imports @/api/db"]],
      ["const { getDb } = await import(`@/api/db`);", ["imports @/api/db"]],
      ["const m = await import(target);", ["a non-literal import()"]],
      ["const m = require(target);", ["a non-literal require()"]],
      // An interpolated template literal, assembled so it isn't a template in this file.
      [`const m = await import(\`@/api/$${"{name}"}\`);`, ["a non-literal import()"]],
      [
        'import { createRequire } from "node:module";\nconst m = createRequire(import.meta.url)(x);',
        ["createRequire"],
      ],
      [
        'import * as pkg from "@opika/db";\nconst make = pkg["create" + "Data" + "base"];',
        ["a namespace import of @opika/db"],
      ],
      ['const pkg = await import("@opika/db");', ["a dynamic import of @opika/db"]],
    ] as const) {
      expect([source, usesFrom({ [page]: source })]).toEqual([source, uses]);
    }
  });

  it("a comment marker inside a string hides no import (the review of 72b8a3b, note 4)", () => {
    for (const source of [
      'const glob = "/kabinet/*";\nimport { getDb } from "@/api/db";\n/** doc */\nexport const x = 1;',
      'const site = "https://example.org/*";\nimport { getDb } from "@/api/db";\n/* end */',
      'const u = "a//b"; import { getDb } from "@/api/db";',
      'const u = "a//b"; const { getDb } = await import("@/api/db");',
    ]) {
      expect([source, usesFrom({ [page]: source })]).toEqual([source, ["imports @/api/db"]]);
    }
  });

  it("an import or createRequire written in a string or a comment is no finding", () => {
    for (const source of [
      'export const note = "import(x) and createRequire(y), createDatabase too";',
      'export const t = `import { getDb } from "@/api/db"`;',
      '// import { getDb } from "@/api/db";\nexport const x = 1;',
      "/* const m = await import(target); createRequire */\nexport const x = 1;",
    ]) {
      expect([source, usesFrom({ [page]: source })]).toEqual([source, []]);
    }
  });

  it("catches a raw handle reached through a helper outside the kabinet's folders", () => {
    expect(
      usesFrom({
        [page]: 'import { helper } from "@/lib/helper";',
        [helper]: 'import { getDb } from "../api/db";\nexport const helper = () => getDb();',
      }),
    ).toEqual(["imports ../api/db"]);
  });

  it("passes kabinetDb and type-only imports (only the allowed wrapper holds the raw handle)", () => {
    const fs = withFiles({
      [page]:
        'import { kabinetDb } from "@/kabinet/kabinet-db";\nimport type { Database } from "@opika/db";\nimport type { getDb } from "@/api/db";\nexport type { Database } from "@opika/db";',
    });
    const found = offencesIn(closureOf([page], fs), fs);
    expect(found).toEqual([{ key: "kabinet/kabinet-db.ts", uses: ["imports ../api/db"] }]);
    expect(found.every(allowed)).toBe(true);
  });

  it("an allow-listed module that gains a finding is no longer allowed (the review of 72b8a3b, note 3)", () => {
    const grown = `${disk.read(wrapper)}\nexport const later = (target: string) => import(target);\nimport { createRequire } from "node:module";\nexport const load = createRequire(import.meta.url);\n`;
    const found = offencesFrom({
      [page]: 'import { kabinetDb } from "@/kabinet/kabinet-db";',
      [wrapper]: grown,
    });
    expect(found).toEqual([
      {
        key: "kabinet/kabinet-db.ts",
        uses: ["imports ../api/db", "a non-literal import()", "createRequire"],
      },
    ]);
    expect(found.filter((offence) => !allowed(offence))).toEqual(found);
  });

  it("a file the compiler can't parse fails the scan rather than passing it", () => {
    expect(() => usesFrom({ [page]: 'import { getDb } from "@/api/db"\nconst = ;' })).toThrow(
      /does not parse/,
    );
  });
});
