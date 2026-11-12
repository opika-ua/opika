import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeedCardView } from "@opika/contracts";
import {
  DEFAULT_GALLERY_SORT,
  type Freshness,
  type FreshnessKind,
  NO_FILTERS,
} from "@opika/domain";
import { freshnessLabel } from "@opika/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryCard } from "./GalleryCard";

/** The gallery-context props every real caller passes (`tvaryny/page.tsx`); this file's
 * own concern is the card's rendering, not filter/sort plumbing, so every test shares the
 * no-filter default unless a test says otherwise. */
const NO_CONTEXT = { filters: NO_FILTERS, sort: DEFAULT_GALLERY_SORT, citySlugs: new Map() };

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
      logo: null,
      publicLocation: {
        precision: "fuzzed_address",
        cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      verification: "verified",
    },
    ...overrides,
  } as FeedCardView;
}

describe("GalleryCard under-review label", () => {
  it("shows «На перевірці» for a shelter listed before verification and nothing for a verified one", () => {
    const listed = makeCard();
    listed.shelter = { ...listed.shelter, verification: "listed_before_verification" };
    render(<GalleryCard card={listed} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.getByTestId("under-review-badge").textContent).toBe("На перевірці");
    cleanup();
    render(<GalleryCard card={makeCard()} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.queryByTestId("under-review-badge")).toBeNull();
  });
});

describe("GalleryCard age", () => {
  it("shows a declared range's span in the facts line (owner, 2026-11-12)", () => {
    render(
      <GalleryCard
        card={makeCard({ ageBucket: "adult", ageSpan: { kind: "between", from: 3, to: 4 } })}
        cityName="Бровари"
        {...NO_CONTEXT}
      />,
    );
    expect(screen.getByTestId("card-meta").textContent).toContain("≈\u00A03–4 роки");
    expect(screen.getByTestId("card-meta").textContent).not.toContain("дорослий");
  });

  it("keeps the bucket word when there is no span", () => {
    render(<GalleryCard card={makeCard({ ageSpan: null })} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.getByTestId("card-meta").textContent).toContain("молодий");
  });
});

describe("GalleryCard link", () => {
  it("is exactly one link, and only one - the pill is not a nested button or anchor", () => {
    render(<GalleryCard card={makeCard()} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("points at /tvaryny/{id}", () => {
    const card = makeCard();
    render(<GalleryCard card={card} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`/tvaryny/${card.id}`);
  });

  /**
   * Pet card PR 5, decision B: every card link carries the gallery's own
   * filter and sort, so the overlay it opens can ask `animals.neighbours`
   * for the right walk through the same result set this card is part of.
   * `animalPageHref` itself is unit-tested in `filter-url.test.ts`; this is
   * the wiring check - that the card actually passes its own `filters`/
   * `sort`/`citySlugs` props through rather than a hardcoded default. The
   * mutation that would slip past "points at /tvaryny/{id}" above (ignoring
   * these three props entirely) fails exactly this test instead.
   */
  it("carries the gallery's own filter and sort context on its href", () => {
    const card = makeCard({ species: "dog" });
    const cityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never;
    render(
      <GalleryCard
        card={card}
        cityName="Бровари"
        filters={{ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } }}
        sort="longest_waiting"
        citySlugs={new Map([[cityId, "brovary" as never]])}
      />,
    );
    const href = screen.getByRole("link").getAttribute("href") ?? "";
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe(`/tvaryny/${card.id}`);
    expect(url.searchParams.get("vyd")).toBe("dog");
    expect(url.searchParams.get("sort")).toBe("longest_waiting");
  });

  it("names the link from its visible text, so no aria-label can disagree with it (WCAG 2.5.3)", () => {
    render(<GalleryCard card={makeCard({ name: "Мурчик" })} cityName="Бровари" {...NO_CONTEXT} />);
    const link = screen.getByRole("link");
    expect(link.hasAttribute("aria-label")).toBe(false);
    expect(link.textContent).toContain("Мурчик");
    expect(screen.getByRole("link", { name: /Мурчик/ })).toBeTruthy();
  });

  it("folds the reserved badge into the accessible name for a reserved animal", () => {
    const card = makeCard({ listingKind: "reserved" });
    render(<GalleryCard card={card} cityName="Бровари" {...NO_CONTEXT} />);

    expect(screen.getByRole("link", { name: /Уже домовляються/ })).toBeTruthy();
  });
});

describe("GalleryCard the «Познайомитися» pill", () => {
  // Oleksii's owner-approved replacement for the builder prompt's
  // "Усиновити" - the design's own literal, transcribed here rather than
  // read from `uk.feed.adoptPill`: a test that imports the same constant
  // the component renders can't catch a wrong value, only a wiring
  // regression (`docs/standing-constraints.md`'s "a test may not compare
  // output against the same constant the code renders" — confirmed by
  // mutating `adoptPill` back to "Усиновити" during review: the earlier,
  // `uk`-importing version of this test still passed).
  it("is visible on every card, published or reserved", () => {
    render(<GalleryCard card={makeCard()} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.getByText("Познайомитися")).toBeTruthy();
  });

  it("stays out of the accessible name (aria-hidden)", () => {
    render(<GalleryCard card={makeCard()} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.queryByRole("link", { name: /Познайомитися/ })).toBeNull();
  });
});

describe("GalleryCard reserved tag", () => {
  it("renders beside the freshness badge only for a reserved animal", () => {
    render(
      <GalleryCard
        card={makeCard({ listingKind: "published" })}
        cityName="Бровари"
        {...NO_CONTEXT}
      />,
    );
    expect(screen.queryByTestId("reserved-badge")).toBeNull();

    render(
      <GalleryCard
        card={makeCard({ listingKind: "reserved" })}
        cityName="Бровари"
        {...NO_CONTEXT}
      />,
    );
    expect(screen.getByTestId("reserved-badge").textContent).toBe("Уже домовляються");
  });
});

describe("GalleryCard freshness badge", () => {
  it("shows the relative day count in words, no pips", () => {
    const freshness = makeFreshness("fresh", 3);
    render(<GalleryCard card={makeCard({ freshness })} cityName="Бровари" {...NO_CONTEXT} />);

    expect(screen.getByTestId("freshness-badge").textContent).toBe(freshnessLabel(freshness));
    expect(screen.queryByTestId("freshness-pip")).toBeNull();
  });
});

describe("GalleryCard meta line", () => {
  it("shows sex, age and size - no city", () => {
    render(
      <GalleryCard
        card={makeCard({ sex: "female", ageBucket: "senior", size: "large" })}
        cityName="Бровари"
        {...NO_CONTEXT}
      />,
    );
    const meta = screen.getByTestId("card-meta");
    expect(meta.textContent).toContain("Дівчинка");
    expect(meta.textContent).toContain("літня");
    expect(meta.textContent).toContain("велика");
    expect(meta.textContent).not.toContain("Бровари");
  });

  it("still carries the city in the accessible name, for a screen-reader user", () => {
    render(<GalleryCard card={makeCard()} cityName="Бровари" {...NO_CONTEXT} />);
    expect(screen.getByRole("link", { name: /Бровари/ })).toBeTruthy();
  });
});

describe("GalleryCard names no shelter", () => {
  it("shows neither the shelter's name nor a verification suffix", () => {
    const shelterName = "Тестовий притулок";
    render(<GalleryCard card={makeCard()} cityName="Бровари" {...NO_CONTEXT} />);

    const link = screen.getByRole("link");
    expect(link.textContent).not.toContain(shelterName);
    expect(link.textContent).not.toContain("перевірений");
  });
});

describe("GalleryCard on a phone (text under the photo)", () => {
  it("shows the freshness in words as text, in either layout", () => {
    const freshness = makeFreshness("fresh", 12);
    for (const layout of ["responsive", "stacked"] as const) {
      const { unmount } = render(
        <GalleryCard
          card={makeCard({ freshness })}
          cityName="Бровари"
          layout={layout}
          {...NO_CONTEXT}
        />,
      );
      expect(screen.getAllByText(freshnessLabel(freshness))).toHaveLength(1);
      unmount();
    }
  });

  it("the stacked layout has no pill, and the freshness text is rendered once", () => {
    render(
      <GalleryCard
        card={makeCard({ listingKind: "reserved" })}
        cityName="Бровари"
        layout="stacked"
        {...NO_CONTEXT}
      />,
    );
    expect(screen.queryByText("Познайомитися")).toBeNull();
    expect(screen.getByTestId("reserved-badge").textContent).toBe("Уже домовляються");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByText(freshnessLabel(makeFreshness("fresh", 3)))).toHaveLength(1);
  });

  it("keeps a long name whole in the accessible name while the visible name is the same text", () => {
    const name = "Принцеса Маргарита Велика Київська та всієї Русі";
    render(
      <GalleryCard card={makeCard({ name })} cityName="Бровари" layout="stacked" {...NO_CONTEXT} />,
    );
    expect(screen.getByRole("link", { name: new RegExp(name) })).toBeTruthy();
    expect(screen.getByTestId("card-name").textContent).toBe(name);
  });
});

describe("GalleryCard photo loading", () => {
  const withPhoto = makeCard({
    primaryPhoto: { storageKey: "/seed-photos/dog-1.jpg" } as FeedCardView["primaryPhoto"],
  });
  const img = (container: HTMLElement) => container.querySelector("img");

  it("the first-row photo loads now, without high priority", () => {
    const { container } = render(
      <GalleryCard card={withPhoto} cityName={null} eager {...NO_CONTEXT} />,
    );
    expect(img(container)?.getAttribute("loading")).toBe("eager");
    expect(img(container)?.getAttribute("fetchpriority")).toBeNull();
  });

  it("the priority photo gets fetchpriority high and is not lazy", () => {
    const { container } = render(
      <GalleryCard card={withPhoto} cityName={null} priority eager {...NO_CONTEXT} />,
    );
    expect(img(container)?.getAttribute("fetchpriority")).toBe("high");
    expect(img(container)?.getAttribute("loading")).not.toBe("lazy");
  });

  it("a photo below the first row stays lazy", () => {
    const { container } = render(<GalleryCard card={withPhoto} cityName={null} {...NO_CONTEXT} />);
    expect(img(container)?.getAttribute("loading")).toBe("lazy");
    expect(img(container)?.getAttribute("fetchpriority")).toBeNull();
  });

  it("one freshness chip for both species: page fill, ink text, species only as the dot", () => {
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
    const chip = css.match(/@utility gcard-fresh \{([^}]*)\}/)?.[1] ?? "";
    expect(chip).toContain("tablet:bg-page");
    expect(chip).toContain("tablet:text-ink");
    expect(chip).toContain("tablet:shadow-float");
    expect(chip).not.toContain("--dot");
    expect(css).not.toContain("--on-dot");
    expect(css).toMatch(/@utility gcard-cat \{\s*--dot: var\(--color-species-cat\);/);
    expect(css).toMatch(/@utility gcard-dog \{\s*--dot: var\(--color-species-dog\);/);
  });
});
