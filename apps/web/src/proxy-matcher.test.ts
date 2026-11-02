import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";

// Next's testing helper loads modules that read AsyncLocalStorage off globalThis. Its own file, so
// the global it needs doesn't leak into `proxy.test.ts`.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;

describe("proxy matcher", () => {
  // Next buffers a matched non-GET request's whole body before the route or the proxy's own
  // 403/429 can answer, which defeats `/api/kabinet`'s 16 KB cap; both excluded prefixes are
  // gate-exempt by path and take no other proxy effect.
  async function matches(pathname: string): Promise<boolean> {
    const { config } = await import("./proxy");
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    return unstable_doesMiddlewareMatch({ config, url: `https://opika.example${pathname}` });
  }

  it.each([
    "/api/kabinet/shelter/photos/add",
    "/api/kabinet/invitation/acceptWithPassword",
    "/api/kabinet",
    "/api/auth/sign-in/email",
  ])("skips %s", async (path) => expect(await matches(path)).toBe(false));

  it.each([
    "/api/rpc/animals/list",
    "/api/monitoring",
    "/api/cron/r2-cleanup",
    "/api/kabinetx",
    "/api/authx",
    "/kabinet",
    "/kabinet/vkhid",
    "/kabinet/vkhid/novyi-parol",
    "/kabinet/vkhid/pidtverdzhennia",
    "/prytulky",
    "/tvaryny",
    "/",
  ])("still runs on %s", async (path) => expect(await matches(path)).toBe(true));
});

describe("proxy body buffering bound", () => {
  // Next reads the setting through `bytes.parse` for strings and as-is for numbers. 64 KB is the
  // largest body any matched path accepts (`/api/rpc`, `/api/monitoring`), and the routes' own
  // caps only fire if the proxy hands them more than that, so the bound sits above both.
  it("is above every matched route's own cap and far below Next's 10 MB default", async () => {
    const { PROXY_CLIENT_MAX_BODY_BYTES } = await import("../next.config");
    const { PUBLIC_RPC_MAX_BODY_BYTES } = await import("./api/public-rpc-route");
    const { MONITORING_MAX_BODY_BYTES } = await import("./api/monitoring-tunnel");
    expect(PROXY_CLIENT_MAX_BODY_BYTES).toBeGreaterThan(PUBLIC_RPC_MAX_BODY_BYTES);
    expect(PROXY_CLIENT_MAX_BODY_BYTES).toBeGreaterThan(MONITORING_MAX_BODY_BYTES);
    expect(PROXY_CLIENT_MAX_BODY_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });

  it("is what the Next config sets", async () => {
    const config = (await import("../next.config")).default;
    const { PROXY_CLIENT_MAX_BODY_BYTES } = await import("../next.config");
    expect(config.experimental?.proxyClientMaxBodySize).toBe(PROXY_CLIENT_MAX_BODY_BYTES);
  });
});
