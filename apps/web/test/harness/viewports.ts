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
 * The gallery's own breakpoints (docs/design/README.md, "Breakpoints &
 * Surfaces") — 0-599 / 600-1023 / 1024-1439 / 1440+. `PHONE` (390) already
 * sits in the first range and `DESKTOP` (1280) already sits in the third,
 * so only the tablet and wide ranges need a viewport of their own.
 */
export const GALLERY_TABLET: Viewport = { name: "768x1024 tablet", width: 768, height: 1024 };
/** Clear of the 1440 boundary on purpose, not pinned to it — a viewport
 * exactly at a CSS breakpoint's edge is the one place a rounding disagreement
 * between the test and the browser could hide a real off-by-one. */
export const GALLERY_WIDE: Viewport = { name: "1600x900 wide desktop", width: 1600, height: 900 };

/**
 * A short phone — an iPhone SE is 375x667, and a browser with its address bar
 * showing is shorter still. Used to prove the card gives up photo height
 * rather than clipping the shelter's words.
 */
export const SHORT_PHONE: Viewport = { name: "390x640 short phone", width: 390, height: 640 };

/*
 * Font-metrics portability — resolved, not a live caveat any more.
 *
 * `apps/web` used to render Literata/Commissioner as bare font-family names
 * with no `next/font` loader behind them, so both fell back to whatever the
 * platform served — different fonts, different metrics, on a Windows dev
 * machine versus a Linux CI runner, entirely outside this harness's control.
 * As of the font-loading commit, both are loaded via `next/font/google`
 * (apps/web/src/app/fonts.ts): the same two WOFF2 files render everywhere
 * Chromium runs, so a Windows machine and a Linux CI runner now measure the
 * same glyphs, not merely similar-looking substitutes.
 *
 * What that does and doesn't buy: the *margin* between the shelter line and
 * the card's bottom edge is now a stable, reproducible number — 46.5px at
 * 390x844, 16px at both 390x640 and 1280x800, measured with the real fonts
 * loaded — rather than a platform-dependent unknown. It does not mean the
 * margin can't erode from legitimate content changes (a longer localized
 * string, a larger type-scale step); that is what
 * `discovery-layout.harness.ts`'s `MIN_SHELTER_MARGIN_PX` floor and
 * `expectMinimumBottomMargin` exist to catch, deliberately short of the
 * measured value so there's real warning before an actual clip, not a
 * second copy of "whatever it happens to be today".
 */
