/**
 * O-10/C6 + D-6 (`feat/d-6-detail-photo-gallery`) — `DetailPhotoGallery.tsx`'s
 * dot indicator (mobile) and thumbnail strip (desktop) are new interactive
 * controls. Reviewer round 1 on this row found neither had a rendered
 * assertion for what markup inspection can't catch
 * (`docs/standing-constraints.md`'s "a UI item may not be marked done on the
 * basis of inspecting markup"): both control types are in the real tab
 * order. (Until 2026-10-20 this file also measured the dots' 48px touch
 * target and the focus ring's width; both measured appearance and were
 * removed with the other UI-measuring tests.)
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

import { test } from "@playwright/test";
import { expectReachableByTab, openRoute } from "./harness";
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

test.describe("detail page photo gallery — keyboard reachability", () => {
  test("a mobile dot button is reachable by Tab", async ({ page, browser }) => {
    const href = await discoverMultiPhotoAnimalHref(browser);
    await openRoute(page, href, DETAIL_PHONE, { readySelector: DETAIL_READY });

    await expectReachableByTab(page, {
      label: "photo-dot button",
      locator: page.getByTestId("detail-photo-dot").first(),
    });
  });

  test("a desktop thumbnail button is reachable by Tab", async ({ page, browser }) => {
    const href = await discoverMultiPhotoAnimalHref(browser);
    await openRoute(page, href, DETAIL_DESKTOP, { readySelector: DETAIL_READY });

    // `.nth(1)`, the non-active thumbnail: kept from when this also read the
    // focus ring (the active one carries an always-on ring); reachability
    // holds for either.
    await expectReachableByTab(page, {
      label: "photo-thumbnail button (non-active)",
      locator: page.getByTestId("detail-photo-thumbnail").nth(1),
    });
  });
});
