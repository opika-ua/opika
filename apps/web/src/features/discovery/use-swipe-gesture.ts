import { useCallback, useEffect, useRef } from "react";
import { DECK_RETURN_SPRING, returnToOrigin } from "./spring";
import { type SwipeDirection, swipeDecision } from "./swipe-decision";

// --- Design constants ---

/** Rotation factor: degrees per pixel of horizontal displacement. */
const ROTATION_FACTOR = 0.03;
/** Maximum rotation in degrees regardless of displacement. */
const MAX_ROTATION_DEG = 6;
/** Pixels of drag over which the affordance label fades from 0 → 1 opacity. */
const AFFORDANCE_FADE_PX = 40;
/**
 * Exit animation duration in ms — `docs/design/README.md`'s "The deck" ·
 * "Gesture:" · "Exit 280ms" (G4, `docs/handoff-2026-10-04.md` §3 block 6).
 * Was 300ms, pre-dating that frame pin.
 */
const EXIT_MS = 280;
/**
 * Exit easing for the two paths that actually move between fixed points on
 * a declared timeline (full exit, and the reduced-motion opacity-only
 * exit) — `docs/design/README.md`'s general motion table: "reveal 280ms"
 * and "quick 120ms" both via `cubic-bezier(0.3, 0, 0, 1)` ("short and dry;
 * no springiness"). The return to centre is not on a timeline at all: it is
 * the deck's one spring (`./spring`, G4), driven per frame from the release
 * position and velocity.
 */
const EXIT_EASE = "cubic-bezier(0.3, 0, 0, 1)";
/**
 * Reduced-motion duration: opacity only — `docs/design/README.md`'s "quick
 * 120ms" (G4). Shared by the committed-exit and the snap-back path under
 * `prefers-reduced-motion`, since reduced motion bypasses the spring
 * entirely in both cases (docs/design/README.md:204, :639, :872) and both
 * get the same fixed-timeline "quick" treatment. Already matched the spec's number
 * before this row; only the easing (now `EXIT_EASE`, see above) changed.
 */
const REDUCED_EXIT_MS = 120;

/** Where every return to centre ends, written exactly rather than via `applyTransform(0)`. */
const ORIGIN_TRANSFORM = "translate3d(0, 0, 0) rotate(0deg)";

/**
 * A release counts as moving only if the finger moved this recently.
 *
 * `velocityX` is the speed of the last pointermove, and a finger held still
 * produces no pointermove at all — so without this, a card dragged quickly,
 * held, then let go would be released with the speed it had before the hold
 * and lurch in that direction. Pointer events arrive every 8–16ms while a
 * finger moves; 100ms without one is a finger at rest.
 */
const RELEASE_VELOCITY_WINDOW_MS = 100;

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
  /**
   * Checked synchronously at pointerup, before any exit animation starts, for
   * a drag that has otherwise crossed the commit threshold. Returning `false`
   * makes the gesture spring back to origin instead — the same path and the
   * same `onSnapBack` call an under-threshold drag already takes — rather
   * than starting an exit the caller is about to refuse anyway.
   *
   * This has to live here, checked before the animation begins, rather than
   * as a guard inside `onCommit` itself: `onCommit` only fires once the exit
   * transition has already finished (`whenTransitionSettles`, below), by
   * which point the DOM node has already been translated off-screen via a
   * direct style write this hook owns. A caller that decides only inside
   * `onCommit` to refuse the commit has no way back to centre — the card is
   * stuck wherever the finished exit animation left it, permanently, since
   * nothing else in this component tree ever touches that transform again.
   * Checking first avoids ever starting the exit for a commit that is going
   * to be refused, rather than trying to undo one that already ran. Omitting
   * this callback keeps every previously-decided commit unconditional, the
   * behaviour before this existed.
   */
  canCommit?: (direction: SwipeDirection) => boolean;
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
 * Velocity at release in px/ms: the last move's, unless the finger had
 * stopped (see `RELEASE_VELOCITY_WINDOW_MS`).
 */
export function releaseVelocity(velocityX: number, lastMoveAt: number, releasedAt: number): number {
  return releasedAt - lastMoveAt > RELEASE_VELOCITY_WINDOW_MS ? 0 : velocityX;
}

/**
 * Drive the card back to the origin on the deck's spring, one frame at a
 * time, then run `done` — exactly once, unless cancelled first.
 *
 * Per-frame rather than a CSS transition because a transition takes a
 * duration and a curve, and a spring has neither: its motion depends on the
 * release velocity and it ends when it reaches the origin, not at a time
 * chosen in advance. Position is computed from elapsed time, not from a
 * frame count, so a dropped frame moves the card to where the spring is.
 *
 * No fallback timer, unlike `whenTransitionSettles`. That one exists because
 * `transitionend` may never fire; a frame callback always does while the tab
 * is visible, and in a hidden tab — where frames pause — there is no card on
 * screen to be wrong about. When the tab returns, the first frame finds the
 * spring long since at rest and finishes. A return to centre is also not a
 * decision the user can lose, which is the reason the commit path needs its
 * guarantee.
 */
function springToOrigin(
  node: HTMLElement,
  fromX: number,
  velocityPxPerMs: number,
  render: (x: number) => void,
  done: () => void,
): () => void {
  node.style.transition = "none";
  const frameAt = returnToOrigin(DECK_RETURN_SPRING, fromX, velocityPxPerMs * 1000);
  const startedAt = performance.now();
  let settled = false;
  let frame = 0;

  const step = (): void => {
    const next = frameAt((performance.now() - startedAt) / 1000);
    if (next.kind === "at_rest") {
      settled = true;
      node.style.transform = ORIGIN_TRANSFORM;
      done();
      return;
    }
    render(next.x);
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);

  return () => {
    if (settled) return;
    settled = true;
    cancelAnimationFrame(frame);
  };
}

/**
 * Hook that wires PointerEvent-based swipe gestures to a card element.
 *
 * Returns a ref callback — attach it to the draggable card element.
 * The hook writes transforms directly to the DOM node (no React state). The
 * exit is a CSS transition on a fixed timeline; the return to centre is the
 * deck's spring, driven per frame (`springToOrigin`).
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

  /**
   * Every way a card goes back to centre without committing — an
   * under-threshold release, a refused commit (`canCommit`), and the browser
   * cancelling the pointer — goes through here, so reduced motion is honoured
   * on all of them. It used to be honoured on the first two only: the cancel
   * path wrote its own transform transition and animated regardless.
   */
  const returnToCentre = useCallback(
    (node: HTMLElement, fromX: number, velocityPxPerMs: number) => {
      if (prefersReducedMotion.current) {
        // Reduced motion: the stack does not move (docs/design/README.md:204,
        // :639, :872). Transitioning opacity only means the transform below
        // applies in one frame — the card is simply back where it started,
        // with nothing to wait for. Reduced motion bypasses the spring
        // entirely, so this takes the exit path's fixed "quick" easing.
        node.style.transition = `opacity ${REDUCED_EXIT_MS}ms ${EXIT_EASE}`;
        node.style.transform = ORIGIN_TRANSFORM;
        callbacksRef.current.onSnapBack?.();
        return;
      }

      pendingSettle.current = {
        kind: "snap_back",
        cancel: springToOrigin(
          node,
          fromX,
          velocityPxPerMs,
          (x) => applyTransform(node, x),
          () => {
            pendingSettle.current = null;
            callbacksRef.current.onSnapBack?.();
          },
        ),
      };
    },
    [applyTransform],
  );

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
      // A caller refusing the commit (`canCommit` returning false) takes the
      // exact same path as a decision that never crossed the threshold —
      // spring back, `onSnapBack`, nothing exits. See `canCommit`'s own
      // comment on `SwipeGestureCallbacks` for why this has to be decided
      // here rather than inside `onCommit`.
      if (decision.committed && (callbacksRef.current.canCommit?.(decision.direction) ?? true)) {
        // Exit animation: slide out in the committed direction
        const exitX = decision.direction === "left" ? -window.innerWidth : window.innerWidth;
        const durationMs = prefersReducedMotion.current ? REDUCED_EXIT_MS : EXIT_MS;

        if (prefersReducedMotion.current) {
          node.style.transition = `opacity ${REDUCED_EXIT_MS}ms ${EXIT_EASE}`;
          node.style.opacity = "0";
        } else {
          node.style.transition = `transform ${EXIT_MS}ms ${EXIT_EASE}`;
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
      } else {
        // The card is where the last move put it, which is where the spring
        // starts from — not at the pointerup's own coordinate.
        returnToCentre(
          node,
          state.lastX - state.startX,
          releaseVelocity(state.velocityX, state.lastTime, e.timeStamp),
        );
      }
    },
    [applyTransform, returnToCentre],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent) => {
      const state = stateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      stateRef.current = null;

      // The browser took the pointer (usually to scroll), so there is no
      // fling to carry: the card returns from rest. A cancel's own clientX
      // is not reliable, hence the last rendered position.
      returnToCentre(e.currentTarget as HTMLElement, state.lastX - state.startX, 0);
    },
    [returnToCentre],
  );

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
