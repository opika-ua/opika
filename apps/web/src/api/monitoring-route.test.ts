import { afterEach, describe, expect, it, vi } from "vitest";

const DSN = "https://publickey@o1.ingest.de.sentry.io/4500000000000001";
const body = [
  JSON.stringify({ event_id: "e1", dsn: DSN }),
  JSON.stringify({ type: "event" }),
  JSON.stringify({ event_id: "e1", message: "x" }),
].join("\n");

const request = (method = "POST") =>
  new Request("https://opika.example/api/monitoring", {
    method,
    headers: { "content-type": "text/plain", "x-forwarded-for": "198.51.100.9" },
    ...(method === "POST" ? { body } : {}),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("app/api/monitoring/route.ts", () => {
  it("is 404 without a DSN and 405 for any other method", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const route = await import("../app/api/monitoring/route");
    expect((await route.POST(request())).status).toBe(404);
    for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
      expect((await route[method]()).status).toBe(405);
    }
  });

  it("has its own limiter: the 21st call in a minute from one address gets 429", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    const forward = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", forward);
    const route = await import("../app/api/monitoring/route");
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await route.POST(request())).status);
    expect(statuses.slice(0, 20).every((s) => s === 204)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(forward).toHaveBeenCalledTimes(20);
  });
});
