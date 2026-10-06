import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * No test file existed for this module before Phase 3, block 4
 * (`docs/handoff-2026-10-04.md` §3) — the in-memory sliding window had only
 * `proxy.test.ts`'s indirect 429-after-100-requests coverage. Direct tests
 * here are faster and pin the sliding-window boundary precisely; `upstashRate
 * Limiter` and `apiRateLimiter`'s branching are new in this row and had no
 * coverage of any kind until now.
 */

describe("inMemoryRateLimiter", () => {
  it("allows up to maxRequests, then rejects the next one in the same window", async () => {
    const { inMemoryRateLimiter } = await import("./rate-limit");
    const limiter = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    const now = new Date("2026-01-01T00:00:00Z");

    expect(await limiter.check("k", now)).toBe(true);
    expect(await limiter.check("k", now)).toBe(true);
    expect(await limiter.check("k", now)).toBe(true);
    expect(await limiter.check("k", now)).toBe(false);
  });

  it("allows again once the window has fully elapsed", async () => {
    const { inMemoryRateLimiter } = await import("./rate-limit");
    const limiter = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const t0 = new Date("2026-01-01T00:00:00Z");

    expect(await limiter.check("k", t0)).toBe(true);
    expect(await limiter.check("k", t0)).toBe(false);

    const afterWindow = new Date(t0.getTime() + 60_001);
    expect(await limiter.check("k", afterWindow)).toBe(true);
  });

  it("tracks separate keys independently", async () => {
    const { inMemoryRateLimiter } = await import("./rate-limit");
    const limiter = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const now = new Date("2026-01-01T00:00:00Z");

    expect(await limiter.check("a", now)).toBe(true);
    expect(await limiter.check("b", now)).toBe(true);
    expect(await limiter.check("a", now)).toBe(false);
    expect(await limiter.check("b", now)).toBe(false);
  });
});

/**
 * `@upstash/ratelimit` and `@upstash/redis` are mocked: this is a real
 * network call to a shared store in production, which a unit test can
 * neither reach nor should want to reach. What's under test is this
 * module's own wiring — does `upstashRateLimiter` build the right
 * algorithm with the right arguments, and does `check` map the SDK's
 * response correctly — not whether Upstash's own sliding-window Lua script
 * works, which is Upstash's test suite's job, not this one's.
 */
describe("upstashRateLimiter", () => {
  const limitMock = vi.fn();
  const slidingWindowMock = vi.fn((max: number, window: string) => ({ max, window }));

  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    slidingWindowMock.mockClear();
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(
        vi.fn(function RatelimitMock() {
          return { limit: limitMock };
        }),
        { slidingWindow: slidingWindowMock },
      ),
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: vi.fn(function RedisMock() {
        return {};
      }),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
  });

  it("returns true when the SDK reports success", async () => {
    limitMock.mockResolvedValue({ success: true });
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    const limiter = upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 60_000,
      maxRequests: 100,
      prefix: "test",
    });

    expect(await limiter.check("1.2.3.4", new Date())).toBe(true);
  });

  it("returns false when the SDK reports the limit was exceeded", async () => {
    limitMock.mockResolvedValue({ success: false });
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    const limiter = upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 60_000,
      maxRequests: 100,
      prefix: "test",
    });

    expect(await limiter.check("1.2.3.4", new Date())).toBe(false);
  });

  it("passes the key straight through to the SDK's limit() call", async () => {
    limitMock.mockResolvedValue({ success: true });
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    const limiter = upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 60_000,
      maxRequests: 100,
      prefix: "test",
    });

    await limiter.check("9.9.9.9", new Date());
    expect(limitMock).toHaveBeenCalledWith("9.9.9.9");
  });

  it("builds a sliding window of maxRequests over windowMs converted to whole seconds", async () => {
    limitMock.mockResolvedValue({ success: true });
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 90_000,
      maxRequests: 42,
      prefix: "test",
    });

    expect(slidingWindowMock).toHaveBeenCalledWith(42, "90 s");
  });
});

/**
 * `apiRateLimiter`'s own module-scope branch: Upstash-backed when both env
 * vars are present, in-memory otherwise. `vi.resetModules()` per test is
 * required because the branch runs once, at module evaluation time — a
 * cached module from an earlier test's env would silently carry the wrong
 * decision forward.
 */
describe("apiRateLimiter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
  });

  it("falls back to the in-memory limiter when no Upstash env vars are set", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { apiRateLimiter } = await import("./rate-limit");

    /**
     * Proves it's genuinely the in-memory sliding window, not merely that
     * the call resolved: drive the exact same key past the real 100/min
     * default budget and check the 101st request is rejected. A broken
     * fallback that instead tried to construct `upstashRateLimiter` against
     * an empty URL would reject every call with a real connection error
     * (an unhandled rejection failing this test), not resolve `false` on
     * the 101st — this distinguishes "falls back correctly" from "fails in
     * a way `await` happens not to surface."
     */
    const key = `apiRateLimiter-fallback-${Math.random()}`;
    const now = new Date();
    for (let i = 0; i < 100; i++) {
      expect(await apiRateLimiter.check(key, now)).toBe(true);
    }
    expect(await apiRateLimiter.check(key, now)).toBe(false);
  });

  /**
   * Tier 1 review's medium finding: only "both present" and "both absent"
   * were tested — `UPSTASH_URL && UPSTASH_TOKEN` (requiring both) could
   * regress to `!UPSTASH_URL && !UPSTASH_TOKEN` (requiring neither, the
   * inverse condition) without either existing test catching it, since
   * both conditions agree on the all-present and all-absent cases and
   * disagree only when exactly one is set. These two tests are what
   * actually pin `&&` over any other two-input boolean combination.
   */
  it.each([
    ["UPSTASH_REDIS_REST_URL only", "https://example-upstash.example.com", ""],
    ["UPSTASH_REDIS_REST_TOKEN only", "", "test-token"],
  ])("falls back to the in-memory limiter when only %s is set", async (_label, url, token) => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token);
    const { apiRateLimiter } = await import("./rate-limit");

    const key = `apiRateLimiter-partial-env-${Math.random()}`;
    const now = new Date();
    for (let i = 0; i < 100; i++) {
      expect(await apiRateLimiter.check(key, now)).toBe(true);
    }
    expect(await apiRateLimiter.check(key, now)).toBe(false);
  });

  it("constructs the Upstash-backed limiter when both env vars are set", async () => {
    const limitMock = vi.fn().mockResolvedValue({ success: true });
    const slidingWindowMock = vi.fn((max: number, window: string) => ({ max, window }));
    const redisConstructorMock = vi.fn(function RedisMock() {
      return {};
    });

    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(
        vi.fn(function RatelimitMock() {
          return { limit: limitMock };
        }),
        { slidingWindow: slidingWindowMock },
      ),
    }));
    vi.doMock("@upstash/redis", () => ({ Redis: redisConstructorMock }));
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example-upstash.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    const { apiRateLimiter } = await import("./rate-limit");

    expect(redisConstructorMock).toHaveBeenCalledWith({
      url: "https://example-upstash.example.com",
      token: "test-token",
    });
    expect(slidingWindowMock).toHaveBeenCalledWith(100, "60 s");

    const result = await apiRateLimiter.check("1.2.3.4", new Date());
    expect(result).toBe(true);
    expect(limitMock).toHaveBeenCalledWith("1.2.3.4");
  });
});
