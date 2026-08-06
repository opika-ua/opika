/**
 * Layout assertions for /discovery.
 *
 * Each test here corresponds to a defect that shipped through a green CI and a
 * "renders correctly" sign-off, because the only check applied was that the
 * text appeared somewhere in the HTML. Text in the HTML is exactly what all
 * three of these had.
 */

import { expect, test } from "@playwright/test";
import {
  expectContainedBy,
  expectNoOverlap,
  expectNoViewportOverflow,
  openRoute,
  rectOf,
} from "./harness";
import { DESKTOP, PHONE, type Viewport } from "./viewports";

const ROUTE = "/discovery";
const CARD = "[data-testid='swipe-card']";

for (const viewport of [PHONE, DESKTOP] satisfies Viewport[]) {
  test.describe(`/discovery at ${viewport.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });
    });

    // Lost fix 1.
    test("the action row sits below the card, not on top of it", async ({ page }) => {
      await expectNoOverlap(
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
        { label: "action row", locator: page.getByTestId("action-row") },
      );
    });

    // Lost fix 2. The photo pushing the text down is invisible in markup: the
    // sentence is present in the DOM and merely clipped by the card's
    // `overflow: hidden`.
    test("the freshness block is fully visible inside the card", async ({ page }) => {
      await expectContainedBy(
        { label: "freshness block", locator: page.getByTestId("freshness-block") },
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
      );
    });

    // Lost fix 3.
    test("the page does not overflow the viewport in either axis", async ({ page }) => {
      await expectNoViewportOverflow(page, viewport);
    });
  });
}

/**
 * The recorded desktop gap.
 *
 * TODO(responsive): /discovery is a 390px phone column centred in whatever
 * width it is given. This assertion states the requirement — the deck should
 * use the space a laptop has — and is expected to fail until the responsive
 * pass lands. `test.fail()` keeps it running rather than skipped, so when the
 * layout does become responsive Playwright reports an *unexpected pass* and
 * whoever fixed it is told to delete this marker. A `skip` would go quiet
 * instead, which is how a known gap turns into a forgotten one.
 */
test.describe("/discovery responsive gap", () => {
  test.fail();

  test(`the deck uses the available width at ${DESKTOP.name}`, async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    const card = await rectOf(page.getByTestId("swipe-card"), "swipe card");

    expect(
      card.width,
      `the card is ${card.width}px wide in a ${DESKTOP.width}px viewport — the layout is ` +
        `phone-only and does not adapt`,
    ).toBeGreaterThan(500);
  });
});
