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
  return { kind, ageDays, updatedAt: new Date(now.getTime() - ageDays * 86_400_000) };
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
        uk: "Ми оновлювали цю картку 25 червня. Напишіть — скажемо, чи Ластівка ще з нами.",
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
  // V2 repoint (docs/design/README.md, "The freshness marker"): fill colours moved
  // bg-leaf -> bg-rg-registry, bg-ink-4 -> bg-rg-ink-3, bg-ink -> bg-rg-ink (same role,
  // new token names). The empty slot is no longer `null`/unstyled: it's the
  // WCAG 1.4.11 fix — transparent fill + border-rg-ink-3 — replacing the mock's
  // original solid #DCDCD9 fill, which measured 1.16-1.37:1 against every background
  // it appears on and fails the 3:1 non-text-contrast requirement. The design was
  // subsequently updated to specify the outline directly.
  it.each([
    ["fresh", 3, ["bg-rg-registry", "empty", "empty"]],
    ["aging", 19, ["bg-rg-ink-3", "bg-rg-ink-3", "empty"]],
    ["stale", 41, ["bg-rg-ink-3", "bg-rg-ink-3", "bg-rg-ink"]],
  ] as const)("renders three pips for %s, filled per the design table", (kind, days, expected) => {
    renderCard(makeCard({ freshness: makeFreshness(kind, days) }));

    const pips = screen.getAllByTestId("freshness-pip");
    expect(pips).toHaveLength(3);
    expect(pips.map((p) => p.getAttribute("data-filled"))).toEqual(
      expected.map((fill) => (fill === "empty" ? "false" : "true")),
    );
    // Stronger than the boolean check above: the *specific* fill colour per
    // the design table, not just whether a pip is filled at all. The empty
    // slot gets its own check — border-drawn, transparent, never a bg- fill.
    expected.forEach((fill, i) => {
      if (fill === "empty") {
        expect(pips[i]?.className).toContain("bg-transparent");
        expect(pips[i]?.className).toContain("border-rg-ink-3");
        expect(pips[i]?.className).not.toContain("bg-rg-");
      } else {
        expect(pips[i]?.className).toContain(fill);
      }
    });
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

  /** "…and `aria-label` repeats the same sentence" — docs/design/README.md. */
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

  it("renders the shelter's own sentence beneath the day count", () => {
    const card = makeCard();
    renderCard(card);

    const sentence = card.shelter.freshnessSentence?.uk;
    expect(sentence).toBeTruthy();
    expect(screen.getByText(sentence as string)).toBeTruthy();
  });
});

describe("SwipeCard name", () => {
  /**
   * A long name must truncate to one line rather than wrap and push the rest
   * of the card down. happy-dom does no layout, so this asserts the mechanism
   * that produces the single line; the rendered height is measured for real in
   * `test/harness/discovery-layout.harness.ts`.
   */
  it("truncates a long Ukrainian name to a single line", () => {
    renderCard(makeCard({ name: "Всеволода-Мирослава Великодушна з Броварського притулку" }));

    const nameEl = screen.getByTestId("card-name");

    // Tailwind's `truncate` utility is exactly `overflow:hidden;
    // text-overflow:ellipsis; white-space:nowrap` — the same three
    // properties this test checked individually before the Tailwind
    // migration, now behind one class instead of three that could drift
    // independently.
    expect(nameEl.className.split(/\s+/)).toContain("truncate");
  });

  /**
   * Truncation is visual only. The full name must stay in the accessible tree,
   * or the ellipsis becomes data loss for anyone using a screen reader.
   */
  it("keeps the full name in the DOM and on the card's accessible label", () => {
    const name = "Всеволода-Мирослава Великодушна з Броварського притулку";
    renderCard(makeCard({ name }));

    expect(screen.getByTestId("card-name").textContent).toBe(name);
    expect(screen.getByTestId("swipe-card").getAttribute("aria-label")).toBe(name);
  });
});
