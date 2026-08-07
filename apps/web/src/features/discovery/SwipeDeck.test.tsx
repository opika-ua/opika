import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { generateMockCards } from "./mock-data";
import { SwipeDeck } from "./SwipeDeck";

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
