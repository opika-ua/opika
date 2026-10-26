/**
 * Phase T — the site-wide header: on every user-facing surface except the
 * deck, carrying the wordmark and all three site links (S8 added the saved
 * page's), reachable by keyboard; plus the demo banner on the gallery and
 * detail pages.
 *
 * - **E5/E1/B2** — «Про проєкт» was reachable from one link in the whole
 *   app, and the detail page (the URL people paste into Telegram) carried no
 *   wordmark at all.
 *
 * Until 2026-10-20 this file also measured the header's height (A2), the
 * nav and footer links' touch targets, the logo mark's baseline alignment
 * (O-1), sideways overflow, the demo banner's clipping, the card name's font
 * size (A1) and long-name truncation (C1). Those measured appearance and
 * were removed (Oleksii, 2026-10-20, verbatim: "Drop the rest that measure
 * appearance."; CLAUDE.md, "Test logic, not looks").
 */

import { expect, test } from "@playwright/test";
import { expectReachableByTab, openRoute } from "./harness";
import { DETAIL_PHONE, NARROW_PHONE, PHONE } from "./viewports";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.31" } });

const GALLERY = "/tvaryny";
const DECK = "/tvaryny/gortaty";
const ABOUT = "/pro";
const FOR_SHELTERS = "/prytulkam";
const SAVED = "/zberezheni";

const HEADER = "[data-testid='site-header']";
const WORDMARK = "[data-testid='site-wordmark']";
const NAV_ABOUT = "[data-testid='nav-about']";
const NAV_SHELTERS = "[data-testid='nav-for-shelters']";
const NAV_SAVED = "[data-testid='nav-saved']";
const CARD = "[data-testid='animal-card']";

let cachedAnimalHref: string | null = null;
async function firstAnimalHref(page: import("@playwright/test").Page): Promise<string> {
  if (cachedAnimalHref !== null) return cachedAnimalHref;
  await openRoute(page, GALLERY, PHONE, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  expect(href, "no animal card link on the gallery — cannot reach a detail page").toBeTruthy();
  cachedAnimalHref = href as string;
  return cachedAnimalHref;
}

test.describe("the header is on every user-facing surface except the deck", () => {
  for (const [name, route] of [
    ["gallery", GALLERY],
    ["about", ABOUT],
    ["for shelters", FOR_SHELTERS],
  ] as const) {
    test(`${name} carries the wordmark and all three site links`, async ({ page }) => {
      await openRoute(page, route, PHONE, { readySelector: HEADER });

      await expect(page.locator(WORDMARK)).toHaveText("Opika");
      await expect(page.locator(NAV_ABOUT)).toHaveAttribute("href", ABOUT);
      await expect(page.locator(NAV_SHELTERS)).toHaveAttribute("href", FOR_SHELTERS);
      await expect(page.locator(NAV_SAVED)).toHaveAttribute("href", SAVED);
    });
  }

  test("the detail page carries it too — this is the URL people paste into Telegram", async ({
    page,
  }) => {
    await openRoute(page, await firstAnimalHref(page), DETAIL_PHONE, { readySelector: HEADER });

    await expect(page.locator(WORDMARK)).toHaveText("Opika");
    await expect(page.locator(NAV_ABOUT)).toHaveAttribute("href", ABOUT);
    await expect(page.locator(NAV_SHELTERS)).toHaveAttribute("href", FOR_SHELTERS);
    await expect(page.locator(NAV_SAVED)).toHaveAttribute("href", SAVED);
  });

  test("the deck does NOT carry it — docs/design/README.md:589, never two navigations at once", async ({
    page,
  }) => {
    await openRoute(page, DECK, PHONE, {
      readySelector: "[data-testid='back-to-deck-list'], header",
    });

    expect(
      await page.locator(HEADER).count(),
      "the deck's header replaces the gallery header by design — a site header here would be " +
        "the second navigation the design explicitly rules out, not a fix",
    ).toBe(0);
  });
});

/**
 * D-2: the demo banner (`detail-demo-banner`) shows on the detail page while
 * the registry holds no real shelters. `NARROW_PHONE` (320) is this
 * project's own narrowest supported width (`docs/stack-decision.md`, "budget
 * Android"). Its clipping and the pages' sideways overflow were measured
 * here until 2026-10-20 (removed with the other UI-measuring tests).
 *
 * The gallery's own banner (`gallery-demo-banner`) is gone — Oleksii,
 * mid-build, verbatim: "remove На сайті поки немає справжніх притулків —
 * усі картки тут демонстраційні. as we hide our app anyways and people
 * without gate cant access it ye[t]." Only the detail page's instance is
 * still asserted.
 */
test.describe("the demo banner is visible on the detail page", () => {
  test("detail page banner is visible at 320", async ({ page }) => {
    await openRoute(page, await firstAnimalHref(page), NARROW_PHONE, { readySelector: HEADER });
    await expect(page.getByTestId("detail-demo-banner")).toBeVisible();
  });
});

test.describe("the header is reachable by keyboard", () => {
  test("the «Про проєкт» link is reachable by Tab", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await expectReachableByTab(page, {
      label: "header «Про проєкт» link",
      locator: page.locator(NAV_ABOUT),
    });
  });

  test("the «Для притулків» link is reachable by Tab", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await expectReachableByTab(page, {
      label: "header «Для притулків» link",
      locator: page.locator(NAV_SHELTERS),
    });
  });

  test("the «Збережені» link is reachable by Tab", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await expectReachableByTab(page, {
      label: "header «Збережені» link",
      locator: page.locator(NAV_SAVED),
    });
  });
});
