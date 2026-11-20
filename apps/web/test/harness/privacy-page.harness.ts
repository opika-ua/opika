/**
 * The privacy policy against a real server: it answers 200 with its own title, reads as one h1 and
 * its sections, does not scroll sideways on a phone, and /pro's summary links to it.
 */
import { expect, test } from "@playwright/test";
import { noSidewaysScroll, openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

const PATH = "/polityka-konfidentsiinosti";

test("the privacy policy answers 200 with its title, one h1 and no sideways scroll at 390", async ({
  page,
}) => {
  await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
  const response = await page.goto(PATH, { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  expect(await page.title()).toBe("Політика конфіденційності – Opika");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Політика конфіденційності");
  await expect(page.getByRole("heading", { level: 2, name: "Хто ще обробляє дані" })).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});

test("from desktop the policy and the other content pages keep to the width", async ({ page }) => {
  for (const width of [1024, 1440]) {
    for (const route of [PATH, "/pro", "/prytulkam"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: "load" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await noSidewaysScroll(page), `${route} at ${width}`).toBe(true);
    }
  }
});

test("/pro's data summary links to the privacy policy, and #dani still lands", async ({ page }) => {
  await openRoute(page, "/pro#dani", DESKTOP);
  await expect(page.locator("#dani")).toHaveText(/^Коротко: я не продаю дані/);
  await page.getByRole("link", { name: "політиці конфіденційності" }).click();
  await page.waitForURL(`**${PATH}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Політика конфіденційності");
});
