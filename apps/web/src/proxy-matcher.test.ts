import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Next's testing helper loads modules that read AsyncLocalStorage off globalThis. Its own file, so
// the global it needs doesn't leak into `proxy.test.ts`.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;

describe("proxy matcher", () => {
  // Next buffers a matched non-GET request's whole body before the route or the proxy's own
  // 403/429 can answer, which defeats `/api/kabinet`'s 16 KB cap; both excluded prefixes take
  // no other proxy effect.
  async function matches(pathname: string, headers?: Record<string, string>): Promise<boolean> {
    const { config } = await import("./proxy");
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    return unstable_doesMiddlewareMatch({
      config,
      url: `https://opika.example${pathname}`,
      ...(headers === undefined ? {} : { headers }),
    });
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
    "/kabinet/zaiavka/pidtverdyty",
    "/kabinet/zaiavka/ne-ya",
    "/prytulky",
    "/tvaryny",
    "/",
  ])("still runs on %s", async (path) => expect(await matches(path)).toBe(true));

  // What Next 16's segment cache sends for a `<Link>` prefetch (`segment-cache/cache.js`).
  const PREFETCH = {
    rsc: "1",
    "next-router-prefetch": "1",
    "next-router-segment-prefetch": "/_tree",
  };
  const DISCOVERY = [
    "/",
    "/tvaryny/some-animal",
    "/tvaryny/misto/kyiv",
    "/tvaryny/vyd/sobaky",
    "/tvaryny/vyd/koty",
    "/prytulky/x",
  ];

  it.each(DISCOVERY)("skips a router prefetch of %s, so it is never charged", async (path) =>
    expect(await matches(path, PREFETCH)).toBe(false),
  );

  it.each(DISCOVERY)("still runs on a document request for %s", async (path) =>
    expect(await matches(path, { accept: "text/html" })).toBe(true),
  );

  it.each([
    ["the prefetch header alone (Next renders the full document)", { "next-router-prefetch": "1" }],
    ["rsc alone (a navigation, which renders the page)", { rsc: "1" }],
    ["a runtime prefetch (value 2 renders data)", { rsc: "1", "next-router-prefetch": "2" }],
    ["a server action dressed as a prefetch", { ...PREFETCH, "next-action": "abc" }],
  ])("still charges a discovery page for %s", async (_label, headers) => {
    expect(await matches("/", headers)).toBe(true);
    expect(await matches("/tvaryny/misto/kyiv", headers)).toBe(true);
    expect(await matches("/tvaryny/vyd/sobaky", headers)).toBe(true);
    expect(await matches("/tvaryny/vyd/koty", headers)).toBe(true);
  });

  // Review of #564, finding a: a route handler ignores the prefetch headers and answers in full.
  it.each([
    "/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc/opengraph-image",
    "/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc/opengraph-image?b1a2c3",
    "/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc/opengraph-image-x1y2z3",
    "/tvaryny/misto/kyiv/twitter-image",
    "/prytulky/dddddddd-dddd-4ddd-8ddd-dddddddddddd/icon",
    "/prytulky/dddddddd-dddd-4ddd-8ddd-dddddddddddd/apple-icon",
    // No segment before the file, and `generateImageMetadata`'s trailing id (re-review of #564).
    "/tvaryny/opengraph-image",
    "/prytulky/icon",
    "/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc/opengraph-image/0",
    "/tvaryny/misto/kyiv/twitter-image/small",
  ])("still charges %s with both prefetch headers (a route handler, not a page)", async (path) =>
    expect(await matches(path, PREFETCH)).toBe(true),
  );

  // Owner, 2026-11-20 (finding b): a prefetch carrying the route state renders the head, so any
  // `next-router-state-tree` is charged, matched on presence: the server URL-decodes the value.
  // An empty value isn't matched (Next reads it as absent). The server can't parse it either
  // (`parseAndValidateFlightRouterState('')` throws): an uncharged 500 that reads no head and no
  // data, which any path outside the matcher (`/api/auth`) already allows.
  it.each([
    ["the metadata-only tree", '["",{},null,"metadata-only"]'],
    ["the same tree URL-encoded", "%5B%22%22%2C%7B%7D%2Cnull%2C%22metadata-only%22%5D"],
    ["a tree the proxy can't parse", "garbage"],
  ])("still charges a prefetch carrying %s", async (_label, tree) => {
    const headers = { rsc: "1", "next-router-prefetch": "1", "next-router-state-tree": tree };
    expect(await matches("/tvaryny/cccccccc-cccc-4ccc-8ccc-cccccccccccc", headers)).toBe(true);
    expect(await matches("/prytulky/dddddddd-dddd-4ddd-8ddd-dddddddddddd", headers)).toBe(true);
    expect(await matches("/", headers)).toBe(true);
    expect(await matches("/tvaryny/vyd/sobaky", headers)).toBe(true);
    expect(await matches("/tvaryny/vyd/koty", headers)).toBe(true);
  });

  // A route handler under the discovery paths ignores the prefetch headers. Metadata files are
  // charged by name above; any other one (a `route.ts`) needs its own matcher entry first.
  it("no route.ts under /tvaryny or /prytulky, whose answer a prefetch pair would get uncharged", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/^route\.(?:ts|tsx|js)$/.test(entry.name)) found.push(path);
      }
    };
    for (const section of ["tvaryny", "prytulky"]) walk(join(__dirname, "app", section));
    expect(found).toEqual([]);
  });

  it.each(["/kabinet", "/kabinet/vkhid", "/prytulkam", "/tvarynyx", "/pro"])(
    "still runs on a router prefetch of %s",
    async (path) => expect(await matches(path, PREFETCH)).toBe(true),
  );
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

  it("does not send X-Powered-By", async () => {
    const config = (await import("../next.config")).default;
    expect(config.poweredByHeader).toBe(false);
  });
});
