/**
 * The viewports the rendering harness opens pages at.
 *
 * Since 2026-10-20 nothing here is measured for layout: the geometry, size and
 * breakpoint-measuring tests that most of these sizes existed for were
 * removed (Oleksii, 2026-10-20, verbatim: "Drop the rest that measure
 * appearance."; CLAUDE.md, "Test logic, not looks"), and the sizes only they
 * used went with them. What stays picks which instance of a control renders
 * (the mobile or desktop one) or which state a breakpoint shows, for the
 * behaviour tests that open a page at it.
 */

export interface Viewport {
  /** Used in test titles and failure messages. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** The size every screen in docs/design/README.md is specified at. */
export const PHONE: Viewport = { name: "390x844 phone", width: 390, height: 844 };

/** Smallest common laptop. */
export const DESKTOP: Viewport = { name: "1280x800 desktop", width: 1280, height: 800 };

/**
 * A short phone - an iPhone SE is 375x667, and a browser with its address bar
 * showing is shorter still.
 */
export const SHORT_PHONE: Viewport = { name: "390x640 short phone", width: 390, height: 640 };

/**
 * 360x640 - the modal Android viewport width, and the one this product's
 * actual audience is most likely holding: budget Android hardware, which
 * `docs/stack-decision.md` names as the target throughout.
 */
export const ANDROID_PHONE: Viewport = { name: "360x640 android phone", width: 360, height: 640 };

/**
 * 320x640 - the narrowest width still worth calling a real device (iPhone SE
 * 1st gen, small budget Androids).
 */
export const NARROW_PHONE: Viewport = { name: "320x640 narrow phone", width: 320, height: 640 };

/**
 * F1's own detail-page mock frames - `Opika Registry Frames.dc.html`'s "D2
 * Деталі · 360" and "D1 Деталі · 1920" name these exact widths, not the
 * generic `PHONE`/`DESKTOP` pair above.
 */
export const DETAIL_PHONE: Viewport = { name: "360x1200 detail phone", width: 360, height: 1200 };
export const DETAIL_DESKTOP: Viewport = {
  name: "1920x1080 detail desktop",
  width: 1920,
  height: 1080,
};
