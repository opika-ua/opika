/**
 * The site footer (owner, 2026-11-20, concept A2): one `contentinfo` on every public page, with its
 * links, and the independence line once. Found by role and text; the only measure is the 48px
 * target floor on a phone.
 */

import { expect, type Page, test } from "@playwright/test";
import {
  expectMinTargetHeight,
  noSidewaysScroll,
  openRoute,
  servedAnimalIds,
  useClientAddressPerRepetition,
} from "./harness";
import { DESKTOP, NARROW_PHONE, PHONE } from "./viewports";

const INDEPENDENT = "Opika робить одна людина, незалежно. Це не державний і не міський сервіс.";
const HEADER = "[data-testid='site-header']";

test.beforeEach(async ({ page }, testInfo) => {
  await useClientAddressPerRepetition(page, testInfo);
});

async function expectOneFooter(page: Page, route: string): Promise<void> {
  const footer = page.getByRole("contentinfo");
  await expect(footer, route).toHaveCount(1);
  await expect(footer.getByText(INDEPENDENT), route).toBeVisible();
  await expect(page.getByText(INDEPENDENT), route).toHaveCount(1);
}

test("every public page ends with one footer", async ({ page }) => {
  test.setTimeout(90_000);
  const [animalId] = await servedAnimalIds(page, 1);
  const animalPage = `/tvaryny/${animalId}`;
  await openRoute(page, animalPage, DESKTOP, { readySelector: HEADER });
  const shelterPage = await page.locator("main a[href^='/prytulky/']").first().getAttribute("href");
  expect(shelterPage, "the animal page links its shelter").toMatch(/^\/prytulky\//);

  for (const route of [
    "/tvaryny",
    "/tvaryny/misto/brovary",
    animalPage,
    shelterPage as string,
    "/pro",
    "/prytulkam",
    "/polityka-konfidentsiinosti",
    "/zberezheni",
    "/rate-limited/screen",
    "/no-such-page",
  ]) {
    await openRoute(page, route, DESKTOP, { readySelector: HEADER });
    await expectOneFooter(page, route);
  }
});

test("the footer's links lead to the site's pages, the email, Instagram and the privacy policy", async ({
  page,
}) => {
  await openRoute(page, "/pro", DESKTOP, { readySelector: HEADER });
  const footer = page.getByRole("contentinfo");
  const links = await footer
    .getByRole("link")
    .evaluateAll((all) => all.map((a) => [a.textContent, a.getAttribute("href")]));
  expect(links).toEqual([
    ["Opika", "/tvaryny"],
    ["Тварини", "/tvaryny"],
    ["Для притулків", "/prytulkam"],
    ["Про проєкт", "/pro"],
    ["hello@opika.org.ua", "mailto:hello@opika.org.ua"],
    ["Instagram", "https://www.instagram.com/opika.ua/"],
    ["Політика конфіденційності", "/polityka-konfidentsiinosti"],
  ]);
  await expect(footer.getByRole("link", { name: "Instagram" })).toHaveAttribute("rel", "noopener");

  await footer.getByRole("link", { name: "Для притулків" }).click();
  await page.waitForURL((url) => url.pathname === "/prytulkam");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("on a phone every footer link is a 48px target", async ({ page }) => {
  await openRoute(page, "/pro", PHONE, { readySelector: HEADER });
  const links = page.getByRole("contentinfo").getByRole("link");
  await expect(links).toHaveCount(7);
  for (const link of await links.all()) await expectMinTargetHeight(link);
});

test("at 320 the footer wraps without widening the page", async ({ page }) => {
  for (const route of ["/tvaryny", "/prytulkam"]) {
    await openRoute(page, route, NARROW_PHONE, { readySelector: HEADER });
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    await expect(page.getByRole("contentinfo").getByText(INDEPENDENT)).toBeVisible();
    expect(await noSidewaysScroll(page), route).toBe(true);
  }
});
