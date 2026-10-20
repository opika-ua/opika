/**
 * A small rendering harness over Playwright.
 *
 * It exists because three milestones in a row were signed off on checks that
 * confirmed the shape of the code rather than its behaviour — most sharply at
 * M5, where "the /discovery page renders" was concluded by fetching the HTML
 * and grepping it for card text, while the action row sat on top of the card
 * and the gesture did not work at all.
 *
 * So what this file provides is what grepping markup cannot do: drive a real
 * pointer sequence and a real tab order through the real event loop.
 *
 * 2026-10-20: the layout-measuring helpers (overlap, containment, margins,
 * viewport overflow, touch-target boxes, row counts, contrast, `sizes` and
 * srcset resolution) are gone, removed with the tests that used them
 * (Oleksii, 2026-10-20, verbatim: "UI-measuring tests: yes, keep both V-B2
 * tests (the 48px shared controls and the focus indicator being present).
 * They’re accessibility guarantees, not looks. Drop the rest that measure
 * appearance."). See CLAUDE.md, "Test logic, not looks".
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

/** A locator with a human name, so failures say which element it was. */
export interface Measured {
  readonly label: string;
  readonly locator: Locator;
}

/**
 * Load a route at an exact viewport size.
 *
 * `readySelector` is awaited rather than a fixed sleep: the deck mounts on the
 * client, and asserting before hydration tests the wrong thing.
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
 * Real Tab presses, not `locator.focus()`: `focus()` succeeds on a
 * `tabindex="-1"` element (removed from the tab order), so a `focus()`-based
 * check can't fail for the reason a keyboard-operation test needs to fail
 * for. This walks the real tab order and asserts `target` is in it.
 *
 * Reachability only, not appearance. Until 2026-10-20 this was
 * `expectFocusVisibleOutline` and also asserted the focused element's
 * computed outline width and offset; those were measurements of how focus
 * looks, removed with the other UI-measuring tests (Oleksii, 2026-10-20,
 * verbatim: "Drop the rest that measure appearance."). The one focus
 * indicator presence test V-B2 keeps lives in
 * `kabinet-profile-edit.harness.ts`.
 */
export async function expectReachableByTab(
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
