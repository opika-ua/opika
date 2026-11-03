import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as domain from "@opika/domain";
import * as domainCore from "@opika/domain/core";
import { describe, expect, it } from "vitest";

/**
 * Zod and the contract barrel stay out of the browser bundle of every public page.
 *
 * A client file that imports `@opika/domain` or `@opika/contracts` for one constant pulls zod and
 * every schema those packages build at module init (zod chains are not reliably tree-shaken), about
 * 33 KB gzip on every page. The client may import only the zod-free subpaths
 * `@opika/domain/core` and `@opika/contracts/constants`; types are free (`import type` is erased).
 *
 * Kabinet client code is exempt (it uses zod forms on purpose) but must switch zod's `new Function`
 * probe off first: zod 4 runs the probe when it builds its first object schema, and the CSP
 * reports it as eval (audit F5). The probe is lazy, so it is the first schema construction that
 * matters, not module load; every kabinet client file that can reach a schema therefore imports
 * `zod-client-config` before anything else. The built-output half of this guard is
 * `scripts/check-route-bundles.mjs`, run in CI right after `build:web`.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)));
const WEB = resolve(SRC, "..");
const REPO = resolve(WEB, "../..");
const PACKAGES = join(REPO, "packages");

const ZOD_CONFIG = join(SRC, "zod-client-config.ts");
const DOMAIN_CORE = join(PACKAGES, "domain/src/core.ts");
const CONTRACTS_CONSTANTS = join(PACKAGES, "contracts/src/constants.ts");

/** What a client file may not import at runtime, by exact specifier. */
const FORBIDDEN = new Set(["zod", "@opika/contracts", "@opika/domain"]);

/** Workspace entries a client graph may walk into, as the files their `exports` map points at. */
const WORKSPACE_ENTRIES: Record<string, string> = {
  "@opika/domain/core": DOMAIN_CORE,
  "@opika/contracts/constants": CONTRACTS_CONSTANTS,
  "@opika/i18n/public": join(PACKAGES, "i18n/src/public.ts"),
  "@opika/i18n": join(PACKAGES, "i18n/src/index.ts"),
  "@opika/ui": join(PACKAGES, "ui/src/index.ts"),
};

const sourceFilesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFilesUnder(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

const read = (file: string): string => readFileSync(file, "utf8");

type Import = { specifier: string; dynamic: boolean };

/**
 * Runtime imports of a file: `import type`, `export type` and imports whose every specifier is an
 * inline `type` are erased by the compiler and do not count. A regex, not a parser, like the other
 * source-scan tests here; the built-output check is the backstop for anything it misreads.
 */
const runtimeImportsOf = (file: string): Import[] => {
  const source = read(file);
  const found: Import[] = [];
  const staticImport =
    /(?:^|\n)[ \t]*(import|export)(\s+type)?\s*([^;'"]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(staticImport)) {
    const [, , typeOnly, clause, from, bare] = match;
    if (bare !== undefined) {
      found.push({ specifier: bare, dynamic: false });
      continue;
    }
    if (typeOnly !== undefined || from === undefined) continue;
    const named = /^\{([^}]*)\}$/.exec((clause ?? "").trim());
    const specifiers = named?.[1]?.split(",").filter((part) => part.trim() !== "") ?? [];
    if (specifiers.length > 0 && specifiers.every((part) => part.trim().startsWith("type "))) {
      continue;
    }
    found.push({ specifier: from, dynamic: false });
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1] !== undefined) found.push({ specifier: match[1], dynamic: true });
  }
  return found;
};

const resolveSpecifier = (from: string, specifier: string): string | undefined => {
  const workspace = WORKSPACE_ENTRIES[specifier];
  if (workspace !== undefined) return workspace;
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (base === undefined) return undefined;
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(
    (candidate) => existsSync(candidate),
  );
};

type Walk = {
  visited: Map<string, string | null>;
  /** Files holding a forbidden runtime import, with what they import. */
  offences: { file: string; specifier: string }[];
};

/** Every file reachable from `entries` by runtime imports, and every forbidden import on the way. */
const walk = (entries: readonly string[]): Walk => {
  const visited = new Map<string, string | null>();
  const offences: Walk["offences"] = [];
  const queue = entries.map((entry): [string, string | null] => [entry, null]);
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const [file, parent] = next;
    if (visited.has(file)) continue;
    visited.set(file, parent);
    for (const { specifier } of runtimeImportsOf(file)) {
      if (FORBIDDEN.has(specifier)) offences.push({ file, specifier });
      const target = resolveSpecifier(file, specifier);
      if (target !== undefined) queue.push([target, file]);
    }
  }
  return { visited, offences };
};

const rel = (file: string): string => file.slice(REPO.length + 1).replaceAll("\\", "/");

const describeOffence = (walked: Walk, offence: Walk["offences"][number]): string => {
  const chain = [offence.file];
  for (let parent = walked.visited.get(chain[0] ?? ""); parent; parent = walked.visited.get(parent))
    chain.unshift(parent);
  return `${offence.specifier} <- ${chain.map(rel).join(" -> ")}`;
};

const isKabinet = (file: string): boolean => /[\\/]kabinet[\\/]/.test(file);
const isClientFile = (file: string): boolean => /^\s*["']use client["']/.test(read(file));

const webFiles = sourceFilesUnder(SRC);
const clientEntries = webFiles.filter((file) => isClientFile(file) && !isKabinet(file));
const kabinetClientFiles = webFiles.filter((file) => isClientFile(file) && isKabinet(file));

describe("the public client bundle carries no zod", () => {
  const publicEntries = [...clientEntries, join(SRC, "instrumentation-client.ts")];
  const walked = walk(publicEntries);

  it("finds the client files it is meant to guard", () => {
    const names = new Set(
      publicEntries.map((file) => file.slice(SRC.length + 1).replaceAll("\\", "/")),
    );
    for (const name of [
      "features/gallery/GalleryFilterDropdowns.tsx",
      "features/animal-detail/RevealFlow.tsx",
      "features/gallery/FilterSheet.tsx",
      "features/likes/SaveButton.tsx",
      "features/reveal/ContactRevealDialog.tsx",
      "features/filters/use-feed-filters.ts",
      "instrumentation-client.ts",
    ]) {
      expect(names, name).toContain(name);
    }
    // The walk reaches the modules that used to pull zod in, so a silent resolver break fails here.
    for (const file of [
      "features/gallery/filter-url.ts",
      "features/filters/filter-state.ts",
      "features/likes/likes-store.ts",
      "api/browser-client.ts",
    ]) {
      expect(walked.visited.has(join(SRC, file)), file).toBe(true);
    }
    expect(walked.visited.has(DOMAIN_CORE)).toBe(true);
    expect(walked.visited.has(CONTRACTS_CONSTANTS)).toBe(true);
  });

  it("imports no zod, bare contracts or bare domain at runtime", () => {
    expect(walked.offences.map((offence) => describeOffence(walked, offence))).toEqual([]);
  });

  it("keeps zod out of instrumentation-client, which runs on every page", () => {
    expect(read(join(SRC, "instrumentation-client.ts"))).not.toMatch(/["']zod["']/);
  });
});

describe("the two zod-free subpaths stay pure", () => {
  it("domain core imports no zod, no workspace package and never the main entry", () => {
    const walked = walk([DOMAIN_CORE]);
    expect(walked.offences).toEqual([]);
    const specifiers = [...walked.visited.keys()].flatMap((file) =>
      runtimeImportsOf(file).map((entry) => `${rel(file)}: ${entry.specifier}`),
    );
    // Relative only: a package import (zod included) would be listed here.
    expect(specifiers.filter((line) => !/: \.\.?\//.test(line))).toEqual([]);
    expect([...walked.visited.keys()].filter((file) => /[\\/]index\.tsx?$/.test(file))).toEqual([]);
  });

  it("contracts constants import only the domain core", () => {
    expect(runtimeImportsOf(CONTRACTS_CONSTANTS).map((entry) => entry.specifier)).toEqual([
      "@opika/domain/core",
    ]);
  });

  it("are re-exported unchanged by the package indexes, so server imports do not move", () => {
    for (const [name, value] of Object.entries(domainCore)) {
      expect((domain as Record<string, unknown>)[name], name).toBe(value);
    }
    expect(read(join(PACKAGES, "domain/src/index.ts"))).toContain('export * from "./core"');
    expect(read(join(PACKAGES, "contracts/src/index.ts"))).toContain('export * from "./constants"');
  });
});

describe("kabinet client code switches zod's eval probe off before it can run", () => {
  it("has a config module that does it, in the browser only", () => {
    const source = read(ZOD_CONFIG);
    expect(source).toMatch(/z\.config\(\{\s*jitless:\s*true\s*\}\)/);
    expect(source).toMatch(/typeof window !== "undefined"/);
  });

  it("imports the config first in every kabinet client file that can reach a schema", () => {
    const missing = kabinetClientFiles.flatMap((file) => {
      if (walk([file]).offences.length === 0) return [];
      const first = runtimeImportsOf(file)[0];
      const firstFile = first && resolveSpecifier(file, first.specifier);
      return firstFile === ZOD_CONFIG ? [] : [rel(file)];
    });
    expect(missing).toEqual([]);
  });

  it("is also the only way a kabinet entry gets zod configured (no other z.config call)", () => {
    const callers = webFiles.filter((file) => /\bz\.config\(/.test(read(file))).map(rel);
    expect(callers).toEqual(["apps/web/src/zod-client-config.ts"]);
  });
});

describe("CI checks the built output of the gallery and detail routes", () => {
  it("runs the route bundle check right after build:web", () => {
    const workflow = read(join(REPO, ".github/workflows/ci.yml"));
    const build = workflow.indexOf("pnpm run build:web");
    const check = workflow.indexOf("pnpm --filter @opika/web run check:route-bundles");
    expect(build).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(build);
  });
});
