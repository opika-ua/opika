import { CityIdSchema, citySlugOf, NO_FILTERS } from "@opika/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CitySlugsById } from "../gallery/filter-url";
import { mockAppRouter, WithMockRouter } from "../gallery/test-router";
import { DeckScreen } from "./DeckScreen";
import { generateMockCards } from "./mock-data";

const useFeedDeckMock = vi.fn();

vi.mock("./use-feed-deck", () => ({
  useFeedDeck: (...args: unknown[]) => useFeedDeckMock(...args),
}));

/**
 * Default for every test below: the real `REGISTRY_HAS_NO_REAL_SHELTERS` is
 * `true` on production today (Phase D), which would make the filters/position
 * assertions in this file fail against the D-2 demo banner they never meant
 * to exercise. Mocked `false` here so this file's existing tests keep
 * covering the header's real (non-demo) behaviour; the demo-banner
 * describe block below overrides it per-test via `vi.doMock` + a dynamic
 * re-import, the same pattern `seo-flags.test.ts` uses.
 */
vi.mock("../../seo-flags", async (importOriginal) => ({
  ...(await importOriginal()),
  REGISTRY_HAS_NO_REAL_SHELTERS: false,
}));

const FROM_GALLERY_KEY = "opika:deck-entered-from-gallery";
const CITY_SLUGS: CitySlugsById = new Map();

/**
 * `useFeedDeck` is mocked here — its own real fetch/cursor/error behaviour
 * is `use-feed-deck.test.tsx`'s job. This file is about what `DeckScreen`
 * itself owns: the header (position, progress, inherited-filters phrase)
 * and the exit control (button, Esc, and which of `router.back()` vs a
 * fresh gallery link it picks).
 */
describe("DeckScreen", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useFeedDeckMock.mockReset();
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
    });
  });

  it("renders the filters phrase and the position/progress, position 1-indexed", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 5,
    });

    render(
      <WithMockRouter>
        <DeckScreen
          filters={NO_FILTERS}
          total={34}
          filtersLabel="Бровари · собаки"
          citySlugs={CITY_SLUGS}
        />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-filters-label").textContent).toBe("Бровари · собаки");
    // shownCount 5 means 5 cards already swiped past — the 6th is on screen.
    expect(screen.getByTestId("deck-position").textContent).toBe("6 з 34");
  });

  /**
   * R5: once the starting fetch counted against a session, its
   * `reachableCount` is the total — not the gallery's, which has no
   * seen-set exclusion. Position and progress bar share the one total
   * (`DeckScreen.tsx`'s `effectiveTotal`), so both are asserted.
   */
  it("numbers against the feed's own reachableCount, not the gallery's total", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 5,
      reachableCount: 20,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-position").textContent).toBe("6 з 20");
    // Position 6 of 20 — a literal, not the component's own formula.
    const fill = screen.getByTestId("deck-progress-bar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("30%");
  });

  /**
   * No session at the starting fetch means nothing was excluded, so the
   * gallery's total is the honest snapshot — and stays shown after swipes,
   * which R1 used to suppress from the very first one.
   */
  it("falls back to the gallery's total when the starting fetch had no session, and keeps it", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 5,
      reachableCount: null,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-position").textContent).toBe("6 з 34");
    expect(screen.getByTestId("deck-progress-bar")).toBeTruthy();
  });

  it("numbers against reachableCount even when the deck was entered with no gallery total", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
      reachableCount: 12,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-position").textContent).toBe("1 з 12");
  });

  /**
   * The count and the page are separate statements, so a race can report 0
   * with a card on screen. «0 з 0» and a NaN-width bar are worse than no
   * number at all.
   */
  it("shows no position, and announces nothing, for a total of 0 with a card on screen", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
      reachableCount: 0,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.queryByTestId("deck-position")).toBeNull();
    expect(screen.queryByTestId("deck-progress-bar")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("shows neither the filters phrase nor a position when given nothing to say", () => {
    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.queryByTestId("deck-filters-label")).toBeNull();
    expect(screen.queryByTestId("deck-position")).toBeNull();
  });

  it("hides the position once the deck errors — there's no card to number", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "error", reason: "loadFailed" },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 2,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.queryByTestId("deck-position")).toBeNull();
  });

  it("hides the position while loading — no fetch has resolved yet to confirm a first card exists", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "loading" },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.queryByTestId("deck-position")).toBeNull();
  });

  it("hides the position once exhausted — numbering a card past the last one is a real off-by-one, not shown", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "exhausted", seenCount: 3 },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 3,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.queryByTestId("deck-position")).toBeNull();
  });

  it("announces entering the deck at position 1, and the announcement never changes as the user swipes", () => {
    const { rerender } = render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.getByRole("status").textContent).toBe("Режим по одній. Тварина 1 з 34.");

    // A later render with a higher shownCount (as if the user had swiped
    // several cards) must not re-announce — docs/design/README.md's
    // announcement is about *entering* the deck, not a running commentary,
    // and a live region whose text keeps changing re-announces on every
    // change (aria-live's own contract), talking over SwipeDeck's own
    // focus/DOM changes on commit.
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 5,
    });
    rerender(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.getByRole("status").textContent).toBe("Режим по одній. Тварина 1 з 34.");
  });

  it("announces nothing when there's no total to announce", () => {
    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    // The region exists (empty) so a later announcement would be heard; it
    // must not carry a number-less variant of the sentence.
    expect(screen.getByRole("status").textContent).toBe("");
  });

  /**
   * R5: the announcement used to be written at mount from the gallery's
   * total — before any fetch — and promised a returning visitor a number
   * their seen-set had already made unreachable. It now waits for the
   * first "ready" and uses the same total as the header.
   */
  it("announces the feed's own reachableCount, not the gallery's total", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
      reachableCount: 20,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(screen.getByRole("status").textContent).toBe("Режим по одній. Тварина 1 з 20.");
  });

  it("waits for the first card before announcing, then announces once", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "loading" },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
      reachableCount: null,
    });
    // A fresh element each time: re-rendering the identical element object
    // lets React skip the update entirely, which would prove nothing.
    const view = () => (
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>
    );
    const { rerender } = render(view());
    expect(screen.getByRole("status").textContent, "nothing to announce while loading").toBe("");

    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
      reachableCount: 20,
    });
    rerender(view());
    expect(screen.getByRole("status").textContent).toBe("Режим по одній. Тварина 1 з 20.");

    // A later feed (a retry) with a different total must not re-announce.
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
      reachableCount: 19,
    });
    rerender(view());
    expect(screen.getByRole("status").textContent).toBe("Режим по одній. Тварина 1 з 20.");
  });

  it("clicking back-to-list calls router.back() when the gallery entry marker is present", () => {
    sessionStorage.setItem(FROM_GALLERY_KEY, "1");
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByTestId("deck-back-to-list"));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("clears the marker after reading it — a second mount doesn't get a free pass", () => {
    sessionStorage.setItem(FROM_GALLERY_KEY, "1");

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    expect(sessionStorage.getItem(FROM_GALLERY_KEY)).toBeNull();
  });

  it("without the marker, exits to a freshly-built gallery link rather than guessing history", () => {
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByTestId("deck-back-to-list"));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/tvaryny");
  });

  /**
   * The bare-`NO_FILTERS` case above passes even if `citySlugs` were wired
   * up wrong (an empty or garbage map produces the same "/tvaryny" either
   * way, since there is no city to translate) — this is the case that
   * actually exercises the threading: a real city filter, a real map,
   * asserted against the real slug, not just "some string came back."
   */
  it("without the marker, a real city filter carries its real slug into the exit link", () => {
    const BROVARY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const filters = {
      ...NO_FILTERS,
      cities: { kind: "oneOf" as const, values: [BROVARY] as const },
    };
    const citySlugs = new Map([[BROVARY, citySlugOf("Brovary")]]);
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={filters} total={null} filtersLabel={null} citySlugs={citySlugs} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByTestId("deck-back-to-list"));

    // Literal, not `citySlugOf("Brovary")` — `citySlugs` above is built from
    // the same call, so comparing against it again would pass even if
    // citySlugOf itself were broken, as long as it were broken consistently.
    expect(router.push).toHaveBeenCalledWith("/tvaryny?misto=brovary");
  });

  it("Escape triggers the same exit as the back-to-list button", () => {
    sessionStorage.setItem(FROM_GALLERY_KEY, "1");
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("a non-Escape key does nothing", () => {
    sessionStorage.setItem(FROM_GALLERY_KEY, "1");
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} citySlugs={CITY_SLUGS} />
      </WithMockRouter>,
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

/**
 * D-1/D-2 (Oleksii, Phase D decisions): exercises the branch the top-level
 * `vi.mock` above hides from every other test in this file —
 * `REGISTRY_HAS_NO_REAL_SHELTERS: true`, which is the real, live value on
 * production today. `vi.doMock` + `vi.resetModules` + a dynamic re-import of
 * `DeckScreen`, not the statically-imported one, because the static import
 * already bound to the file-level mock's `false`. `uk.demo.deckLabel`
 * ("Демо") is real Ukrainian, landed 2026-09-06 — no i18n mocking needed to
 * exercise this branch.
 */
describe("DeckScreen — demo banner (REGISTRY_HAS_NO_REAL_SHELTERS)", () => {
  beforeEach(() => {
    vi.resetModules();
    useFeedDeckMock.mockReset();
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 5,
    });
  });

  afterEach(() => {
    vi.doUnmock("../../seo-flags");
  });

  it("shows the demo banner, keeping the position but hiding the progress bar", async () => {
    vi.doMock("../../seo-flags", async (importOriginal) => ({
      ...(await importOriginal()),
      REGISTRY_HAS_NO_REAL_SHELTERS: true,
    }));
    const { DeckScreen: DeckScreenDemo } = await import("./DeckScreen");

    render(
      <WithMockRouter>
        <DeckScreenDemo
          filters={NO_FILTERS}
          total={34}
          filtersLabel="Бровари · собаки"
          citySlugs={CITY_SLUGS}
        />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-demo-banner").textContent).toBe("Демо");
    expect(screen.queryByTestId("deck-filters-label")).toBeNull();
    // Kept per Oleksii's Phase D decision: demo mode is the whole testing
    // period, so a deck missing the position count for weeks is not the
    // deck being tested.
    expect(screen.getByTestId("deck-position").textContent).toBe("6 з 34");
    // Degrades instead of the count (Oleksii, D-1): the bar only duplicates
    // what the count already says, and giving up its width is what lets a
    // short demo label fit at 320px. jsdom doesn't apply real CSS, so this
    // asserts the Tailwind toggle class directly rather than computed
    // visibility — the harness (`discovery-layout.harness.ts`) is what
    // proves this actually renders hidden in a real browser. Split on
    // whitespace, not a substring check — `overflow-hidden` already
    // contains "hidden".
    const barClasses = screen.getByTestId("deck-progress-bar").className.split(/\s+/);
    expect(barClasses).toContain("hidden");
    expect(barClasses).not.toContain("block");
  });

  it("shows the real filters phrase, position, and progress bar once the flag is false, same DeckScreen module", async () => {
    vi.doMock("../../seo-flags", async (importOriginal) => ({
      ...(await importOriginal()),
      REGISTRY_HAS_NO_REAL_SHELTERS: false,
    }));
    const { DeckScreen: DeckScreenReal } = await import("./DeckScreen");

    render(
      <WithMockRouter>
        <DeckScreenReal
          filters={NO_FILTERS}
          total={34}
          filtersLabel="Бровари · собаки"
          citySlugs={CITY_SLUGS}
        />
      </WithMockRouter>,
    );

    expect(screen.queryByTestId("deck-demo-banner")).toBeNull();
    expect(screen.getByTestId("deck-filters-label").textContent).toBe("Бровари · собаки");
    expect(screen.getByTestId("deck-position").textContent).toBe("6 з 34");
    const barClasses = screen.getByTestId("deck-progress-bar").className.split(/\s+/);
    expect(barClasses).toContain("block");
    expect(barClasses).not.toContain("hidden");
  });
});
