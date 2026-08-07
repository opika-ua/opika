/**
 * Column-count assertions for /tvaryny — real bounding rects, not a
 * `grid-cols-N` class read out of markup. "Correct column count at every
 * width" is E1's own definition of done, so this is the assertion that
 * would actually fail if the responsive grid or the card's breakpoint
 * reflow were wrong, the same standard discovery-layout.harness.ts holds
 * the deck to.
 *
 * `GALLERY_PAGE_SIZE` (packages/contracts/src/procedures/pagination.ts) is
 * 24 specifically because it divides evenly by every column count here
 * (1/2/3/4) — every row at every breakpoint should be full, no ragged last
 * row to special-case.
 */

import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, openRoute, rectOf, rowCounts } from "./harness";
import { DESKTOP, GALLERY_TABLET, GALLERY_WIDE, PHONE, type Viewport } from "./viewports";

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const GALLERY_PAGE_SIZE = 24;

const BREAKPOINTS: ReadonlyArray<{ viewport: Viewport; columns: number }> = [
  { viewport: PHONE, columns: 1 },
  { viewport: GALLERY_TABLET, columns: 2 },
  { viewport: DESKTOP, columns: 3 },
  { viewport: GALLERY_WIDE, columns: 4 },
];

for (const { viewport, columns } of BREAKPOINTS) {
  test.describe(`/tvaryny at ${viewport.name}`, () => {
    test(`renders ${columns} card${columns === 1 ? "" : "s"} per row`, async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });

      const cards = await page.locator(CARD).all();
      expect(
        cards.length,
        `expected a full page of ${GALLERY_PAGE_SIZE} seeded animals, got ${cards.length} — ` +
          `is the harness database actually seeded? (playwright.config.ts webServer runs ` +
          `db:migrate then db:seed before next start)`,
      ).toBe(GALLERY_PAGE_SIZE);

      const counts = await rowCounts(cards);
      expect(
        counts,
        `row sizes were [${counts.join(", ")}] at ${viewport.name} — every row should be ` +
          `exactly ${columns} wide (${GALLERY_PAGE_SIZE} items / ${columns} columns = ` +
          `${GALLERY_PAGE_SIZE / columns} full rows, no remainder)`,
      ).toEqual(Array(GALLERY_PAGE_SIZE / columns).fill(columns));
    });

    // Vertical scroll is correct here — 24 cards in a grid is normally
    // taller than one screen, unlike the deck's fixed single-card viewport
    // (discovery-layout.harness.ts). Horizontal scroll would still mean a
    // real defect (a card or the grid itself spilling past the right edge).
    test("does not scroll sideways", async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });
      await expectNoHorizontalOverflow(page, viewport);
    });
  });
}

/**
 * The two layout variants are different shapes, not just a reflowed count:
 * "120px photo left, text right" (tablet) vs. photo 4:5, full width
 * (phone, desktop, wide) — docs/design/README.md, "Breakpoints & Surfaces"
 * and "The Gallery" > "Card". A column-count match alone would not catch a
 * broken `tablet:aspect-auto`/`tablet:w-30` that still happened to wrap at
 * the right width.
 */
test.describe("/tvaryny card shape by breakpoint", () => {
  test(`the photo is a fixed ~120px column at ${GALLERY_TABLET.name}`, async ({ page }) => {
    await openRoute(page, ROUTE, GALLERY_TABLET, { readySelector: CARD });
    const photo = await rectOf(page.getByTestId("card-photo").first(), "first card's photo");

    expect(
      photo.width,
      `photo is ${photo.width}px wide at ${GALLERY_TABLET.name}; docs/design/README.md's ` +
        `tablet card is "120px photo left, text right"`,
    ).toBeCloseTo(120, 0);
  });

  for (const viewport of [PHONE, DESKTOP, GALLERY_WIDE] satisfies Viewport[]) {
    test(`the photo keeps a 4:5 ratio at ${viewport.name}`, async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });
      const photo = await rectOf(page.getByTestId("card-photo").first(), "first card's photo");

      const ratio = photo.width / photo.height;
      expect(
        ratio,
        `photo is ${photo.width}x${photo.height} (ratio ${ratio.toFixed(3)}) at ` +
          `${viewport.name}; docs/design/README.md specifies 4:5 (0.8) for this breakpoint`,
      ).toBeCloseTo(0.8, 1);
    });
  }
});
