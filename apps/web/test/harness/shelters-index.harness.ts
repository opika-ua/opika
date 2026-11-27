/**
 * `/prytulky` against a real server and the seeded corpus (verified shelters with animals). Flows
 * only, found by role, text and the served `<head>`: the page answers with its heading, rows that
 * lead to shelter pages, a self canonical, and no sideways scroll on a phone.
 */

import { expect, test } from "@playwright/test";
import { expectReachableByTab, noSidewaysScroll, openRoute } from "./harness";
import { ANDROID_PHONE, DESKTOP } from "./viewports";

// TEST-NET-2, a fixed address of its own: `proxy.ts` rate-limits `/prytulky` per IP.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.161" } });

const ROW = "[data-testid='shelter-index-row']";

test("answers with its heading, the owner's title, a self canonical and rows to shelter pages", async ({
  page,
}) => {
  const response = await page.goto("/prytulky");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Притулки й ініціативи");
  expect(await page.title()).toBe("Притулки для тварин на Opika – перевірені вручну");
  await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", /\/prytulky$/);
  // Grouped by city: a city heading above the rows.
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();

  const row = page.locator(ROW).first();
  const href = await row.getAttribute("href");
  expect(href).toMatch(/^\/prytulky\/[0-9a-f-]{36}$/);
  await row.click();
  await page.waitForURL((url) => url.pathname === href);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a row is reachable by keyboard on desktop, and a phone does not scroll sideways", async ({
  page,
}) => {
  await openRoute(page, "/prytulky", DESKTOP, { readySelector: ROW });
  await expectReachableByTab(
    page,
    { locator: page.locator(ROW).first(), label: "first shelter row" },
    40,
  );

  await openRoute(page, "/prytulky", ANDROID_PHONE, { readySelector: ROW });
  expect(await noSidewaysScroll(page)).toBe(true);
});
