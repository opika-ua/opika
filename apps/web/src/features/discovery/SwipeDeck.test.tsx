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
});

/**
 * `ErrorState`'s three-way switch over `DeckErrorReason` — untested before
 * this, per a real reviewer finding on the branch that introduced it:
 * nothing asserted that `offline`/`sessionExpired`/`loadFailed` actually
 * render their own distinct copy, rather than all silently collapsing to
 * one. Each reason has real, different i18n keys (`uk.errors.*`); pinning
 * against those directly, not the component's own constant, matches
 * `docs/standing-constraints.md`'s "a test may not compare output against
 * the same constant the code renders."
 */
describe("SwipeDeck error state", () => {
  it("renders the offline copy, with no body line — uk.errors.offline has none", () => {
    render(
      <SwipeDeck
        state={{ kind: "error", reason: "offline" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(uk.errors.offline.eyebrow)).toBeTruthy();
    expect(screen.getByText(uk.errors.offline.title)).toBeTruthy();
    expect(screen.getByRole("button", { name: uk.errors.offline.action })).toBeTruthy();
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

    expect(screen.getByText(uk.errors.loadFailed.eyebrow)).toBeTruthy();
    expect(screen.getByText(uk.errors.loadFailed.title)).toBeTruthy();
    expect(screen.getByText(uk.errors.loadFailed.body)).toBeTruthy();
    expect(screen.getByRole("button", { name: uk.errors.loadFailed.action })).toBeTruthy();
  });

  it("renders the sessionExpired copy, with no body line — uk.errors.sessionExpired has none", () => {
    render(
      <SwipeDeck
        state={{ kind: "error", reason: "sessionExpired" }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(uk.errors.sessionExpired.eyebrow)).toBeTruthy();
    expect(screen.getByText(uk.errors.sessionExpired.title)).toBeTruthy();
    expect(screen.getByRole("button", { name: uk.errors.sessionExpired.action })).toBeTruthy();
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

    screen.getByRole("button", { name: uk.errors.loadFailed.action }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
