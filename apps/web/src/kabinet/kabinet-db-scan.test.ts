import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
 * The justified exceptions, each with its reason. Kept exact: an entry that no longer holds the
 * raw handle, or that the walk no longer reaches, fails the test too, so the list can't go stale.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  "kabinet/kabinet-db.ts": "the one place the raw handle is wrapped",
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

/**
 * Every module `text` loads: static imports and re-exports (a whole-statement `import type` or
 * `export type` loads nothing and is skipped), side-effect imports, and dynamic `import()`.
 */
function loadedSpecifiers(text: string): string[] {
  const out: string[] = [];
  const statement =
    /(?:^|[\n;])\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s*)?["']([^"']+)["']/g;
  for (const match of text.matchAll(statement)) {
    if (match[1] === undefined && match[2] !== undefined) out.push(match[2]);
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1] !== undefined) out.push(match[1]);
  }
  return out;
}

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

/** Every module reachable from `entries` by loading imports; the raw module itself ends a path. */
function closureOf(entries: readonly string[], fs: FileSystem): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop();
    if (file === undefined || seen.has(file) || file === RAW_DB_MODULE) continue;
    seen.add(file);
    for (const specifier of loadedSpecifiers(fs.read(file))) {
      const target = resolveLocal(specifier, file, fs);
      if (target !== null) stack.push(target);
    }
  }
  return seen;
}

/** Why `text` (at `path`) holds the raw database, or null when it doesn't. */
function rawDatabaseUseIn(path: string, text: string, fs: FileSystem): string | null {
  for (const specifier of loadedSpecifiers(text)) {
    if (resolveLocal(specifier, path, fs) === RAW_DB_MODULE) return `imports ${specifier}`;
  }
  const loadsDbPackage = loadedSpecifiers(text).some(
    (specifier) => specifier === "@opika/db" || specifier.startsWith("@opika/db/"),
  );
  if (loadsDbPackage && /\bcreateDatabase\b/.test(text)) return "uses createDatabase";
  return null;
}

const keyOf = (path: string) => relative(SRC, path).replaceAll("\\", "/");

function offencesIn(modules: Iterable<string>, fs: FileSystem) {
  return [...modules].flatMap((path) => {
    const use = rawDatabaseUseIn(path, fs.read(path), fs);
    return use === null ? [] : [{ key: keyOf(path), use }];
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
    expect(offences.filter((offence) => !Object.hasOwn(ALLOWED, offence.key))).toEqual([]);
  });

  it("every allow-list entry is still reached and still needs its exception", () => {
    for (const key of Object.keys(ALLOWED)) {
      expect([key, reachedKeys.has(key)]).toEqual([key, true]);
      expect([key, offences.some((offence) => offence.key === key)]).toEqual([key, true]);
    }
  });

  it("the public pages' default-handle client stays out of the kabinet's reach (F8-F1-D8)", () => {
    // `server-client.ts` defaults to `getDb()`; the kabinet's one caller uses `routerClientOver`.
    expect(reachedKeys.has("api/server-client.ts")).toBe(false);
  });
});

describe("the scan's detector", () => {
  const page = join(SRC, "app/kabinet/example/page.tsx");
  const helper = join(SRC, "lib/helper.ts");
  /** A small file system: the real one, plus the files given. */
  const withFiles = (files: Record<string, string>): FileSystem => ({
    read: (path) => files[path] ?? disk.read(path),
    exists: (path) => Object.hasOwn(files, path) || disk.exists(path),
  });
  const offencesFrom = (files: Record<string, string>) => {
    const fs = withFiles(files);
    return offencesIn(closureOf([page], fs), fs).map((offence) => offence.use);
  };

  it("catches each way in: relative, the @/ alias, re-export, dynamic import, createDatabase named or through a namespace", () => {
    for (const [source, use] of [
      ['import { getDb } from "../../../api/db";', "imports ../../../api/db"],
      ['import { getDb as kabinetDb } from "@/api/db";', "imports @/api/db"],
      ['export { getDb } from "@/api/db";', "imports @/api/db"],
      ['const { getDb } = await import("../../../api/db");', "imports ../../../api/db"],
      ['import { createDatabase } from "@opika/db";', "uses createDatabase"],
      ['import * as m from "@opika/db";\nconst db = m.createDatabase(url);', "uses createDatabase"],
    ] as const) {
      expect([source, offencesFrom({ [page]: source })]).toEqual([source, [use]]);
    }
  });

  it("catches a raw handle reached through a helper outside the kabinet's folders", () => {
    expect(
      offencesFrom({
        [page]: 'import { helper } from "@/lib/helper";',
        [helper]: 'import { getDb } from "../api/db";\nexport const helper = () => getDb();',
      }),
    ).toEqual(["imports ../api/db"]);
  });

  it("passes kabinetDb and type-only imports (only the allowed wrapper holds the raw handle)", () => {
    const fs = withFiles({
      [page]:
        'import { kabinetDb } from "@/kabinet/kabinet-db";\nimport type { Database } from "@opika/db";\nimport type { getDb } from "@/api/db";',
    });
    expect(offencesIn(closureOf([page], fs), fs)).toEqual([
      { key: "kabinet/kabinet-db.ts", use: "imports ../api/db" },
    ]);
  });
});
