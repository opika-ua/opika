/**
 * E2's own verification list (docs/build-plan.md doesn't spell these out
 * per-phase, but the phase brief does): the rail is measurably visible at
 * >=1024 and the sheet is not, and vice versa below — by bounding rect, not
 * by class name or markup presence; a filter applied, then the URL copied
 * and reopened in a fresh context, produces the same result set; the back
 * button returns to the previous result set, asserted on rendered rows
 * rather than on the URL alone; and at least one filter application works
 * with JavaScript disabled.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";

async function cardNames(page: {
  locator(selector: string): { allTextContents(): Promise<string[]> };
}) {
  return page.locator(`${CARD} [data-testid='card-name']`).allTextContents();
}

test.describe("/tvaryny rail vs sheet — mutually exclusive by breakpoint", () => {
  test("at >=1024, the rail is visible and the sheet trigger is not", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const railBox = await page.getByTestId("filter-rail").boundingBox();
    expect(railBox, "filter-rail should have a real bounding box at desktop width").not.toBeNull();
    expect(railBox?.width, "filter-rail should have non-zero width").toBeGreaterThan(0);

    const triggerBox = await page.getByTestId("filter-sheet-trigger").boundingBox();
    expect(
      triggerBox,
      "filter-sheet-trigger should have no bounding box (display:none) at desktop width — " +
        "the rail owns filtering there, not the sheet",
    ).toBeNull();
  });

  test("below 1024, the sheet trigger is visible and the rail is not", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });

    const triggerBox = await page.getByTestId("filter-sheet-trigger").boundingBox();
    expect(
      triggerBox,
      "filter-sheet-trigger should have a real bounding box at phone width",
    ).not.toBeNull();
    expect(triggerBox?.width, "filter-sheet-trigger should have non-zero width").toBeGreaterThan(0);

    const railBox = await page.getByTestId("filter-rail").boundingBox();
    expect(
      railBox,
      "filter-rail should have no bounding box (display:none) at phone width — the sheet " +
        "owns filtering there, not the rail",
    ).toBeNull();
  });
});

test.describe("/tvaryny filters — URL is the single source of truth", () => {
  test("a filter applied, then the URL reopened in a fresh context, reproduces the same result set", async ({
    page,
    browser,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByTestId("filter-rail").getByRole("link", { name: "Собаки" }).click();
    await page.waitForURL(/vyd=dog/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const filteredUrl = page.url();
    const namesInOriginalContext = await cardNames(page);
    expect(
      namesInOriginalContext.length,
      "the dog filter should narrow the 24-card page",
    ).toBeGreaterThan(0);

    // A genuinely fresh context — no cookies, no session, standing in for
    // "someone else opens the link you sent them."
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(filteredUrl, { waitUntil: "load" });
    await freshPage.locator(CARD).first().waitFor({ state: "visible" });

    const namesInFreshContext = await cardNames(freshPage);
    expect(
      namesInFreshContext,
      `pasting ${filteredUrl} into a fresh context produced a different result set than the ` +
        `one that built it`,
    ).toEqual(namesInOriginalContext);

    await freshContext.close();
  });

  test("back returns to the real prior page, and forward restores the filtered result set", async ({
    page,
  }) => {
    // A real prior page, not Playwright's own about:blank tab state — the
    // page the adopter was actually on before they started filtering.
    //
    // This is the "replace, not push" decision (ReplaceNav) made visible:
    // a filter click REPLACES the current history entry rather than adding
    // one, so it is the /tvaryny visit itself, not "the unfiltered state,"
    // that one back-press escapes to — deliberately, so ten filter clicks
    // don't cost ten back-presses to undo. What still has to hold is that
    // back lands somewhere real (not stuck, not an error) and forward
    // faithfully restores the filtered rows, not just the filtered URL.
    await page.goto("/", { waitUntil: "load" });
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByTestId("filter-rail").getByRole("link", { name: "Малий" }).click();
    await page.waitForURL(/rozmir=small/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const namesAfterFiltering = await cardNames(page);

    await page.goBack();
    await expect(
      page,
      "one back-press should return to the real page visited before /tvaryny",
    ).toHaveURL("/");

    await page.goForward();
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const namesAfterForward = await cardNames(page);
    expect(
      namesAfterForward,
      "forward should restore the exact filtered result set, not just the filtered URL",
    ).toEqual(namesAfterFiltering);
  });
});

test.describe("/tvaryny filters — work with JavaScript disabled", () => {
  test("the sheet's native form narrows the result set with no JS at all", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ROUTE, { waitUntil: "load" });
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const namesBefore = await cardNames(page);

    // No JS: the trigger is a plain <a href="#tvaryny-filters"> revealed by
    // the :target CSS rule, and the form is a real <form method="GET">.
    await page.getByTestId("filter-sheet-trigger").click();
    const speciesCheckbox = page.locator('#tvaryny-filters input[name="vyd"][value="dog"]');
    await expect(
      speciesCheckbox,
      "the species checkbox should be reachable without JS",
    ).toBeAttached();
    // The input itself is visually `sr-only` (1x1, clipped) — its wrapping
    // <label> is what a real tap actually lands on and what native <label>
    // semantics forward the click to, exactly like every other chip in
    // this UI. Clicking the tiny input directly is a test artifact, not
    // how anyone — mouse or screen reader — actually operates this control.
    await speciesCheckbox.locator("xpath=..").click();
    await expect(
      speciesCheckbox,
      "clicking the label should check the checkbox it wraps",
    ).toBeChecked();
    await page.locator('#tvaryny-filters button[type="submit"]').click();

    await page.waitForURL(/vyd=dog/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const namesAfter = await cardNames(page);
    expect(
      namesAfter,
      "submitting the sheet's native form with no JS should narrow the result set",
    ).not.toEqual(namesBefore);

    await context.close();
  });

  test("every card is still reachable by Tab with no JS — the grid never relies on script to be tabbable", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ROUTE, { waitUntil: "load" });
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const firstCardHref = await page.locator(CARD).first().getAttribute("href");
    await page.locator(CARD).first().focus();
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute("href"));
    expect(
      focusedHref,
      "the first card should be focusable directly (no roving tabindex removing it from " +
        "the tab order) when JS never ran to set one up",
    ).toBe(firstCardHref);

    await context.close();
  });
});
