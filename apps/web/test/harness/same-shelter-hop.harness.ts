/**
 * «Ще тварини цього притулку» (the same shelter's other animals) as a way from one animal to
 * another, in a real browser. From the full page, a card opens the next full page, never the
 * gallery's overlay drawn over the page. From the overlay, a card swaps the animal inside the
 * same overlay, like «Наступний»: no second entrance, and ✕ or Back return to the list underneath.
 * Flows only, found by role, label and URL (CLAUDE.md, "Test logic, not looks").
 *
 * Not asserted: the dialog's DOM node surviving a hop. «Наступний» remounts it too (each animal
 * is its own intercepted segment); what the visitor sees is the entrance, which is asserted.
 *
 * Its own TEST-NET-2 addresses (.181 to .184), one per group: proxy.ts's limiter is per IP.
 */

import { uk } from "@opika/i18n";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DETAIL_DESKTOP, type Viewport } from "./viewports";

const CARD = "[data-testid='animal-card']";
const ANIMAL_PATH = /^\/tvaryny\/[0-9a-f-]{36}$/;
const PHONE_360: Viewport = { name: "360x740 phone", width: 360, height: 740 };
const ENTRANCE = /animate-panel-up/;

const ipHeaders = (lastOctet: number) => ({ "x-forwarded-for": `198.51.100.${lastOctet}` });

function sameShelterBlock(scope: Page | Locator) {
  return scope.getByRole("region", { name: uk.sameShelter.heading });
}

/** The block's first card: its href and the name it shows, read before it is clicked. */
async function firstBlockCard(scope: Page | Locator) {
  const card = sameShelterBlock(scope).locator(CARD).first();
  const href = (await card.getAttribute("href")) ?? "";
  const name = (await card.getByTestId("card-name").textContent())?.trim() ?? "";
  expect(href, "a block card is a plain link to its animal's page").toMatch(ANIMAL_PATH);
  expect(name.length, "a block card shows its animal's name").toBeGreaterThan(0);
  return { card, href, name };
}

function pathAndQuery(page: Page) {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

/** Opens the first list card of `route` as the overlay. */
async function openOverlay(page: Page, route: string, viewport: Viewport, tap: boolean) {
  await openRoute(page, route, viewport, { readySelector: CARD });
  const card = page.locator(CARD).first();
  const name = (await card.getByTestId("card-name").textContent())?.trim() ?? "";
  if (tap) await card.tap();
  else await card.click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await expect(dialog, "a fresh open plays the entrance").toHaveClass(ENTRANCE);
  return { name, dialog };
}

/** From the open overlay, follows the block's first card and checks it swapped in place. */
async function hopInsideOverlay(page: Page, overlayName: string, tap: boolean) {
  const opened = page.getByRole("dialog", { name: overlayName });
  const target = await firstBlockCard(opened);
  if (tap) await target.card.tap();
  else await target.card.click();

  await page.waitForURL((url) => url.pathname === target.href);
  const dialog = page.getByRole("dialog", { name: target.name });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog"), "one overlay, not one per animal").toHaveCount(1);
  await expect(dialog.getByRole("heading", { level: 1, name: target.name })).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 1 }), "one animal in it").toHaveCount(1);
  await expect(dialog, "the entrance plays once per overlay").not.toHaveClass(ENTRANCE);
  // Still the overlay over the list, not a full page.
  await expect(page.locator(CARD).first()).toBeAttached();
  return target;
}

test.describe("from the full animal page", () => {
  test.use({ extraHTTPHeaders: ipHeaders(181) });

  test("a block card opens the next full page, never the overlay over this one; Back returns", async ({
    page,
  }) => {
    await openRoute(page, "/", DETAIL_DESKTOP, { readySelector: CARD });
    const startHref = (await page.locator(CARD).first().getAttribute("href")) ?? "";
    const startPath = new URL(startHref, page.url()).pathname;
    await openRoute(page, startPath, DETAIL_DESKTOP);
    const startName =
      (await page.getByRole("heading", { level: 1 }).first().textContent())?.trim() ?? "";
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const target = await firstBlockCard(page);
    await target.card.click();

    await page.waitForURL((url) => url.pathname === target.href);
    await expect(page.getByRole("heading", { level: 1, name: target.name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }), "one page, one h1").toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goBack();

    await page.waitForURL((url) => url.pathname === startPath);
    await expect(page.getByRole("heading", { level: 1, name: startName })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

for (const [label, viewport, tap, octet] of [
  ["desktop, click", DETAIL_DESKTOP, false, 182],
  ["360x740 phone, tap", PHONE_360, true, 183],
] as const) {
  test.describe(`from the overlay over the gallery at /, ${label}`, () => {
    test.use({ extraHTTPHeaders: ipHeaders(octet), hasTouch: tap, isMobile: tap });

    test("a block card swaps the animal in the same overlay; «Закрити» returns to the list", async ({
      page,
    }) => {
      const { name } = await openOverlay(page, "/", viewport, tap);
      const firstCardName = await page.locator(CARD).first().getByTestId("card-name").textContent();
      const target = await hopInsideOverlay(page, name, tap);

      const close = page
        .getByRole("dialog", { name: target.name })
        .getByRole("button", { name: uk.preview.close });
      if (tap) await close.tap();
      else await close.click();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(pathAndQuery(page)).toBe("/");
      await expect(page.locator(CARD).first().getByTestId("card-name")).toHaveText(
        firstCardName ?? "",
      );
    });

    // As after «Наступний» (a replace, not a push): Back leaves the overlay for the list.
    test("after a block hop, the browser's Back returns to the list, not the previous animal", async ({
      page,
    }) => {
      const { name } = await openOverlay(page, "/", viewport, tap);
      await hopInsideOverlay(page, name, tap);

      await page.goBack();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(pathAndQuery(page)).toBe("/");
      await expect(page.locator(CARD).first()).toBeVisible();
    });
  });
}

test.describe("from the overlay over a landing page", () => {
  test.use({ extraHTTPHeaders: ipHeaders(184) });

  for (const route of ["/tvaryny/misto/brovary", "/tvaryny/vyd/sobaky"]) {
    test(`${route}: a block hop stays in the overlay; «Закрити» returns to the page`, async ({
      page,
    }) => {
      const { name } = await openOverlay(page, route, DETAIL_DESKTOP, false);
      const target = await hopInsideOverlay(page, name, false);

      await page
        .getByRole("dialog", { name: target.name })
        .getByRole("button", { name: uk.preview.close })
        .click();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(pathAndQuery(page)).toBe(route);
      await expect(page.locator(CARD).first()).toBeVisible();
    });
  }
});
