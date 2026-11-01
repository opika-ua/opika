/**
 * Phase T - the site-wide header: on every user-facing surface except the
 * deck, carrying the wordmark and all three site links (S8 added the saved
 * page's), reachable by keyboard; plus the demo banner on the gallery and
 * detail pages.
 *
 * - **E5/E1/B2** - «Про проєкт» was reachable from one link in the whole
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
import { expectReachableByTab, noSidewaysScroll, openRoute } from "./harness";
import { DESKTOP, DETAIL_PHONE, NARROW_PHONE, PHONE } from "./viewports";

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

// Hamburger menu (below `tablet:`): the drawer's own copies of the three
// links carry a `-menu` suffix (`SiteHeader.tsx`'s `NavLinks`), distinct
// from the ids above, which always address the inline, tablet-and-up nav.
const NAV_MENU_TRIGGER = "[data-testid='nav-menu-trigger']";
const NAV_MENU_SHEET = "[data-testid='nav-menu-sheet']";
const NAV_ABOUT_MENU = "[data-testid='nav-about-menu']";
const NAV_SHELTERS_MENU = "[data-testid='nav-for-shelters-menu']";
const NAV_SAVED_MENU = "[data-testid='nav-saved-menu']";

let cachedAnimalHref: string | null = null;
async function firstAnimalHref(page: import("@playwright/test").Page): Promise<string> {
  if (cachedAnimalHref !== null) return cachedAnimalHref;
  await openRoute(page, GALLERY, PHONE, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  expect(href, "no animal card link on the gallery – cannot reach a detail page").toBeTruthy();
  cachedAnimalHref = href as string;
  return cachedAnimalHref;
}

/**
 * `NAV_SAVED` only renders once something's saved (`SavedButton.tsx`,
 * Oleksii: "show Збережені tab in header only if we have something saved
 * otherwise hide it"). An `addInitScript`, not a real save through the UI —
 * these tests are about the header, not the save flow, and `likes-store.ts`'s
 * own shape (`version`, `items[].animalId`/`likedAt`) is what `SavedButton`
 * reads, so seeding it directly is the same state a real save would leave,
 * reached without depending on `SaveButton` staying wired the way it is
 * today. Registered before `openRoute`'s own `page.goto`, so it's in place
 * for that navigation, same as every later one on this page.
 */
async function seedASavedAnimal(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "likes.v1",
      JSON.stringify({
        version: 1,
        items: [
          { animalId: "00000000-0000-4000-8000-000000000000", likedAt: new Date().toISOString() },
        ],
      }),
    );
  });
}

/** MK-7: the independence line sits in the content of «Про проєкт» and «Для притулків». */
test.describe("the independence line is visible and does not widen the page", () => {
  const wide = { name: "1440x900 wide", width: 1440, height: 900 };
  for (const route of [ABOUT, FOR_SHELTERS]) {
    for (const viewport of [NARROW_PHONE, wide]) {
      test(`${route} at ${viewport.width}`, async ({ page }) => {
        await openRoute(page, route, viewport, { readySelector: HEADER });
        await expect(
          page.getByText(
            "Opika робить одна людина, незалежно. Це не державний і не міський сервіс.",
          ),
        ).toBeVisible();
        expect(await noSidewaysScroll(page)).toBe(true);
      });
    }
  }
});

test.describe("the header is on every user-facing surface except the deck", () => {
  for (const [name, route] of [
    ["gallery", GALLERY],
    ["about", ABOUT],
    ["for shelters", FOR_SHELTERS],
  ] as const) {
    test(`${name} carries the wordmark and all three site links`, async ({ page }) => {
      await seedASavedAnimal(page);
      await openRoute(page, route, PHONE, { readySelector: HEADER });

      await expect(page.locator(WORDMARK)).toHaveText("Opika");
      await expect(page.locator(NAV_ABOUT)).toHaveAttribute("href", ABOUT);
      await expect(page.locator(NAV_SHELTERS)).toHaveAttribute("href", FOR_SHELTERS);
      await expect(page.locator(NAV_SAVED)).toHaveAttribute("href", SAVED);
    });
  }

  /**
   * Oleksii, from a live screenshot: "show Збережені tab in header only if
   * we have something saved otherwise hide it." A fresh context has nothing
   * in `localStorage` at all, so this is the real default, not a seeded one.
   */
  test("«Збережені» is absent for a visitor with nothing saved", async ({ page }) => {
    await openRoute(page, GALLERY, PHONE, { readySelector: HEADER });
    await expect(page.locator(NAV_ABOUT)).toHaveAttribute("href", ABOUT);
    // In the server HTML for the pre-paint flag, hidden once the island sees none saved.
    await expect(page.locator(NAV_SAVED)).toBeHidden();
  });

  test("the detail page carries it too – this is the URL people paste into Telegram", async ({
    page,
  }) => {
    await seedASavedAnimal(page);
    await openRoute(page, await firstAnimalHref(page), DETAIL_PHONE, { readySelector: HEADER });

    await expect(page.locator(WORDMARK)).toHaveText("Opika");
    await expect(page.locator(NAV_ABOUT)).toHaveAttribute("href", ABOUT);
    await expect(page.locator(NAV_SHELTERS)).toHaveAttribute("href", FOR_SHELTERS);
    await expect(page.locator(NAV_SAVED)).toHaveAttribute("href", SAVED);
  });

  test("the deck does NOT carry it – docs/design/README.md:589, never two navigations at once", async ({
    page,
  }) => {
    await openRoute(page, DECK, PHONE, {
      readySelector: "[data-testid='back-to-deck-list'], header",
    });

    expect(
      await page.locator(HEADER).count(),
      "the deck's header replaces the gallery header by design – a site header here would be " +
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
 * The gallery's own banner (`gallery-demo-banner`) is gone - Oleksii,
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

/**
 * `PHONE` (390px) is below `tablet:` (600px, `--breakpoint-tablet`), so the
 * inline `<nav>` is CSS-hidden there and its links are out of the native tab
 * order (a `display: none` element is never a Tab stop) - reaching them now
 * goes through `MobileNavMenu`'s drawer instead. Updated for the hamburger
 * menu, not deleted: the owner's task that added it explicitly kept "48px
 * touch target on the toggle button, aria-expanded/aria-controls, visible
 * focus" as a requirement, and this describe block is what used to cover the
 * links' own reachability at this exact width - still worth covering, just
 * through the drawer now.
 */
test.describe("the header is reachable by keyboard", () => {
  test("the hamburger toggle is reachable by Tab, below tablet:", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await expectReachableByTab(page, {
      label: "header hamburger menu toggle",
      locator: page.locator(NAV_MENU_TRIGGER),
    });
  });

  test("the «Про проєкт» link is reachable by Tab, once the drawer is open", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await page.locator(NAV_MENU_TRIGGER).click();
    await expectReachableByTab(page, {
      label: "drawer «Про проєкт» link",
      locator: page.locator(NAV_ABOUT_MENU),
    });
  });

  test("the «Для притулків» link is reachable by Tab, once the drawer is open", async ({
    page,
  }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await page.locator(NAV_MENU_TRIGGER).click();
    await expectReachableByTab(page, {
      label: "drawer «Для притулків» link",
      locator: page.locator(NAV_SHELTERS_MENU),
    });
  });

  test("the «Збережені» link is reachable by Tab, once the drawer is open", async ({ page }) => {
    await seedASavedAnimal(page);
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await page.locator(NAV_MENU_TRIGGER).click();
    await expectReachableByTab(page, {
      label: "drawer «Збережені» link",
      locator: page.locator(NAV_SAVED_MENU),
    });
  });
});

test.describe("the mobile nav drawer (below tablet:)", () => {
  test("below tablet:, the hamburger toggle is visible and the inline nav is not", async ({
    page,
  }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await expect(page.locator(NAV_MENU_TRIGGER)).toBeVisible();
    await expect(page.locator(NAV_ABOUT)).toBeHidden();
  });

  test("at tablet: and up, the inline nav is visible and the hamburger toggle is not", async ({
    page,
  }) => {
    await openRoute(page, ABOUT, DESKTOP, { readySelector: HEADER });
    await expect(page.locator(NAV_ABOUT)).toBeVisible();
    await expect(page.locator(NAV_MENU_TRIGGER)).toBeHidden();
  });

  test("opens with zero JS, via the plain #site-nav-menu anchor jump", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.31" },
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ABOUT, { waitUntil: "load" });
    await page.locator(NAV_MENU_TRIGGER).click();
    // The reveal itself, asserted rather than left implicit in a later
    // click's actionability timeout - same reasoning as `FilterSheet`'s own
    // no-JS test: with no JS this is `:target` and `globals.css`'s
    // `#site-nav-menu:target` rule doing all of the work, and if that rule
    // were dropped the dialog would stay `display: none` from the UA
    // stylesheet's own `dialog:not([open])`.
    await expect(
      page.locator(NAV_MENU_SHEET),
      "the <dialog> should be revealed by the :target rule alone, with no JS",
    ).toBeVisible();
    await expect(page.locator(NAV_ABOUT_MENU)).toBeVisible();
    await context.close();
  });

  test("Escape closes the open drawer and returns focus to the toggle", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await page.locator(NAV_MENU_TRIGGER).click();
    await expect(page.locator(NAV_MENU_SHEET)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator(NAV_MENU_SHEET)).toBeHidden();
    await expect(page.locator(NAV_MENU_TRIGGER)).toBeFocused();
  });

  test("clicking a link in the drawer navigates to it", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await page.locator(NAV_MENU_TRIGGER).click();
    await page.locator(NAV_SHELTERS_MENU).click();
    await expect(page).toHaveURL(FOR_SHELTERS);
  });
});
