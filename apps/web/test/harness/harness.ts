/**
 * A small rendering harness over Playwright.
 *
 * It exists because three milestones in a row were signed off on checks that
 * confirmed the shape of the code rather than its behaviour - most sharply at
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
  /** Stated time between moves, stamped on the events. ~16ms is one frame at 60Hz. */
  readonly stepMs?: number;
  /** Stated time between the final move and `pointerup`. */
  readonly holdBeforeReleaseMs?: number;
}

/**
 * Drive a real pointerdown → pointermove* → pointerup sequence, with every
 * event's time stated rather than waited for.
 *
 * The times are the point. `page.mouse.move(x, y, { steps })` dispatches every
 * move in the same tick, so `event.timeStamp` barely advances and any velocity
 * computed from it is fiction. This used to space the moves with real sleeps,
 * which only moved the fiction: the gap between two `page.mouse` events is
 * however long the sleep plus the CDP round trip took, so the same script read
 * as one velocity on an idle machine and another on a loaded one. Stamping each
 * event (see `dispatchStamped`) makes the velocity the hook computes exactly
 * `dx / steps / stepMs`, on any machine, and the helper never waits on the
 * real clock (Oleksii, 2026-10-20: "the drag helper without real sleeps").
 */
export async function dragHorizontally(
  page: Page,
  target: Locator,
  opts: DragOptions,
): Promise<void> {
  const { dx, steps = 12, stepMs = 16, holdBeforeReleaseMs = 0 } = opts;
  const moves = Array.from({ length: steps }, (_, i) => ({
    dx: (dx * (i + 1)) / steps,
    atMs: stepMs * (i + 1),
  }));
  await dispatchStamped(page, target, "drag target", {
    moves,
    releaseAtMs: stepMs * steps + holdBeforeReleaseMs,
  });
}

/** The swipe card's inline transform once the return spring has come to rest (CSSOM-normalised). */
export const CARD_AT_REST_TRANSFORM = "translate3d(0px, 0px, 0px) rotate(0deg)";

/**
 * The top card's name once the deck has settled after a gesture that should
 * not advance it, for a "did not advance" assertion to read.
 *
 * Settled is a state, not a duration. The card carries no inline transform
 * until a gesture moves it, and the return spring's last write puts it at
 * exactly `CARD_AT_REST_TRANSFORM` (`springToOrigin`, and the reduced-motion
 * return), so that string means "this card was moved and has come back to
 * rest". A deck that advanced instead shows another card's name. This waits
 * for whichever comes first and returns the name then; the caller asserts it.
 *
 * It replaces a fixed 600ms sleep, which guessed the spring would be done by
 * then: on a slow runner it read the deck mid-flight, and the negative
 * assertion passed whether or not the gesture was broken. A gesture that
 * delivered no events at all never reaches rest and fails here, by timeout,
 * rather than passing vacuously.
 */
export async function nameOnceSettled(page: Page, before: string): Promise<string> {
  const card = page.getByTestId("swipe-card");
  const read = () =>
    card.evaluate((el) => ({
      name: el.getAttribute("aria-label"),
      transform: (el as HTMLElement).style.transform,
    }));
  await expect
    .poll(
      async () => {
        const { name, transform } = await read();
        return name !== before || transform === CARD_AT_REST_TRANSFORM;
      },
      {
        message: `the card "${before}" neither came back to rest nor gave way to another card`,
        timeout: 5_000,
      },
    )
    .toBe(true);
  return (await read()).name ?? "";
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
 * latency. That is not a slow test, it is a test that stops testing - an
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
  await dispatchStamped(page, target, "flick target", {
    moves: [{ dx: opts.dx, atMs: opts.overMs }],
    releaseAtMs: opts.overMs + 1,
  });
}

interface StampedGesture {
  /** Each move's offset from the press point, and its time after the press. */
  readonly moves: ReadonlyArray<{ readonly dx: number; readonly atMs: number }>;
  /** The release's time after the press, at the last move's offset. */
  readonly releaseAtMs: number;
}

/**
 * Press, move and release on `target`'s centre with each event's timestamp
 * stated through `Input.dispatchMouseEvent`, which Blink carries through to
 * `event.timeStamp`.
 *
 * The times are stamped forward from now, never back: a stamp earlier than
 * the page's own time origin arrives clamped to 0 (measured, Chromium 151),
 * which would make every gap zero.
 */
async function dispatchStamped(
  page: Page,
  target: Locator,
  label: string,
  gesture: StampedGesture,
): Promise<void> {
  const box = await rectOf(target, label);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const lastDx = gesture.moves.at(-1)?.dx ?? 0;

  const cdp = await page.context().newCDPSession(page);
  try {
    // Input.TimeSinceEpoch is seconds, fractional. A clock read to anchor
    // the stamps, not a wait.
    const t0 = Date.now() / 1000;
    const common = { y, button: "left" as const };

    await cdp.send("Input.dispatchMouseEvent", {
      ...common,
      x,
      type: "mousePressed",
      buttons: 1,
      clickCount: 1,
      timestamp: t0,
    });
    for (const move of gesture.moves) {
      await cdp.send("Input.dispatchMouseEvent", {
        ...common,
        x: x + move.dx,
        type: "mouseMoved",
        buttons: 1,
        timestamp: t0 + move.atMs / 1000,
      });
    }
    await cdp.send("Input.dispatchMouseEvent", {
      ...common,
      x: x + lastDx,
      type: "mouseReleased",
      buttons: 0,
      clickCount: 1,
      timestamp: t0 + gesture.releaseAtMs / 1000,
    });
  } finally {
    await cdp.detach();
  }
}

/** True when the page does not scroll sideways (an accessibility floor, not a look). Used by the shelter and gallery-card specs; dev-ui and gallery-filters-v2 still read it inline. */
export function noSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

/** The touch-target floor: the control's box is at least 48px tall. */
export async function expectMinTargetHeight(locator: Locator, minimum = 48): Promise<void> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the control has no box (not rendered or hidden)");
  if (box.height < minimum) throw new Error(`target height ${box.height}px is under ${minimum}px`);
}

/**
 * What every tab row must keep (tabs-polish): at most 48px tall, no vertical scroll, a pointer on
 * every tab, and the keyboard focus ring of the first tab inside the row's clip.
 */
export async function expectTabRowSound(page: Page, row: Locator): Promise<void> {
  const measured = await row.evaluate((node) => {
    const tabs = [...node.querySelectorAll<HTMLElement>('[role="tab"]')];
    const first = tabs[0];
    if (first === undefined) throw new Error("no tab");
    return {
      height: node.getBoundingClientRect().height,
      overflow: node.scrollHeight - node.clientHeight,
      cursors: tabs.map((tab) => getComputedStyle(tab).cursor),
    };
  });
  expect(measured.height).toBeLessThanOrEqual(48);
  expect(measured.overflow).toBeLessThanOrEqual(0);
  expect(measured.cursors.length).toBeGreaterThan(0);
  for (const cursor of measured.cursors) expect(cursor).toBe("pointer");

  // A key press first, so the programmatic focus counts as keyboard focus.
  await page.keyboard.press("Shift");
  await row.getByRole("tab").first().focus();
  const ring = await row.evaluate((node) => {
    const tab = node.querySelector<HTMLElement>('[role="tab"]');
    if (tab === null) throw new Error("no tab");
    const style = getComputedStyle(tab);
    const rowStyle = getComputedStyle(node);
    const reach = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
    const clip = node.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    return {
      drawn: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0,
      top: box.top - reach - (clip.top + Number.parseFloat(rowStyle.borderTopWidth)),
      bottom: clip.bottom - Number.parseFloat(rowStyle.borderBottomWidth) - (box.bottom + reach),
      left: box.left - reach - clip.left,
    };
  });
  expect(ring.drawn).toBe(true);
  expect(ring.top).toBeGreaterThanOrEqual(0);
  expect(ring.bottom).toBeGreaterThanOrEqual(0);
  expect(ring.left).toBeGreaterThanOrEqual(0);
}
