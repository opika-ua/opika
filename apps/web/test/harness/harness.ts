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
 * Assert the document does not scroll in either axis.
 *
 * `window.innerWidth/Height` rather than the nominal viewport, because once a
 * scrollbar appears it takes width from the layout and the nominal number
 * stops describing what the user sees.
 */
export async function expectNoViewportOverflow(page: Page, viewport: Viewport): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));

  expect(
    m.scrollWidth,
    `document scrollWidth ${m.scrollWidth} exceeds the ${viewport.name} viewport ` +
      `(${m.innerWidth}px) by ${m.scrollWidth - m.innerWidth}px — the page scrolls sideways`,
  ).toBeLessThanOrEqual(m.innerWidth);

  expect(
    m.scrollHeight,
    `document scrollHeight ${m.scrollHeight} exceeds the ${viewport.name} viewport ` +
      `(${m.innerHeight}px) by ${m.scrollHeight - m.innerHeight}px — the page scrolls vertically`,
  ).toBeLessThanOrEqual(m.innerHeight);
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
 * move in the same tick, so `event.timeStamp` barely advances and any
 * velocity computed from it is fiction. Spacing the moves in wall-clock time
 * is what makes this exercise the gesture rather than inspect it — including
 * the 2px-in-1ms flick that a real thumb produces when tapping.
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
