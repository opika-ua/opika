import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(SRC, "..", "public");
const SECRET = "test-proxy-secret";

function get(path: string, method = "GET", headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, "https://opika.example"), { method, headers });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function resolveFile(base: string): string | undefined {
  return [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")].find(
    existsSync,
  );
}

// Workspace packages by import name: `@opika/ui/x` loads code from `packages/ui`, so every source
// file of that package counts as loaded (coarse on purpose: it can only add references).
const REPO_PACKAGES = resolve(SRC, "..", "..", "..", "packages");
function workspacePackageSources(specifier: string): string[] {
  for (const dir of readdirSync(REPO_PACKAGES)) {
    const manifest = join(REPO_PACKAGES, dir, "package.json");
    if (!existsSync(manifest)) continue;
    const name = (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name;
    if (name && (specifier === name || specifier.startsWith(`${name}/`))) {
      return sourceFiles(join(REPO_PACKAGES, dir, "src"));
    }
  }
  return [];
}

function importedFiles(from: string, source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const specifier = m[1] ?? "";
    if (specifier.startsWith("@/")) {
      const file = resolveFile(join(SRC, specifier.slice(2)));
      if (file) out.push(file);
    } else if (specifier.startsWith(".")) {
      const file = resolveFile(resolve(dirname(from), specifier));
      if (file) out.push(file);
    } else if (specifier.startsWith("@opika/")) {
      out.push(...workspacePackageSources(specifier));
    }
  }
  return out;
}

// Entry points = every file of the gate-exempt pages (`/kabinet/*`: sign-in, reset, invitation,
// confirm), the root layout and the not-found page every unknown `/kabinet/*` path renders; then
// what they import, transitively.
function exemptPageSources(): string[] {
  const seen = new Set<string>();
  const queue = [
    ...sourceFiles(join(SRC, "app/kabinet")),
    join(SRC, "app/layout.tsx"),
    join(SRC, "app/not-found.tsx"),
  ];
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...importedFiles(file, readFileSync(file, "utf8")));
  }
  return [...seen];
}

const ASSET_LITERAL =
  /["'`](\/[A-Za-z0-9_\-./]+\.(?:svg|png|webp|jpe?g|gif|ico|avif|woff2?|webmanifest))["'`]/g;

let referencedCache: string[] | undefined;
function referencedAssetUrls(): string[] {
  referencedCache ??= computeReferencedAssetUrls();
  return referencedCache;
}

function computeReferencedAssetUrls(): string[] {
  const urls = new Set<string>();
  for (const file of exemptPageSources()) {
    for (const m of readFileSync(file, "utf8").matchAll(ASSET_LITERAL)) {
      const url = m[1] ?? "";
      // Only same-origin files that exist in `public/`; route paths like "/x.png" elsewhere do not count.
      if (existsSync(join(PUBLIC_DIR, url))) urls.add(url);
    }
  }
  // Next file conventions at the app root (`app/icon.svg`, `app/apple-icon.png`) are linked from every
  // page's <head> under their bare name.
  for (const name of readdirSync(join(SRC, "app"))) {
    if (/^(icon|apple-icon)\.(svg|png|ico)$/.test(name)) urls.add(`/${name}`);
  }
  return [...urls].sort();
}

// The source walk reads a few hundred files; a loaded CI machine needs more than the default 5 s.
describe("gate-exempt pages' static assets", { timeout: 60_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PRELAUNCH_GATE_SECRET", SECRET);
    vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: false }));
  });
  afterEach(() => {
    vi.doUnmock("./seo-flags");
    vi.unstubAllEnvs();
  });

  it("finds the logo among the assets the exempt pages reference", () => {
    expect(referencedAssetUrls()).toContain("/brand-v3/logo.svg");
  });

  it("serves every referenced asset without the gate cookie", async () => {
    const { proxy } = await import("./proxy");
    for (const url of referencedAssetUrls()) {
      for (const method of ["GET", "HEAD"]) {
        const response = await proxy(get(url, method));
        expect(response.status, `${method} ${url}`).not.toBe(403);
      }
    }
  });

  it("keeps the exemption to those exact files, not to the directory", async () => {
    const { GATE_EXEMPT_PAGE_ASSET_PATHS } = await import("./proxy");
    const referenced = new Set(referencedAssetUrls());
    for (const path of GATE_EXEMPT_PAGE_ASSET_PATHS) expect(referenced.has(path), path).toBe(true);
  });

  it.each([
    "/tvaryny",
    "/brand-v3",
    "/brand-v3/",
    "/brand-v3/README.md",
    "/brand-v3/logo.svg/",
    "/brand-v3/logo.svg/extra",
    "/brand-v3/logo.svgx",
    "/brand-v3/%2e%2e/tvaryny",
    "/brand-v3/..%2ftvaryny",
    "/brand-v3/logo.svg%2f..%2f..%2ftvaryny",
    "/brand-v3/logo.svg;/tvaryny",
    "/brand-v3/LOGO.SVG",
    "/pet-card/icon-close.svg",
    "/seed-photos/x.webp",
    "/icon.svgx",
  ])("still gates %s", async (path) => {
    const { proxy } = await import("./proxy");
    expect((await proxy(get(path))).status).toBe(403);
  });

  it("resolves dot segments before the gate sees the path, so traversal lands on a gated page", async () => {
    const { proxy } = await import("./proxy");
    for (const path of [
      "/brand-v3/../tvaryny",
      "/brand-v3/%2E%2E/tvaryny",
      "/brand-v3/./../tvaryny",
    ]) {
      const request = get(path);
      expect(request.nextUrl.pathname, path).toBe("/tvaryny");
      expect((await proxy(request)).status, path).toBe(403);
    }
  });

  it("answers only GET and HEAD without the cookie", async () => {
    const { proxy } = await import("./proxy");
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect((await proxy(get("/brand-v3/logo.svg", method))).status, method).toBe(403);
    }
  });

  it("does not let a query string naming the exempt file open a gated page", async () => {
    const { proxy } = await import("./proxy");
    expect((await proxy(get("/tvaryny?x=/brand-v3/logo.svg"))).status).toBe(403);
  });
});
