import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMockCards } from "./mock-data";
import { SwipeDeck } from "./SwipeDeck";
import { releaseVelocity, useSwipeGesture } from "./use-swipe-gesture";

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

/** The x offset the hook last wrote to the card's transform, in px. */
function translateX(node: HTMLElement): number {
  const match = /translate3d\((-?[\d.]+)(?:px)?,/.exec(node.style.transform);
  if (!match?.[1]) throw new Error(`no translate3d in "${node.style.transform}"`);
  return Number(match[1]);
}

/**
 * Stubs `matchMedia` so `prefers-reduced-motion: reduce` reads as matched.
 * Caller must restore with `vi.unstubAllGlobals()` in a `finally`.
 */
function stubReducedMotion(): void {
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
        ensureSession={() => Promise.resolve(true)}
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
  canCommit?: (direction: "left" | "right") => boolean;
}) {
  const [dx, setDx] = useState(0);
  const { cardRef } = useSwipeGesture({
    onDrag: setDx,
    onCommit: props.onCommit,
    ...(props.onSnapBack ? { onSnapBack: props.onSnapBack } : {}),
    ...(props.canCommit ? { canCommit: props.canCommit } : {}),
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

  /**
   * G4 (`docs/handoff-2026-10-04.md` §3 block 6): the exit is a real design
   * value on a fixed timeline — `docs/design/README.md`'s "Exit 280ms" via
   * `cubic-bezier(0.3, 0, 0, 1)` — a timeline, unlike the return to centre,
   * which is the deck's spring (below). Pins the 300ms→280ms frame
   * correction; an edit that put the spring on this path, or any other
   * duration or curve, must fail here.
   */
  it("exits on the design's fixed 280ms timeline", () => {
    const card = mountCard({ onCommit: vi.fn() });

    drag(card, 150); // past the 88px commit distance

    expect(card.style.transition).toBe("transform 280ms cubic-bezier(0.3, 0, 0, 1)");
  });

  /**
   * The committed-exit path under reduced motion is the one reduced-motion
   * case where the easing is actually visible — opacity genuinely animates
   * 1 -> 0, unlike the snap-back case's instant one-frame reset. Catches a
   * real gap: the earlier version of this change pinned the invisible
   * snap-back string but not this one.
   */
  it("exits on opacity under prefers-reduced-motion, on the same fixed timeline", () => {
    stubReducedMotion();

    try {
      const card = mountCard({ onCommit: vi.fn() });

      drag(card, 150); // past the 88px commit distance

      expect(card.style.transition).toBe("opacity 120ms cubic-bezier(0.3, 0, 0, 1)");
      expect(card.style.opacity).toBe("0");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * G4 part 2: the return is the deck's spring, driven frame by frame — not a
   * CSS transition with a duration and a curve, which is what this path was
   * until now (`transform 300ms cubic-bezier(0.16, 1, 0.3, 1)`). Asserted on
   * the rendered transform mid-flight: a jump to centre, or a transition left
   * doing the work, both fail here. The spring's own physics — no overshoot,
   * release velocity, settling — is pinned in `spring.test.ts`.
   */
  it("returns to centre on the spring, frame by frame, not on a CSS transition", () => {
    const onSnapBack = vi.fn();
    const card = mountCard({ onCommit: vi.fn(), onSnapBack });

    drag(card, 60); // short of the 88px commit threshold

    expect(card.style.transition, "no CSS transition may drive the return").toBe("none");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    const midFlight = translateX(card);
    expect(midFlight, "100ms in, the card must be on its way back").toBeLessThan(60);
    expect(midFlight, "…and not already at centre — that would be a jump").toBeGreaterThan(5);
    expect(onSnapBack, "onSnapBack waits for the spring to arrive").not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(card.style.transform).toBe("translate3d(0, 0, 0) rotate(0deg)");
    expect(onSnapBack).toHaveBeenCalledTimes(1);
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
      vi.advanceTimersByTime(50); // 50ms into the 280ms exit, still under the finger
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
    const underTheFinger = card.style.transform;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(onSnapBack).not.toHaveBeenCalled();
    // The spring writes the transform itself every frame, so dropping its
    // callback is not enough — its frames must stop too, or it would drag
    // the card out from under the finger that just grabbed it.
    expect(card.style.transform, "the abandoned spring kept moving the card").toBe(underTheFinger);
  });

  /**
   * Gesture parity's own re-entrancy guard (`canCommit`, `SwipeDeck.tsx`'s
   * `handleCommit` comment) lives here rather than inside `onCommit`, and
   * this is the test proving why it has to: a review found that guarding
   * only inside `onCommit` (calling `setDx(0)` and returning) could not
   * actually recentre anything, because by the time `onCommit` fires the
   * exit animation has already run to completion and written a real
   * off-screen `transform` straight to the node — `setDx` never controlled
   * that transform in the first place. A refused commit must therefore never
   * start the exit animation at all; it has to take the exact same path as
   * an under-threshold drag.
   */
  it("refuses a commit via canCommit — springs back instead of exiting, transform ends at centre", () => {
    const onCommit = vi.fn();
    const onSnapBack = vi.fn();
    const canCommit = vi.fn(() => false);
    const card = mountCard({ onCommit, onSnapBack, canCommit });

    drag(card, 150); // well past the 88px commit distance
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(canCommit).toHaveBeenCalledWith("right");
    expect(onCommit, "a refused commit must never fire onCommit").not.toHaveBeenCalled();
    expect(onSnapBack, "a refused commit takes the same path as a snap-back").toHaveBeenCalledTimes(
      1,
    );
    expect(
      card.style.transform,
      "the card must end up back at centre, not stuck at its exit position",
    ).toBe("translate3d(0, 0, 0) rotate(0deg)");
  });

  /**
   * The same refusal, under reduced motion — a distinct branch in
   * `onPointerUp` (synchronous `onSnapBack`, no pending settle to wait on),
   * found on review as the one `canCommit` path nothing else exercised.
   */
  it("refuses a commit via canCommit under prefers-reduced-motion — no animation, snaps back synchronously", () => {
    stubReducedMotion();

    try {
      const onCommit = vi.fn();
      const onSnapBack = vi.fn();
      const canCommit = vi.fn(() => false);
      const card = mountCard({ onCommit, onSnapBack, canCommit });

      drag(card, 150); // well past the 88px commit distance

      expect(onCommit, "a refused commit must never fire onCommit").not.toHaveBeenCalled();
      expect(card.style.transform).toBe("translate3d(0, 0, 0) rotate(0deg)");
      // Reduced motion has nothing to wait for — the callback fires in the
      // same tick as the refusal, not on a later transition/fallback timer.
      expect(onSnapBack).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** Omitting `canCommit` entirely must not change any previously-decided commit. */
  it("commits normally when canCommit is not provided at all", () => {
    const onCommit = vi.fn();
    const card = mountCard({ onCommit });

    drag(card, 150);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onCommit).toHaveBeenCalledWith("right");
  });

  /**
   * docs/design/README.md:204, :639, :872 — under reduced motion "the stack
   * does not move". A spring-back therefore has no transform transition to animate
   * or to wait for: the card is simply back where it started, in one frame.
   *
   * This path had no test, which is how it quietly acquired a 120ms transform
   * animation during the fix-5 rewrite.
   */
  it("returns the card without animating it under prefers-reduced-motion", () => {
    stubReducedMotion();

    try {
      const onSnapBack = vi.fn();
      const card = mountCard({ onCommit: vi.fn(), onSnapBack });

      drag(card, 20);

      expect(
        card.style.transition,
        "reduced motion must not put a transition on transform — the stack does not move",
      ).not.toContain("transform");
      // G4: reduced motion bypasses the spring entirely, so this gets the
      // same fixed-timeline "quick" easing as the exit path, not the
      // spring-back approximation's curve.
      expect(card.style.transition).toBe("opacity 120ms cubic-bezier(0.3, 0, 0, 1)");
      expect(card.style.transform).toBe("translate3d(0, 0, 0) rotate(0deg)");
      // Nothing is animating, so there is nothing to wait for.
      expect(onSnapBack).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * The browser cancelling the pointer (usually to take a vertical scroll)
   * returns the card on the same spring as any other return — it used to
   * write its own 300ms transform transition and fire `onSnapBack` before
   * the card had moved at all.
   */
  it("returns to centre on the spring when the browser cancels the pointer", () => {
    const onSnapBack = vi.fn();
    const card = mountCard({ onCommit: vi.fn(), onSnapBack });

    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", { clientX: 0 }));
    });
    act(() => {
      card.dispatchEvent(pointerEvent("pointermove", { clientX: 50 }));
    });
    act(() => {
      card.dispatchEvent(pointerEvent("pointercancel", { clientX: 0 }));
    });

    expect(card.style.transition).toBe("none");
    expect(onSnapBack, "onSnapBack waits for the card to arrive").not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(card.style.transform).toBe("translate3d(0, 0, 0) rotate(0deg)");
    expect(onSnapBack).toHaveBeenCalledTimes(1);
  });

  /**
   * G4's known gap (`docs/build-plan.md`'s G4 row): the cancel path ignored
   * `prefers-reduced-motion` entirely and animated the transform anyway,
   * against README:204's "the stack does not move".
   */
  it("does not animate the card when the pointer is cancelled under prefers-reduced-motion", () => {
    stubReducedMotion();

    try {
      const onSnapBack = vi.fn();
      const card = mountCard({ onCommit: vi.fn(), onSnapBack });

      act(() => {
        card.dispatchEvent(pointerEvent("pointerdown", { clientX: 0 }));
      });
      act(() => {
        card.dispatchEvent(pointerEvent("pointermove", { clientX: 50 }));
      });
      act(() => {
        card.dispatchEvent(pointerEvent("pointercancel", { clientX: 0 }));
      });

      expect(
        card.style.transition,
        "reduced motion must not put a transition on transform — the stack does not move",
      ).not.toContain("transform");
      expect(card.style.transform).toBe("translate3d(0, 0, 0) rotate(0deg)");
      expect(onSnapBack).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * The release velocity reaching the spring through the hook, end to end:
 * pointer timestamps → `velocityX` (px/ms) → `releaseVelocity` → the spring
 * (px/s). Everything else in this file releases at rest, and `spring.test.ts`
 * hands the spring a velocity directly, so without these a lost unit
 * conversion or a bypassed `releaseVelocity` left the whole suite green.
 *
 * `timeStamp` is read-only on a constructed event, so it is defined on the
 * instance. 36px at 0.375 px/ms stays short of both commit thresholds (88px,
 * 0.45 px/ms), so this is always a return, never an exit.
 */
describe("swipe gesture release velocity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function timedPointerEvent(type: string, clientX: number, timeStamp: number): PointerEvent {
    const event = pointerEvent(type, { clientX });
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
    return event;
  }

  function dragOutwardAndRelease(card: HTMLElement, releasedAt: number): void {
    act(() => {
      card.dispatchEvent(timedPointerEvent("pointerdown", 0, 0));
    });
    act(() => {
      card.dispatchEvent(timedPointerEvent("pointermove", 30, 100));
    });
    act(() => {
      card.dispatchEvent(timedPointerEvent("pointermove", 36, 116)); // 0.375 px/ms outward
    });
    act(() => {
      card.dispatchEvent(timedPointerEvent("pointerup", 36, releasedAt));
    });
  }

  it("carries a card released while moving outward further out before it returns", () => {
    const onCommit = vi.fn();
    render(<GestureHarness onCommit={onCommit} />);
    const card = screen.getByTestId("card");
    stubPointerCapture(card);

    dragOutwardAndRelease(card, 120); // 4ms after the last move: still moving

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(
      translateX(card),
      "the release velocity must carry the card past where it was let go",
    ).toBeGreaterThan(36);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(card.style.transform).toBe("translate3d(0, 0, 0) rotate(0deg)");
  });

  it("returns a card held still before release straight back, with no carried velocity", () => {
    render(<GestureHarness onCommit={vi.fn()} />);
    const card = screen.getByTestId("card");
    stubPointerCapture(card);

    dragOutwardAndRelease(card, 400); // held for 284ms after the last move

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(translateX(card), "a held card must not lurch outward on release").toBeLessThan(36);
  });
});

describe("releaseVelocity", () => {
  it("keeps the last move's velocity for a finger still moving at release", () => {
    expect(releaseVelocity(0.4, 1_000, 1_016)).toBe(0.4);
    expect(releaseVelocity(-0.3, 1_000, 1_100)).toBe(-0.3);
  });

  /** A held finger produces no pointermove, so the last one's speed is stale. */
  it("treats a finger that stopped before release as at rest", () => {
    expect(releaseVelocity(0.4, 1_000, 1_101)).toBe(0);
    expect(releaseVelocity(0.4, 1_000, 3_000)).toBe(0);
  });
});
