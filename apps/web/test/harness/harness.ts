/**
 * A small rendering harness over Playwright.
 *
 * It exists because three milestones in a row were signed off on checks that
 * confirmed the shape of the code rather than its behaviour — most sharply at
 * M5, where "the /discovery page renders" was concluded by fetching the HTML
 * and grepping it for card text, while the action row sat on top of the card
 * and the gesture did not work at all.
 *
 * So the two things this file provides are the two things grepping markup
 * cannot do: measure what the browser actually laid out, and drive a real
 * pointer sequence through the real event loop.
 *
 * It is a verification tool, not a framework. Everything here is a thin,
 * well-labelled wrapper whose value is the failure message.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import type { Viewport } from "./viewports";

/** A DOM rectangle in CSS pixels, as `Locator.boundingBox()` returns it. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A locator with a human name, so failures say what was measured. */
export interface Measured {
  readonly label: string;
  readonly locator: Locator;
}

/**
 * Sub-pixel slack. Layout rounds, and two elements that merely share an edge
 * can report rects differing by a fraction of a pixel. At or below this, an
 * intersection is treated as touching rather than overlapping — otherwise
 * every stacked-but-adjacent pair would report a false positive.
 */
const EPSILON_PX = 0.5;

function fmt(r: Rect): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  return `x=${round(r.x)} y=${round(r.y)} w=${round(r.width)} h=${round(r.height)} (right=${round(
    r.x + r.width,
  )} bottom=${round(r.y + r.height)})`;
}

/**
 * Load a route at an exact viewport size.
 *
 * `readySelector` is awaited rather than a fixed sleep: the deck mounts on the
 * client, and asserting geometry before hydration measures the wrong thing.
 */
export async function openRoute(
  page: Page,
  route: string,
  viewport: Viewport,
  opts: { readonly readySelector?: string } = {},
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(route, { waitUntil: "load" });
  if (opts.readySelector) {
    await page.locator(opts.readySelector).first().waitFor({ state: "visible" });
  }
}

/** Bounding box, or a failure that names the element instead of `null`. */
export async function rectOf(locator: Locator, label: string): Promise<Rect> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(
      `${label}: no bounding box. The element is absent, detached, or not rendered ` +
        `(display:none / zero-size). Selector: ${locator}`,
    );
  }
  return box;
}

/**
 * How many items share each row of a grid, in DOM order — the real check
 * for "N columns," as opposed to reading a `grid-cols-N` class out of
 * markup. Two rects are the same row when their top edges are within
 * `tolerancePx`, which absorbs sub-pixel layout rounding without conflating
 * two genuinely different rows.
 *
 * Assumes `locators` are already in the grid's visual reading order (DOM
 * order for a plain `grid-auto-flow: row` container, which is what a card
 * grid with no `order` overrides produces) — this does not re-derive row
 * membership from `x`, only from the `y` grouping, so a caller that passes
 * locators out of order gets a wrong answer rather than a caught one.
 */
export async function rowCounts(locators: readonly Locator[], tolerancePx = 1): Promise<number[]> {
  const rects = await Promise.all(locators.map((l, i) => rectOf(l, `row item ${i}`)));
  const counts: number[] = [];
  let rowTop: number | null = null;
  for (const rect of rects) {
    if (rowTop === null || Math.abs(rect.y - rowTop) > tolerancePx) {
      counts.push(1);
      rowTop = rect.y;
    } else {
      counts[counts.length - 1] = (counts[counts.length - 1] ?? 0) + 1;
    }
  }
  return counts;
}

/** The intersection of two rects, or null when they do not meaningfully overlap. */
export function overlapOf(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  if (width <= EPSILON_PX || height <= EPSILON_PX) return null;
  return { x, y, width, height };
}

/**
 * Assert two elements do not sit on top of one another.
 *
 * This is the assertion M5 needed and did not have: an action row positioned
 * `absolute; bottom: 0` over the card reads perfectly in the markup.
 */
export async function expectNoOverlap(a: Measured, b: Measured): Promise<void> {
  const ra = await rectOf(a.locator, a.label);
  const rb = await rectOf(b.locator, b.label);
  const overlap = overlapOf(ra, rb);

  expect(
    overlap,
    `"${a.label}" and "${b.label}" must not intersect.\n` +
      `        ${a.label}: ${fmt(ra)}\n` +
      `        ${b.label}: ${fmt(rb)}\n` +
      `        intersection: ${overlap ? fmt(overlap) : "none"}`,
  ).toBeNull();
}

/**
 * Assert `inner` is fully inside `outer` — nothing clipped on any edge.
 *
 * Used for "the freshness block is fully visible inside the card", where a
 * too-tall photo pushes the block past the card's `overflow: hidden` edge and
 * the text simply vanishes with no error anywhere.
 */
export async function expectContainedBy(inner: Measured, outer: Measured): Promise<void> {
  const ri = await rectOf(inner.locator, inner.label);
  const ro = await rectOf(outer.locator, outer.label);

  const spill = {
    top: ro.y - ri.y,
    left: ro.x - ri.x,
    right: ri.x + ri.width - (ro.x + ro.width),
    bottom: ri.y + ri.height - (ro.y + ro.height),
  };
  const worst = Math.max(spill.top, spill.left, spill.right, spill.bottom);

  expect(
    worst,
    `"${inner.label}" must be fully visible inside "${outer.label}".\n` +
      `        ${inner.label}: ${fmt(ri)}\n` +
      `        ${outer.label}: ${fmt(ro)}\n` +
      `        spill: top=${spill.top.toFixed(2)} left=${spill.left.toFixed(2)} ` +
      `right=${spill.right.toFixed(2)} bottom=${spill.bottom.toFixed(2)} (positive = clipped)`,
  ).toBeLessThanOrEqual(EPSILON_PX);
}

/**
 * Assert `inner`'s bottom edge sits at least `minMarginPx` above `outer`'s —
 * not merely "not clipped", but "not dangerously close to clipping".
 *
 * `expectContainedBy` only fails once spill turns positive. That is the
 * right bar for correctness, but it gives zero warning as the margin erodes
 * from generous to razor-thin — a change (a longer localized string, a
 * font swap, a line-height tweak) can eat the entire buffer and this would
 * stay green right up until the pixel it goes negative. This is the second,
 * separate thing worth asserting: that today's margin is a margin, not an
 * accident one bad content change away from becoming a real clip.
 */
export async function expectMinimumBottomMargin(
  inner: Measured,
  outer: Measured,
  minMarginPx: number,
): Promise<void> {
  const ri = await rectOf(inner.locator, inner.label);
  const ro = await rectOf(outer.locator, outer.label);
  const margin = ro.y + ro.height - (ri.y + ri.height);

  expect(
    margin,
    `"${inner.label}" has only ${margin.toFixed(1)}px of margin above "${outer.label}"'s ` +
      `bottom edge; expected at least ${minMarginPx}px.\n` +
      `        ${inner.label}: ${fmt(ri)}\n` +
      `        ${outer.label}: ${fmt(ro)}\n` +
      `        The containment check elsewhere only fails at 0 — this exists so an eroding ` +
      `margin is caught while there is still room to fix it, not the moment it clips.`,
  ).toBeGreaterThanOrEqual(minMarginPx);
}

async function viewportOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
}

/**
 * Assert the document does not scroll sideways.
 *
 * `window.innerWidth` rather than the nominal viewport, because once a
 * scrollbar appears it takes width from the layout and the nominal number
 * stops describing what the user sees.
 *
 * Split from `expectNoViewportOverflow` for a page that is *supposed* to
 * scroll vertically — a content list, or "this screen scrolls" pages like
 * the eventual animal detail page (docs/design/README.md, "04 Detail —
 * 1440") — where asserting `scrollHeight` would fail against correct
 * behaviour rather than catch a real defect.
 */
export async function expectNoHorizontalOverflow(page: Page, viewport: Viewport): Promise<void> {
  const m = await viewportOverflow(page);

  expect(
    m.scrollWidth,
    `document scrollWidth ${m.scrollWidth} exceeds the ${viewport.name} viewport ` +
      `(${m.innerWidth}px) by ${m.scrollWidth - m.innerWidth}px — the page scrolls sideways`,
  ).toBeLessThanOrEqual(m.innerWidth);
}

/**
 * Assert the document does not scroll in either axis. For a page that must
 * fit entirely within one screen (the swipe deck) — see
 * `expectNoHorizontalOverflow` for a page allowed to grow vertically.
 */
export async function expectNoViewportOverflow(page: Page, viewport: Viewport): Promise<void> {
  await expectNoHorizontalOverflow(page, viewport);
  const m = await viewportOverflow(page);

  expect(
    m.scrollHeight,
    `document scrollHeight ${m.scrollHeight} exceeds the ${viewport.name} viewport ` +
      `(${m.innerHeight}px) by ${m.scrollHeight - m.innerHeight}px — the page scrolls vertically`,
  ).toBeLessThanOrEqual(m.innerHeight);
}

/**
 * Real Tab presses, not `locator.focus()` — same reasoning
 * `gallery-filters.harness.ts`'s tab-order test already documents:
 * `focus()` succeeds on a `tabindex="-1"` element (removed from the tab
 * order) and even on elements with no visible focus styling at all, so a
 * `focus()`-based check can't fail for the reason a focus-visible test
 * needs to fail for. Walking the real tab order, then reading the
 * genuinely-focused element's own computed outline, is the only version
 * that can.
 *
 * Chromium's own `:focus-visible` heuristic is what's actually exercised
 * here: keyboard-driven focus qualifies, a mouse click on a button/link
 * generally doesn't. Asserting a real, non-zero outline after reaching the
 * target by keyboard is therefore a genuine test of
 * `docs/standing-constraints.md`'s "an interactive element ships with its
 * focus-visible styling and a test" — not a proxy for it.
 */
export async function expectFocusVisibleOutline(
  page: Page,
  target: Measured,
  maxTabPresses = 25,
): Promise<void> {
  const handle = await target.locator.elementHandle();
  if (!handle) throw new Error(`${target.label}: element not found, cannot Tab to it`);

  let presses = 0;
  let reached = false;
  while (presses < maxTabPresses && !reached) {
    await page.keyboard.press("Tab");
    presses += 1;
    reached = await page.evaluate((el) => document.activeElement === el, handle);
  }

  expect(reached, `${target.label} was not reached within ${maxTabPresses} Tab presses`).toBe(true);

  const outline = await page.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      width: style.outlineWidth,
      style: style.outlineStyle,
      offset: style.outlineOffset,
    };
  }, handle);

  /**
   * `outline-width >= 2px` alone is not enough — verified by mutation, not
   * assumed: Chromium's own fallback focus ring for a plain link/button
   * that has no author styling at all (`outline-style: auto`) still reports
   * a non-"none" style and a >0 width (1px, 1px offset, in the browsers
   * this suite runs against) — deleting this app's actual
   * `focus-visible:outline-*` classes from an element and re-running this
   * check used to still pass, against the native fallback. Both `width`
   * and `offset` being at least 2px is what actually distinguishes this
   * design system's intentional styling (every focus ring in this app is
   * 3px, offset 3px) from that fallback, which never reaches 2px on
   * either axis.
   */
  const MIN_INTENTIONAL_PX = 2;
  expect(
    outline.style,
    `${target.label}: focus-visible outline-style is "${outline.style}" — no visible focus ring`,
  ).not.toBe("none");
  expect(
    Number.parseFloat(outline.width),
    `${target.label}: focus-visible outline-width is "${outline.width}" — looks like the ` +
      `browser's own unstyled fallback ring (1px), not this app's intentional styling`,
  ).toBeGreaterThanOrEqual(MIN_INTENTIONAL_PX);
  expect(
    Number.parseFloat(outline.offset),
    `${target.label}: focus-visible outline-offset is "${outline.offset}" — looks like the ` +
      `browser's own unstyled fallback ring (1px offset), not this app's intentional styling`,
  ).toBeGreaterThanOrEqual(MIN_INTENTIONAL_PX);
}

function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function parseRgb(css: string): readonly [number, number, number] {
  const m = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) throw new Error(`not an rgb()/rgba() color: "${css}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * WCAG contrast ratio between two colors, each as `getComputedStyle` resolves
 * them — always an `rgb()`/`rgba()` string regardless of the source CSS
 * syntax (a hex value, a `theme()` token, a named color). Assumes both are
 * opaque against an opaque page, which holds for every surface this design
 * system defines — there is no semi-transparent background anywhere in it.
 */
export function contrastRatio(colorA: string, colorB: string): number {
  const lumA = relativeLuminance(parseRgb(colorA));
  const lumB = relativeLuminance(parseRgb(colorB));
  const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

export interface DragOptions {
  /** Signed horizontal displacement in CSS px. Negative drags left. */
  readonly dx: number;
  /** Intermediate `pointermove` events. */
  readonly steps?: number;
  /** Wall-clock gap between moves. ~16ms is one animation frame at 60Hz. */
  readonly stepDelayMs?: number;
  /** Pause between the final move and `pointerup`. */
  readonly holdBeforeReleaseMs?: number;
}

/**
 * Drive a real pointerdown → pointermove* → pointerup sequence.
 *
 * The delays are the point. `page.mouse.move(x, y, { steps })` dispatches every
 * move in the same tick, so `event.timeStamp` barely advances and any velocity
 * computed from it is fiction. Spacing the moves in wall-clock time is what
 * makes this exercise the gesture rather than inspect it.
 *
 * Use this for *distance*-driven gestures only. It cannot express a velocity:
 * the gap between two `page.mouse` events is however long the CDP round trip
 * took — measured at ~3ms on an idle laptop and far more on a loaded runner —
 * so the same script reads as 0.6 px/ms one run and 0.05 px/ms the next. For
 * anything that turns on velocity, use `flickWithTimestamps`.
 */
export async function dragHorizontally(
  page: Page,
  target: Locator,
  opts: DragOptions,
): Promise<void> {
  const { dx, steps = 12, stepDelayMs = 16, holdBeforeReleaseMs = 0 } = opts;
  const box = await rectOf(target, "drag target");
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(startX, y);
  await page.mouse.down();

  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (dx * i) / steps, y);
    if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
  }

  if (holdBeforeReleaseMs > 0) await page.waitForTimeout(holdBeforeReleaseMs);
  await page.mouse.up();
}

export interface FlickOptions {
  /** Signed horizontal displacement in CSS px. Negative flicks left. */
  readonly dx: number;
  /** Time the displacement is stated to have taken. Velocity is `dx / overMs`. */
  readonly overMs: number;
}

/**
 * Flick with a *stated* velocity rather than a hoped-for one.
 *
 * The swipe hook decides between a tap and a fling from the instantaneous
 * velocity between the last two pointermove samples. `page.mouse` cannot drive
 * that: it stamps each event with the wall clock at the moment CDP delivers it,
 * so the velocity a test produces is really a measurement of the machine's
 * latency. That is not a slow test, it is a test that stops testing — an
 * assertion that "a 2px twitch does not commit" passes on a loaded runner
 * whether or not the code still refuses the twitch, and passes quietly.
 *
 * `Input.dispatchMouseEvent` takes an explicit timestamp and Blink carries it
 * through to `event.timeStamp`, so the velocity below is the velocity the hook
 * computes. Verified: `{ dx: 2, overMs: 1 }` arrives as a 1.00ms gap.
 *
 * Chromium-only, which this harness already is.
 */
export async function flickWithTimestamps(
  page: Page,
  target: Locator,
  opts: FlickOptions,
): Promise<void> {
  const box = await rectOf(target, "flick target");
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);

  const cdp = await page.context().newCDPSession(page);
  try {
    // Input.TimeSinceEpoch is seconds, fractional.
    const t0 = Date.now() / 1000;
    const common = { x, y, button: "left" as const };

    await cdp.send("Input.dispatchMouseEvent", {
      ...common,
      type: "mousePressed",
      buttons: 1,
      clickCount: 1,
      timestamp: t0,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      ...common,
      x: x + opts.dx,
      type: "mouseMoved",
      buttons: 1,
      timestamp: t0 + opts.overMs / 1000,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      ...common,
      x: x + opts.dx,
      type: "mouseReleased",
      buttons: 0,
      clickCount: 1,
      timestamp: t0 + (opts.overMs + 1) / 1000,
    });
  } finally {
    await cdp.detach();
  }
}
