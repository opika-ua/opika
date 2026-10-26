/**
 * The gallery's photos actually load - `/tvaryny`, real seeded rows.
 *
 * Until 2026-10-20 this file also measured column counts per breakpoint, the
 * card photo's shape, the content width, the photo box staying the same size while its image loads, the
 * mobile toolbar fitting its row and sideways scroll. Those measured
 * appearance and were removed (Oleksii, 2026-10-20, verbatim: "Drop the rest
 * that measure appearance."; CLAUDE.md, "Test logic, not looks"). What stays
 * is behaviour: every photo on the page decodes. The file keeps its name so
 * the pointers to it elsewhere (its fixed rate-limit IP, among them) still
 * resolve.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { PHONE } from "./viewports";

/**
 * `proxy.ts` rate-limits `/tvaryny` at 100 req/min per IP, shared across
 * every harness file that requests it under the real local identity - see
 * `gallery-arrow-nav.harness.ts`'s comment for the real, reproducing 429
 * this caused once that file's requests joined this one's and
 * `gallery-filters.harness.ts`'s in the same shared budget. Isolates this
 * file's own volume the same way `gallery-rate-limit.harness.ts` already
 * isolates its own deliberate budget exhaustion. TEST-NET-2
 * (198.51.100.0/24), deliberately not the TEST-NET-3 block that file draws
 * a random host from each run - see `gallery-arrow-nav.harness.ts` for why
 * a fixed address inside that block would be a 1-in-254 collision per run.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.23" } });

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const GALLERY_PAGE_SIZE = 24;

/**
 * `<img src>` occupying the right box is not evidence the image actually
 * decoded - `photo.storageKey` used to be rendered as a bare object key,
 * 404ing on every card, and the layout assertions this file then carried
 * stayed green through that the whole time: the
 * `aspect-[4/5]`/`w-30` box holds its size and `bg-photo-placeholder`'s
 * hatch shows through a failed `<img>` exactly the same as a loading one.
 * This is the check that would actually have caught it.
 */
test.describe("/tvaryny photos actually load", () => {
  /**
   * `next/image` defaults to `loading="lazy"` - confirmed by a first version
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
        // to load - success or failure - so a 404 settles this fast-path
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
});
