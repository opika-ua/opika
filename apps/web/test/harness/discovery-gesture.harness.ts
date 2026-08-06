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
import { dragHorizontally, openRoute } from "./harness";
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
   * Lost fix 6, verified in a real browser rather than only in the pure
   * function. A tap is never perfectly still: the pointer moves a pixel or
   * two within a millisecond or so, which is an *instantaneous* velocity far
   * above the 0.45 px/ms commit threshold. The unit test pins the decision
   * function; this pins the thing the user actually does.
   */
  test("a 2px jitter during a tap does not fling the card away", async ({ page }) => {
    const before = await topCardName(page);

    await dragHorizontally(page, page.getByTestId("swipe-card"), {
      dx: 2,
      steps: 1,
      stepDelayMs: 1,
    });

    await page.waitForTimeout(600);
    expect(
      await topCardName(page),
      "a 2px twitch is a tap, not a swipe — the deck must not advance",
    ).toBe(before);
  });
});
