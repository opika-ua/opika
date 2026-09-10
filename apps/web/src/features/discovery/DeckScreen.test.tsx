import type { ContactRevealView } from "@opika/contracts";
import {
  type AnimalIdSchema,
  CityIdSchema,
  NO_FILTERS,
  RevealIdSchema,
  ShelterIdSchema,
} from "@opika/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockAppRouter, WithMockRouter } from "../gallery/test-router";
import { DeckScreen } from "./DeckScreen";
import { generateMockCards } from "./mock-data";

const useFeedDeckMock = vi.fn();

vi.mock("./use-feed-deck", () => ({
  useFeedDeck: (...args: unknown[]) => useFeedDeckMock(...args),
}));

/**
 * Gesture parity (Oleksii, 2026-09-10): a right commit now opens the real
 * reveal, the same `revealBrowserClient` `RevealFlow.test.tsx` mocks —
 * `use-reveal-flow.ts` is the shared consumer both files' components
 * import through.
 */
const revealBootstrap = vi.fn();
const revealCall = vi.fn();

vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: {
    session: { bootstrap: (...args: unknown[]) => revealBootstrap(...args) },
    animals: { reveal: (...args: unknown[]) => revealCall(...args) },
  },
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

  /**
   * Oleksii's resolution to R1's STOP (`docs/build-plan.md`, Phase R,
   * 2026-09-09): `total` comes from the gallery's unfiltered count, which
   * has no seen-set exclusion — once this device has a non-empty seen-set,
   * the deck itself may not be able to reach `total` cards, and «6 з 34»
   * would be a number the deck can't honour. The progress bar shares the
   * same gate (`DeckScreen.tsx`'s single `showPosition` condition covers
   * both), asserted here via its own testid rather than assumed.
   */
  it("hides the position AND the progress bar once the seen-set is non-empty", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 5,
      hasActiveSeenSet: true,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel="Бровари · собаки" />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-filters-label").textContent).toBe("Бровари · собаки");
    expect(screen.queryByTestId("deck-position")).toBeNull();
    expect(screen.queryByTestId("deck-progress-bar")).toBeNull();
  });

  it("keeps showing the position for a first-time visitor with an empty seen-set", () => {
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards: generateMockCards(1) },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 5,
      hasActiveSeenSet: false,
    });

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={34} filtersLabel="Бровари · собаки" />
      </WithMockRouter>,
    );

    expect(screen.getByTestId("deck-position").textContent).toBe("6 з 34");
    expect(screen.getByTestId("deck-progress-bar")).toBeTruthy();
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

/**
 * Gesture parity (Oleksii, 2026-09-10): a right commit — the «Написати»
 * button and a right-drag already shared one `handleCommit("right")` call
 * before this existed — now opens the real reveal, the same dialog
 * `RevealFlow.test.tsx` covers on the detail page. `SwipeDeck` here is the
 * real component (only `useFeedDeck` is mocked), so clicking its own
 * «Написати» button is what actually exercises `SwipeDeck`'s `onReveal`
 * prop end to end.
 */
describe("DeckScreen — gesture parity reveal", () => {
  const REVEAL_ID = RevealIdSchema.parse("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff");
  const SHELTER_ID = ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa");
  const CITY_ID = CityIdSchema.parse("12121212-3434-4565-8787-909090909090");

  function revealFor(animalId: ReturnType<typeof AnimalIdSchema.parse>): ContactRevealView {
    return {
      id: REVEAL_ID,
      animalId,
      revealedAt: new Date("2026-08-08T10:00:00Z"),
      shelterSnapshot: {
        shelterId: SHELTER_ID,
        displayName: "Притулок «Домівка»",
        contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
        exactAddress: {
          line1: "вул. Незалежності, 12",
          line2: null,
          postalCode: null,
          cityId: CITY_ID,
          district: null,
          coordinates: { lat: 50.5111, lng: 30.7903 },
        },
        publicLocation: { precision: "city", cityId: CITY_ID, district: null },
        verificationStatusAtReveal: "verified",
        donation: null,
      },
      animalSnapshot: { name: "Мурчик", primaryPhoto: null },
    };
  }

  beforeEach(() => {
    revealBootstrap.mockReset();
    revealCall.mockReset();
    revealBootstrap.mockResolvedValue({});
    const cards = generateMockCards(1);
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards },
      onSwipe: vi.fn(),
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
    });
    revealCall.mockResolvedValue(revealFor(cards[0]!.id));
  });

  it("clicking «Написати» opens the real reveal dialog for the top card, and the deck still advances", async () => {
    const onSwipe = vi.fn();
    const cards = generateMockCards(1);
    useFeedDeckMock.mockReturnValue({
      state: { kind: "ready", cards },
      onSwipe,
      onPrefetch: vi.fn(),
      onRetry: vi.fn(),
      shownCount: 0,
    });
    revealCall.mockResolvedValue(revealFor(cards[0]!.id));

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Написати" }));

    // onSwipe (the deck's own advance, unchanged from R1) fires the same
    // tick as the reveal — gesture parity adds a dialog, it doesn't gate
    // the deck's own advance on the reveal resolving.
    expect(onSwipe).toHaveBeenCalledWith(cards[0]!.id, "right");

    await screen.findByTestId("reveal-dialog");
    expect(revealCall).toHaveBeenCalledWith({ animalId: cards[0]!.id });
    expect(screen.getByTestId("reveal-contact-row").textContent).toBe("+380671234567");
    // The dialog's own copy names the card that was actually committed,
    // not whatever `state.cards[0]` is by the time the dialog renders.
    expect(screen.getByText("Ви запитали про Мурчик.")).toBeTruthy();
  });

  it("does not show the detail page's 'back to gallery' link — no accurate copy exists for the deck yet", async () => {
    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Написати" }));
    await screen.findByTestId("reveal-dialog");

    expect(screen.queryByTestId("reveal-back-to-gallery")).toBeNull();
  });

  it("Escape closes the reveal dialog without also exiting the deck", async () => {
    const router = mockAppRouter();
    sessionStorage.setItem(FROM_GALLERY_KEY, "1");

    render(
      <WithMockRouter router={router}>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Написати" }));
    await screen.findByTestId("reveal-dialog");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByTestId("reveal-dialog")).toBeNull());
    // The design's own keyboard table: Esc closes the topmost thing first.
    // Exiting the deck out from under an open dialog would be the second,
    // unwanted Esc this same keypress must not also trigger.
    expect(router.back).not.toHaveBeenCalled();
  });

  it("closing the dialog returns focus to the back-to-list button, not nowhere", async () => {
    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Написати" }));
    await screen.findByTestId("reveal-dialog");

    fireEvent.click(screen.getByTestId("reveal-close"));

    await waitFor(() => expect(screen.queryByTestId("reveal-dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId("deck-back-to-list"));
  });

  it("shows the real error dialog — including the reveal rate limit — the same as the detail page", async () => {
    revealCall.mockRejectedValue(new Error("RATE_LIMITED"));

    render(
      <WithMockRouter>
        <DeckScreen filters={NO_FILTERS} total={null} filtersLabel={null} />
      </WithMockRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Написати" }));
    await screen.findByTestId("reveal-dialog");

    expect(screen.getByRole("dialog", { name: "Щось не спрацювало на нашому боці." })).toBeTruthy();
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
        <DeckScreenDemo filters={NO_FILTERS} total={34} filtersLabel="Бровари · собаки" />
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
        <DeckScreenReal filters={NO_FILTERS} total={34} filtersLabel="Бровари · собаки" />
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
