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
