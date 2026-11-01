import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_PAGE_PATHS } from "./token-pages";

/**
 * Oleksii, 2026-10-20, verbatim: "On /kabinet/vkhid* pages that carry a token: Cache-Control:
 * no-store and Referrer-Policy: no-referrer." The reset link's page gets both from the proxy,
 * which every page load passes; driven through the real `proxy`, with the site launched so the
 * pre-launch gate stays out of the way (its own tests are `proxy.test.ts`).
 */
describe("the token pages' headers, set by the proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
  });
  afterEach(() => {
    vi.doUnmock("../seo-flags");
  });

  const load = async (path: string) => {
    const { proxy } = await import("../proxy");
    return proxy(
      new NextRequest(`https://opika.example${path}`, {
        headers: { "x-vercel-forwarded-for": "198.51.100.61" },
      }),
    );
  };

  it("the reset page answers no-store and no-referrer, with or without its token", async () => {
    expect(TOKEN_PAGE_PATHS).toEqual(["/kabinet/vkhid/novyi-parol"]);
    for (const path of ["/kabinet/vkhid/novyi-parol?token=abc123", "/kabinet/vkhid/novyi-parol"]) {
      const response = await load(path);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
    }
  });

  /**
   * PW-2 Q1 (Oleksii, 2026-10-20, verbatim): "Token pages send Cache-Control: no-store, plus
   * Referrer-Policy: no-referrer, except that pages whose button submits an ordinary form use
   * strict-origin (PW1-Q1)." The invitation link's form posts by `fetch`, so it gets both,
   * whatever the parameter holds.
   */
  it("the invitation link's page answers no-store and no-referrer, whatever its parameter holds", async () => {
    for (const path of [
      `/kabinet/vkhid?zaproshennia=${"A".repeat(43)}`,
      "/kabinet/vkhid?zaproshennia=",
      "/kabinet/vkhid?zaproshennia=a&zaproshennia=b",
    ]) {
      const response = await load(path);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
    }
  });

  it("other pages, kabinet ones included, are left as they were", async () => {
    for (const path of [
      "/kabinet/vkhid",
      "/kabinet/vkhid?token=x",
      "/kabinet/vkhid/zabuly?zaproshennia=x",
      "/tvaryny",
    ]) {
      const response = await load(path);
      expect(response.headers.get("referrer-policy"), path).toBeNull();
      expect(response.headers.get("cache-control"), path).toBeNull();
    }
  });
});
