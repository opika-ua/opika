/**
 * The species landing pages (owner, 2026-11-27) against a real server and the seeded corpus,
 * whose verified shelters list far more than ten dogs. Flows only, found by role and test id:
 * the gallery's switch is a real link to the page, a click lands there with no animal overlay
 * open (a one-segment `/tvaryny/{x}` would be caught by the overlay's interception, which is why
 * the address has two), and the page's own head and 404.
 */

import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, DETAIL_DESKTOP, PHONE } from "./viewports";

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

/**
 * A card opened from a landing page: the overlay or the full animal page, either way the URL and
 * what is on screen agree, and Escape or Back return to the same landing page with its filters,
 * its own heading and its own first card (owner, 2026-11-27: no stale page left behind).
 */
async function expectCardRoundTrip(
  page: Page,
  route: string,
  heading: string,
  leave: "Escape" | "Back",
) {
  await openRoute(page, route, DETAIL_DESKTOP, { readySelector: CARD });
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  const card = page.locator(CARD).first();
  const name = (await card.getByTestId("card-name").textContent())?.trim() ?? "";
  expect(name.length).toBeGreaterThan(0);

  await card.click();
  await page.waitForURL((url) => /^\/tvaryny\/[0-9a-f-]{36}$/.test(url.pathname));
  const dialog = page.getByRole("dialog", { name });
  const overlay = await dialog
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  // The animal on screen is the one the URL names: in the overlay, or as the whole page.
  const shown = overlay ? dialog : page;
  await expect(shown.getByRole("heading", { level: 1, name })).toBeVisible();

  if (leave === "Escape" && overlay) await page.keyboard.press("Escape");
  else await page.goBack();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForURL((url) => url.pathname + url.search === route);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.locator(CARD).first().getByTestId("card-name")).toHaveText(name);
}

test.describe("a card opened from a landing page, and the way back", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.172" } });

  const SPECIES_PAGE_2 = `${SPECIES_PAGE}?stor=2`;
  for (const leave of ["Escape", "Back"] as const) {
    test(`the dogs' page 2: ${leave} returns to it, its page and heading intact`, async ({
      page,
    }) => {
      await expectCardRoundTrip(page, SPECIES_PAGE_2, "Собаки шукають дім", leave);
    });

    test(`a city page with a species filter: ${leave} returns to it, its filter intact`, async ({
      page,
    }) => {
      await expectCardRoundTrip(
        page,
        "/tvaryny/misto/brovary?vyd=dog",
        "Шукають дім: Бровари",
        leave,
      );
    });
  }
});
