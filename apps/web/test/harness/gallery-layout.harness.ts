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
import {
  DESKTOP,
  GALLERY_DESKTOP_ROOMY,
  GALLERY_TABLET,
  GALLERY_WIDE,
  GALLERY_WIDE_ROOMY,
  PHONE,
  type Viewport,
} from "./viewports";

/**
 * `proxy.ts` rate-limits `/tvaryny` at 100 req/min per IP, shared across
 * every harness file that requests it under the real local identity — see
 * `gallery-arrow-nav.harness.ts`'s comment for the real, reproducing 429
 * this caused once that file's requests joined this one's and
 * `gallery-filters.harness.ts`'s in the same shared budget. Isolates this
 * file's own volume the same way `gallery-rate-limit.harness.ts` already
 * isolates its own deliberate budget exhaustion.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.23" } });

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

/**
 * `docs/design/README.md`: "content 960" (1024-1439) / "content max 1320"
 * (1440+). Originally read (E1, no rail yet) as an exact constant every
 * viewport in each bracket must hit, which is what the border-box bug this
 * comment used to describe was measured against: `max-width` and padding
 * sharing one element caps the container's own *border* box regardless of
 * padding, landing ~120px short (840/1200) of the true content-box number
 * — caught by measuring the first row's actual card span rather than
 * `rectOf(gallery-grid)` alone, which max-width would have kept reporting
 * as exactly 960/1320 either way.
 *
 * E2 added a fixed 280px rail + 32px gap beside the grid, which the
 * 960/1320 figures never accounted for — arithmetic docs/design/README.md
 * now states explicitly. 960/1320 are the grid's own ceiling, not a
 * constant: `DESKTOP` (1280) and `GALLERY_WIDE` (1600) sit below the point
 * where that ceiling is reachable at all once the rail is subtracted, so
 * the correct span there is the *fluid* remainder, computed below, not
 * 960/1320 themselves. `GALLERY_DESKTOP_ROOMY`/`GALLERY_WIDE_ROOMY` are
 * the other half of that claim: proof the ceiling is a real number the
 * grid actually reaches, not a cap that never binds.
 */
test.describe("/tvaryny content width", () => {
  /** docs/design/README.md, "Breakpoints & Surfaces": page padding 60px a side (desktop/wide). */
  const PAGE_PADDING_PX = 60 * 2;
  /** docs/design/README.md, "The Gallery" > "Rail, count, sort": the rail's own fixed width. */
  const RAIL_PX = 280;
  /** docs/design/README.md, "Breakpoints & Surfaces": "rail↔grid gap 32". */
  const RAIL_GAP_PX = 32;

  const fluidContentWidth = (viewportPx: number, ceilingPx: number): number =>
    Math.min(ceilingPx, viewportPx - PAGE_PADDING_PX - RAIL_PX - RAIL_GAP_PX);

  const CONTENT_WIDTH: ReadonlyArray<{ viewport: Viewport; columns: number; ceilingPx: number }> = [
    { viewport: DESKTOP, columns: 3, ceilingPx: 960 },
    { viewport: GALLERY_DESKTOP_ROOMY, columns: 3, ceilingPx: 960 },
    { viewport: GALLERY_WIDE, columns: 4, ceilingPx: 1320 },
    { viewport: GALLERY_WIDE_ROOMY, columns: 4, ceilingPx: 1320 },
  ];

  for (const { viewport, columns, ceilingPx } of CONTENT_WIDTH) {
    const expectedPx = fluidContentWidth(viewport.width, ceilingPx);
    const reachesCeiling = expectedPx === ceilingPx;

    test(`a full row of cards spans ${expectedPx}px ${
      reachesCeiling
        ? `(the ${ceilingPx} ceiling, reached)`
        : `(fluid, below the ${ceilingPx} ceiling)`
    } at ${viewport.name}`, async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });
      const firstRow = await Promise.all(
        Array.from({ length: columns }, (_, i) =>
          rectOf(page.locator(CARD).nth(i), `card ${i} of the first row`),
        ),
      );

      const left = Math.min(...firstRow.map((r) => r.x));
      const right = Math.max(...firstRow.map((r) => r.x + r.width));
      const span = right - left;

      expect(
        Math.abs(span - expectedPx),
        `the first row's ${columns} cards span ${span.toFixed(1)}px at ${viewport.name}, ` +
          `expected ${expectedPx} (viewport ${viewport.width} - ${PAGE_PADDING_PX} page padding - ` +
          `${RAIL_PX} rail - ${RAIL_GAP_PX} gap, capped at the ${ceilingPx} ceiling). A ~120px ` +
          `shortfall below that means max-width and padding are back on the same border-box ` +
          `element, eating each other's budget — rectOf(gallery-grid) alone would not have caught ` +
          `this, since max-width still caps that element's own border box at ${ceilingPx} either way.`,
      ).toBeLessThanOrEqual(2);
    });
  }
});

/**
 * `<img src>` occupying the right box (asserted above, at every breakpoint)
 * is not evidence the image actually decoded — `photo.storageKey` used to
 * be rendered as a bare object key, 404ing on every card, and the layout
 * assertions above stayed green through that the whole time: the
 * `aspect-[4/5]`/`w-30` box holds its size and `bg-photo-placeholder`'s
 * hatch shows through a failed `<img>` exactly the same as a loading one.
 * This is the check that would actually have caught it.
 */
test.describe("/tvaryny photos actually load", () => {
  /**
   * `next/image` defaults to `loading="lazy"` — confirmed by a first version
   * of this test that checked all 24 without scrolling and found most of
   * them still undecoded, correctly: an image below the fold hasn't been
   * asked to load yet, which is the feature working, not a bug. Real
   * verification of a lazy-loaded gallery has to include actually
   * scrolling, the same way a person would, rather than only checking
   * whatever happens to be in the first viewport.
   */
  test(`every one of the page's ${GALLERY_PAGE_SIZE} photos decodes once scrolled into view`, async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    const imgs = await page.locator(`${CARD} img`).all();
    expect(imgs.length, `expected ${GALLERY_PAGE_SIZE} photos, found ${imgs.length}`).toBe(
      GALLERY_PAGE_SIZE,
    );

    const results: Array<{ i: number; loaded: boolean; src: string | null }> = [];
    for (const [i, img] of imgs.entries()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate((el: HTMLImageElement) => {
        // `complete` becomes true once the browser has finished *attempting*
        // to load — success or failure — so a 404 settles this fast-path
        // almost immediately. The listeners below are the case where the
        // fetch is still in flight: `error` has to be handled explicitly,
        // not just `load`, or a genuinely broken image (the exact case this
        // test exists to catch) hangs here until Playwright's own 30s
        // timeout instead of failing on the real assertion below.
        if (el.complete) return;
        return new Promise<void>((resolve) => {
          el.addEventListener("load", () => resolve(), { once: true });
          el.addEventListener("error", () => resolve(), { once: true });
        });
      });
      const loaded = await img.evaluate((el: HTMLImageElement) => el.naturalWidth > 0);
      results.push({ i, loaded, src: await img.getAttribute("src") });
    }

    const broken = results.filter((r) => !r.loaded);
    expect(
      broken,
      `${broken.length}/${GALLERY_PAGE_SIZE} photos did not decode: ` +
        broken.map((r) => `card ${r.i} <img src="${r.src}">`).join(", "),
    ).toEqual([]);
  });

  /**
   * next/image's `fill` mode sizes the `<img>` to its parent via
   * `position: absolute; inset: 0` — it never sizes the parent itself, which
   * is what `aspect-[4/5]` (phone/desktop/wide) and flex stretch under
   * `tablet:aspect-auto` do independently of whether the image has loaded.
   * That should make a layout shift structurally impossible here, not just
   * unlikely — asserted by measuring the same container before and after its
   * image decodes.
   *
   * The photo responses are held open for `HOLD_PHOTO_MS` first, and the
   * `<img>` is asserted to still be undecoded at the "before" measurement.
   * Without both, this test is decoration: `openRoute` waits for the `load`
   * event, by which point the first card's image has already decoded
   * (measured: `naturalWidth` 624, not 0), so "before" and "after" are two
   * post-load measurements of the same box and the comparison passes no
   * matter what sizes it. Hence `page.goto` + a visible-card wait here
   * rather than `openRoute` — waiting for `load` is exactly what has to
   * not happen.
   */
  const HOLD_PHOTO_MS = 1_500;

  for (const viewport of [PHONE, GALLERY_TABLET] satisfies Viewport[]) {
    test(`the photo box does not resize once its image loads, at ${viewport.name}`, async ({
      page,
    }) => {
      await page.route("**/seed-photos/*.jpg", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, HOLD_PHOTO_MS));
        await route.continue();
      });

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
      await page.locator(CARD).first().waitFor({ state: "visible" });

      const container = page.getByTestId("card-photo").first();
      const img = page.locator(`${CARD} img`).first();

      const naturalWidthBefore = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(
        naturalWidthBefore,
        `the first card's image had already decoded (naturalWidth ` +
          `${naturalWidthBefore}) before the "before" measurement — the ` +
          `comparison below would then be two post-load rects and could not ` +
          `fail. Is the ${HOLD_PHOTO_MS}ms photo hold still in effect?`,
      ).toBe(0);

      const before = await rectOf(container, "photo box, pre-load");

      await img.evaluate(
        (el: HTMLImageElement) =>
          new Promise<void>((resolve) => {
            if (el.complete) resolve();
            else {
              el.addEventListener("load", () => resolve(), { once: true });
              el.addEventListener("error", () => resolve(), { once: true });
            }
          }),
      );
      const naturalWidthAfter = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(naturalWidthAfter, "the held photo never decoded at all").toBeGreaterThan(0);

      const after = await rectOf(container, "photo box, post-load");
      expect(
        after,
        `photo box measured ${before.width}x${before.height} before its image loaded and ` +
          `${after.width}x${after.height} after — the box should be sized by CSS alone, ` +
          `never by the image`,
      ).toEqual(before);
    });
  }
});
