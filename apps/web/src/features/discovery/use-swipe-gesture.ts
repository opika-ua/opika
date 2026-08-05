import { useCallback, useRef } from "react";
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
      callbacks.onDrag?.(dx);
    },
    [applyTransform, callbacks],
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

        if (prefersReducedMotion.current) {
          node.style.transition = `opacity ${REDUCED_EXIT_MS}ms ${EASE}`;
          node.style.opacity = "0";
        } else {
          node.style.transition = `transform ${EXIT_MS}ms ${EASE}`;
          applyTransform(node, exitX);
        }

        const commitDirection = decision.direction;
        node.addEventListener(
          "transitionend",
          () => {
            callbacks.onCommit(commitDirection);
          },
          { once: true },
        );
      } else {
        // Spring back to origin
        if (prefersReducedMotion.current) {
          node.style.transition = `opacity ${REDUCED_EXIT_MS}ms ${EASE}`;
          node.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
        } else {
          node.style.transition = `transform ${SPRING_BACK_MS}ms ${EASE}`;
          node.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
        }

        node.addEventListener(
          "transitionend",
          () => {
            callbacks.onSnapBack?.();
          },
          { once: true },
        );
      }
    },
    [applyTransform, callbacks],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      stateRef.current = null;

      const node = e.currentTarget as HTMLElement;
      node.style.transition = `transform ${SPRING_BACK_MS}ms ${EASE}`;
      node.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
      callbacks.onSnapBack?.();
    },
    [callbacks],
  );

  /** Ref callback — attach to the card element. */
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
