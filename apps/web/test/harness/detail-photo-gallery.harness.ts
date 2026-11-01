/**
 * O-10/C6 + D-6 (`feat/d-6-detail-photo-gallery`), updated for pet card PR 5
 * (Figma `75:425`/`88:1929`, owner decision 7): the old dot indicator
 * (mobile) and thumbnail strip (desktop) are gone, replaced by a native
 * scroll-snap slider with a "next" button (always present once there's more
 * than one photo) and a "prev" button (present once scrolled). This file
 * now checks the next button is in the real tab order -
 * `docs/standing-constraints.md`'s "a UI item may not be marked done on the
 * basis of inspecting markup," applied to the new control the way it was to
 * the old ones.
 *
 * A dedicated `x-forwarded-for` isolates this file from `animal-detail.
 * harness.ts`'s own already-tight request budget (that file's own top
 * comment: ~20 tests, each a full gallery navigation, already exhaust it)
 * rather than adding more tests there and risking tipping it over -
 * TEST-NET-2 (198.51.100.0/24), `.33`, the next unclaimed address (`.21`
 * through `.32` are claimed by other harness files).
 *
 * Finding an animal with ≥2 photos (needed for the next button to render at
 * all) without hardcoding an id: `packages/db/src/seed.ts`'s `photoCount`
 * formula gives every published, non-special-cased animal `1 + (i % 5)`
 * photos - 2 to 5 for 4 out of every 5 indices, only `i % 5 === 0` ever
 * yields exactly 1 - so the first few gallery cards are overwhelmingly
 * likely to already qualify. This checks real candidates from the real
 * gallery rather than asserting that probability, and fails with a clear
 * message (not a silent false pass) if the corpus's distribution ever
 * changes enough that none of the first few do.
 */

import { expect, test } from "@playwright/test";
import { expectReachableByTab, openRoute } from "./harness";
import { DETAIL_DESKTOP } from "./viewports";

const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.33" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

const GALLERY_ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const DETAIL_READY = "section[aria-label='Фотографії тварини'] img";
const MAX_CANDIDATES = 8;

/**
 * Discovered once per file run, same reasoning as `animal-detail.harness.
 * ts`'s own `discoverFirstAnimalHref`: every test below needs the same real,
 * multi-photo animal, not its own fresh gallery walk.
 */
let cachedMultiPhotoHref: string | null = null;

async function discoverMultiPhotoAnimalHref(
  browser: import("@playwright/test").Browser,
): Promise<string> {
  if (cachedMultiPhotoHref) return cachedMultiPhotoHref;
  const page = await browser.newPage({ extraHTTPHeaders: SPOOFED_IP_HEADERS });
  try {
    await openRoute(page, GALLERY_ROUTE, DETAIL_DESKTOP, { readySelector: CARD });
    const hrefs = await page
      .locator(CARD)
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    const realHrefs = hrefs.filter((h): h is string => h !== null);

    for (const href of realHrefs.slice(0, MAX_CANDIDATES)) {
      await page.goto(href, { waitUntil: "load" });
      await page.locator(DETAIL_READY).first().waitFor({ state: "visible" });
      // 3, not 2: at the panel's own desktop width (max-w-271, p-10), 2 photos
      // (2*360 + 16 = 736px) fit inside the ~1004px content area with nothing to
      // scroll - `scrollBy` is a no-op and the prev button never appears. 3 photos
      // (3*360 + 32 = 1112px) genuinely overflow, which is what this file's own prev-
      // button test needs a real animal for.
      const photoCount = await page.locator(DETAIL_READY).count();
      if (photoCount >= 3) {
        cachedMultiPhotoHref = href;
        return href;
      }
    }
    throw new Error(
      `none of the first ${MAX_CANDIDATES} gallery animals have 3+ photos – ` +
        "packages/db/src/seed.ts's photoCount distribution may have changed; this harness " +
        "needs a real multi-photo animal to exercise the slider's prev/next buttons at all.",
    );
  } finally {
    await page.close();
  }
}

test.describe("detail page photo gallery – keyboard reachability", () => {
  test("the slider's next button is reachable by Tab", async ({ page, browser }) => {
    const href = await discoverMultiPhotoAnimalHref(browser);
    await openRoute(page, href, DETAIL_DESKTOP, { readySelector: DETAIL_READY });

    await expectReachableByTab(page, {
      label: "photo-next button",
      locator: page.getByRole("button", { name: "Наступне фото" }),
    });
  });

  /**
   * Owner decision 7: "a prev button appears once you've scrolled" - clicking
   * next should scroll the strip and surface the prev button, which must
   * also be in the tab order once it exists.
   */
  test("the slider's prev button appears after scrolling and is reachable by Tab", async ({
    page,
    browser,
  }) => {
    const href = await discoverMultiPhotoAnimalHref(browser);
    await openRoute(page, href, DETAIL_DESKTOP, { readySelector: DETAIL_READY });

    await expect(page.getByRole("button", { name: "Попереднє фото" })).toHaveCount(0);
    await page.getByRole("button", { name: "Наступне фото" }).click();
    const prev = page.getByRole("button", { name: "Попереднє фото" });
    await expect(prev).toBeVisible();
    await expectReachableByTab(page, { label: "photo-prev button", locator: prev });
  });
});
