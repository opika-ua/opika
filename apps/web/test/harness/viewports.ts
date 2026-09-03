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
 * E2 added a fixed 280px rail + 32px gap beside the grid, which the grid's
 * own 960/1320 max-width numbers don't account for — see
 * docs/design/README.md's "Breakpoints & Surfaces" note. Below
 * viewport - 120 (page padding) - 280 - 32, the grid is genuinely, fluidly
 * narrower than 960/1320, which is what `DESKTOP` and `GALLERY_WIDE`
 * measure. These two exist to prove the OTHER half of "ceiling, not
 * constant" — that 960/1320 are real numbers the grid actually reaches
 * once there's enough room, not just a cap that never binds:
 * `GALLERY_DESKTOP_ROOMY` (1400) clears 1392 (960 + 312 + 120) while
 * staying under 1440, so it's still the 3-column desktop bracket, not
 * `GALLERY_WIDE`'s 4-column one; `GALLERY_WIDE_ROOMY` (1800) clears 1752
 * (1320 + 312 + 120) the same way for the wide bracket.
 */
export const GALLERY_DESKTOP_ROOMY: Viewport = {
  name: "1400x800 roomy desktop",
  width: 1400,
  height: 800,
};
export const GALLERY_WIDE_ROOMY: Viewport = {
  name: "1800x900 roomy wide",
  width: 1800,
  height: 900,
};

/**
 * A short phone — an iPhone SE is 375x667, and a browser with its address bar
 * showing is shorter still. Used to prove the card gives up photo height
 * rather than clipping the shelter's words.
 */
export const SHORT_PHONE: Viewport = { name: "390x640 short phone", width: 390, height: 640 };

/**
 * 360x640 — the modal Android viewport width, and the one this product's
 * actual audience is most likely holding: budget Android hardware, which
 * `docs/stack-decision.md` names as the target throughout.
 *
 * Added in Phase D because it was **unmeasured rather than known-good**. The
 * suite's narrowest frame was `PHONE` at 390 (an iPhone width), and the deck's
 * shelter-line margin measured 20px there against -22px at 320 — so the
 * behaviour at 360, where most real visitors are, sat in an untested gap
 * between a comfortable pass and a silent clip.
 */
export const ANDROID_PHONE: Viewport = { name: "360x640 android phone", width: 360, height: 640 };

/**
 * 320x640 — the narrowest width still worth calling a real device (iPhone SE
 * 1st gen, small budget Androids).
 *
 * Deliberately NOT in the deck's assertion loop: the shelter line already
 * measures -22px here on unmodified code, which is a real pre-existing clip
 * rather than a regression, and asserting against it would make the suite red
 * for a defect it did not cause. It exists so that clip is *measured* and can
 * be tracked, per the standing rule that a documented limit with no test
 * exercising it is not a limit.
 */
export const NARROW_PHONE: Viewport = { name: "320x640 narrow phone", width: 320, height: 640 };

/**
 * F1's own detail-page mock frames — `Opika Registry Frames.dc.html`'s "D2
 * Деталі · 360" and "D1 Деталі · 1920" name these exact widths, not the
 * generic `PHONE`/`DESKTOP` pair above. Heights are tall enough to fit the
 * page's own content without scrolling in the harness's own screenshots
 * (a real device would scroll; the assertions below don't depend on
 * everything fitting above the fold, but the PR's required screenshots do
 * read better without a mid-scroll crop).
 */
export const DETAIL_PHONE: Viewport = { name: "360x1200 detail phone", width: 360, height: 1200 };
export const DETAIL_DESKTOP: Viewport = {
  name: "1920x1080 detail desktop",
  width: 1920,
  height: 1080,
};

/**
 * The two widths the H1 real-R2 verification pass actually tabulated when it
 * found the gallery card overfetching at 2x (see `gallery-photo-sizes.
 * harness.ts`). Same numbers as `DETAIL_PHONE`/`DETAIL_DESKTOP` above by
 * coincidence of the design's own frame widths, kept separate because these
 * measure the *gallery*, and a later change to either pair must not silently
 * move the other.
 */
export const GALLERY_PHONE_360: Viewport = {
  name: "360x800 gallery phone",
  width: 360,
  height: 800,
};
export const GALLERY_DESKTOP_1920: Viewport = {
  name: "1920x1080 gallery desktop",
  width: 1920,
  height: 1080,
};

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
