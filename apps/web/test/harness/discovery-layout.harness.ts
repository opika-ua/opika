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
 * `expectContainedBy` already covers) — a real floor with slack where slack
 * still exists (see viewports.ts).
 *
 * V2 repoint, in two stages. First (name growing 26px -> display-m 34px):
 * PHONE 46.5px -> 16.0px, DESKTOP unchanged at 16.0px, SHORT_PHONE 16.0px
 * -> 0.0px — the photo was already pinned at its 200px `min-h-50` floor at
 * that size, so the whole increase landed on the margin with nowhere else
 * to go. Second (the deck text block's own spacing corrected to
 * `Opika Registry System.dc.html`'s actual values — the sentence at 15/22
 * not body-l's 17/26, freshness block padding 16 not 12, min-height 88 not
 * 108, text block gap 12/padding `0 8` not the old spacing tokens):
 * SHORT_PHONE's margin recovered to a measured 12.0px, PHONE and DESKTOP
 * unaffected (their photos had room to give and already absorbed stage
 * one). Floors below carry a few px of slack under each measured value,
 * matching the margin already recorded for PHONE.
 */
const MIN_SHELTER_MARGIN_PX = new Map<Viewport, number>([
  [PHONE, 12],
  [SHORT_PHONE, 8],
  [DESKTOP, 4],
]);

/**
 * Keyed by the viewport object, not its `name`, and loud when absent.
 * `MIN_SHELTER_MARGIN_PX[v.name] ?? 0` would turn a renamed viewport — or a
 * newly added one — into a silently vacuous assertion: a 0 floor passes for
 * anything `expectContainedBy` already passes, so the test would still be
 * green while asserting nothing.
 */
function minShelterMarginFor(viewport: Viewport): number {
  const px = MIN_SHELTER_MARGIN_PX.get(viewport);
  if (px === undefined) {
    throw new Error(
      `no shelter-line margin floor recorded for ${viewport.name}. Measure the margin at ` +
        `that size and add an entry to MIN_SHELTER_MARGIN_PX — defaulting to 0 would leave ` +
        `this assertion passing without checking anything.`,
    );
  }
  return px;
}

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
        minShelterMarginFor(viewport),
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
  /**
   * V2 repoint: 396 -> 388 -> back to 396. The first repoint (name growing
   * to display-m, 34px up from 26px) was real, but the text block below it
   * was oversized at the time — 17/26 shelter sentence instead of the B7
   * frame's own 15/22, and padding/gap values that didn't match
   * `Opika Registry System.dc.html` (12/8 padding, 12 gap, not the pre-V2
   * spacing tokens the migration had left in place). Correcting those gave
   * the photo its room back; 396 is what the card's real content actually
   * yields, not a coincidence that it matches the pre-V2 number. This test
   * exists to catch an *accidental* shift (something above the photo
   * growing further, or the card getting shorter), not to keep any one
   * number pinned regardless of why it changed.
   */
  test("the photo area is the height the feed screen specifies", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    const photo = await rectOf(page.getByTestId("card-photo"), "photo area");

    expect(
      Math.round(photo.height),
      `photo area is ${photo.height}px; expected 396 (V2's name/meta/freshness ` +
        `block at ${PHONE.name}, docs/design/README.md's "The deck").\n` +
        `        Anything else means something above the photo grew, or the card\n` +
        `        got shorter and the photo shrank to protect the text — check the\n` +
        `        card height before assuming this is about the ratio.`,
    ).toBe(396);
  });

  /**
   * The photo must be able to give way, and this is a separate lock from the
   * one above rather than a second opinion on it: pinning the photo at a fixed
   * height with `flex-shrink: 0` passes the height assertion and reintroduces
   * the clipping on any shorter card. Neither assertion implies the other.
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
      minShelterMarginFor(SHORT_PHONE),
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
