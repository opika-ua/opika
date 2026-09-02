import { NO_FILTERS } from "@opika/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAppRouter, WithMockRouter } from "../gallery/test-router";
import { DeckScreen } from "./DeckScreen";
import { generateMockCards } from "./mock-data";

const useFeedDeckMock = vi.fn();

vi.mock("./use-feed-deck", () => ({
  useFeedDeck: (...args: unknown[]) => useFeedDeckMock(...args),
}));

const FROM_GALLERY_KEY = "opika:deck-entered-from-gallery";

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
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel="Бровари · собаки" />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-filters-label").textContent).toBe("Бровари · собаки");
    // shownCount 5 means 5 cards already swiped past — the 6th is on screen.
    expect(screen.getByTestId("deck-position").textContent).toBe("6 з 34");
  });

  it("shows neither the filters phrase nor a position when given nothing to say", () => {
    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
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
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} />
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
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} />
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
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} />
      </WithMockRouter>,
    );

    expect(screen.queryByTestId("deck-position")).toBeNull();
  });

  it("announces entering the deck at position 1, and the announcement never changes as the user swipes", () => {
    const { rerender } = render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} />
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
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel={null} />
      </WithMockRouter>,
    );

    expect(screen.getByRole("status").textContent).toBe("Режим по одній. Тварина 1 з 34.");
  });

  it("renders no announcement region at all when there's no total to announce", () => {
    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clicking back-to-list calls router.back() when the gallery entry marker is present", () => {
    sessionStorage.setItem(FROM_GALLERY_KEY, "1");
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
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
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    expect(sessionStorage.getItem(FROM_GALLERY_KEY)).toBeNull();
  });

  it("without the marker, exits to a freshly-built gallery link rather than guessing history", () => {
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByTestId("deck-back-to-list"));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/tvaryny");
  });

  it("Escape triggers the same exit as the back-to-list button", () => {
    sessionStorage.setItem(FROM_GALLERY_KEY, "1");
    const router = mockAppRouter();

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
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
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
