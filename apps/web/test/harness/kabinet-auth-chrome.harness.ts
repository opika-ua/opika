/**
 * Every page before sign-in wears the public header (owner, 2026-11-20, option A): the site nav
 * with working links out, «Кабінет притулку» marked as the current section, the header where
 * /prytulkam has it, and the card centred. Found by role, test id and text; the two boxes compared
 * are the header (as `header-audiences` does) and the card's centre.
 *
 * On the sign-in server (`sign-in-server.ts`), with self-registration on so the email-link pages
 * render: on the main server every /kabinet page is a 404.
 */

import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, type Page, test } from "@playwright/test";
import { layoutWidth, noSidewaysScroll } from "./harness";
import { type SignInServer, startSignInServer } from "./sign-in-server";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.93" }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

/** Dummy tokens: the invitation's unusable page, the reset form, the links' expired cards. */
const PAGES = [
  "/kabinet/vkhid",
  "/kabinet/vkhid?zaproshennia=dummy-token",
  "/kabinet/vkhid/zabuly",
  "/kabinet/vkhid/novyi-parol?token=dummy-token",
  "/kabinet/zaiavka/pidtverdyty?token=dummy-token",
  "/kabinet/zaiavka/ne-ya?token=dummy-token",
] as const;

const HEADER = "[data-testid='site-header']";

async function open(page: Page, origin: string, path: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  const response = await page.goto(`${origin}${path}`, { waitUntil: "load" });
  expect(response?.status(), path).toBeLessThan(500);
  expect(response?.status(), path).not.toBe(404);
  await expect(page.locator(HEADER)).toBeVisible();
}

test.describe("pre-sign-in pages wear the public header", () => {
  let server: SignInServer | undefined;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    server = await startSignInServer(HARNESS_DATABASE_URL, { SELF_REGISTRATION_ENABLED: "1" });
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  const origin = () => {
    if (server === undefined) throw new Error("no server");
    return server.origin;
  };

  test("desktop: the site nav links out, the kabinet entry is current, the card is centred", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // The public site has no footer yet (2026-11-20); whatever /prytulkam ends with, these match.
    await open(page, origin(), "/prytulkam", 1440);
    const footers = await page.getByRole("contentinfo").count();
    for (const path of PAGES) {
      await open(page, origin(), path, 1440);
      await expect(page.getByRole("contentinfo"), path).toHaveCount(footers);
      const nav = page.locator(HEADER).getByRole("navigation", { name: "Opika" });
      await expect(nav.getByRole("link", { name: "Тварини" }), path).toHaveAttribute(
        "href",
        "/tvaryny",
      );
      await expect(nav.getByRole("link", { name: "Для притулків" }), path).toHaveAttribute(
        "href",
        "/prytulkam",
      );
      await expect(nav.getByRole("link", { name: "Про проєкт" }), path).toHaveAttribute(
        "href",
        "/pro",
      );
      await expect(nav.locator("[aria-current]"), path).toHaveCount(0);
      const entry = page.getByTestId("nav-kabinet");
      await expect(entry, path).toBeVisible();
      await expect(entry, path).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("site-wordmark"), path).toHaveAttribute("href", "/tvaryny");
      expect(await noSidewaysScroll(page), `${path} scrolls sideways`).toBe(true);

      // The owner saw the card off-centre (2026-11-20): its centre is the page's.
      const centre = (await layoutWidth(page)) / 2;
      const offset = await page.evaluate((pageCentre) => {
        const card = document.querySelector("main")?.firstElementChild;
        if (!card) return Number.NaN;
        const r = card.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - pageCentre);
      }, centre);
      expect(offset, `${path}: card centre off the page centre`).toBeLessThanOrEqual(1);
    }
  });

  test("phone: the menu holds the nav, ending with the current kabinet entry", async ({ page }) => {
    test.setTimeout(120_000);
    for (const path of PAGES) {
      await open(page, origin(), path, 390);
      await expect(page.getByTestId("nav-kabinet"), path).toBeHidden();
      expect(await noSidewaysScroll(page), `${path} scrolls sideways`).toBe(true);
      await page.getByTestId("nav-menu-trigger").click();
      const sheet = page.getByTestId("nav-menu-sheet");
      await expect(sheet.getByRole("link", { name: "Для притулків" }), path).toBeVisible();
      const entry = page.getByTestId("nav-kabinet-menu");
      await expect(entry, path).toBeVisible();
      await expect(entry, path).toHaveAttribute("aria-current", "true");
    }
  });

  test("the header sits where /prytulkam has it, and «Для притулків» leads there", async ({
    page,
  }) => {
    const box = async () => {
      const b = await page.locator(HEADER).boundingBox();
      return b === null ? null : [b.x, b.y, b.width, b.height].map(Math.round);
    };
    await open(page, origin(), "/prytulkam", 1440);
    const publicHeader = await box();
    await open(page, origin(), "/kabinet/vkhid", 1440);
    expect(await box()).toEqual(publicHeader);

    await page
      .locator(HEADER)
      .getByRole("navigation", { name: "Opika" })
      .getByRole("link", { name: "Для притулків" })
      .click();
    await page.waitForURL((url) => url.pathname === "/prytulkam");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
