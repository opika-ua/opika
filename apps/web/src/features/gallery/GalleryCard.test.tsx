import type { FeedCardView } from "@opika/contracts";
import type { Freshness, FreshnessKind } from "@opika/domain";
import { freshnessLabel } from "@opika/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cardAccessibleName } from "./card-text";
import { GalleryCard } from "./GalleryCard";

/** Same reasoning as AnimalCard.test.tsx's own: "it rendered without throwing" is not evidence. */

function makeFreshness(kind: FreshnessKind, ageDays: number): Freshness {
  const now = new Date("2026-08-06T12:00:00Z");
  return { kind, ageDays, confirmedAt: new Date(now.getTime() - ageDays * 86_400_000) };
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

describe("GalleryCard link", () => {
  it("is exactly one link, and only one — the pill is not a nested button or anchor", () => {
    render(<GalleryCard card={makeCard()} cityName="Бровари" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("points at /tvaryny/{id}", () => {
    const card = makeCard();
    render(<GalleryCard card={card} cityName="Бровари" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`/tvaryny/${card.id}`);
  });

  it("has the accessible name cardAccessibleName computes, unaffected by the pill text", () => {
    const card = makeCard({ name: "Мурчик" });
    render(<GalleryCard card={card} cityName="Бровари" />);

    const expected = cardAccessibleName(card, "Бровари");
    expect(screen.getByRole("link", { name: expected })).toBeTruthy();
  });

  it("folds the reserved badge into the accessible name for a reserved animal", () => {
    const card = makeCard({ listingKind: "reserved" });
    render(<GalleryCard card={card} cityName="Бровари" />);

    expect(screen.getByRole("link").getAttribute("aria-label")).toContain("Уже домовляються");
  });
});

describe("GalleryCard the «Познайомитися» pill", () => {
  // Oleksii's owner-approved replacement for the builder prompt's
  // "Усиновити" — the design's own literal, transcribed here rather than
  // read from `uk.feed.adoptPill`: a test that imports the same constant
  // the component renders can't catch a wrong value, only a wiring
  // regression (`docs/standing-constraints.md`'s "a test may not compare
  // output against the same constant the code renders" — confirmed by
  // mutating `adoptPill` back to "Усиновити" during review: the earlier,
  // `uk`-importing version of this test still passed).
  it("is visible on every card, published or reserved", () => {
    render(<GalleryCard card={makeCard()} cityName="Бровари" />);
    expect(screen.getByText("Познайомитися")).toBeTruthy();
  });

  it("does not change the accessible name — the link's own aria-label is what's read", () => {
    const card = makeCard();
    render(<GalleryCard card={card} cityName="Бровари" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("aria-label")).not.toContain("Познайомитися");
  });
});

describe("GalleryCard reserved tag", () => {
  it("renders beside the freshness badge only for a reserved animal", () => {
    render(<GalleryCard card={makeCard({ listingKind: "published" })} cityName="Бровари" />);
    expect(screen.queryByTestId("reserved-badge")).toBeNull();

    render(<GalleryCard card={makeCard({ listingKind: "reserved" })} cityName="Бровари" />);
    expect(screen.getByTestId("reserved-badge").textContent).toBe("Уже домовляються");
  });
});

describe("GalleryCard freshness badge", () => {
  it("shows the relative day count in words, no pips", () => {
    const freshness = makeFreshness("fresh", 3);
    render(<GalleryCard card={makeCard({ freshness })} cityName="Бровари" />);

    expect(screen.getByTestId("freshness-badge").textContent).toBe(freshnessLabel(freshness));
    expect(screen.queryByTestId("freshness-pip")).toBeNull();
  });

  it.each([
    ["dog", "bg-brand-dog"],
    ["cat", "bg-brand-accent"],
  ] as const)("colours the badge by species: %s → %s", (species, tone) => {
    render(<GalleryCard card={makeCard({ species })} cityName="Бровари" />);
    expect(screen.getByTestId("freshness-badge").className).toContain(tone);
  });
});

describe("GalleryCard meta line", () => {
  it("shows sex, age and size — no city", () => {
    render(
      <GalleryCard
        card={makeCard({ sex: "female", ageBucket: "senior", size: "large" })}
        cityName="Бровари"
      />,
    );
    const meta = screen.getByTestId("card-meta");
    expect(meta.textContent).toContain("Дівчинка");
    expect(meta.textContent).toContain("літній");
    expect(meta.textContent).toContain("велика");
    expect(meta.textContent).not.toContain("Бровари");
  });

  it("still carries the city in the accessible name, for a screen-reader user", () => {
    render(<GalleryCard card={makeCard()} cityName="Бровари" />);
    expect(screen.getByRole("link").getAttribute("aria-label")).toContain("Бровари");
  });
});

describe("GalleryCard names no shelter", () => {
  it("shows neither the shelter's name nor a verification suffix", () => {
    const shelterName = "Тестовий притулок";
    render(<GalleryCard card={makeCard()} cityName="Бровари" />);

    const link = screen.getByRole("link");
    expect(link.textContent).not.toContain(shelterName);
    expect(link.textContent).not.toContain("перевірений");
  });
});
