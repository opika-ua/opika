import type { ContactRevealView } from "@opika/contracts";
import {
  type AnimalId,
  type CityId,
  CityIdSchema,
  RevealIdSchema,
  type ShelterContact,
  ShelterIdSchema,
} from "@opika/domain";
import { uk } from "@opika/i18n";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateMockCards } from "./mock-data";
import { type CommitDirection, type DeckState, SwipeDeck } from "./SwipeDeck";

/**
 * The deck's action row is the only way through the feed for anyone who cannot
 * perform a drag — a keyboard user, a switch user, anyone on a device where
 * the pointer gesture misbehaves. That makes "reachable by keyboard" a
 * correctness property, not a nicety.
 */

/**
 * `SwipeDeck`'s own reveal (`useReveal`) requires a real `ensureSession`
 * prop — no default, on purpose, since R3's own STOP finding was two
 * independent session-bootstrap calls racing each other. Every render
 * site below passes this same resolved-true stub; the tests about the
 * reveal's own bootstrap ordering mock `revealBrowserClient` directly
 * instead (see below) and don't depend on what this stub does.
 */
const ENSURE_SESSION = () => Promise.resolve(true);

/**
 * Same mocking approach as `RevealFlow.test.tsx`: the client is mocked at
 * the module boundary, so what's under test is this component's own call
 * order and rendering, not the RPC transport.
 */
const revealCallOrder: string[] = [];
const revealBootstrap = vi.fn();
const revealCall = vi.fn();

vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: {
    session: {
      bootstrap: (...args: unknown[]) => {
        revealCallOrder.push("session.bootstrap");
        return revealBootstrap(...args);
      },
    },
    animals: {
      reveal: (...args: unknown[]) => {
        revealCallOrder.push("animals.reveal");
        return revealCall(...args);
      },
    },
  },
}));

/**
 * Wraps the real `useSwipeGesture` (not a stand-in — `onDrag`/`cardRef`/
 * `onSnapBack`/`onCommit` all keep behaving exactly as they do outside
 * tests) purely to capture the `canCommit` predicate `SwipeDeck` passes in.
 *
 * `canCommit`, not `onCommit`: the re-entrancy guard for a right-drag while
 * a reveal is already loading lives in `canCommit`, checked by the real
 * hook *before* any exit animation starts — never inside `handleCommit`
 * (`onCommit`) itself, which by construction only ever runs after a real
 * drag's exit animation has already finished. A review caught that the
 * inverse — guarding inside `onCommit` and calling `setDx(0)` — cannot
 * actually undo anything: the exit animation writes the off-screen
 * `transform` straight to the DOM node, a write `dx` never controlled to
 * begin with, so a card blocked that way stayed stuck off-screen forever.
 * `use-swipe-gesture.test.tsx` proves the hook itself takes the spring-back
 * path when `canCommit` refuses a commit; this file's own job is narrower —
 * proving `SwipeDeck` wires `canCommit` to `revealState.kind`, the one thing
 * that test, driven by a bare harness with no reveal state at all, cannot
 * reach.
 */
let capturedCanCommit: ((direction: CommitDirection) => boolean) | null = null;

vi.mock("./use-swipe-gesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-swipe-gesture")>();
  return {
    ...actual,
    useSwipeGesture: (callbacks: Parameters<typeof actual.useSwipeGesture>[0]) => {
      capturedCanCommit = callbacks.canCommit ?? null;
      return actual.useSwipeGesture(callbacks);
    },
  };
});

const SHELTER_ID = ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa");
const REVEAL_ID = RevealIdSchema.parse("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff");
const CITY_ID = CityIdSchema.parse("12121212-3434-4565-8787-909090909090");

function revealFor(animalId: AnimalId, contact: ShelterContact): ContactRevealView {
  return {
    id: REVEAL_ID,
    animalId,
    revealedAt: new Date("2026-08-08T10:00:00Z"),
    shelterSnapshot: {
      shelterId: SHELTER_ID,
      displayName: "Притулок «Домівка»",
      contact,
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
  revealCallOrder.length = 0;
  revealBootstrap.mockReset();
  revealCall.mockReset();
  revealBootstrap.mockResolvedValue({});
});

function renderDeck(overrides: { onSwipe?: (id: AnimalId, dir: CommitDirection) => void } = {}) {
  const onSwipe = overrides.onSwipe ?? vi.fn();
  const onPrefetch = vi.fn();
  render(
    <SwipeDeck
      ensureSession={ENSURE_SESSION}
      state={{ kind: "ready", cards: generateMockCards(5) }}
      onSwipe={onSwipe}
      onPrefetch={onPrefetch}
    />,
  );
  return { onSwipe, onPrefetch };
}

describe("SwipeDeck action row", () => {
  it("renders exactly two actions — R2 dropped the third «Далі» button", () => {
    renderDeck();

    const actionRow = within(screen.getByTestId("action-row"));
    expect(actionRow.getByRole("button", { name: uk.actions.notNow })).toBeTruthy();
    expect(actionRow.getByRole("button", { name: uk.actions.write })).toBeTruthy();
    expect(actionRow.getAllByRole("button")).toHaveLength(2);
  });

  it("shows the not-a-judgement notice below the action row", () => {
    renderDeck();

    const notice = screen.getByTestId("not-a-judgement-notice");
    expect(notice.textContent).toBe("«Не зараз» — це просто фільтр, а не оцінка тварини.");

    // Real pixel placement is the harness's job (jsdom doesn't lay out);
    // DOM order is what this test can actually check, and it's what
    // "below" means for a `flex flex-col` sibling with no explicit order.
    const actionRow = screen.getByTestId("action-row");
    expect(actionRow.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("reaches every action by tabbing, in the order they are read", async () => {
    const user = userEvent.setup();
    renderDeck();

    const expectedOrder = [uk.actions.notNow, uk.actions.write];
    const reached: string[] = [];

    for (let i = 0; i < expectedOrder.length; i++) {
      await user.tab();
      const active = document.activeElement;
      expect(active, `nothing focused after ${i + 1} tab(s)`).not.toBe(document.body);
      reached.push(active?.textContent ?? "");
    }

    expect(reached).toEqual(expectedOrder);
  });

  /**
   * Focus is not enough — a focusable element that ignores Enter is a dead end.
   * These assert the swipe actually fires, and in the right direction, since
   * "Написати" and "Не зараз" mean opposite things to the adopter.
   */
  it("commits a pass when the focused 'Не зараз' button is activated by Enter", async () => {
    const user = userEvent.setup();
    const onSwipe = vi.fn();
    renderDeck({ onSwipe });

    await user.tab();
    expect(document.activeElement?.textContent).toBe(uk.actions.notNow);
    await user.keyboard("{Enter}");

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0]?.[1]).toBe("left");
  });

  it("commits an interest when 'Написати' is activated by Space", async () => {
    const user = userEvent.setup();
    const onSwipe = vi.fn();
    renderDeck({ onSwipe });

    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe(uk.actions.write);
    await user.keyboard(" ");

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0]?.[1]).toBe("right");
  });
});

/**
 * R3 (Phase R, `docs/build-plan.md`): «Написати» both records the swipe
 * (unchanged from R1 — `onSwipe` still fires) and opens the same reveal
 * dialog the detail page uses. No `secondaryAction`: the deck's own
 * requirement is "no exit back to the gallery," so unlike the detail
 * page's dialog there is no `reveal-back-to-gallery` link here at all.
 */
describe("SwipeDeck reveal", () => {
  function renderDeckForReveal() {
    const cards = generateMockCards(5);
    const onSwipe = vi.fn();
    const onPrefetch = vi.fn();
    render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "ready", cards }}
        onSwipe={onSwipe}
        onPrefetch={onPrefetch}
      />,
    );
    return { cards, onSwipe, onPrefetch };
  }

  it("opens the reveal dialog for the top card when «Написати» is clicked, and still records the swipe", async () => {
    const { cards, onSwipe } = renderDeckForReveal();
    const topCard = cards[0];
    if (!topCard) throw new Error("generateMockCards(5) must return at least one card");
    revealCall.mockResolvedValue(
      revealFor(topCard.id, { primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );

    fireEvent.click(screen.getByRole("button", { name: uk.actions.write }));
    await screen.findByTestId("reveal-dialog");

    // The deck's own `ensureSession` (here, `ENSURE_SESSION`) is what gates
    // the reveal, NOT a second, independent `revealBrowserClient.session
    // .bootstrap` call — caught on review: two concurrent, cookie-less
    // bootstrap calls (one from `use-feed-deck.ts`'s own swipe-recording,
    // one from an earlier version of the deck's reveal) couldn't tell the
    // server they were the same visitor and minted two adopters. Asserting
    // `revealBootstrap` was never called is what actually proves the
    // shared path is used, not just that a reveal happened.
    expect(revealBootstrap).not.toHaveBeenCalled();
    expect(revealCallOrder).toEqual(["animals.reveal"]);
    expect(revealCall).toHaveBeenCalledWith({ animalId: topCard.id });
    expect(screen.getByText(`Ви запитали про ${topCard.name}.`)).toBeTruthy();

    // R1's own recording is unchanged — R3 adds the reveal on top of it,
    // not instead of it.
    expect(onSwipe).toHaveBeenCalledWith(topCard.id, "right");
  });

  it("does not open a reveal for «Не зараз»", async () => {
    renderDeckForReveal();

    fireEvent.click(screen.getByRole("button", { name: uk.actions.notNow }));
    await new Promise((r) => setTimeout(r, 0));

    expect(revealCallOrder).toEqual([]);
    expect(screen.queryByTestId("reveal-dialog")).toBeNull();
  });

  it("has no secondary 'back to gallery' link — the deck's own requirement is no exit at all", async () => {
    const { cards } = renderDeckForReveal();
    const topCard = cards[0];
    if (!topCard) throw new Error("generateMockCards(5) must return at least one card");
    revealCall.mockResolvedValue(
      revealFor(topCard.id, { primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );

    fireEvent.click(screen.getByRole("button", { name: uk.actions.write }));
    await screen.findByTestId("reveal-dialog");

    expect(screen.queryByTestId("reveal-back-to-gallery")).toBeNull();
  });

  it("Escape closes the dialog without affecting the deck's own state, and returns focus to «Написати»", async () => {
    const { cards, onSwipe } = renderDeckForReveal();
    const topCard = cards[0];
    if (!topCard) throw new Error("generateMockCards(5) must return at least one card");
    revealCall.mockResolvedValue(
      revealFor(topCard.id, { primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );

    const writeButton = screen.getByRole("button", { name: uk.actions.write });
    fireEvent.click(writeButton);
    await screen.findByTestId("reveal-dialog");

    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByTestId("reveal-dialog")).toBeNull();
    // The deck itself already advanced past the first card the instant
    // «Написати» committed — closing the dialog is purely a dialog-local
    // change, never a second effect on deck state.
    expect(onSwipe).toHaveBeenCalledTimes(1);
    // Caught on review: closing used to leave focus nowhere in particular
    // (a keyboard user's next Tab would restart from the header) — the
    // detail page's own `RevealFlow` already returns focus to its
    // trigger on close, and the deck's reveal was missing the same
    // contract until this fix.
    expect(document.activeElement).toBe(writeButton);
  });

  it("keeps the reveal dialog open even once the swipe that opened it exhausts the deck", async () => {
    const onSwipe = vi.fn();
    const [only] = generateMockCards(1);
    if (!only) throw new Error("generateMockCards(1) must return one card");
    revealCall.mockResolvedValue(
      revealFor(only.id, { primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );

    const { rerender } = render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "ready", cards: [only] }}
        onSwipe={onSwipe}
        onPrefetch={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: uk.actions.write }));
    await screen.findByTestId("reveal-dialog");

    // What `use-feed-deck.ts`'s own `onSwipe` does next in the real app —
    // the last card commits, the deck state moves to "exhausted". The
    // dialog is rendered as a sibling of the deck's own content, not
    // nested inside the "ready" branch, specifically so this rerender
    // does not unmount it mid-reveal.
    rerender(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "exhausted", seenCount: 1 }}
        onSwipe={onSwipe}
        onPrefetch={vi.fn()}
      />,
    );

    expect(screen.getByTestId("reveal-dialog")).toBeTruthy();
  });

  /**
   * Caught on review: with no guard, a second «Написати» press (or an
   * equivalent right-drag) while the first reveal is still in flight
   * could spend a second reveal on a slower network, and a stale first
   * response landing after a faster second one would overwrite it —
   * `useReveal.ts`'s own generation guard closes the data half of that;
   * disabling the button while loading closes the "why would anyone
   * press it twice" half, matching `RevealFlow.tsx`'s own trigger.
   */
  it("disables «Написати» while a reveal is in flight, and re-enables it once it resolves", async () => {
    const { cards } = renderDeckForReveal();
    const topCard = cards[0];
    if (!topCard) throw new Error("generateMockCards(5) must return at least one card");
    let resolveReveal: (value: ContactRevealView) => void = () => {};
    revealCall.mockReturnValue(
      new Promise<ContactRevealView>((resolve) => {
        resolveReveal = resolve;
      }),
    );

    const writeButton = screen.getByRole("button", { name: uk.actions.write }) as HTMLButtonElement;
    fireEvent.click(writeButton);

    await new Promise((r) => setTimeout(r, 0));
    expect(writeButton.disabled).toBe(true);

    resolveReveal(
      revealFor(topCard.id, { primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    await screen.findByTestId("reveal-dialog");

    expect(writeButton.disabled).toBe(false);
  });

  /**
   * Gesture parity (Oleksii, 2026-09-12, in direct answer to "should
   * dragging a card to the right do exactly what «Написати» does, including
   * spending one unit of the reveal budget": yes) means a right-drag while
   * a reveal is already in flight needs the identical outcome the button's
   * own `disabled` prop gives it. The test above proves the button half (a
   * disabled button never reaches `handleCommit` at all); this proves
   * `SwipeDeck` wires the drag half — `canCommit` — to the same
   * `revealState.kind`, the one thing `use-swipe-gesture.test.tsx`'s own
   * `canCommit` coverage cannot reach, since that file's harness carries no
   * reveal state of its own. Reading `capturedCanCommit`'s return value
   * directly, rather than simulating a drag and asserting on `onSwipe`/
   * `revealCall` call counts, tests the actual predicate the real hook
   * consults before ever starting an exit animation — not a side effect one
   * step removed from it.
   */
  it("canCommit refuses a right-drag while a reveal is already in flight, allows it once resolved", async () => {
    const { cards } = renderDeckForReveal();
    const topCard = cards[0];
    if (!topCard) throw new Error("generateMockCards(5) must return at least one card");
    let resolveReveal: (value: ContactRevealView) => void = () => {};
    revealCall.mockReturnValue(
      new Promise<ContactRevealView>((resolve) => {
        resolveReveal = resolve;
      }),
    );

    expect(capturedCanCommit, "SwipeDeck must have called useSwipeGesture by now").not.toBeNull();
    expect(capturedCanCommit?.("right"), "no reveal is loading yet").toBe(true);

    const writeButton = screen.getByRole("button", { name: uk.actions.write }) as HTMLButtonElement;
    fireEvent.click(writeButton);
    await new Promise((r) => setTimeout(r, 0));
    expect(writeButton.disabled, "the commit should already be loading").toBe(true);

    // A right-drag on the next card, while this reveal is still in flight,
    // must be refused — matching what the disabled button itself blocks.
    expect(capturedCanCommit?.("right"), "a reveal is loading").toBe(false);
    // «Не зараз» (skip) was never part of this decision and stays unaffected.
    expect(capturedCanCommit?.("left"), "skip is never gated by a reveal").toBe(true);

    resolveReveal(
      revealFor(topCard.id, { primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );
    await screen.findByTestId("reveal-dialog");
    expect(writeButton.disabled).toBe(false);
    expect(capturedCanCommit?.("right"), "the reveal has resolved").toBe(true);
  });

  /**
   * R3's own STOP finding: an earlier version of this row passed
   * `cityName: null` unconditionally, on the stated (and false) premise
   * that no city lookup existed anywhere in the deck. `cardCityId`
   * (`../gallery/card-text.ts`, already used by the gallery's own cards)
   * plus a real `cityNames` map is what the gallery already does; this
   * pins that the deck does too.
   */
  it("names the swiped animal's real city in the reveal, when the lookup has one", async () => {
    const cards = generateMockCards(5);
    const topCard = cards[0];
    if (!topCard) throw new Error("generateMockCards(5) must return at least one card");
    revealCall.mockResolvedValue(
      revealFor(topCard.id, { primary: { kind: "phone", e164: "+380671234567" }, additional: [] }),
    );

    render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "ready", cards }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        cityNames={{ ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CityId]: "Бровари" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: uk.actions.write }));
    await screen.findByTestId("reveal-dialog");

    expect(screen.getByText(/Бровари/)).toBeTruthy();
  });
});

/**
 * docs/design/README.md, "Gallery → deck": "Focus lands on the top card."
 * Once, on entering the deck — not re-stolen on every swipe, which would
 * fight a screen-reader user already reading the action row they just
 * activated (same "once, not per swipe" reasoning as `DeckScreen`'s own
 * entry announcement).
 */
describe("SwipeDeck entry focus", () => {
  it("focuses the top card once the deck is ready", () => {
    const [first] = generateMockCards(3);
    render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "ready", cards: generateMockCards(3) }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
      />,
    );

    expect(document.activeElement?.getAttribute("aria-label")).toBe(first?.name);
  });

  it("does not steal focus back to the card on a later swipe", async () => {
    const cards = generateMockCards(3);
    const { rerender } = render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "ready", cards }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
      />,
    );

    // Move focus deliberately, as a keyboard user would after the entry
    // focus lands — to the "Не зараз" button, the deck's own real
    // keyboard path.
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement?.textContent).toBe(uk.actions.notNow);

    const afterSwipe: DeckState = { kind: "ready", cards: cards.slice(1) };
    rerender(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={afterSwipe}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
      />,
    );

    expect(document.activeElement?.textContent).toBe(uk.actions.notNow);
  });

  /**
   * The path `state.kind`'s own dependency array doesn't skip: ready →
   * error → loading → ready (a retry) genuinely changes `state.kind` at
   * every step, so this effect re-fires on the final transition back to
   * "ready" the same way it does on first entry. Deliberate, not an
   * oversight — when the error card unmounts, its own focused heading
   * goes with it, and leaving focus on `<body>` after a successful retry
   * would be worse than moving it again.
   */
  it("re-focuses the top card after a successful retry, the same as on first entry", () => {
    const cards = generateMockCards(2);
    const { rerender } = render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "error", reason: "loadFailed" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    rerender(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "loading" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
      />,
    );
    rerender(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "ready", cards }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
      />,
    );

    expect(document.activeElement?.getAttribute("aria-label")).toBe(cards[0]?.name);
  });
});

/**
 * `ErrorState`'s three-way switch over `DeckErrorReason` — untested before
 * this, per a real reviewer finding on the branch that introduced it:
 * nothing asserted that `offline`/`sessionExpired`/`loadFailed` actually
 * render their own distinct copy, rather than all silently collapsing to
 * one. Pinned against the literal Ukrainian strings, transcribed from
 * `packages/i18n/src/messages/uk.ts`, not against `uk.errors.*` itself —
 * round-2 review caught an earlier version of this file that read the copy
 * back off the same `uk.errors[reason]` constant the component renders,
 * which would pass against any value and doesn't satisfy
 * `docs/standing-constraints.md`'s "a test may not compare output against
 * the same constant the code renders" the way it claimed to.
 */
describe("SwipeDeck error state", () => {
  it("renders the offline copy, with no body line", () => {
    render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "error", reason: "offline" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("БЕЗ ЗВ'ЯЗКУ")).toBeTruthy();
    expect(screen.getByText("Зараз немає інтернету.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Спробувати ще раз" })).toBeTruthy();
  });

  it("renders the loadFailed copy, including its body line", () => {
    render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "error", reason: "loadFailed" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("НЕ ЗАВАНТАЖИЛОСЯ")).toBeTruthy();
    expect(screen.getByText("Щось не спрацювало на нашому боці.")).toBeTruthy();
    expect(screen.getByText("Це не ваша помилка і не помилка притулку.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Оновити" })).toBeTruthy();
  });

  it("renders the sessionExpired copy, with no body line", () => {
    render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "error", reason: "sessionExpired" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("СЕСІЯ ЗАВЕРШИЛАСЯ")).toBeTruthy();
    expect(screen.getByText("Ми почали стрічку заново.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "До стрічки" })).toBeTruthy();
  });

  it("calls onRetry when the error card's action button is activated", () => {
    const onRetry = vi.fn();
    render(
      <SwipeDeck
        ensureSession={ENSURE_SESSION}
        state={{ kind: "error", reason: "loadFailed" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={onRetry}
      />,
    );

    screen.getByRole("button", { name: "Оновити" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
