/**
 * O-10/C6 + D-6 (`feat/d-6-detail-photo-gallery`) — `DetailPhotoGallery.tsx`'s
 * dot indicator (mobile) and thumbnail strip (desktop) are new interactive
 * controls. Reviewer round 1 on this row found neither had a rendered
 * assertion for the two things markup inspection can't catch
 * (`docs/standing-constraints.md`'s "a UI item may not be marked done on the
 * basis of inspecting markup"): a real 48px touch target on the dot buttons
 * (an 8px visual dot, sized up to a 48px hit area — the same "small visual,
 * real hit area" shape O-19, `docs/observations.md`, exists to keep from
 * regressing) and a real focus-visible outline on both control types.
 *
 * A dedicated `x-forwarded-for` isolates this file from `animal-detail.
 * harness.ts`'s own already-tight request budget (that file's own top
 * comment: ~20 tests, each a full gallery navigation, already exhaust it)
 * rather than adding more tests there and risking tipping it over —
 * TEST-NET-2 (198.51.100.0/24), `.33`, the next unclaimed address (`.21`
 * through `.32` are claimed by other harness files).
 *
 * Finding an animal with ≥2 photos (needed for any dot or thumbnail to
 * render at all) without hardcoding an id: `packages/db/src/seed.ts`'s
 * `photoCount` formula gives every published, non-special-cased animal
 * `1 + (i % 5)` photos — 2 to 5 for 4 out of every 5 indices, only
 * `i % 5 === 0` ever yields exactly 1 — so the first few gallery cards are
 * overwhelmingly likely to already qualify. This checks real candidates from
 * the real gallery rather than asserting that probability, and fails with a
 * clear message (not a silent false pass) if the corpus's distribution ever
 * changes enough that none of the first few do.
 */

import { expect, test } from "@playwright/test";
import { expectFocusVisibleOutline, expectMinTouchTarget, openRoute } from "./harness";
import { DETAIL_DESKTOP, DETAIL_PHONE } from "./viewports";

const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.33" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

const GALLERY_ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const DETAIL_READY = "[data-testid='detail-photo']";
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
      await page.locator(DETAIL_READY).waitFor({ state: "visible" });
      const hasThumbnails = (await page.getByTestId("detail-photo-thumbnail").count()) > 0;
      if (hasThumbnails) {
        cachedMultiPhotoHref = href;
        return href;
      }
    }
    throw new Error(
      `none of the first ${MAX_CANDIDATES} gallery animals have more than one photo — ` +
        "packages/db/src/seed.ts's photoCount distribution may have changed; this harness " +
        "needs a real multi-photo animal to exercise the dot/thumbnail controls at all.",
    );
  } finally {
    await page.close();
  }
}

test.describe("detail page photo gallery — touch target and focus-visible", () => {
  test("every mobile dot button meets the 48px touch-target floor", async ({ page, browser }) => {
    const href = await discoverMultiPhotoAnimalHref(browser);
    await openRoute(page, href, DETAIL_PHONE, { readySelector: DETAIL_READY });

    const dots = page.getByTestId("detail-photo-dot");
    const count = await dots.count();
    expect(
      count,
      "expected at least one photo dot on a multi-photo animal at phone width",
    ).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expectMinTouchTarget(dots.nth(i), `photo dot ${i + 1} of ${count}`);
    }
  });

  test("a mobile dot button shows a real focus-visible outline", async ({ page, browser }) => {
    const href = await discoverMultiPhotoAnimalHref(browser);
    await openRoute(page, href, DETAIL_PHONE, { readySelector: DETAIL_READY });

    await expectFocusVisibleOutline(page, {
      label: "photo-dot button",
      locator: page.getByTestId("detail-photo-dot").first(),
    });
  });

  test("a desktop thumbnail button shows a real focus-visible outline", async ({
    page,
    browser,
  }) => {
    const href = await discoverMultiPhotoAnimalHref(browser);
    await openRoute(page, href, DETAIL_DESKTOP, { readySelector: DETAIL_READY });

    /**
     * `.nth(1)`, deliberately not `.first()`: the first thumbnail is the
     * active one by default, and the active thumbnail carries its ring
     * (`outline outline-[3px] outline-offset-[3px] outline-rg-ink`)
     * unconditionally — not gated on `:focus-visible` at all. Asserting
     * against it would pass even with the component's real
     * `focus-visible:outline-*` classes deleted outright (confirmed by
     * mutation: that deletion left `.first()`'s check green, because what it
     * was actually measuring was the always-on active ring, not focus).
     * `.nth(1)` is never the active one here (`activeIndex` starts at 0), so
     * any outline it shows after a real Tab sequence can only come from its
     * own `focus-visible:` styling.
     */
    await expectFocusVisibleOutline(page, {
      label: "photo-thumbnail button (non-active)",
      locator: page.getByTestId("detail-photo-thumbnail").nth(1),
    });
  });
});
