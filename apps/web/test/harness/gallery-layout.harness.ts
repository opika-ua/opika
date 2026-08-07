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

/**
 * `docs/design/README.md`: "content 960" (1024-1439) / "content max 1320"
 * (1440+) — a real defect nearly shipped here, and one `rectOf` on the grid
 * container itself cannot see: Preflight is border-box, so `max-width` caps
 * the container's own *border* box regardless of its padding — a
 * `max-w-[960px]` element measures 960px via `getBoundingClientRect()`
 * whether or not `px-15` is also on it, because padding shrinks the
 * *content* box the grid tracks lay out in, not the border box Playwright
 * reads. Measuring a full row's actual card span (leftmost card's left edge
 * to rightmost card's right edge) is what actually reflects the content
 * box, and is what would have caught max-width and padding sharing one
 * element (that mistake measures ~120px short — 840/1200, not 960/1320).
 */
test.describe("/tvaryny content width", () => {
  const CONTENT_WIDTH: ReadonlyArray<{ viewport: Viewport; columns: number; px: number }> = [
    { viewport: DESKTOP, columns: 3, px: 960 },
    { viewport: GALLERY_WIDE, columns: 4, px: 1320 },
  ];

  for (const { viewport, columns, px } of CONTENT_WIDTH) {
    test(`a full row of cards spans ${px}px, not padding-shrunk, at ${viewport.name}`, async ({
      page,
    }) => {
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
        Math.abs(span - px),
        `the first row's ${columns} cards span ${span.toFixed(1)}px at ${viewport.name}, ` +
          `expected ${px}. A ~120px shortfall (landing near ${px - 120}) means max-width and ` +
          `padding are back on the same border-box element, eating each other's budget — ` +
          `rectOf(gallery-grid) alone would not have caught this, since max-width still caps ` +
          `that element's own border box at ${px} either way.`,
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
   * is what `aspect-[4/5]`/`tablet:w-30` do independent of whether the image
   * has loaded. That should make a layout shift structurally impossible
   * here, not just unlikely — asserted by re-measuring the same container
   * before and after confirming its image has decoded, rather than trusted.
   */
  test("the photo box does not resize once its image finishes loading", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    const container = page.getByTestId("card-photo").first();
    const before = await rectOf(container, "photo box, pre-load");

    await page
      .locator(`${CARD} img`)
      .first()
      .evaluate(
        (el: HTMLImageElement) =>
          new Promise<void>((resolve) => {
            if (el.complete) resolve();
            else el.addEventListener("load", () => resolve(), { once: true });
          }),
      );

    const after = await rectOf(container, "photo box, post-load");
    expect(
      after,
      `photo box measured ${before.width}x${before.height} before its image loaded and ` +
        `${after.width}x${after.height} after — the box should be sized by CSS alone, ` +
        `never by the image`,
    ).toEqual(before);
  });
});
