import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * F8-F1 (the PW1-F8 review's note 5): no kabinet page, route or module holds the raw database.
 * Each reads through `kabinetDb()` (`kabinet-db.ts`), whose query errors are cleaned, so a throw
 * that reaches Next's log carries no statement parameters. This scan fails if a kabinet source file
 * imports the raw handle again: `getDb` (`src/api/db.ts`) or `@opika/db`'s `createDatabase`.
 * Tests are not scanned: they build their own databases, and a test that mocks `api/db` mocks
 * what `kabinetDb()` wraps.
 */
const SRC = resolve(fileURLToPath(import.meta.url), "../..");
const RAW_DB_MODULE = join(SRC, "api/db");

/** Every kabinet surface: its pages, its routes (RPC, Better Auth's, the auth cleanup), its code. */
const ROOTS = [
  "app/kabinet",
  "app/api/kabinet",
  "app/api/auth",
  "app/api/cron/auth-cleanup",
  "kabinet",
  "features/kabinet",
];

/**
 * The justified exceptions, each with its reason. Kept exact: an entry that no longer imports the
 * raw handle fails the test too, so the list can't go stale.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  "kabinet/kabinet-db.ts": "the one place the raw handle is wrapped",
};

const SOURCE = /\.(?:ts|tsx)$/;
const TEST = /\.(?:test|harness)\.(?:ts|tsx)$/;

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

/** Every module specifier `text` imports, statically, dynamically or by re-export. */
function specifiersOf(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(
    /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g,
  )) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) out.push(specifier);
  }
  return out;
}

/** Why `text` (at `path`) holds the raw database, or null when it doesn't. */
function rawDatabaseUseIn(path: string, text: string): string | null {
  for (const specifier of specifiersOf(text)) {
    if (specifier.startsWith(".") && resolve(dirname(path), specifier) === RAW_DB_MODULE) {
      return `imports ${specifier}`;
    }
  }
  if (/\bimport\b[^;]*\bcreateDatabase\b[^;]*from\s*["']@opika\/db["']/.test(text)) {
    return "imports createDatabase from @opika/db";
  }
  return null;
}

describe("the kabinet reads through kabinetDb(), never the raw handle", () => {
  const files = ROOTS.flatMap(sourcesUnder);
  const offences = files.flatMap((path) => {
    const key = relative(SRC, path).replaceAll("\\", "/");
    const use = rawDatabaseUseIn(path, readFileSync(path, "utf8"));
    return use === null ? [] : [{ key, use }];
  });

  it("covers the kabinet's pages and routes (the scan is not looking at nothing)", () => {
    const keys = new Set(files.map((path) => relative(SRC, path).replaceAll("\\", "/")));
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
    ]) {
      expect([known, keys.has(known)]).toEqual([known, true]);
    }
  });

  it("no kabinet source imports getDb or createDatabase, beyond the allow-list", () => {
    expect(offences.filter((offence) => !Object.hasOwn(ALLOWED, offence.key))).toEqual([]);
  });

  it("every allow-list entry still exists and still needs its exception", () => {
    for (const key of Object.keys(ALLOWED)) {
      expect([key, existsSync(join(SRC, key))]).toEqual([key, true]);
      expect([key, offences.some((offence) => offence.key === key)]).toEqual([key, true]);
    }
  });

  it("the detector itself: each way in is caught, kabinetDb is not", () => {
    const page = join(SRC, "app/kabinet/example/page.tsx");
    expect(rawDatabaseUseIn(page, 'import { getDb } from "../../../api/db";')).toBe(
      "imports ../../../api/db",
    );
    expect(rawDatabaseUseIn(page, 'const { getDb } = await import("../../../api/db");')).toBe(
      "imports ../../../api/db",
    );
    expect(rawDatabaseUseIn(page, 'export { getDb } from "../../../api/db";')).toBe(
      "imports ../../../api/db",
    );
    expect(
      rawDatabaseUseIn(page, 'import { createDatabase, type Database } from "@opika/db";'),
    ).toBe("imports createDatabase from @opika/db");
    expect(
      rawDatabaseUseIn(page, 'import { kabinetDb } from "../../../kabinet/kabinet-db";'),
    ).toBeNull();
    expect(rawDatabaseUseIn(page, 'import type { Database } from "@opika/db";')).toBeNull();
  });
});
