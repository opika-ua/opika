import type { Freshness } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { freshnessLabel } from "./freshness-display";

function makeFreshness(kind: Freshness["kind"], ageDays: number): Freshness {
  return { kind, confirmedAt: new Date("2026-08-01T00:00:00Z"), ageDays };
}

describe("freshnessLabel", () => {
  /**
   * Same boundary set packages/domain/src/discovery/freshness.test.ts uses
   * (CLAUDE.md's non-negotiable plural-boundary suite, plus 3 to exercise
   * the "few" form 1/2 mask with "учора"/"позавчора"). This asserts the
   * {days} substitution around the domain's Intl output, not the plural
   * rule itself - it would fail if the template broke, not if Intl did.
   */
  it.each([
    [1, "Оновлено учора"],
    [2, "Оновлено позавчора"],
    [3, "Оновлено 3 дні тому"],
    [5, "Оновлено 5 днів тому"],
    [11, "Оновлено 11 днів тому"],
    [21, "Оновлено 21 день тому"],
    [22, "Оновлено 22 дні тому"],
  ])("wraps the relative-time string for %i day(s)", (ageDays, expected) => {
    expect(freshnessLabel(makeFreshness("fresh", ageDays))).toBe(expected);
  });
});
