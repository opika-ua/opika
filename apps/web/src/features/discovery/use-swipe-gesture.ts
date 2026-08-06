import { useCallback, useEffect, useRef } from "react";
import { type SwipeDirection, swipeDecision } from "./swipe-decision";

// --- Design constants ---

/** Rotation factor: degrees per pixel of horizontal displacement. */
const ROTATION_FACTOR = 0.03;
/** Maximum rotation in degrees regardless of displacement. */
const MAX_ROTATION_DEG = 6;
/** Pixels of drag over which the affordance label fades from 0 → 1 opacity. */
const AFFORDANCE_FADE_PX = 40;
/** Exit animation duration in ms. */
const EXIT_MS = 300;
/** Spring-back duration in ms (ease-out, no overshoot per spec). */
const SPRING_BACK_MS = 300;
/** Design easing: cubic-bezier(0.16, 1, 0.3, 1). */
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Reduced-motion exit: opacity only, 120ms. */
const REDUCED_EXIT_MS = 120;

/**
 * Grace period added to a transition's own duration before the fallback timer
 * takes over. Long enough that the timer never beats a transition that is
 * simply running a frame or two late.
 */
const TRANSITION_FALLBACK_SLACK_MS = 150;

export interface SwipeGestureCallbacks {
  /** Called when the user drags. dx is signed displacement in px. */
  onDrag?: (dx: number) => void;
  /** Called when the card commits (exits). */
  onCommit: (direction: SwipeDirection) => void;
  /** Called when the card snaps back to origin. */
  onSnapBack?: () => void;
}

interface PointerState {
  pointerId: number;
  startX: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
}

/**
 * What the card is doing between gestures, and how to abandon it.
 *
 * The `kind` is load-bearing at pointerdown. A spring-back is a suggestion and
 * may be dropped when the user grabs the card again. A commit is a decision the
 * user has already made, and dropping it loses the swipe with no trace: the
 * deck never advances, the card is left off screen, and nothing errors.
 */
interface PendingSettle {
  readonly kind: "commit" | "snap_back";
  readonly cancel: () => void;
}

/**
 * Run `done` when a CSS transition on `node` finishes — or when it doesn't.
 *
 * `transitionend` is not guaranteed to fire. A backgrounded tab, a transition
 * interrupted by another style write, a dropped frame at the wrong moment, or
 * simply `transition: none` resolving to no transition at all, and the event
 * never arrives. Because the whole commit path hung off that one event, the
 * deck would then wedge: the card sat off screen, the deck never advanced, and
 * there was no way forward short of a reload.
 *
 * So the timer is not a nicety — it is the only thing making the commit
 * guaranteed. Whichever of the two arrives first wins, exactly once.
 *
 * Returns a canceller for the case where the user grabs the card again before
 * either has fired.
 */
function whenTransitionSettles(
  node: HTMLElement,
  durationMs: number,
  done: () => void,
): () => void {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = (): void => {
    if (settled) return;
    settled = true;
    node.removeEventListener("transitionend", onTransitionEnd);
    if (timer !== undefined) clearTimeout(timer);
    done();
  };

  const onTransitionEnd = (event: Event): void => {
    // Ignore transitions bubbling up from anything inside the card.
    if (event.target !== node) return;
    finish();
  };

  node.addEventListener("transitionend", onTransitionEnd);
  timer = setTimeout(finish, durationMs + TRANSITION_FALLBACK_SLACK_MS);

  return () => {
    if (settled) return;
    settled = true;
    node.removeEventListener("transitionend", onTransitionEnd);
    if (timer !== undefined) clearTimeout(timer);
  };
}

/**
 * Hook that wires PointerEvent-based swipe gestures to a card element.
 *
 * Returns a ref callback — attach it to the draggable card element.
 * The hook writes transforms directly to the DOM node (no React state),
 * and uses CSS transitions for exit / spring-back animations.
 */
export function useSwipeGesture(callbacks: SwipeGestureCallbacks) {
  const stateRef = useRef<PointerState | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useRef(false);
  const pendingSettle = useRef<PendingSettle | null>(null);

  /**
   * The callbacks object is a fresh literal on every render of the deck, and
   * the deck re-renders on every pointermove because it tracks `dx` in state.
   * When the handlers depended on it, each of them — and therefore the ref
   * callback that registers them — changed identity ~60 times a second, so
   * React detached and re-attached every listener on every frame of a drag.
   *
   * Reading through a ref keeps the handlers referentially stable for the life
   * of the component while still calling the newest callbacks.
   */
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // Check once on first interaction — avoids SSR issues
  const checkReducedMotion = useCallback(() => {
    if (typeof window !== "undefined") {
      prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

  const applyTransform = useCallback((node: HTMLElement, dx: number) => {
    const rotation = Math.min(Math.max(dx * ROTATION_FACTOR, -MAX_ROTATION_DEG), MAX_ROTATION_DEG);
    node.style.transform = `translate3d(${dx}px, 0, 0) rotate(${rotation}deg)`;
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      // Only handle primary pointer (left mouse / single touch)
      if (e.button !== 0) return;
      const node = e.currentTarget as HTMLElement;

      checkReducedMotion();

      // A press landing on a card that is already leaving must not renegotiate
      // the swipe the user has just made. Cancelling the pending commit would
      // drop it silently — and the exit's own `transitionend` would not save it
      // either, because the `transition: none` written below is exactly the
      // "interrupted by another style write" case the fallback timer exists for.
      // So swallow the press: the exit finishes on its own and the deck
      // replaces this card from under the finger.
      if (pendingSettle.current?.kind === "commit") return;

      // A spring-back is only a suggestion. Drop it, or its onSnapBack would
      // land in the middle of this drag and reset the affordance under the
      // user's finger.
      pendingSettle.current?.cancel();
      pendingSettle.current = null;

      node.setPointerCapture(e.pointerId);
      // Clear any in-progress transition
      node.style.transition = "none";

      stateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        lastX: e.clientX,
        lastTime: e.timeStamp,
        velocityX: 0,
      };
    },
    [checkReducedMotion],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;

      const node = e.currentTarget as HTMLElement;
      const dx = e.clientX - state.startX;
      const dt = e.timeStamp - state.lastTime;

      if (dt > 0) {
        state.velocityX = (e.clientX - state.lastX) / dt;
      }
      state.lastX = e.clientX;
      state.lastTime = e.timeStamp;

      applyTransform(node, dx);
      callbacksRef.current.onDrag?.(dx);
    },
    [applyTransform],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      stateRef.current = null;

      const node = e.currentTarget as HTMLElement;
      const dx = e.clientX - state.startX;
      const decision = swipeDecision(dx, state.velocityX);

      if (decision.committed) {
        // Exit animation: slide out in the committed direction
        const exitX = decision.direction === "left" ? -window.innerWidth : window.innerWidth;
        const durationMs = prefersReducedMotion.current ? REDUCED_EXIT_MS : EXIT_MS;

        if (prefersReducedMotion.current) {
          node.style.transition = `opacity ${REDUCED_EXIT_MS}ms ${EASE}`;
          node.style.opacity = "0";
        } else {
          node.style.transition = `transform ${EXIT_MS}ms ${EASE}`;
          applyTransform(node, exitX);
        }

        const commitDirection = decision.direction;
        pendingSettle.current = {
          kind: "commit",
          cancel: whenTransitionSettles(node, durationMs, () => {
            pendingSettle.current = null;
            callbacksRef.current.onCommit(commitDirection);
          }),
        };
      } else if (prefersReducedMotion.current) {
        // Reduced motion: the stack does not move (docs/design/README.md:126,
        // :348). Transitioning opacity only means the transform below applies
        // in one frame — the card is simply back where it started. There is no
        // transform transition, so there is nothing to wait for and no
        // `transitionend` to wait for it with.
        node.style.transition = `opacity ${REDUCED_EXIT_MS}ms ${EASE}`;
        node.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
        callbacksRef.current.onSnapBack?.();
      } else {
        // Spring back to origin
        node.style.transition = `transform ${SPRING_BACK_MS}ms ${EASE}`;
        node.style.transform = "translate3d(0, 0, 0) rotate(0deg)";

        pendingSettle.current = {
          kind: "snap_back",
          cancel: whenTransitionSettles(node, SPRING_BACK_MS, () => {
            pendingSettle.current = null;
            callbacksRef.current.onSnapBack?.();
          }),
        };
      }
    },
    [applyTransform],
  );

  const onPointerCancel = useCallback((e: PointerEvent) => {
    const state = stateRef.current;
    if (!state || e.pointerId !== state.pointerId) return;
    stateRef.current = null;

    const node = e.currentTarget as HTMLElement;
    node.style.transition = `transform ${SPRING_BACK_MS}ms ${EASE}`;
    node.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
    callbacksRef.current.onSnapBack?.();
  }, []);

  /**
   * Ref callback — attach to the card element.
   *
   * Every dependency here is stable for the life of the component, so this
   * callback is too: React calls it once on mount and once on unmount, and the
   * listeners below are attached exactly once.
   */
  const cardRef = useCallback(
    (node: HTMLElement | null) => {
      const prev = nodeRef.current;
      if (prev) {
        prev.removeEventListener("pointerdown", onPointerDown);
        prev.removeEventListener("pointermove", onPointerMove);
        prev.removeEventListener("pointerup", onPointerUp);
        prev.removeEventListener("pointercancel", onPointerCancel);
      }

      nodeRef.current = node;

      if (node) {
        node.style.touchAction = "pan-y";
        node.addEventListener("pointerdown", onPointerDown);
        node.addEventListener("pointermove", onPointerMove);
        node.addEventListener("pointerup", onPointerUp);
        node.addEventListener("pointercancel", onPointerCancel);
      }
    },
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel],
  );

  // A card can unmount mid-animation — the deck advancing is exactly that.
  // Leaving a timer pointing at a detached node keeps it alive to no purpose.
  useEffect(() => {
    return () => {
      pendingSettle.current?.cancel();
      pendingSettle.current = null;
    };
  }, []);

  return { cardRef };
}

/**
 * Compute the affordance label opacity for a given drag displacement.
 * Returns a value between 0 and 1, reaching 1 at ±40px.
 */
export function affordanceOpacity(dx: number): number {
  return Math.min(Math.abs(dx) / AFFORDANCE_FADE_PX, 1);
}

/**
 * Which affordance label to show for the current drag direction.
 * Returns null if dx is exactly 0 (no direction yet).
 */
export function affordanceSide(dx: number): SwipeDirection | null {
  if (dx === 0) return null;
  return dx < 0 ? "left" : "right";
}
