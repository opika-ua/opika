import type { Freshness } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { freshnessLabel, freshnessPips } from "./freshness-display";

function makeFreshness(kind: Freshness["kind"], ageDays: number): Freshness {
  return { kind, confirmedAt: new Date("2026-08-01T00:00:00Z"), ageDays };
}

describe("freshnessPips", () => {
  // Which pips are filled; the colour each carries is appearance and is not
  // asserted (CLAUDE.md, "Test logic, not looks"; removed 2026-10-20).
  const filled = (kind: Freshness["kind"]) => freshnessPips(kind).map((pip) => pip !== "empty");

  it("fills one pip when fresh, the rest empty", () => {
    expect(filled("fresh")).toEqual([true, false, false]);
  });

  it("fills two pips when aging, the last empty", () => {
    expect(filled("aging")).toEqual([true, true, false]);
  });

  it("fills all three pips when stale", () => {
    expect(filled("stale")).toEqual([true, true, true]);
  });
});

describe("freshnessLabel", () => {
  /**
   * Same boundary set packages/domain/src/discovery/freshness.test.ts uses
   * (CLAUDE.md's non-negotiable plural-boundary suite, plus 3 to exercise
   * the "few" form 1/2 mask with "учора"/"позавчора"). This asserts the
   * {days} substitution around the domain's Intl output, not the plural
   * rule itself — it would fail if the template broke, not if Intl did.
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
