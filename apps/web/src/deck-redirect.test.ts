import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

/**
 * The swipe deck is retired (owner, 2026-11-02) and the gallery moved from `/tvaryny` to `/`
 * (SEO PR 6): every old URL, deck sub-paths included, is a permanent redirect to the gallery. Next carries the query string over by itself; the harness
 * spec `retired-deck-redirect.harness.ts` pins that against a real server.
 */
/** Next's `:name*` (zero or more segments) is the only pattern syntax the sources use. */
function matches(source: string, pathname: string): boolean {
  return new RegExp(`^${source.replace(/\/:\w+\*/g, "(?:/.*)?")}$`).test(pathname);
}

async function redirectFor(pathname: string) {
  const redirects = (await nextConfig.redirects?.()) ?? [];
  return redirects.find((r) => matches(r.source, pathname));
}

describe("the retired gallery and deck routes", () => {
  it.each([
    "/tvaryny",
    "/tvaryny/gortaty",
    "/tvaryny/gortaty/anything",
    "/tvaryny/gortaty/a/b",
    "/discovery",
  ])("%s is a 308 to the gallery", async (path) => {
    const rule = await redirectFor(path);
    expect(rule?.destination).toBe("/");
    expect(rule && "permanent" in rule && rule.permanent).toBe(true);
  });

  it("does not swallow a real animal page", async () => {
    expect(await redirectFor("/tvaryny/0b3f1d0e-6a3c-4c7e-9d0a-2f6f1b6f4a11")).toBeUndefined();
    expect(await redirectFor("/tvaryny/gortatyx")).toBeUndefined();
    expect(await redirectFor("/tvaryny/misto/kyiv")).toBeUndefined();
  });

  it("serves the gallery at `/` by a rewrite, and `/` itself never redirects", async () => {
    expect(await redirectFor("/")).toBeUndefined();
    const rewrites = await nextConfig.rewrites?.();
    const beforeFiles = rewrites && !Array.isArray(rewrites) ? rewrites.beforeFiles : [];
    expect(beforeFiles).toEqual([{ source: "/", destination: "/tvaryny" }]);
  });
});
