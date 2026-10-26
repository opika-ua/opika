import type { FeedCardView } from "@opika/contracts";
import type { Freshness, FreshnessKind } from "@opika/domain";
import { freshnessLabel } from "@opika/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwipeCard } from "./SwipeCard";

/**
 * Behaviour tests for the card.
 *
 * Deliberately not smoke tests. "It rendered without throwing" is the same
 * category of check that let three milestones ship broken, and it would pass
 * against a card that displayed nothing at all.
 */

function makeFreshness(kind: FreshnessKind, ageDays: number): Freshness {
  const now = new Date("2026-08-06T12:00:00Z");
  return { kind, ageDays, confirmedAt: new Date(now.getTime() - ageDays * 86_400_000) };
}

function makeCard(overrides: Partial<FeedCardView> = {}): FeedCardView {
  return {
    id: "00000001-0000-4000-8000-000000000000" as FeedCardView["id"],
    name: "Ластівка",
    species: "dog",
    sex: "female",
    size: "medium",
    ageBucket: "young",
    publicLocation: null,
    primaryPhoto: null,
    freshness: makeFreshness("fresh", 3),
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as FeedCardView["shelter"]["id"],
      displayName: "Тестовий притулок",
      publicLocation: {
        precision: "fuzzed_address",
        cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      freshnessSentence: {
        uk: "Ми оновлювали цю картку 25 червня. Напишіть - скажемо, чи Ластівка ще з нами.",
        en: null,
      },
      verification: "verified",
    },
    ...overrides,
  } as FeedCardView;
}

function renderCard(card: FeedCardView) {
  return render(<SwipeCard card={card} gestureRef={() => {}} dx={0} stackIndex={0} />);
}

describe("SwipeCard freshness marker", () => {
  /**
   * docs/design/README.md: "Three pips, always all three, always in the same
   * position." The count is the assertion — a marker that renders one pip for
   * `fresh` would still look plausible in markup and would silently drop the
   * "how far has this travelled" comparison the whole component exists for.
   */
  // Which pips are filled, per the design table. Their colours are appearance and are
  // not asserted (CLAUDE.md, "Test logic, not looks"; removed 2026-10-20).
  it.each([
    ["fresh", 3, ["filled", "empty", "empty"]],
    ["aging", 19, ["filled", "filled", "empty"]],
    ["stale", 41, ["filled", "filled", "filled"]],
  ] as const)("renders three pips for %s, filled per the design table", (kind, days, expected) => {
    renderCard(makeCard({ freshness: makeFreshness(kind, days) }));

    const pips = screen.getAllByTestId("freshness-pip");
    expect(pips).toHaveLength(3);
    expect(pips.map((p) => p.getAttribute("data-filled"))).toEqual(
      expected.map((fill) => (fill === "empty" ? "false" : "true")),
    );
  });

  /**
   * "The pips are never the only carrier of meaning. The day count in words
   * always sits beside them" — docs/design/README.md.
   *
   * The expected string comes from Intl.RelativeTimeFormat via the domain, so
   * this asserts the plural form a Ukrainian reader actually sees rather than
   * a hand-written one.
   */
  it("shows the day count in words next to the pips", () => {
    const freshness = makeFreshness("fresh", 3);
    renderCard(makeCard({ freshness }));

    expect(freshnessLabel(freshness)).toBe("Оновлено 3 дні тому");
    expect(screen.getByText("Оновлено 3 дні тому")).toBeTruthy();
  });

  /** "…and `aria-label` repeats the same sentence" - docs/design/README.md. */
  it("repeats that same sentence as the block's aria-label", () => {
    const freshness = makeFreshness("aging", 19);
    renderCard(makeCard({ freshness }));

    const sentence = freshnessLabel(freshness);
    expect(sentence).toBe("Оновлено 19 днів тому");

    const block = screen.getByTestId("freshness-block");
    expect(block.getAttribute("aria-label")).toBe(sentence);
    // Same words visible and announced, not two different phrasings.
    expect(screen.getByText(sentence)).toBeTruthy();
  });
  // The shelter's sentence left the deck in designer round 1, S6 (DR1-Q1); its
  // absence is pinned in `features/shelters/sentence-only-there.test.tsx`.
});

describe("SwipeCard name", () => {
  /**
   * A long name truncates visually (not asserted: appearance). The full name
   * must stay in the accessible tree,
   * or the ellipsis becomes data loss for anyone using a screen reader.
   */
  it("keeps the full name in the DOM and on the card's accessible label", () => {
    const name = "Всеволода-Мирослава Великодушна з Броварського притулку";
    renderCard(makeCard({ name }));

    expect(screen.getByTestId("card-name").textContent).toBe(name);
    expect(screen.getByTestId("swipe-card").getAttribute("aria-label")).toBe(name);
  });
});

/**
 * 2026-09-10, found by Oleksii, not by any test: this card had no
 * assertion at all about the "· перевірений" suffix, and it rendered
 * unconditionally - no reference anywhere to `REGISTRY_HAS_NO_REAL_SHELTERS`,
 * the identical defect `AnimalCard.test.tsx`'s own gallery card had.
 * `verificationSuffix` (`seo-flags.ts`) is the shared gate both cards now
 * call. Real `REGISTRY_HAS_NO_REAL_SHELTERS` is `true` on production today -
 * `seo-flags.test.ts`'s `verificationSuffix` describe block covers the
 * other branch directly, via the function's own explicit parameter.
 */
describe("SwipeCard shelter line", () => {
  it("does not mark a verified shelter as verified while the registry holds no real shelters", () => {
    renderCard(makeCard());

    const line = screen.getByTestId("shelter-line");
    expect(line.textContent).toContain("Тестовий притулок");
    expect(line.textContent).not.toContain("перевірений");
  });

  it("says nothing about verification for an unverified shelter, under today's real demo flag", () => {
    renderCard(makeCard({ shelter: { ...makeCard().shelter, verification: "unverified" } }));
    expect(screen.getByTestId("shelter-line").textContent).not.toContain("перевірений");
  });
});

/** Q9 (Oleksii, 2026-10-18): the meta line's age word agrees with the animal. */
describe("SwipeCard meta line, by sex", () => {
  it.each([
    ["female", "молода · середня"],
    ["male", "молодий · середня"],
    ["unknown", "молодий · середня"],
  ] as const)("a %s animal: «%s»", (sex, line) => {
    renderCard(makeCard({ sex, ageBucket: "young", size: "medium" }));
    expect(screen.getByText(line)).toBeTruthy();
  });
});
