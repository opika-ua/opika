import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * No test file existed for this module before Phase 3, block 4
 * (`docs/handoff-2026-10-04.md` §3) - the in-memory sliding window had only
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

  it("says how long until the oldest counted request leaves the window (Retry-After)", async () => {
    const { inMemoryRateLimiter } = await import("./rate-limit");
    const { retryAfterSecondsOf } = await import("./retry-after");
    const limiter = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const t0 = new Date("2026-01-01T00:00:00Z");
    await limiter.check("k", t0);
    const t20 = new Date(t0.getTime() + 20_000);
    expect(await limiter.check("k", t20)).toBe(false);
    expect(retryAfterSecondsOf(limiter, "k", t20)).toBe(40);
    // 40.2 s left rounds up: never tell a client to come back too early.
    expect(retryAfterSecondsOf(limiter, "k", new Date(t0.getTime() + 19_800))).toBe(41);
  });

  it("uses the 60 s window when a limiter cannot say", async () => {
    const { retryAfterSecondsOf } = await import("./retry-after");
    const stub = { check: async () => false };
    expect(retryAfterSecondsOf(stub, "k", new Date())).toBe(60);
  });

  it("wouldAllow answers what check would, and takes nothing", async () => {
    const { inMemoryRateLimiter } = await import("./rate-limit");
    const limiter = inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const t0 = new Date("2026-01-01T00:00:00Z");

    expect(await limiter.wouldAllow("k", t0)).toBe(true);
    expect(await limiter.wouldAllow("k", t0)).toBe(true);
    expect(await limiter.check("k", t0)).toBe(true);
    expect(await limiter.wouldAllow("k", t0)).toBe(false);
    expect(await limiter.wouldAllow("other", t0)).toBe(true);
    expect(await limiter.wouldAllow("k", new Date(t0.getTime() + 60_001))).toBe(true);
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
 * module's own wiring - does `upstashRateLimiter` build the right
 * algorithm with the right arguments, and does `check` map the SDK's
 * response correctly - not whether Upstash's own sliding-window Lua script
 * works, which is Upstash's test suite's job, not this one's.
 */
describe("upstashRateLimiter", () => {
  const limitMock = vi.fn();
  const getRemainingMock = vi.fn();
  const slidingWindowMock = vi.fn((max: number, window: string) => ({ max, window }));
  const ratelimitConstructorMock = vi.fn(function RatelimitMock() {
    return { limit: limitMock, getRemaining: getRemainingMock };
  });

  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    getRemainingMock.mockReset();
    slidingWindowMock.mockClear();
    ratelimitConstructorMock.mockClear();
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(ratelimitConstructorMock, { slidingWindow: slidingWindowMock }),
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
      onUnavailable: "deny",
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
      onUnavailable: "deny",
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
      onUnavailable: "deny",
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
      onUnavailable: "deny",
    });

    expect(slidingWindowMock).toHaveBeenCalledWith(42, "90 s");
  });

  /**
   * The real bug Tier 1 review found: `Math.round` alone sends any window
   * under 500ms to `"0 s"`, which `@upstash/ratelimit`'s own Lua script
   * divides by. No caller passes a sub-second window today, but the floor
   * is what actually prevents that from becoming a live crash if one ever
   * did - this test is what would fail if the floor were removed.
   */
  it("floors the window at 1 second even for a sub-second windowMs", async () => {
    limitMock.mockResolvedValue({ success: true });
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 200,
      maxRequests: 10,
      prefix: "test",
      onUnavailable: "deny",
    });

    expect(slidingWindowMock).toHaveBeenCalledWith(10, "1 s");
  });

  /**
   * RL-1 (`docs/decisions-inbox/feat-rate-limiter-shared-store.md`),
   * resolved: fail closed on a store error or timeout, with a bounded
   * timeout rather than `@upstash/ratelimit`'s own 5000ms default.
   */
  it("passes a bounded timeout to the Ratelimit constructor, not the library's 5000ms default", async () => {
    limitMock.mockResolvedValue({ success: true });
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 60_000,
      maxRequests: 100,
      prefix: "test",
      onUnavailable: "deny",
    });

    expect(ratelimitConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    const [[config]] = ratelimitConstructorMock.mock.calls as unknown as [[{ timeout: number }]];
    expect(config.timeout).toBeGreaterThan(0);
    expect(config.timeout).toBeLessThan(5_000);
  });

  /**
   * `@upstash/ratelimit`'s own default behaviour on its internal timeout is
   * to *resolve* `{ success: true, reason: "timeout" }` - the library's own
   * doc comment calls this "allow requests to pass... in case of network
   * problems," i.e. fail open. RL-1 chose the opposite; this is the
   * override that makes `check` actually fail closed on that specific
   * response shape instead of trusting `success` at face value.
   */
  /**
   * Second Tier 1 review round's finding: the first version of this branch
   * returned `false` with no log line at all, so a genuinely slow (not
   * failing) store denied every request silently - found by review, not
   * by this test, which is what now pins the fix.
   */
  it("fails closed and logs when the SDK reports its own timeout, even though success is true", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockResolvedValue({ success: true, reason: "timeout" });
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    const limiter = upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 60_000,
      maxRequests: 100,
      prefix: "test",
      onUnavailable: "deny",
    });

    expect(await limiter.check("1.2.3.4", new Date())).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("wouldAllow reads getRemaining, never limit(); unreachable or slow, it answers the mode", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    const limiterIn = (onUnavailable: "allow" | "deny") =>
      upstashRateLimiter({
        redis: new Redis({ url: "https://example.invalid", token: "x" }),
        windowMs: 60_000,
        maxRequests: 100,
        prefix: `test-peek-${onUnavailable}`,
        onUnavailable,
      });
    const deny = limiterIn("deny");

    getRemainingMock.mockResolvedValueOnce({ remaining: 1, reset: 0, limit: 100 });
    expect(await deny.wouldAllow("shelter:s1", new Date())).toBe(true);
    getRemainingMock.mockResolvedValueOnce({ remaining: 0, reset: 0, limit: 100 });
    expect(await deny.wouldAllow("shelter:s1", new Date())).toBe(false);
    expect(getRemainingMock).toHaveBeenCalledWith("shelter:s1");
    expect(limitMock).not.toHaveBeenCalled();

    getRemainingMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND example.invalid"));
    expect(await deny.wouldAllow("shelter:s1", new Date())).toBe(false);
    getRemainingMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND example.invalid"));
    expect(await limiterIn("allow").wouldAllow("shelter:s1", new Date())).toBe(true);

    getRemainingMock.mockReturnValueOnce(new Promise(() => {}));
    const slow = deny.wouldAllow("shelter:s1", new Date());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await slow).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "rate_limiter_unreachable", limiter: "test-peek-deny" }),
    );
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  /**
   * The other RL-1 failure mode: an outright rejection (DNS failure,
   * connection refused), which the `timeout` option above does not catch
   * at all - it only races against an indefinitely *pending* promise, not
   * one that settles via rejection. Tier 1 review's own probe reproduced
   * this live against a real unreachable URL; this test pins the fix
   * without needing a real network call.
   */
  it("fails closed and logs when the SDK's limit() call rejects outright", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    limitMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND example.invalid"));
    const { upstashRateLimiter } = await import("./rate-limit");
    const { Redis } = await import("@upstash/redis");
    const limiter = upstashRateLimiter({
      redis: new Redis({ url: "https://example.invalid", token: "x" }),
      windowMs: 60_000,
      maxRequests: 100,
      prefix: "test",
      onUnavailable: "deny",
    });

    expect(await limiter.check("1.2.3.4", new Date())).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

/**
 * `apiRateLimiter`'s own module-scope branch: Upstash-backed when a
 * complete URL/token pair is present (either naming), in-memory otherwise.
 * `vi.resetModules()` per test is required because the branch runs once, at
 * module evaluation time - a cached module from an earlier test's env
 * would silently carry the wrong decision forward. Every test clears all
 * four possible env vars first so a leftover value can't make a "should
 * fall back" case pass by accident.
 */
describe("apiRateLimiter", () => {
  function clearAllUpstashEnv(): void {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  }

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
  });

  it("falls back to the in-memory limiter when no Upstash env vars are set", async () => {
    clearAllUpstashEnv();
    const { apiRateLimiter } = await import("./rate-limit");

    /**
     * Proves it's genuinely the in-memory sliding window, not merely that
     * the call resolved: drive the exact same key past the real 100/min
     * default budget and check the 101st request is rejected. A broken
     * fallback that instead tried to construct `upstashRateLimiter` against
     * an empty URL would reject every call with a real connection error
     * (an unhandled rejection failing this test), not resolve `false` on
     * the 101st - this distinguishes "falls back correctly" from "fails in
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
   * Tier 1 review's medium finding, applied to both naming pairs: only
   * "both present" and "both absent" were tested - `URL && TOKEN`
   * (requiring both) could regress to `!URL && !TOKEN` (requiring neither,
   * the inverse condition) without either existing test catching it, since
   * both conditions agree on the all-present and all-absent cases and
   * disagree only when exactly one is set.
   */
  it.each([
    ["KV_REST_API_URL only", "KV_REST_API_URL"],
    ["KV_REST_API_TOKEN only", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL only", "UPSTASH_REDIS_REST_URL"],
    ["UPSTASH_REDIS_REST_TOKEN only", "UPSTASH_REDIS_REST_TOKEN"],
  ])("falls back to the in-memory limiter when only %s is set", async (_label, setVar) => {
    clearAllUpstashEnv();
    vi.stubEnv(setVar, "some-value");
    const { apiRateLimiter } = await import("./rate-limit");

    const key = `apiRateLimiter-partial-env-${Math.random()}`;
    const now = new Date();
    for (let i = 0; i < 100; i++) {
      expect(await apiRateLimiter.check(key, now)).toBe(true);
    }
    expect(await apiRateLimiter.check(key, now)).toBe(false);
  });

  it("falls back to the in-memory limiter when one half of each pair is set, but neither pair is complete", async () => {
    clearAllUpstashEnv();
    vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const { apiRateLimiter } = await import("./rate-limit");

    const key = `apiRateLimiter-mixed-pair-${Math.random()}`;
    const now = new Date();
    for (let i = 0; i < 100; i++) {
      expect(await apiRateLimiter.check(key, now)).toBe(true);
    }
    expect(await apiRateLimiter.check(key, now)).toBe(false);
  });

  function mockUpstashSdk() {
    const limitMock = vi.fn().mockResolvedValue({ success: true });
    const slidingWindowMock = vi.fn((max: number, window: string) => ({ max, window }));
    const redisConstructorMock = vi.fn(function RedisMock() {
      return {};
    });
    const ratelimitConstructorMock = vi.fn(function RatelimitMock() {
      return { limit: limitMock };
    });

    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(ratelimitConstructorMock, { slidingWindow: slidingWindowMock }),
    }));
    vi.doMock("@upstash/redis", () => ({ Redis: redisConstructorMock }));

    return { limitMock, slidingWindowMock, redisConstructorMock, ratelimitConstructorMock };
  }

  it("constructs the Upstash-backed limiter from KV_REST_API_URL/TOKEN - Vercel's own Storage integration naming", async () => {
    const { limitMock, slidingWindowMock, redisConstructorMock } = mockUpstashSdk();
    clearAllUpstashEnv();
    vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");

    const { apiRateLimiter } = await import("./rate-limit");

    /**
     * `retry: { retries: 0 }` - second Tier 1 review round's finding:
     * `@upstash/redis`'s own default (5 retries, exponential backoff) would
     * make an outright connection failure retry for several seconds during
     * a real outage, racing (and usually losing to) `upstashRateLimiter`'s
     * own 1-second timeout bound with no log line at all. Disabling retries
     * is what makes a real failure land in the logged `catch` branch
     * quickly instead.
     */
    expect(redisConstructorMock).toHaveBeenCalledWith({
      url: "https://example-upstash.example.com",
      token: "test-token",
      retry: { retries: 0 },
    });
    expect(slidingWindowMock).toHaveBeenCalledWith(100, "60 s");

    const result = await apiRateLimiter.check("1.2.3.4", new Date());
    expect(result).toBe(true);
    expect(limitMock).toHaveBeenCalledWith("1.2.3.4");
  });

  it("constructs the Upstash-backed limiter from UPSTASH_REDIS_REST_URL/TOKEN when KV_* is absent", async () => {
    const { redisConstructorMock } = mockUpstashSdk();
    clearAllUpstashEnv();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example-upstash.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    await import("./rate-limit");

    expect(redisConstructorMock).toHaveBeenCalledWith({
      url: "https://example-upstash.example.com",
      token: "test-token",
      retry: { retries: 0 },
    });
  });

  it("prefers KV_REST_API_URL/TOKEN over UPSTASH_REDIS_REST_URL/TOKEN when both pairs are set", async () => {
    const { redisConstructorMock } = mockUpstashSdk();
    clearAllUpstashEnv();
    vi.stubEnv("KV_REST_API_URL", "https://kv-wins.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://upstash-loses.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "upstash-token");

    await import("./rate-limit");

    expect(redisConstructorMock).toHaveBeenCalledWith({
      url: "https://kv-wins.example.com",
      token: "kv-token",
      retry: { retries: 0 },
    });
  });

  /**
   * RL-3 (`docs/decisions-inbox/feat-rate-limiter-shared-store.md`),
   * resolved: Production and Preview must land on different Redis key
   * prefixes so they don't share one rate-limit budget.
   */
  it.each([
    ["production", "opika-api-ratelimit-production"],
    ["preview", "opika-api-ratelimit-preview"],
  ])("namespaces the prefix by VERCEL_ENV (%s)", async (vercelEnv, expectedPrefix) => {
    const { ratelimitConstructorMock } = mockUpstashSdk();
    clearAllUpstashEnv();
    vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    vi.stubEnv("VERCEL_ENV", vercelEnv);

    await import("./rate-limit");

    expect(ratelimitConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: expectedPrefix }),
    );
  });

  it("falls back to an 'unknown' prefix segment when VERCEL_ENV is unset", async () => {
    const { ratelimitConstructorMock } = mockUpstashSdk();
    clearAllUpstashEnv();
    vi.stubEnv("KV_REST_API_URL", "https://example-upstash.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    vi.stubEnv("VERCEL_ENV", "");

    await import("./rate-limit");

    expect(ratelimitConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "opika-api-ratelimit-unknown" }),
    );
  });
});
