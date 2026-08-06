/**
 * Pure function that decides whether a drag gesture commits or snaps back.
 *
 * Extracted from the gesture engine so it can be tested without a DOM.
 * The two thresholds match the design spec: 88 px displacement OR
 * 0.45 px/ms velocity, whichever fires first.
 */

const COMMIT_DISTANCE_PX = 88;
const COMMIT_VELOCITY_PX_MS = 0.45;

/**
 * Displacement below which the gesture is a tap, whatever the velocity says.
 *
 * Velocity is measured between the last two pointermove samples, so it is
 * *instantaneous*, not average. A finger lifting off a tap twitches a pixel or
 * two within a millisecond or so, and 2px in 1ms is 2 px/ms — four times the
 * commit threshold. Without this floor a tap flings the card off screen, which
 * for this product means silently passing on an animal the user wanted to open.
 *
 * 12px sits above real tap jitter (typically 1–4px) and above Android's 8dp
 * touch slop, the point below which the platform will not call a movement a
 * drag at all. It stays well under COMMIT_DISTANCE_PX, so the deliberate fast
 * flick the design asks for still works.
 */
const MIN_COMMIT_DISTANCE_PX = 12;

export type SwipeDirection = "left" | "right";

export type SwipeDecision = { committed: true; direction: SwipeDirection } | { committed: false };

/**
 * @param dx – signed horizontal displacement from the pointer-down point (px)
 * @param velocity – signed horizontal velocity at pointer-up (px/ms)
 */
export function swipeDecision(dx: number, velocity: number): SwipeDecision {
  const absDx = Math.abs(dx);
  const absVel = Math.abs(velocity);

  // A long drag commits regardless of how slowly it was released.
  if (absDx >= COMMIT_DISTANCE_PX) {
    return { committed: true, direction: dx < 0 ? "left" : "right" };
  }

  // A fast flick commits early, but only once it has actually gone somewhere.
  if (absVel >= COMMIT_VELOCITY_PX_MS && absDx >= MIN_COMMIT_DISTANCE_PX) {
    return { committed: true, direction: dx < 0 ? "left" : "right" };
  }

  return { committed: false };
}
