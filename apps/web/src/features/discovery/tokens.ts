/**
 * Non-style design constants for the discovery flow.
 *
 * Colours, radii, shadow, motion durations/easing and the five-step spacing
 * scale moved to `apps/web/src/app/globals.css`'s Tailwind `@theme` block —
 * see that file for the current source of truth and for why they are named
 * the way they are. This file used to hold all of it as plain JS objects,
 * back when SwipeCard/SwipeDeck/the discovery page styled themselves with
 * inline `style` objects; inline styles cannot express a media query, which
 * made responsive layout impossible and is why the migration happened.
 *
 * What remains here never was a CSS value: `stackLayers` is array-slicing
 * logic (how many cards to keep mounted), not a style. The swipe deck's
 * one-off pixel geometry (photo height, stack fan offsets, action-button
 * height, touch targets) now lives as Tailwind arbitrary/canonical values
 * at the point of use in SwipeCard.tsx / SwipeDeck.tsx, each carrying the
 * same explanatory comment this file used to carry — grep those two files
 * for the numbers if you're looking for where a value went.
 *
 * `layout.cardWidth` (358) was dropped outright: nothing in the codebase
 * ever read it. The card's 358px width was always incidental — the page is
 * 390px minus 2x16px padding — never an explicit style.
 */
export const layout = {
  /** Three stack layers, no scaling. */
  stackLayers: 3,
} as const;
