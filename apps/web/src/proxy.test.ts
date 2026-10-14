import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieName } from "./api/prelaunch-gate";

const SECRET = "test-proxy-secret";

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, "http://127.0.0.1:3000"), { headers });
}

/**
 * `vi.doMock` + `vi.resetModules()` per test, same pattern `seo-flags.test.ts`
 * already established (and the same reason: the module cache must be torn
 * down between tests, or the second test to run would silently import the
 * first test's mock). `./proxy` reads `SITE_IS_PUBLICLY_DISCOVERABLE` as a
 * plain imported binding — not a function closing over another module's own
 * copy of it — so mocking `./seo-flags` and re-importing `./proxy` fresh is
 * enough; no closure gotcha to work around here.
 *
 * `proxy` is async as of Phase 3, block 4 (`apiRateLimiter.check` is a
 * `Promise<boolean>` once a shared Upstash store can back it) — every call
 * below is awaited now. No Upstash env vars are set anywhere in this file,
 * so `apiRateLimiter` resolves to the in-memory implementation
 * (`rate-limit.ts`'s own module-scope branch), the same one these tests
 * always exercised.
 */
describe("proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PRELAUNCH_GATE_SECRET", SECRET);
  });

  afterEach(() => {
    vi.doUnmock("./seo-flags");
    vi.unstubAllEnvs();
  });

  describe("while SITE_IS_PUBLICLY_DISCOVERABLE is false", () => {
    beforeEach(() => {
      vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: false }));
    });

    it("denies a request with no gate cookie and no gate query parameter", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/tvaryny"));
      expect(response.status).toBe(403);
    });

    it("denies a request whose gate cookie is wrong", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("https://opika.example/tvaryny", { cookie: `${cookieName()}=wrong` }),
      );
      expect(response.status).toBe(403);
    });

    it("allows a request whose gate cookie is correct, and does not mint a new one", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("https://opika.example/tvaryny", { cookie: `${cookieName()}=${SECRET}` }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("allows a request whose gate query parameter is correct, and mints the cookie", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request(`https://opika.example/tvaryny?gate=${SECRET}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain(`${cookieName()}=${SECRET}`);
    });

    it("denies a request to a route outside /tvaryny just the same — the gate covers the whole site", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/prytulkam"));
      expect(response.status).toBe(403);
    });

    it("lets Vercel's cron reach /api/cron/auth-cleanup without the gate cookie (KH-T5)", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/api/cron/auth-cleanup"));
      expect(response.status).toBe(200);
    });

    it.each([
      "/api/cron",
      "/api/cron/other",
      "/api/cron/auth-cleanupx",
      "/api/cron/auth-cleanup/x",
    ])("still gates %s: the exemption is that one exact path", async (path) => {
      const { proxy } = await import("./proxy");
      expect((await proxy(request(`https://opika.example${path}`))).status).toBe(403);
    });

    it("denies the RPC endpoint just the same as a page route", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/api/rpc/gallery/list"));
      expect(response.status).toBe(403);
    });

    it("carries no user-agent carve-out: a Telegram-bot-shaped user agent is denied identically", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("https://opika.example/tvaryny/some-id", {
          "user-agent": "TelegramBot (like TwitterBot)",
        }),
      );
      expect(response.status).toBe(403);
    });
  });

  describe("while SITE_IS_PUBLICLY_DISCOVERABLE is true", () => {
    beforeEach(() => {
      vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
    });

    it("allows a request with no gate cookie and no gate query parameter at all", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("https://opika.example/tvaryny"));
      expect(response.status).toBe(200);
    });

    /**
     * `proxy` is async now — an async function never throws synchronously
     * even if its body does (the throw surfaces as a rejected Promise
     * instead), so `expect(() => proxy(...)).not.toThrow()` would pass
     * trivially regardless of whether the call actually succeeds. Asserting
     * against the resolved Promise is what keeps this test capable of
     * failing — would have let a reintroduced read of
     * `PRELAUNCH_GATE_SECRET` on this path go undetected.
     */
    it("never reads PRELAUNCH_GATE_SECRET at all — an unset secret does not break a launched site", async () => {
      vi.unstubAllEnvs();
      const { proxy } = await import("./proxy");
      await expect(proxy(request("https://opika.example/tvaryny"))).resolves.toBeDefined();
    });
  });

  describe("the discovery-page rate limiter, independent of the gate", () => {
    beforeEach(() => {
      vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
    });

    it("429s a request past the per-IP limit on /tvaryny", async () => {
      const { proxy } = await import("./proxy");
      let last = await proxy(
        request("https://opika.example/tvaryny", { "x-forwarded-for": "9.9.9.9" }),
      );
      for (let i = 0; i < 100; i++) {
        last = await proxy(
          request("https://opika.example/tvaryny", { "x-forwarded-for": "9.9.9.9" }),
        );
      }
      expect(last.status).toBe(429);
    });

    it("429s a /kabinet page load past the kabinet's per-IP limit (KH-Q8)", async () => {
      const { proxy } = await import("./proxy");
      const { KABINET_RATE_LIMITS } = await import("./kabinet/rate-limits");
      const load = (path: string) =>
        proxy(request(`https://opika.example${path}`, { "x-forwarded-for": "7.7.7.7" }));
      // Both pages draw on one budget: 300 loads across them, then refused.
      for (let i = 0; i < KABINET_RATE_LIMITS.perIp.maxRequests; i++) {
        expect((await load(i % 2 === 0 ? "/kabinet" : "/kabinet/vkhid")).status).toBe(200);
      }
      const refused = await load("/kabinet/vkhid");
      expect(refused.status).toBe(429);
      expect(await refused.text()).toBe("Too Many Requests");
    });

    it("leaves /api/kabinet to its route's own limiter, never charging it twice", async () => {
      const { proxy } = await import("./proxy");
      let last = await proxy(
        request("https://opika.example/api/kabinet/shelter/profile/get", {
          "x-forwarded-for": "6.6.6.6",
        }),
      );
      for (let i = 0; i < 350; i++) {
        last = await proxy(
          request("https://opika.example/api/kabinet/shelter/profile/get", {
            "x-forwarded-for": "6.6.6.6",
          }),
        );
      }
      expect(last.status).toBe(200);
    });

    it("does not rate-limit a route outside /tvaryny", async () => {
      const { proxy } = await import("./proxy");
      let last = await proxy(
        request("https://opika.example/prytulkam", { "x-forwarded-for": "8.8.8.8" }),
      );
      for (let i = 0; i < 150; i++) {
        last = await proxy(
          request("https://opika.example/prytulkam", { "x-forwarded-for": "8.8.8.8" }),
        );
      }
      expect(last.status).toBe(200);
    });
  });
});

/**
 * Review of the hardening, finding 3: the proxy runs on every route, so a
 * static import that reaches Better Auth loads it into every cold start,
 * `/tvaryny` included (measured in the inbox, KH-T4). Walks the proxy's
 * static relative imports (a dynamic `import()` is the sanctioned way in)
 * and fails if any file in that closure imports `better-auth` or the
 * database client.
 */
describe("proxy.ts loads neither Better Auth nor the database statically", () => {
  const SRC = dirname(fileURLToPath(import.meta.url));
  const STATIC_IMPORT = /^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm;

  function closure(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(STATIC_IMPORT)) {
      const specifier = match[1] ?? "";
      if (!specifier.startsWith(".")) continue;
      const base = resolve(dirname(file), specifier);
      const target = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
      if (target !== undefined) closure(target, seen);
    }
    return seen;
  }

  const heavyImports = (files: Set<string>) =>
    [...files].flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(STATIC_IMPORT)]
        .map((match) => match[1] ?? "")
        .filter((specifier) => /^better-auth|\/api\/db$|^\.\.?\/db$/.test(specifier))
        .map((specifier) => `${relative(SRC, file).replaceAll("\\", "/")}: ${specifier}`),
    );

  it("sanity: the walk reaches the kabinet limiters and the page limit", () => {
    const files = [...closure(join(SRC, "proxy.ts"))].map((f) =>
      relative(SRC, f).replaceAll("\\", "/"),
    );
    expect(files).toEqual(
      expect.arrayContaining(["kabinet/limiters.ts", "kabinet/page-limit.ts", "api/rate-limit.ts"]),
    );
  });

  it("finds no static import of better-auth or the database client", () => {
    expect(heavyImports(closure(join(SRC, "proxy.ts")))).toEqual([]);
  });

  it("the check itself sees one: kabinet/runtime.ts does import both", () => {
    expect(heavyImports(closure(join(SRC, "kabinet/runtime.ts")))).toEqual(
      expect.arrayContaining(["kabinet/runtime.ts: ../api/db", "kabinet/auth.ts: better-auth"]),
    );
  });
});
