/**
 * The species landing pages (owner, 2026-11-27) against a real server and the seeded corpus,
 * whose verified shelters list far more than ten dogs. Flows only, found by role and test id:
 * the gallery's switch is a real link to the page, a click lands there with no animal overlay
 * open (a one-segment `/tvaryny/{x}` would be caught by the overlay's interception, which is why
 * the address has two), and the page's own head and 404.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

// TEST-NET-2, a fixed address of its own: `proxy.ts` rate-limits `/` pages per IP.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.171" } });

const SPECIES_PAGE = "/tvaryny/vyd/sobaky";
const CARD = "[data-testid='animal-card']";
const CANONICAL = "link[rel='canonical']";

for (const [label, viewport, testId] of [
  ["desktop", DESKTOP, "species-dog"],
  ["phone", PHONE, "species-dog-mobile"],
] as const) {
  test(`${label}: the gallery's «Собаки» opens the dogs' page, never the animal overlay`, async ({
    page,
  }) => {
    await openRoute(page, "/", viewport, { readySelector: CARD });
    const link = page.getByTestId(testId);
    await expect(link).toHaveAttribute("href", SPECIES_PAGE);
    await link.click();

    await page.waitForURL((url) => url.pathname === SPECIES_PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "Собаки шукають дім" })).toBeVisible();
    await page.locator(CARD).first().waitFor({ state: "visible" });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("the dogs' page has the approved title and is its own canonical", async ({ page }) => {
  const response = await page.goto(SPECIES_PAGE);
  expect(response?.status()).toBe(200);
  expect(await page.title()).toBe("Взяти собаку з притулку – Opika");
  await expect(page.locator(CANONICAL)).toHaveAttribute("href", /\/tvaryny\/vyd\/sobaky$/);
});

test("/?vyd=dog stays the gallery, with the dogs' page as its canonical", async ({ page }) => {
  await openRoute(page, "/?vyd=dog", DESKTOP, { readySelector: CARD });
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.locator(CANONICAL)).toHaveAttribute("href", /\/tvaryny\/vyd\/sobaky$/);
});

test("any other species slug is a real 404", async ({ page }) => {
  const response = await page.goto("/tvaryny/vyd/khomiaky");
  expect(response?.status()).toBe(404);
});
