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
  expectMinimumBottomMargin,
  expectNoOverlap,
  expectNoViewportOverflow,
  openRoute,
  rectOf,
} from "./harness";
import { DESKTOP, PHONE, SHORT_PHONE, type Viewport } from "./viewports";

const ROUTE = "/discovery";
const CARD = "[data-testid='swipe-card']";

/**
 * Minimum bottom margin the shelter line must keep above the card's edge,
 * per viewport. Not the measured value (that would just re-encode "whatever
 * it happens to be today" as a second copy) and not zero (that's what
 * `expectContainedBy` already covers) — a real floor with slack on both
 * sides, chosen once real fonts made the underlying measurement portable
 * across platforms (see viewports.ts). Measured with next/font's Literata
 * and Commissioner loaded: 46.5px at 390x844, 16px at both 390x640 and
 * 1280x800 (the photo has already shrunk to its floor at both, so they
 * land on the same number). PHONE gets a generous floor since it's the
 * primary, unsqueezed case; the other two get a tighter one since a
 * deliberately squeezed layout has less to give.
 */
const MIN_SHELTER_MARGIN_PX: Record<string, number> = {
  [PHONE.name]: 20,
  [SHORT_PHONE.name]: 4,
  [DESKTOP.name]: 4,
};

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

    // Lost fix 2, the property that matters at any size. Text sliding under
    // the card's `overflow: hidden` edge is invisible in markup — the sentence
    // is present in the DOM and simply not painted.
    test("the freshness block is fully visible inside the card", async ({ page }) => {
      await expectContainedBy(
        { label: "freshness block", locator: page.getByTestId("freshness-block") },
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
      );
    });

    // The shelter's own words are the last thing in the card and therefore the
    // first thing to be clipped by anything above them growing.
    test("the shelter line is fully visible inside the card", async ({ page }) => {
      await expectContainedBy(
        { label: "shelter line", locator: page.getByTestId("shelter-line") },
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
      );
    });

    // Task E: the containment check above is a correctness bar, not an early
    // warning — it only fails once spill turns positive. This is the
    // separate assertion that the margin measured with real fonts loaded
    // (see MIN_SHELTER_MARGIN_PX) hasn't quietly eroded.
    test("the shelter line keeps a real margin, not a vanishing one", async ({ page }) => {
      await expectMinimumBottomMargin(
        { label: "shelter line", locator: page.getByTestId("shelter-line") },
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
        MIN_SHELTER_MARGIN_PX[viewport.name] ?? 0,
      );
    });

    // Lost fix 3.
    test("the page does not overflow the viewport in either axis", async ({ page }) => {
      await expectNoViewportOverflow(page, viewport);
    });
  });
}

/**
 * Lost fix 2, the other half: which of the design doc's two photo dimensions
 * won.
 *
 * README:191 gives the photo AREA height as 396. README:307's "photo 4:5"
 * describes the source photography — :39 and :353 both say so, and say it is
 * cropped `object-fit: cover`. So 4:5 is the asset's shape and 396 is the
 * slot's; cover is what reconciles them. 4:5 applied to the container makes it
 * 417.5px on the 334px content box, 21.5px taller than specified.
 *
 * Phone only, deliberately. 396 is a statement about the viewport the design
 * was drawn at. At 1280x800 the card is shorter and the photo is *supposed* to
 * shrink below 396 — it is the flex item that gives way so the shelter's words
 * never do. Asserting 396 everywhere would forbid that.
 */
test.describe(`/discovery photo sizing at ${PHONE.name}`, () => {
  test("the photo area is the height the feed screen specifies", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    const photo = await rectOf(page.getByTestId("card-photo"), "photo area");

    expect(
      Math.round(photo.height),
      `photo area is ${photo.height}px; docs/design/README.md:191 specifies 396.\n` +
        `        417.5 means the container is carrying the 4:5 source ratio, which is\n` +
        `        the asset's shape, not the slot's.\n` +
        `        Anything else means something above the photo grew, or the card\n` +
        `        got shorter and the photo shrank to protect the text — check the\n` +
        `        card height before assuming this is about the ratio.`,
    ).toBe(396);
  });

  /**
   * The photo must be able to give way, and this is a separate lock from the
   * one above rather than a second opinion on it: pinning the photo at a fixed
   * 396 with `flex-shrink: 0` passes the height assertion and reintroduces the
   * clipping on any shorter card. Neither assertion implies the other.
   */
  test("the photo yields to the text when the card is short", async ({ page }) => {
    await openRoute(page, ROUTE, SHORT_PHONE, { readySelector: CARD });

    const photo = await rectOf(page.getByTestId("card-photo"), "photo area");
    expect(
      photo.height,
      "on a 640px-tall screen the photo should have shrunk below its 396px design height",
    ).toBeLessThan(396);

    await expectContainedBy(
      { label: "shelter line", locator: page.getByTestId("shelter-line") },
      { label: "swipe card", locator: page.getByTestId("swipe-card") },
    );
    await expectMinimumBottomMargin(
      { label: "shelter line", locator: page.getByTestId("shelter-line") },
      { label: "swipe card", locator: page.getByTestId("swipe-card") },
      MIN_SHELTER_MARGIN_PX[SHORT_PHONE.name] ?? 0,
    );
  });
});

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
