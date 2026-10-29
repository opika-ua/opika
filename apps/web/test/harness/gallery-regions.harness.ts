/**
 * Nationwide N3: the oblast filter in a real browser against the seeded corpus (eight cities, all
 * in Kyiv oblast or Kyiv city). Flows only, found by role, label and text: the oblast in the URL,
 * the empty state of an oblast with no animals and its neighbour suggestion, the no-JS sheet, and
 * the city options being only the cities that have an animal.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

// TEST-NET-2 (198.51.100.0/24), a fixed address of its own: `proxy.ts` rate-limits `/tvaryny` per
// IP and the other gallery files each take theirs (see `gallery-filters.harness.ts`).
const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.23" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const SHEET = "#tvaryny-filters";

test.describe("/tvaryny, the oblast filter", () => {
  test("?obl= narrows to the oblast and the selector names it", async ({ page }) => {
    await openRoute(page, `${ROUTE}?obl=kyivska`, DESKTOP, { readySelector: CARD });

    await expect(page.getByRole("button", { name: "Область: Київська" })).toBeVisible();
    expect(await page.locator(CARD).count()).toBeGreaterThan(0);
  });

  test("an unknown oblast slug degrades to the unfiltered list, never an error", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    const unfiltered = await page.locator(CARD).count();

    await openRoute(page, `${ROUTE}?obl=atlantis`, DESKTOP, { readySelector: CARD });
    expect(await page.locator(CARD).count()).toBe(unfiltered);
    await expect(page.getByRole("button", { name: "Область: Область" })).toBeVisible();
  });

  test("picking an oblast in the desktop selector writes it to the URL", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByRole("button", { name: "Область: Область" }).click();
    await page.getByRole("button", { name: /^Київська, / }).click();
    await page.waitForURL(/obl=kyivska/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
  });

  test("the oblast selector lists all 27, an empty one disabled in place", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByRole("button", { name: "Область: Область" }).click();
    const pills = page.getByRole("group", { name: "Область" }).getByRole("button");
    expect(await pills.count()).toBe(27);
    // Crimea is listed like any other region; with no animal it is disabled, not removed.
    await expect(page.getByRole("button", { name: "АР Крим, 0 тварин" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("an oblast with no animals says so and offers the next-door oblast that has some", async ({
    page,
  }) => {
    // Zhytomyr borders Kyiv oblast and holds no seeded animal.
    await openRoute(page, `${ROUTE}?obl=zhytomyrska`, DESKTOP, {
      readySelector: "[data-testid='gallery-no-match']",
    });

    await expect(page.getByText("У вибраних областях поки немає тварин.")).toBeVisible();
    const neighbour = page.getByRole("link", { name: /^Сусідня область: Київська \(\+\d+ / });
    await expect(neighbour).toBeVisible();

    await neighbour.click();
    await page.waitForURL(/obl=kyivska/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
  });

  test("the city selector offers only cities that have an animal", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByRole("button", { name: "Місто: Місто" }).click();
    const options = page.getByRole("group", { name: "Місто" }).getByRole("button");
    const names = await options.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label") ?? ""),
    );
    expect(names.length).toBeGreaterThan(0);
    // Every offered city carries a count: it comes from the animals, not from a list of places.
    for (const name of names) expect(name, name).toMatch(/, \d+ /);
  });
});

test.describe("/tvaryny, the oblast filter without JavaScript", () => {
  test("the sheet's native form carries the oblast to the server", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: SPOOFED_IP_HEADERS,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ROUTE, { waitUntil: "load" });
    await page.locator(CARD).first().waitFor({ state: "visible" });

    await page.getByTestId("filter-sheet-trigger").click();
    await expect(page.locator(SHEET)).toBeVisible();
    const kyivska = page.locator(`${SHEET} input[name="obl"]`).first();
    await expect(kyivska, "an oblast checkbox is in the form with no script").toBeAttached();
    await kyivska.locator("xpath=..").click();
    await page.locator(`${SHEET} button[type="submit"]`).click();

    await page.waitForURL(/obl=/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    await context.close();
  });
});

/**
 * The gallery's HTML carries the filter options and their labels (RSC payload included). With the
 * options derived from the animals it must stay small however many settlements exist; this keeps it
 * from growing back into a list. Measured 168,762 bytes on the seeded corpus (eight cities, 24
 * cards, 2026-10-29); the budget leaves room for the labels of a few dozen more cities and
 * would be crossed by 29.7k chips many times over.
 */
const GALLERY_HTML_BUDGET_BYTES = 210_000;

test("the gallery document stays small: the options come from the animals, not from a list", async ({
  page,
}) => {
  const response = await page.goto(ROUTE, { waitUntil: "load" });
  const bytes = Buffer.byteLength((await response?.text()) ?? "");
  expect(bytes, `/tvaryny HTML is ${bytes} bytes`).toBeLessThan(GALLERY_HTML_BUDGET_BYTES);
});
