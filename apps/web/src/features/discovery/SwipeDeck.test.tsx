import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { generateMockCards } from "./mock-data";
import { type DeckState, SwipeDeck } from "./SwipeDeck";

/**
 * The deck's action row is the only way through the feed for anyone who cannot
 * perform a drag — a keyboard user, a switch user, anyone on a device where
 * the pointer gesture misbehaves. That makes "reachable by keyboard" a
 * correctness property, not a nicety.
 */

function renderDeck(overrides: { onSwipe?: (id: string, dir: "left" | "right") => void } = {}) {
  const onSwipe = overrides.onSwipe ?? vi.fn();
  const onPrefetch = vi.fn();
  render(
    <SwipeDeck
      state={{ kind: "ready", cards: generateMockCards(5) }}
      onSwipe={onSwipe}
      onPrefetch={onPrefetch}
    />,
  );
  return { onSwipe, onPrefetch };
}

describe("SwipeDeck action row", () => {
  it("renders all three actions as buttons with their Ukrainian labels", () => {
    renderDeck();

    expect(screen.getByRole("button", { name: uk.actions.notNow })).toBeTruthy();
    expect(screen.getByRole("button", { name: uk.actions.next })).toBeTruthy();
    expect(screen.getByRole("button", { name: uk.actions.write })).toBeTruthy();
  });

  it("reaches every action by tabbing, in the order they are read", async () => {
    const user = userEvent.setup();
    renderDeck();

    const expectedOrder = [uk.actions.notNow, uk.actions.next, uk.actions.write];
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
    await user.tab();
    expect(document.activeElement?.textContent).toBe(uk.actions.write);
    await user.keyboard(" ");

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0]?.[1]).toBe("right");
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
      <SwipeDeck state={{ kind: "ready", cards }} onSwipe={vi.fn()} onPrefetch={vi.fn()} />,
    );

    // Move focus deliberately, as a keyboard user would after the entry
    // focus lands — to the "Не зараз" button, the deck's own real
    // keyboard path.
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement?.textContent).toBe(uk.actions.notNow);

    const afterSwipe: DeckState = { kind: "ready", cards: cards.slice(1) };
    rerender(<SwipeDeck state={afterSwipe} onSwipe={vi.fn()} onPrefetch={vi.fn()} />);

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
        state={{ kind: "error", reason: "loadFailed" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    rerender(<SwipeDeck state={{ kind: "loading" }} onSwipe={vi.fn()} onPrefetch={vi.fn()} />);
    rerender(<SwipeDeck state={{ kind: "ready", cards }} onSwipe={vi.fn()} onPrefetch={vi.fn()} />);

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
