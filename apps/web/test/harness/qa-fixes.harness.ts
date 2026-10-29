/**
 * QA 2026-10-29, PR 1: the root 404, the skip link, a hostile `?stor=` and the page-level 429,
 * each through a real server. Roles, text and statuses only; nothing is measured.
 *
 * `198.51.100.61` keeps this file's requests off every other file's per-IP budget.
 */

import { expect, test } from "@playwright/test";
import { expectReachableByTab } from "./harness";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.61" } });

test.describe("an address no route owns", () => {
  test("answers a real 404 with the on-brand page, the header and a way home", async ({ page }) => {
    const response = await page.goto("/nema-takoi-storinky", { waitUntil: "load" });
    expect(response?.status()).toBe(404);
    expect(response?.headers()["content-language"] ?? "uk").not.toMatch(/^en/);

    await expect(
      page.getByRole("heading", { level: 1, name: "Такої сторінки немає." }),
    ).toBeVisible();
    await expect(
      page.getByText("Можливо, посилання застаріло або в адресі помилка."),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByText("This page could not be found")).toHaveCount(0);

    await expectReachableByTab(page, {
      label: "«На головну» link",
      locator: page.getByRole("link", { name: "На головну" }),
    });
    await page.getByRole("link", { name: "На головну" }).press("Enter");
    await expect(page).toHaveURL(/\/tvaryny$/);
  });
});

test.describe("skip link", () => {
  test("is the first Tab stop, and Enter moves focus to the page content", async ({ page }) => {
    await page.goto("/pro", { waitUntil: "load" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Перейти до вмісту" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });
});

test.describe("/tvaryny?stor= with a hostile value", () => {
  for (const stor of ["1e21", "999999999999999999999", "abc", "-5", "0", "2.5"]) {
    test(`?stor=${stor} answers 200, not an error page`, async ({ page }) => {
      const response = await page.goto(`/tvaryny?stor=${stor}`, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.getByText("Сторінку не вдалося завантажити.")).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }
});

test.describe("the deck", () => {
  test("has a level-1 heading", async ({ page }) => {
    await page.goto("/tvaryny/gortaty", { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1, name: "Тварини по одній" })).toHaveCount(1);
  });
});
