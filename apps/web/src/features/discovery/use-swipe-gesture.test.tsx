import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMockCards } from "./mock-data";
import { SwipeDeck } from "./SwipeDeck";
import { useSwipeGesture } from "./use-swipe-gesture";

/**
 * Tests for the two gesture defects a code review dismissed as "theoretically
 * possible but practically unlikely". Both were real, both are pinned here.
 *
 * happy-dom does no layout, which is fine — neither of these is about
 * geometry. One is about listener bookkeeping, the other about a timer.
 */

/** happy-dom has no pointer capture; the hook calls it on every pointerdown. */
function stubPointerCapture(node: HTMLElement): void {
  node.setPointerCapture = vi.fn();
  node.releasePointerCapture = vi.fn();
  node.hasPointerCapture = vi.fn(() => true);
}

function pointerEvent(type: string, init: { clientX: number; button?: number }): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    button: init.button ?? 0,
    clientX: init.clientX,
  });
}

/**
 * Count pointer-listener registrations on a node from this moment on.
 *
 * Wraps the two DOM methods rather than using `vi.spyOn`, because the real
 * implementations must keep running — the point is to observe the churn, not
 * to prevent the gesture from working.
 */
function countPointerListenerChurn(node: HTMLElement): { added: number; removed: number } {
  const tally = { added: 0, removed: 0 };
  const realAdd = node.addEventListener.bind(node);
  const realRemove = node.removeEventListener.bind(node);

  node.addEventListener = ((type: string, ...rest: unknown[]) => {
    if (type.startsWith("pointer")) tally.added++;
    return (realAdd as (t: string, ...r: unknown[]) => void)(type, ...rest);
  }) as typeof node.addEventListener;

  node.removeEventListener = ((type: string, ...rest: unknown[]) => {
    if (type.startsWith("pointer")) tally.removed++;
    return (realRemove as (t: string, ...r: unknown[]) => void)(type, ...rest);
  }) as typeof node.removeEventListener;

  return tally;
}

describe("swipe gesture listener stability", () => {
  /**
   * Lost fix 4, asserted against the real deck rather than a stand-in, because
   * the defect lived in the composition: `SwipeDeck` keeps `dx` in state and
   * re-renders on every pointermove, and the callbacks object it passed to the
   * hook was a fresh literal each time. That changed the ref callback's
   * identity ~60 times a second, so React detached and re-attached all four
   * pointer listeners on every frame — during the one interaction where the
   * element must not be disturbed.
   *
   * Using the real deck also catches the other way this regresses: someone
   * wrapping `cardRef` in an inline arrow at the call site.
   */
  it("attaches its pointer listeners once and does not re-attach them mid-drag", () => {
    render(
      <SwipeDeck
        state={{ kind: "ready", cards: generateMockCards(5) }}
        onSwipe={vi.fn()}
        onPrefetch={vi.fn()}
      />,
    );

    const card = screen.getByTestId("swipe-card");
    stubPointerCapture(card);
    const churn = countPointerListenerChurn(card);

    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", { clientX: 100 }));
    });

    // 30 frames of dragging. Each one sets state and re-renders the deck.
    for (let i = 1; i <= 30; i++) {
      act(() => {
        card.dispatchEvent(pointerEvent("pointermove", { clientX: 100 + i * 2 }));
      });
    }

    // The drag must actually have driven React state, or this proves nothing.
    expect(card.style.transform, "the card should have been transformed by the drag").toContain(
      "translate3d(60px",
    );

    expect(
      churn.added,
      `pointer listeners were re-attached ${churn.added} times during a 30-frame drag`,
    ).toBe(0);
    expect(churn.removed, "pointer listeners were detached mid-drag").toBe(0);
  });
});

/**
 * A minimal card wired straight to the hook. `ref={cardRef}` with no wrapper —
 * an inline arrow here would churn on its own and mask what is being tested.
 */
function GestureHarness(props: {
  onCommit: (direction: "left" | "right") => void;
  onSnapBack?: () => void;
}) {
  const [dx, setDx] = useState(0);
  const { cardRef } = useSwipeGesture({
    onDrag: setDx,
    onCommit: props.onCommit,
    ...(props.onSnapBack ? { onSnapBack: props.onSnapBack } : {}),
  });

  return <div data-testid="card" data-dx={dx} ref={cardRef} />;
}

describe("swipe gesture commit path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountCard(props: Parameters<typeof GestureHarness>[0]): HTMLElement {
    render(<GestureHarness {...props} />);
    const card = screen.getByTestId("card");
    stubPointerCapture(card);
    return card;
  }

  function drag(card: HTMLElement, to: number): void {
    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", { clientX: 0 }));
    });
    act(() => {
      card.dispatchEvent(pointerEvent("pointermove", { clientX: to }));
    });
    act(() => {
      card.dispatchEvent(pointerEvent("pointerup", { clientX: to }));
    });
  }

  /**
   * Lost fix 5. The commit used to hang entirely off `transitionend`. That
   * event is not guaranteed: a backgrounded tab, an interrupted transition, a
   * dropped frame, and it never arrives. The card then sat off screen with the
   * deck never advancing — a permanently wedged feed, recoverable only by
   * reloading the page.
   */
  it("commits even when transitionend never fires", () => {
    const onCommit = vi.fn();
    const card = mountCard({ onCommit });

    drag(card, 150); // past the 88px commit distance

    expect(onCommit, "commit must wait for the exit animation").not.toHaveBeenCalled();

    // No transitionend is ever dispatched. Only the fallback can save this.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("right");
  });

  it("commits on transitionend without waiting for the fallback", () => {
    const onCommit = vi.fn();
    const card = mountCard({ onCommit });

    drag(card, -150);
    act(() => {
      card.dispatchEvent(new Event("transitionend"));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("left");
  });

  /** Belt and braces must not double-fire: one swipe is one swipe. */
  it("commits exactly once when both transitionend and the fallback would fire", () => {
    const onCommit = vi.fn();
    const card = mountCard({ onCommit });

    drag(card, 150);
    act(() => {
      card.dispatchEvent(new Event("transitionend"));
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("snaps back even when transitionend never fires", () => {
    const onSnapBack = vi.fn();
    const card = mountCard({ onCommit: vi.fn(), onSnapBack });

    drag(card, 20); // short of the threshold

    expect(onSnapBack).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(onSnapBack).toHaveBeenCalledTimes(1);
  });

  /**
   * The other half of the re-grab rule, and the one that costs the user
   * something. A spring-back is a suggestion and may be dropped; a commit is a
   * decision already made. Cancelling it loses the swipe with no trace — the
   * deck never advances and the card sits off screen — and `transitionend`
   * cannot rescue it either, because starting a new drag writes
   * `transition: none`, which is precisely the interrupted-transition case the
   * fallback timer exists for.
   */
  it("keeps a committed swipe when the card is pressed again mid-exit", () => {
    const onCommit = vi.fn();
    const card = mountCard({ onCommit });

    drag(card, 150);
    act(() => {
      vi.advanceTimersByTime(50); // 50ms into the 300ms exit, still under the finger
    });
    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", { clientX: 150 }));
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(
      onCommit,
      "a press during the exit animation must not silently drop the swipe",
    ).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("right");
  });

  /** That press is swallowed, not turned into a drag on a card that is leaving. */
  it("does not start a new drag on a card that is already exiting", () => {
    const onSnapBack = vi.fn();
    const card = mountCard({ onCommit: vi.fn(), onSnapBack });

    drag(card, 150);
    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", { clientX: 150 }));
    });
    act(() => {
      card.dispatchEvent(pointerEvent("pointermove", { clientX: 160 }));
    });
    act(() => {
      card.dispatchEvent(pointerEvent("pointerup", { clientX: 160 }));
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(
      onSnapBack,
      "the swallowed press must not produce a gesture of its own",
    ).not.toHaveBeenCalled();
  });

  /**
   * The unmount branch of the cleanup, which nothing else exercises. A deck
   * that is navigated away from mid-exit must not fire a commit into a tree
   * that no longer exists.
   */
  it("drops a pending settle when the component unmounts mid-animation", () => {
    const onCommit = vi.fn();
    const { unmount } = render(<GestureHarness onCommit={onCommit} />);
    const card = screen.getByTestId("card");
    stubPointerCapture(card);

    drag(card, 150);
    unmount();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(
      onCommit,
      "a timer left pointing at a detached node must not fire its callback",
    ).not.toHaveBeenCalled();
  });

  /**
   * Grabbing the card again while a spring-back is still settling must drop
   * the pending callback — otherwise it lands mid-drag and resets the
   * affordance under the user's finger.
   */
  it("drops a pending snap-back when the card is grabbed again", () => {
    const onSnapBack = vi.fn();
    const card = mountCard({ onCommit: vi.fn(), onSnapBack });

    drag(card, 20);
    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", { clientX: 0 }));
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(onSnapBack).not.toHaveBeenCalled();
  });

  /**
   * docs/design/README.md:126 and :348 — under reduced motion "the stack does
   * not move". A spring-back therefore has no transform transition to animate
   * or to wait for: the card is simply back where it started, in one frame.
   *
   * This path had no test, which is how it quietly acquired a 120ms transform
   * animation during the fix-5 rewrite.
   */
  it("returns the card without animating it under prefers-reduced-motion", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    try {
      const onSnapBack = vi.fn();
      const card = mountCard({ onCommit: vi.fn(), onSnapBack });

      drag(card, 20);

      expect(
        card.style.transition,
        "reduced motion must not put a transition on transform — the stack does not move",
      ).not.toContain("transform");
      expect(card.style.transform).toBe("translate3d(0, 0, 0) rotate(0deg)");
      // Nothing is animating, so there is nothing to wait for.
      expect(onSnapBack).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
