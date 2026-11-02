import { afterEach, describe, expect, it, vi } from "vitest";

const SHA = "425299a0b1c2d3e4f5061728394a5b6c7d8e9f01";
const req = (method = "GET", ip = "198.51.100.7") =>
  new Request("https://opika.example/api/health", {
    method,
    headers: { "x-forwarded-for": ip },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("app/api/health/route.ts", () => {
  it("answers 200 with the build SHA only, uncached", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    const route = await import("../app/api/health/route");
    const res = await route.GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ sha: SHA });
  });

  it("says unknown without a SHA, and never echoes a malformed value", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    let route = await import("../app/api/health/route");
    expect(await (await route.GET(req())).json()).toEqual({ sha: "unknown" });
    vi.resetModules();
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "postgres://secret@host/db");
    route = await import("../app/api/health/route");
    expect(await (await route.GET(req())).json()).toEqual({ sha: "unknown" });
  });

  it("exposes nothing but the SHA, with the environment full of other values", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    vi.stubEnv("DATABASE_URL", "postgres://user:pw@host/db");
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const route = await import("../app/api/health/route");
    const res = await route.GET(req());
    const text = await res.text();
    expect(Object.keys(JSON.parse(text))).toEqual(["sha"]);
    expect(text).not.toMatch(/postgres|s3cret|pw@/);
    expect([...res.headers.keys()].some((k) => k.startsWith("set-cookie"))).toBe(false);
  });

  it("makes no database or network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("DATABASE_URL", "postgres://127.0.0.1:1/none");
    const route = await import("../app/api/health/route");
    expect((await route.GET(req())).status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves HEAD and refuses every other method with 405 and Allow", async () => {
    const route = await import("../app/api/health/route");
    expect((await route.HEAD(req("HEAD"))).status).toBe(200);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
      const res = await route[method](req(method));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("GET, HEAD");
    }
  });

  it("has its own budget: the 31st call in a minute from one address gets 429 with Retry-After", async () => {
    const route = await import("../app/api/health/route");
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await route.GET(req())).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    const last = await route.GET(req());
    expect(statuses[30]).toBe(429);
    expect(last.status).toBe(429);
    expect(Number(last.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await route.GET(req("GET", "203.0.113.5"))).status).toBe(200);
  });
});
