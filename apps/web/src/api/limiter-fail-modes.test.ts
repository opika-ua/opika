import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * With the shared store unreachable, each limiter answers by its own explicit `onUnavailable`
 * (owner, 2026-11-06). The tables below are the policy; a limiter missing from them, or in the
 * wrong mode, fails here.
 */
const ALLOW = ["api", "adopter-mint", "health", "monitoring", "monitoring-test"];
const DENY = [
  "kabinet-sign-in-address",
  "kabinet-sign-in-ip",
  "kabinet-user",
  "kabinet-ip",
  "kabinet-photo-hour",
  "kabinet-photo-day",
  "kabinet-crop-attempt-hour",
  "kabinet-crop-attempt-day",
  "kabinet-invite-ip",
  "kabinet-forgot-ip",
  "kabinet-forgot-address",
  "kabinet-reset-ip",
  "reveal-ip",
];

const limitMock = vi.fn();

async function loadAllLimiters() {
  vi.resetModules();
  vi.stubEnv("KV_REST_API_URL", "https://unreachable.invalid");
  vi.stubEnv("KV_REST_API_TOKEN", "t");
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(
      vi.fn(function RatelimitMock() {
        return { limit: limitMock };
      }),
      { slidingWindow: vi.fn() },
    ),
  }));
  vi.doMock("@upstash/redis", () => ({
    Redis: vi.fn(function RedisMock() {
      return {};
    }),
  }));
  const rateLimit = await import("./rate-limit");
  const { servedPerIpBudgets } = await import("./per-ip-budgets");
  servedPerIpBudgets();
  await import("../kabinet/limiters");
  await import("../app/api/health/route");
  await import("../app/api/monitoring/route");
  await import("../app/api/monitoring/test/route");
  return rateLimit.registeredLimiters;
}

describe("limiter fail modes with the store unreachable", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    limitMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
    vi.restoreAllMocks();
  });

  it("guard: every limiter has an explicit mode, and the set is exactly the two tables", async () => {
    const registered = await loadAllLimiters();
    expect([...registered.keys()].sort()).toEqual([...ALLOW, ...DENY].sort());
    for (const [name, { onUnavailable }] of registered) {
      expect(onUnavailable, name).toBe(ALLOW.includes(name) ? "allow" : "deny");
    }
  });

  it("guard: every file that builds a shared limiter is one the tables cover", () => {
    const here = join(__dirname, "..");
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          if (/\b(?:sharedRateLimiter|upstashRateLimiter)\b/.test(text)) {
            callers.push(path.slice(here.length + 1).replaceAll("\\", "/"));
          }
        }
      }
    };
    walk(here);
    expect(callers.sort()).toEqual([
      "api/per-ip-budgets.ts",
      "api/rate-limit.ts",
      "app/api/health/route.ts",
      "app/api/monitoring/route.ts",
      "app/api/monitoring/test/route.ts",
      "kabinet/limiters.ts",
    ]);
  });

  const failures = [
    ["times out", () => limitMock.mockResolvedValue({ success: true, reason: "timeout" })],
    ["throws", () => limitMock.mockRejectedValue(new Error("ENOTFOUND unreachable.invalid"))],
  ] as const;

  describe.each(failures)("when the store %s", (_label, fail) => {
    it.each(ALLOW)("%s fails open and logs rate_limiter_unreachable", async (name) => {
      const registered = await loadAllLimiters();
      fail();
      warn.mockClear();
      // The warning is throttled to one a minute across limiters; step past it.
      vi.setSystemTime(Date.now() + 61_000 * (ALLOW.indexOf(name) + 1));
      expect(await registered.get(name)?.limiter.check("k", new Date())).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "rate_limiter_unreachable" }),
      );
    });

    it.each(ALLOW)(
      "%s still refuses when a healthy store says the limit is spent",
      async (name) => {
        const registered = await loadAllLimiters();
        limitMock.mockResolvedValue({ success: false, reset: Date.now() + 1_000 });
        expect(await registered.get(name)?.limiter.check("k", new Date())).toBe(false);
      },
    );

    it.each(DENY)("%s fails closed", async (name) => {
      const registered = await loadAllLimiters();
      fail();
      expect(await registered.get(name)?.limiter.check("k", new Date())).toBe(false);
    });
  });
});
