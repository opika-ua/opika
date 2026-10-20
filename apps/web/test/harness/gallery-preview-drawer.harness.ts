/**
 * Designer round 1, S4: the gallery's preview drawer (§2 of
 * `docs/designer-round-1.md`, decision DR1-D5), in a real browser. Flows
 * only, found by role, label and text (CLAUDE.md, "Test logic, not looks"):
 * what opens, what closes it, where focus and the URL end up, and that every
 * way of reaching `/tvaryny/{id}` other than a click from the gallery still
 * gets the full page.
 *
 * Its own `x-forwarded-for` addresses (TEST-NET-2, .43 to .46), for the same
 * reason as its siblings: proxy.ts's limiter is per IP. Four, one per group
 * of tests, because one gallery load is about ten limited requests (the page
 * and the header's prefetches), and ten tests' worth on one address ran into
 * 429s within the minute.
 */

import { uk } from "@opika/i18n";
import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DETAIL_DESKTOP, DETAIL_PHONE } from "./viewports";

const ipHeaders = (lastOctet: number) => ({ "x-forwarded-for": `198.51.100.${lastOctet}` });

/** Page 2, so "back" has a query string to restore, not just the bare path. */
const GALLERY_PAGE_2 = "/tvaryny?stor=2";
const CARD = "[data-testid='animal-card']";

async function openGallery(page: Page, viewport = DETAIL_DESKTOP) {
  await openRoute(page, GALLERY_PAGE_2, viewport, { readySelector: CARD });
}

/** The nth card's href and the name it shows, read before it is clicked. */
async function cardAt(page: Page, index: number) {
  const card = page.locator(CARD).nth(index);
  const href = await card.getAttribute("href");
  const name = (await card.getByTestId("card-name").textContent())?.trim() ?? "";
  expect(href, "a gallery card links to its animal").toMatch(/^\/tvaryny\/[0-9a-f-]{36}$/);
  expect(name.length, "a gallery card shows its animal's name").toBeGreaterThan(0);
  return { card, href: href as string, name };
}

async function openDrawerFrom(page: Page, index = 0) {
  const target = await cardAt(page, index);
  await target.card.click();
  const dialog = page.getByRole("dialog", { name: target.name });
  await expect(dialog).toBeVisible();
  return { ...target, dialog };
}

test.describe("the gallery's preview drawer", () => {
  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(43) });

    test("a click on a card opens a dialog named after the animal, at the animal's own URL, over the list", async ({
      page,
    }) => {
      await openGallery(page);
      const { href, dialog } = await openDrawerFrom(page);

      expect(new URL(page.url()).pathname).toBe(href);
      // The list is still there behind it: same page of the gallery, no full
      // page loaded.
      await expect(page.locator(CARD).first()).toBeAttached();
      await expect(page.getByTestId("animal-name")).toHaveCount(0);

      // Freshness: the day count in words (the pips beside it are decorative).
      await expect(dialog.getByText(/^Оновлено /)).toBeVisible();
      await expect(dialog.getByRole("link", { name: uk.preview.openFull })).toBeVisible();
      // DR1-D7: no contact reveal in the drawer.
      await expect(dialog.getByRole("button", { name: uk.actions.writeShelter })).toHaveCount(0);
    });

    test("opening a card spends one request of the visitor's budget, not a re-prefetch of the gallery", async ({
      page,
    }) => {
      await openGallery(page);
      // Every request proxy.ts charges to the per-IP limit: the page routes
      // under /tvaryny, documents and client fetches alike.
      const charged: string[] = [];
      page.on("request", (request) => {
        const { pathname, search } = new URL(request.url());
        if (pathname === "/tvaryny" || pathname.startsWith("/tvaryny/")) {
          charged.push(pathname + search);
        }
      });

      const { href } = await openDrawerFrom(page);
      // Prefetches start when the new tree commits and the links are seen
      // again; give them the time they took before they were switched off.
      await page.waitForTimeout(3000);

      expect(charged.map((url) => url.split("?")[0])).toEqual([href]);
    });

    test("opening a card further down keeps the list where it was", async ({ page }) => {
      await openGallery(page, DETAIL_PHONE);
      const card = page.locator(CARD).nth(5);
      await card.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before, "the sixth card on a phone is below the first screen").toBeGreaterThan(0);

      await openDrawerFrom(page, 5);
      // Unlock first: the open drawer pins the body, which doesn't move it.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  });

  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(44) });

    test("Escape closes it, returns to the same gallery URL and gives focus back to the card", async ({
      page,
    }) => {
      await openGallery(page);
      const { href } = await openDrawerFrom(page, 2);

      await page.keyboard.press("Escape");

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(GALLERY_PAGE_2);
      await expect(page.locator(`a[href="${href}"]`)).toBeFocused();
    });

    test("the close button closes it and gives focus back to the card", async ({ page }) => {
      await openGallery(page);
      const { href, dialog } = await openDrawerFrom(page, 1);

      await dialog.getByRole("button", { name: uk.preview.close }).click();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).search).toBe("?stor=2");
      await expect(page.locator(`a[href="${href}"]`)).toBeFocused();
    });

    test("the browser's back closes it and leaves the gallery page as it was", async ({ page }) => {
      await openGallery(page);
      await openDrawerFrom(page);

      await page.goBack();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(GALLERY_PAGE_2);
      await expect(page.locator(CARD).first()).toBeVisible();
    });
  });

  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(45) });

    test("Tab and Shift+Tab stay inside the drawer", async ({ page }) => {
      await openGallery(page);
      const { dialog } = await openDrawerFrom(page);
      await expect(dialog.getByRole("heading", { level: 2 })).toBeFocused();

      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((node) => node.contains(document.activeElement)),
          `focus left the drawer after ${i + 1} Tab presses`,
        ).toBe(true);
      }
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press("Shift+Tab");
        expect(
          await dialog.evaluate((node) => node.contains(document.activeElement)),
          `focus left the drawer after ${i + 1} Shift+Tab presses`,
        ).toBe(true);
      }
    });

    test("«Відкрити повну сторінку» goes to the animal's full page", async ({ page }) => {
      await openGallery(page);
      const { href, name, dialog } = await openDrawerFrom(page);

      await dialog.getByRole("link", { name: uk.preview.openFull }).click();

      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(href);
    });

    test("a reload of the drawer's URL renders the full page, with no drawer", async ({ page }) => {
      await openGallery(page);
      const { href, name } = await openDrawerFrom(page);

      await page.reload({ waitUntil: "load" });

      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(href);
    });
  });

  test.describe(() => {
    test.use({ extraHTTPHeaders: ipHeaders(46) });

    test("the deck's entry link still reaches the deck, not a drawer", async ({ page }) => {
      await openGallery(page);

      await page.getByTestId("deck-entry-desktop").click();

      await page.waitForURL(/\/tvaryny\/gortaty/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(CARD)).toHaveCount(0);
    });

    test("with JavaScript disabled, a card is a plain link to the full page", async ({
      browser,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        extraHTTPHeaders: ipHeaders(46),
      });
      const page = await context.newPage();
      try {
        await openGallery(page);
        const { card, href, name } = await cardAt(page, 0);

        await card.click();

        await page.waitForURL((url) => url.pathname === href);
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  });
});
