import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRateLimiter, sharedRateLimiter } from "./rate-limit";
import { ipKeyWith } from "./rate-limit-key";

/**
 * Owner, 2026-10-28: every 429 is logged with its limiter's name only, so
 * Vercel's logs show whether real visitors meet a limit. One structured line,
 * `{ event: "rate_limited", limiter }`; never the key, the address or anything
 * else that identifies a person.
 */
const IP = "203.0.113.77";
const KEY = ipKeyWith("test-rate-limit-key-secret-aaaaaaaaaaaaaaaa", IP);
const LINE = (limiter: string) => [{ event: "rate_limited", limiter }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a limiter's refusal is logged by name, and only that", () => {
  it("a shared limiter: one line per refusal, none while it allows", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = sharedRateLimiter({ name: "test-limiter", windowMs: 60_000, maxRequests: 2 });
    const now = new Date("2026-10-28T12:00:00Z");
    expect(await limiter.check(KEY, now)).toBe(true);
    expect(await limiter.check(KEY, now)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(await limiter.check(KEY, now)).toBe(false);
    expect(await limiter.check(KEY, now)).toBe(false);
    expect(warn.mock.calls).toEqual([LINE("test-limiter"), LINE("test-limiter")]);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(IP);
    expect(logged).not.toContain(KEY);
  });

  it("the adopter API's 100 a minute logs as `api`", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = new Date("2026-10-28T12:00:00Z");
    const key = ipKeyWith("test-rate-limit-key-secret-aaaaaaaaaaaaaaaa", "203.0.113.78");
    for (let i = 0; i < 100; i++) expect(await apiRateLimiter.check(key, now)).toBe(true);
    expect(await apiRateLimiter.check(key, now)).toBe(false);
    expect(warn.mock.calls).toEqual([LINE("api")]);
  });
});
