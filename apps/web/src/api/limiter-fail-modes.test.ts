import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeekableRateLimiter } from "./rate-limit";
import { retryAfterSecondsOf } from "./retry-after";

/**
 * With the shared store unreachable, each limiter answers by its own explicit `onUnavailable`
 * (owner, 2026-11-06; revised 2026-11-20). The tables below are the policy; a limiter missing from
 * them, or in the wrong mode, fails here.
 *
 * 2026-11-20: a first-contact reveal and signed-in kabinet use fail open. The kabinet limiters
 * charged only after a session is validated (per user, photos, city search) are `allow`; `kabinet-ip`
 * is charged before any session is read, so it stays `deny` and its callers ask it through
 * `attemptOf`, letting a validated session through (`page-limit`, `rpc-route`, `auth` tests).
 * Sign-in, reset, invite and registration stay `deny`.
 *
 * 2026-11-24 (audit A-L1): the Sentry tunnel needs no login, so in an outage it keeps its limit,
 * counted per instance in memory (`in-memory`), instead of failing open.
 */
// `health` is in memory since 2026-11-20 (owner): it has no store to lose.
const ALLOW = [
  "api",
  "adopter-mint",
  "monitoring-test",
  "reveal-ip",
  "kabinet-user",
  "kabinet-photo-hour",
  "kabinet-photo-day",
  "kabinet-upload-attempt-hour",
  "kabinet-upload-attempt-day",
  "kabinet-crop-attempt-hour",
  "kabinet-crop-attempt-day",
  "kabinet-city-search-user",
];
const IN_MEMORY = ["monitoring"];
const DENY = [
  "kabinet-sign-in-address",
  "kabinet-sign-in-ip",
  "kabinet-ip",
  "kabinet-invite-ip",
  "kabinet-forgot-ip",
  "kabinet-forgot-address",
  "kabinet-reset-ip",
  "registration-ip-hour",
  "registration-ip-day",
  "registration-address",
  "registration-city-search-ip",
  "registration-resend-user-hour",
  "registration-resend-user-day",
  "registration-mail-day",
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
  await import("../features/registration/limits");
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
    expect([...registered.keys()].sort()).toEqual([...ALLOW, ...IN_MEMORY, ...DENY].sort());
    for (const [name, { onUnavailable }] of registered) {
      const mode = ALLOW.includes(name) ? "allow" : IN_MEMORY.includes(name) ? "in-memory" : "deny";
      expect(onUnavailable, name).toBe(mode);
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
      // Tests only: an unreachable store for the outage suites, never served.
      "api/test-outage.ts",
      "app/api/monitoring/route.ts",
      "app/api/monitoring/test/route.ts",
      "features/registration/limits.ts",
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

    it.each([...ALLOW, ...IN_MEMORY])(
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

    it.each(IN_MEMORY)(
      "%s keeps its own limit per instance: N calls pass, the next is refused, logged",
      async (name) => {
        const registered = await loadAllLimiters();
        const limiter = registered.get(name)?.limiter;
        if (limiter === undefined) throw new Error(name);
        fail();
        warn.mockClear();
        vi.setSystemTime(Date.now() + 61_000 * (ALLOW.length + 1));
        const now = new Date();
        const answers: boolean[] = [];
        for (let i = 0; i < 20; i++) answers.push(await limiter.check("k", now));
        expect(answers).toEqual(Array(20).fill(true));
        const later = new Date(now.getTime() + 20_000);
        expect(await limiter.check("k", later)).toBe(false);
        // Per key: another address still has its own budget.
        expect(await limiter.check("other", later)).toBe(true);
        // From the fallback's own window: the first call leaves it 40 s later.
        expect(retryAfterSecondsOf(limiter, "k", later)).toBe(40);
        // Asked without spending, the same per-instance count answers.
        const peek = limiter as PeekableRateLimiter;
        expect(await peek.wouldAllow("k", later)).toBe(false);
        expect(await peek.wouldAllow("fresh", later)).toBe(true);
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ event: "rate_limiter_unreachable" }),
        );
      },
    );

    it.each([...ALLOW, ...IN_MEMORY, ...DENY])(
      "%s tells an unreachable store apart from a refusal when asked through attemptOf",
      async (name) => {
        const registered = await loadAllLimiters();
        const { attemptOf } = await import("./limit-outcome");
        const limiter = registered.get(name)?.limiter;
        if (limiter === undefined) throw new Error(name);
        fail();
        expect(await attemptOf(limiter, "k", new Date())).toBe("unavailable");
      },
    );
  });

  it.each(DENY)("%s still refuses over the limit, and lets through under it", async (name) => {
    const registered = await loadAllLimiters();
    const limiter = registered.get(name)?.limiter;
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 1_000 });
    expect(await limiter?.check("k", new Date())).toBe(false);
    limitMock.mockResolvedValue({ success: true, reset: Date.now() + 1_000 });
    expect(await limiter?.check("k", new Date())).toBe(true);
  });

  it("an over-limit refusal through attemptOf is «refused», never «unavailable»", async () => {
    const registered = await loadAllLimiters();
    const { attemptOf } = await import("./limit-outcome");
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 1_000 });
    for (const name of [...ALLOW, ...IN_MEMORY, ...DENY]) {
      const limiter = registered.get(name)?.limiter;
      if (limiter === undefined) throw new Error(name);
      expect(await attemptOf(limiter, "k", new Date()), name).toBe("refused");
    }
  });
});
