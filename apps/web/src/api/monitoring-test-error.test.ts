import { describe, expect, it } from "vitest";
import { handleMonitoringTestError, TEST_ERROR_MESSAGE } from "./monitoring-test-error";
import { inMemoryRateLimiter } from "./rate-limit";

const SECRET = "s".repeat(40);
const DSN = "https://publickey@o1.ingest.de.sentry.io/1";
const call = (authorization?: string) =>
  new Request("https://opika.example/api/monitoring/test", {
    method: "POST",
    ...(authorization === undefined ? {} : { headers: { authorization } }),
  });
const deps = (over: Partial<Parameters<typeof handleMonitoringTestError>[1]> = {}) => ({
  cronSecret: SECRET,
  dsn: DSN,
  ipKey: "ip:t",
  limiter: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 }),
  now: new Date("2026-11-02T10:00:00Z"),
  ...over,
});

describe("the owner's test-error route", () => {
  it("throws on purpose for the exact bearer secret", async () => {
    await expect(handleMonitoringTestError(call(`Bearer ${SECRET}`), deps())).rejects.toThrow(
      TEST_ERROR_MESSAGE,
    );
  });

  it("puts nothing from the request into the thrown error", async () => {
    const request = new Request(
      "https://opika.example/api/monitoring/test?gate=GATEVALUE&e=a@b.ua",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${SECRET}`,
          cookie: "opika_session=abc123",
          "x-forwarded-for": "203.0.113.7",
        },
        body: JSON.stringify({ email: "olena@example.ua" }),
      },
    );
    const error = await handleMonitoringTestError(request, deps()).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(TEST_ERROR_MESSAGE);
    for (const echoed of [SECRET, "GATEVALUE", "a@b.ua", "abc123", "203.0.113.7", "olena"]) {
      expect(String((error as Error).message)).not.toContain(echoed);
    }
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${"x".repeat(40)}`],
    ["no Bearer word", SECRET],
  ])("is a plain 404 with %s", async (_label, header) => {
    expect((await handleMonitoringTestError(call(header), deps())).status).toBe(404);
  });

  it("fails closed: no DSN, or an unset or empty secret, is 404 even with a matching header", async () => {
    const matching = call(`Bearer ${SECRET}`);
    expect((await handleMonitoringTestError(matching, deps({ dsn: undefined }))).status).toBe(404);
    expect(
      (await handleMonitoringTestError(call("Bearer "), deps({ cronSecret: undefined }))).status,
    ).toBe(404);
    expect(
      (await handleMonitoringTestError(call("Bearer "), deps({ cronSecret: "" }))).status,
    ).toBe(404);
  });

  it("is rate limited before the secret is checked, per address", async () => {
    const limiter = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    const wrong = (ipKey: string) =>
      handleMonitoringTestError(call(`Bearer ${"x".repeat(40)}`), deps({ limiter, ipKey }));
    for (let i = 0; i < 3; i++) expect((await wrong("ip:a")).status).toBe(404);
    const refused = await wrong("ip:a");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    // Even the right secret is refused once the budget is spent.
    const right = await handleMonitoringTestError(
      call(`Bearer ${SECRET}`),
      deps({ limiter, ipKey: "ip:a" }),
    );
    expect(right.status).toBe(429);
    expect((await wrong("ip:b")).status).toBe(404);
  });
});
