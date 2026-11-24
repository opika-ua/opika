import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bearerMatches } from "./bearer";

const { timingSafeEqual } = vi.hoisted(() => ({ timingSafeEqual: vi.fn() }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual };
});

const SECRET = "s3cret-value-that-is-long-enough-for-a-cron";

beforeEach(() => {
  timingSafeEqual.mockClear();
});

describe("bearerMatches", () => {
  it("accepts exactly `Bearer <secret>`", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["a wrong token", "Bearer not-the-secret"],
    ["the secret with a trailing space", `Bearer ${SECRET} `],
    ["a prefix of the secret", `Bearer ${SECRET.slice(0, -1)}`],
    ["the secret without the scheme", SECRET],
    ["another scheme", `Basic ${SECRET}`],
    ["a lower-case scheme", `bearer ${SECRET}`],
    ["an empty header", ""],
  ])("refuses %s", (_label, header) => {
    expect(bearerMatches(header, SECRET)).toBe(false);
  });

  it("refuses a missing header, and an unset or empty secret even for `Bearer `", () => {
    expect(bearerMatches(null, SECRET)).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches("Bearer undefined", undefined)).toBe(false);
  });

  it("compares with timingSafeEqual over equal-length digests, whatever the header's length", () => {
    bearerMatches("Bearer x", SECRET);
    bearerMatches(`Bearer ${SECRET}${"y".repeat(500)}`, SECRET);
    expect(timingSafeEqual).toHaveBeenCalledTimes(2);
    for (const [given, expected] of timingSafeEqual.mock.calls) {
      expect([given.length, expected.length]).toEqual([32, 32]);
    }
  });

  it("is the only bearer check: no cron or secret route keeps its own compare", () => {
    const users = [
      "../kabinet/application-cleanup-cron.ts",
      "../kabinet/auth-cleanup.ts",
      "../kabinet/notifications-cron.ts",
      "../kabinet/r2-cleanup-cron.ts",
      "./monitoring-test-error.ts",
    ];
    for (const path of users) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect({ path, shared: /\bbearerMatches\(/.test(source) }).toEqual({ path, shared: true });
      expect({ path, own: /timingSafeEqual|`Bearer \$\{/.test(source) }).toEqual({
        path,
        own: false,
      });
    }
  });
});
