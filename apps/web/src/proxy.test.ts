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
      const response = proxy(request("https://opika.example/tvaryny"));
      expect(response.status).toBe(403);
    });

    it("denies a request whose gate cookie is wrong", async () => {
      const { proxy } = await import("./proxy");
      const response = proxy(
        request("https://opika.example/tvaryny", { cookie: `${cookieName()}=wrong` }),
      );
      expect(response.status).toBe(403);
    });

    it("allows a request whose gate cookie is correct, and does not mint a new one", async () => {
      const { proxy } = await import("./proxy");
      const response = proxy(
        request("https://opika.example/tvaryny", { cookie: `${cookieName()}=${SECRET}` }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("allows a request whose gate query parameter is correct, and mints the cookie", async () => {
      const { proxy } = await import("./proxy");
      const response = proxy(request(`https://opika.example/tvaryny?gate=${SECRET}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain(`${cookieName()}=${SECRET}`);
    });

    it("denies a request to a route outside /tvaryny just the same — the gate covers the whole site", async () => {
      const { proxy } = await import("./proxy");
      const response = proxy(request("https://opika.example/prytulkam"));
      expect(response.status).toBe(403);
    });

    it("denies the RPC endpoint just the same as a page route", async () => {
      const { proxy } = await import("./proxy");
      const response = proxy(request("https://opika.example/api/rpc/gallery/list"));
      expect(response.status).toBe(403);
    });

    it("carries no user-agent carve-out: a Telegram-bot-shaped user agent is denied identically", async () => {
      const { proxy } = await import("./proxy");
      const response = proxy(
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
      const response = proxy(request("https://opika.example/tvaryny"));
      expect(response.status).toBe(200);
    });

    it("never reads PRELAUNCH_GATE_SECRET at all — an unset secret does not break a launched site", async () => {
      vi.unstubAllEnvs();
      const { proxy } = await import("./proxy");
      expect(() => proxy(request("https://opika.example/tvaryny"))).not.toThrow();
    });
  });

  describe("the discovery-page rate limiter, independent of the gate", () => {
    beforeEach(() => {
      vi.doMock("./seo-flags", () => ({ SITE_IS_PUBLICLY_DISCOVERABLE: true }));
    });

    it("429s a request past the per-IP limit on /tvaryny", async () => {
      const { proxy } = await import("./proxy");
      let last = proxy(request("https://opika.example/tvaryny", { "x-forwarded-for": "9.9.9.9" }));
      for (let i = 0; i < 100; i++) {
        last = proxy(request("https://opika.example/tvaryny", { "x-forwarded-for": "9.9.9.9" }));
      }
      expect(last.status).toBe(429);
    });

    it("does not rate-limit a route outside /tvaryny", async () => {
      const { proxy } = await import("./proxy");
      let last = proxy(
        request("https://opika.example/prytulkam", { "x-forwarded-for": "8.8.8.8" }),
      );
      for (let i = 0; i < 150; i++) {
        last = proxy(request("https://opika.example/prytulkam", { "x-forwarded-for": "8.8.8.8" }));
      }
      expect(last.status).toBe(200);
    });
  });
});
