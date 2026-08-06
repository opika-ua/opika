import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertFullIcu,
  DEFAULT_FRESHNESS_POLICY,
  FreshnessPolicySchema,
  formatFreshnessRelative,
  freshnessOf,
} from "./freshness";

const NOW = new Date("2026-08-05T12:00:00.000Z");

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("full ICU", () => {
  it("is present, so every other assertion in this file is meaningful", () => {
    // Without it uk-UA collapses to English and the plural assertions below
    // would be testing the wrong language while still passing some of the time.
    expect(() => assertFullIcu()).not.toThrow();
  });

  it("throws, and reports what it saw, on a runtime without Ukrainian data", () => {
    // The branch that matters: a boot assertion that cannot fail is decoration.
    // The message has to name the value received, or the operator is left
    // guessing which locale data is missing.
    expect(() => assertFullIcu(() => "January")).toThrow(/January/);
  });
});

describe("FreshnessPolicy validation", () => {
  it("rejects a policy whose aging band sits below its fresh band", () => {
    // {fresh: 30, aging: 7} parsed cleanly before this and made `aging`
    // unreachable, so a month-old listing read as fresh.
    expect(FreshnessPolicySchema.safeParse({ freshMaxDays: 30, agingMaxDays: 7 }).success).toBe(
      false,
    );
  });

  it("accepts equal bounds, which collapses aging to a single day", () => {
    expect(FreshnessPolicySchema.safeParse({ freshMaxDays: 7, agingMaxDays: 7 }).success).toBe(
      true,
    );
  });

  it("accepts the shipped default", () => {
    expect(FreshnessPolicySchema.safeParse(DEFAULT_FRESHNESS_POLICY).success).toBe(true);
  });
});

describe("freshnessOf classification", () => {
  const policy = DEFAULT_FRESHNESS_POLICY;

  const cases: ReadonlyArray<[number, string]> = [
    [0, "fresh"],
    [1, "fresh"],
    [7, "fresh"],
    [8, "aging"],
    [30, "aging"],
    [31, "stale"],
    [365, "stale"],
  ];

  for (const [days, expected] of cases) {
    it(`classifies ${days} days as ${expected}`, () => {
      expect(freshnessOf(daysAgo(days), NOW, policy).kind).toBe(expected);
    });
  }

  it("counts whole elapsed days, not calendar days", () => {
    const twentyHours = new Date(NOW.getTime() - 20 * 3_600_000);
    expect(freshnessOf(twentyHours, NOW, policy).ageDays).toBe(0);
  });

  it("clamps a future timestamp to zero rather than reporting negative age", () => {
    const ahead = new Date(NOW.getTime() + 86_400_000);
    const result = freshnessOf(ahead, NOW, policy);
    expect(result.ageDays).toBe(0);
    expect(result.kind).toBe("fresh");
  });

  it("honours a tuned policy rather than the default thresholds", () => {
    const strict = { freshMaxDays: 1, agingMaxDays: 3 };
    expect(freshnessOf(daysAgo(2), NOW, strict).kind).toBe("aging");
    expect(freshnessOf(daysAgo(4), NOW, strict).kind).toBe("stale");
  });

  it("preserves the original timestamp so the badge need not recompute it", () => {
    const updatedAt = daysAgo(5);
    expect(freshnessOf(updatedAt, NOW, policy).updatedAt).toEqual(updatedAt);
  });
});

/**
 * Ukrainian has four plural forms, and `numeric: "auto"` additionally
 * substitutes named words for the nearest days. Both behaviours are asserted
 * against real output rather than assumed:
 *
 * - 1 and 2 do not render as numerals at all. Ukrainian has a dedicated word
 *   for the day before yesterday («позавчора»), and CLDR spells yesterday
 *   «учора», not «вчора» — a difference no amount of confidence would catch.
 * - 3 exercises the "few" form, which the named words would otherwise mask.
 * - 11 is a teen, which takes the "many" form despite ending in 1.
 * - 21 returns to the "one" form, and 22 to "few".
 */
describe("Ukrainian relative-time output at plural boundaries", () => {
  const cases: ReadonlyArray<[number, string]> = [
    [1, "учора"],
    [2, "позавчора"],
    [3, "3 дні тому"],
    [5, "5 днів тому"],
    [11, "11 днів тому"],
    [21, "21 день тому"],
    [22, "22 дні тому"],
  ];

  for (const [days, expected] of cases) {
    it(`renders ${days} days as "${expected}"`, () => {
      const freshness = freshnessOf(daysAgo(days), NOW, DEFAULT_FRESHNESS_POLICY);
      expect(freshness.ageDays).toBe(days);
      expect(formatFreshnessRelative(freshness, "uk")).toBe(expected);
    });
  }

  it("uses the named form for today rather than a numeral", () => {
    const freshness = freshnessOf(NOW, NOW, DEFAULT_FRESHNESS_POLICY);
    expect(formatFreshnessRelative(freshness, "uk")).toBe("сьогодні");
  });

  it("renders English through the same call path", () => {
    const freshness = freshnessOf(daysAgo(5), NOW, DEFAULT_FRESHNESS_POLICY);
    expect(formatFreshnessRelative(freshness, "en")).toBe("5 days ago");
  });

  it("points into the past, which is the sign that is easy to get backwards", () => {
    const freshness = freshnessOf(daysAgo(5), NOW, DEFAULT_FRESHNESS_POLICY);
    expect(formatFreshnessRelative(freshness, "uk")).toContain("тому");
  });
});
