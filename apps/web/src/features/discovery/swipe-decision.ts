/**
 * Pure function that decides whether a drag gesture commits or snaps back.
 *
 * Extracted from the gesture engine so it can be tested without a DOM.
 * The two thresholds match the design spec: 88 px displacement OR
 * 0.45 px/ms velocity, whichever fires first.
 */

const COMMIT_DISTANCE_PX = 88;
const COMMIT_VELOCITY_PX_MS = 0.45;

export type SwipeDirection = "left" | "right";

export type SwipeDecision = { committed: true; direction: SwipeDirection } | { committed: false };

/**
 * @param dx – signed horizontal displacement from the pointer-down point (px)
 * @param velocity – signed horizontal velocity at pointer-up (px/ms)
 */
export function swipeDecision(dx: number, velocity: number): SwipeDecision {
  const absDx = Math.abs(dx);
  const absVel = Math.abs(velocity);

  if (absDx >= COMMIT_DISTANCE_PX || absVel >= COMMIT_VELOCITY_PX_MS) {
    return { committed: true, direction: dx < 0 ? "left" : "right" };
  }

  return { committed: false };
}
