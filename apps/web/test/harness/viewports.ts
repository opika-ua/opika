/**
 * The viewports the rendering harness runs against.
 *
 * Two, deliberately: the phone size the design was drawn at, and a desktop
 * size that the layout does not support yet. The desktop run is expected to
 * fail — see `discovery-layout.harness.ts` — and that failure is the standing
 * evidence for the responsive pass that follows this one.
 */

export interface Viewport {
  /** Used in test titles and failure messages. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** The size every screen in docs/design/README.md is specified at. */
export const PHONE: Viewport = { name: "390x844 phone", width: 390, height: 844 };

/** Smallest common laptop. Nothing has been built for this yet. */
export const DESKTOP: Viewport = { name: "1280x800 desktop", width: 1280, height: 800 };

/**
 * A short phone — an iPhone SE is 375x667, and a browser with its address bar
 * showing is shorter still. Used to prove the card gives up photo height
 * rather than clipping the shelter's words.
 */
export const SHORT_PHONE: Viewport = { name: "390x640 short phone", width: 390, height: 640 };

/*
 * A caveat that applies to every measurement taken through this harness.
 *
 * `apps/web` does not load 'Literata' or 'Commissioner' via `next/font`, so
 * both fall back to whatever the platform serves — which differs between a
 * Windows dev machine and a Linux CI runner. Text block heights therefore vary
 * by a few pixels between environments.
 *
 * The containment assertions survive that today because the card carries
 * roughly 46px of vertical headroom at 390x844. That margin is the only thing
 * making them portable, and nothing enforces it. If these ever fail on one
 * machine and pass on another, this is the first thing to check — and the fix
 * is to load the real fonts, not to loosen the assertion.
 */
