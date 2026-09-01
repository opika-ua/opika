import type { FeedCardView } from "@opika/contracts";
import type { Freshness, FreshnessKind } from "@opika/domain";
import { freshnessLabel } from "@opika/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnimalCard } from "./AnimalCard";
import { cardAccessibleName } from "./card-text";

/**
 * Behaviour tests, mirroring SwipeCard.test.tsx's own stated reason for
 * being one: "it rendered without throwing" would still pass against a card
 * that displayed nothing at all.
 */

function makeFreshness(kind: FreshnessKind, ageDays: number): Freshness {
  const now = new Date("2026-08-06T12:00:00Z");
  return { kind, ageDays, updatedAt: new Date(now.getTime() - ageDays * 86_400_000) };
}

function makeCard(overrides: Partial<FeedCardView> = {}): FeedCardView {
  return {
    id: "00000001-0000-4000-8000-000000000000" as FeedCardView["id"],
    name: "Мурчик",
    species: "cat",
    sex: "male",
    size: "small",
    ageBucket: "young",
    publicLocation: null,
    primaryPhoto: null,
    freshness: makeFreshness("fresh", 3),
    listingKind: "published",
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as FeedCardView["shelter"]["id"],
      displayName: "Тестовий притулок",
      publicLocation: {
        precision: "fuzzed_address",
        cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      freshnessSentence: null,
      verification: "verified",
    },
    ...overrides,
  } as FeedCardView;
}

describe("AnimalCard link", () => {
  /**
   * The regression this guards: someone later wraps the photo (or the
   * shelter name) in its own <a> or <button>, and the card silently grows a
   * second tab stop. docs/design/README.md: "One <a> per animal — no nested
   * buttons, so Tab stops once per animal."
   */
  it("is exactly one link, and only one", () => {
    render(<AnimalCard card={makeCard()} cityName="Бровари" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("points at /tvaryny/{id} — docs/gallery-contract-decisions.md §6", () => {
    const card = makeCard();
    render(<AnimalCard card={card} cityName="Бровари" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`/tvaryny/${card.id}`);
  });

  it("has the accessible name cardAccessibleName computes, not the raw name or alt text", () => {
    const card = makeCard({ name: "Мурчик" });
    render(<AnimalCard card={card} cityName="Бровари" />);

    const expected = cardAccessibleName(card, "Бровари");
    expect(expected).not.toBe("Мурчик"); // the composed name is strictly richer
    expect(screen.getByRole("link", { name: expected })).toBeTruthy();
  });

  it("folds the reserved badge into the accessible name for a reserved animal", () => {
    const card = makeCard({ listingKind: "reserved" });
    render(<AnimalCard card={card} cityName="Бровари" />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("aria-label")).toContain("Уже домовляються");
  });
});

describe("AnimalCard reserved badge", () => {
  it("renders the pill only for a reserved animal", () => {
    render(<AnimalCard card={makeCard({ listingKind: "published" })} cityName="Бровари" />);
    expect(screen.queryByTestId("reserved-badge")).toBeNull();
  });

  it("renders both the full and short label text for CSS to swap by breakpoint", () => {
    render(<AnimalCard card={makeCard({ listingKind: "reserved" })} cityName="Бровари" />);

    expect(screen.getByText("Уже домовляються")).toBeTruthy();
    expect(screen.getByText("Домовляються")).toBeTruthy();
  });
});

describe("AnimalCard meta line", () => {
  it("reads age, size, then housing+city", () => {
    render(
      <AnimalCard
        card={makeCard({ ageBucket: "senior", size: "large", publicLocation: null })}
        cityName="Бровари"
      />,
    );
    expect(screen.getByTestId("card-meta").textContent).toBe("літній · велика · м. Бровари");
  });
});

describe("AnimalCard freshness marker", () => {
  it("renders three pips, aria-hidden, filled per the design table — same as the deck", () => {
    render(
      <AnimalCard card={makeCard({ freshness: makeFreshness("aging", 19) })} cityName="Бровари" />,
    );

    const row = screen.getAllByTestId("freshness-pip")[0]?.parentElement;
    expect(row?.getAttribute("aria-hidden")).toBe("true");

    const pips = screen.getAllByTestId("freshness-pip");
    expect(pips).toHaveLength(3);
    expect(pips.map((p) => p.getAttribute("data-filled"))).toEqual(["true", "true", "false"]);
  });

  it("shows the day count in words, visibly, next to the pips", () => {
    const freshness = makeFreshness("fresh", 3);
    render(<AnimalCard card={makeCard({ freshness })} cityName="Бровари" />);

    expect(screen.getByText(freshnessLabel(freshness))).toBeTruthy();
  });

  it("does not render the deck's boxed shelter sentence", () => {
    render(<AnimalCard card={makeCard()} cityName="Бровари" />);
    expect(screen.queryByTestId("freshness-block")).toBeNull();
  });
});

describe("AnimalCard resolved variant", () => {
  /**
   * `resolved` is never set by any real caller today — see
   * AnimalCardProps["resolved"]'s own comment for why (the gallery/feed
   * query never returns an adopted animal, so no live `FeedCardView` can
   * express this). This is the one place the rendering is exercised at
   * all: a hand-built fixture, per docs/design/README.md, "The gallery
   * card" > "Resolved" — "Different fill and different text — never
   * dimming."
   */
  it("replaces the freshness pips with the shelter's sentence, not a dimmed version of them", () => {
    render(<AnimalCard card={makeCard({ name: "Бім" })} cityName="Бровари" resolved />);

    expect(screen.queryByTestId("freshness-pip")).toBeNull();
    expect(screen.getByText("Притулок каже: Бім уже вдома.")).toBeTruthy();
  });

  it("never shows the reserved badge, even if the underlying listingKind is reserved", () => {
    render(
      <AnimalCard
        card={makeCard({ listingKind: "reserved" })}
        cityName="Бровари"
        resolved
      />,
    );
    expect(screen.queryByTestId("reserved-badge")).toBeNull();
  });

  it("gives the shelter line ink-2, not the standard card's ink-3", () => {
    render(<AnimalCard card={makeCard()} cityName="Бровари" resolved />);
    expect(screen.getByTestId("shelter-line").className).toContain("text-rg-ink-2");
  });
});

describe("AnimalCard shelter line", () => {
  it("marks a verified shelter, without a monogram (the gallery card's own, simpler spec)", () => {
    render(<AnimalCard card={makeCard()} cityName="Бровари" />);

    const line = screen.getByTestId("shelter-line");
    expect(line.textContent).toContain("Тестовий притулок");
    expect(line.textContent).toContain("перевірений");
  });

  it("says nothing about verification for an unverified shelter", () => {
    render(
      <AnimalCard
        card={makeCard({ shelter: { ...makeCard().shelter, verification: "unverified" } })}
        cityName="Бровари"
      />,
    );
    expect(screen.getByTestId("shelter-line").textContent).not.toContain("перевірений");
  });
});
