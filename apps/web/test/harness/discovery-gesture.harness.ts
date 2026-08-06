/**
 * Gesture assertions for /discovery, driven through real pointer events.
 *
 * M5 was signed off as working while the gesture did not function at all. No
 * amount of reading the hook would have settled it; the only thing that
 * settles it is pressing, moving and releasing, then looking at what the deck
 * did. That is all this file does.
 *
 * The card exposes its animal name as `aria-label`, so "did the deck advance"
 * is observable without reaching into React internals.
 */

import { expect, test } from "@playwright/test";
import { dragHorizontally, flickWithTimestamps, openRoute } from "./harness";
import { PHONE } from "./viewports";

const ROUTE = "/discovery";
const CARD = "[data-testid='swipe-card']";

/** The name on the currently-top card. */
async function topCardName(page: import("@playwright/test").Page): Promise<string> {
  const label = await page.getByTestId("swipe-card").getAttribute("aria-label");
  expect(label, "the top card should expose its animal name as aria-label").not.toBeNull();
  return label ?? "";
}

test.describe(`/discovery gesture at ${PHONE.name}`, () => {
  test.beforeEach(async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
  });

  test("a deliberate drag past the threshold advances the deck", async ({ page }) => {
    const before = await topCardName(page);

    // 140px is past the 88px commit distance, spread over ~12 frames so the
    // gesture looks like a thumb rather than a teleport.
    await dragHorizontally(page, page.getByTestId("swipe-card"), {
      dx: 140,
      steps: 12,
      stepDelayMs: 16,
    });

    await expect
      .poll(() => topCardName(page), {
        message: `the deck should have advanced past "${before}" after a committed swipe`,
        timeout: 5_000,
      })
      .not.toBe(before);
  });

  test("a drag well short of the threshold snaps back and keeps the card", async ({ page }) => {
    const before = await topCardName(page);

    await dragHorizontally(page, page.getByTestId("swipe-card"), {
      dx: 20,
      steps: 10,
      stepDelayMs: 24,
    });

    await page.waitForTimeout(600); // let the spring-back finish
    expect(await topCardName(page), "a 20px drag must not commit").toBe(before);
  });

  /**
   * The positive control for the pair below, and it has to come first: a test
   * that asserts "the deck did not advance" proves nothing unless the same
   * driver can also make it advance. Without this, a `flickWithTimestamps` that
   * silently delivered no events at all would look like a passing tap test.
   *
   * 30px in 5ms is 6 px/ms — over the velocity threshold and well under the
   * 88px distance threshold, so this can only commit down the velocity path.
   */
  test("a fast short flick past the velocity threshold advances the deck", async ({ page }) => {
    const before = await topCardName(page);

    await flickWithTimestamps(page, page.getByTestId("swipe-card"), { dx: 30, overMs: 5 });

    await expect
      .poll(() => topCardName(page), {
        message:
          `a 30px flick in 5ms (6 px/ms) is over the 0.45 px/ms commit velocity and should ` +
          `have advanced the deck past "${before}" — if this fails alongside the tap test ` +
          `below, suspect the driver rather than the gesture`,
        timeout: 5_000,
      })
      .not.toBe(before);
  });

  /**
   * Lost fix 6, in a real browser rather than only in the pure function.
   *
   * A tap is never perfectly still: the pointer moves a pixel or two within a
   * millisecond or so, which is an *instantaneous* velocity far above the
   * 0.45 px/ms commit threshold. 2px in 1ms is 2 px/ms.
   *
   * The timestamps have to be dispatched explicitly. Driving this with
   * `page.mouse` produced whatever velocity the CDP round trip happened to
   * imply — ~0.6 px/ms on an idle machine, a tenth of that under load — so the
   * assertion passed on a loaded runner with the 12px floor deleted. It read as
   * a lock and was a coin toss.
   */
  test("a 2px jitter during a tap does not fling the card away", async ({ page }) => {
    const before = await topCardName(page);

    await flickWithTimestamps(page, page.getByTestId("swipe-card"), { dx: 2, overMs: 1 });

    await page.waitForTimeout(600);
    expect(
      await topCardName(page),
      "a 2px twitch at 2 px/ms is a tap, not a swipe — the deck must not advance",
    ).toBe(before);
  });
});
