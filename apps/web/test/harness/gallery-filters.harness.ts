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
import { expectFocusVisibleOutline, openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/**
 * `proxy.ts` rate-limits `/tvaryny` at 100 req/min per IP, shared across
 * every harness file that requests it under the real local identity —
 * `gallery-rate-limit.harness.ts`'s own comment names this as a risk for
 * "present or future" tests. Confirmed as a real, reproducing 429 once
 * `gallery-arrow-nav.harness.ts` (E2.5) added its own real requests to the
 * shared pile — see that file's comment for the full story. Isolates this
 * file's volume the same way that file's own dedicated test already
 * isolates itself. Manually-created contexts below (the fresh-context and
 * JS-disabled tests) need the header passed explicitly — `test.use()`
 * only configures the implicit `context`/`page` fixtures, not a context a
 * test creates itself via `browser.newContext()`.
 *
 * TEST-NET-2 (198.51.100.0/24), deliberately not the TEST-NET-3 block
 * `gallery-rate-limit.harness.ts` draws a random host from each run — see
 * `gallery-arrow-nav.harness.ts` for why a fixed address inside that block
 * would be a 1-in-254 collision per run rather than no collision at all.
 */
const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.22" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
/** The id the no-JS `:target` reveal keys on — `FilterSheet`'s `SHEET_ID`. */
const SHEET = "#tvaryny-filters";

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

/**
 * docs/standing-constraints.md: "An interactive element ships with its
 * focus-visible styling and a test." E5's deck-entry control has two
 * instances — desktop header, mobile row — CSS-hidden by breakpoint, same
 * as the rail/sheet split above, so each needs its own viewport.
 */
test.describe("/tvaryny deck entry — keyboard focus", () => {
  test("the desktop entry link shows a real focus-visible outline", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await expectFocusVisibleOutline(page, {
      label: "desktop deck-entry link",
      locator: page.getByTestId("deck-entry-desktop"),
    });
  });

  test("the mobile entry link shows a real focus-visible outline", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });

    await expectFocusVisibleOutline(page, {
      label: "mobile deck-entry link",
      locator: page.getByTestId("deck-entry-mobile"),
    });
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
    // "someone else opens the link you sent them." Still spoofs this
    // file's own IP: a real distinct visitor wouldn't share it in
    // production, but this is the harness's own request budget, not
    // theirs, and letting it consume the shared local-IP budget is
    // exactly the collision this file works around everywhere else.
    const freshContext = await browser.newContext({ extraHTTPHeaders: SPOOFED_IP_HEADERS });
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
    // page the adopter was actually on before they started filtering. `/`
    // itself can't serve this purpose (it 308-redirects to /tvaryny —
    // FirstRunBand.tsx, next.config.ts), so `/pro` stands in as any other
    // real, distinct route would.
    //
    // This is the "replace, not push" decision (ReplaceNav) made visible:
    // a filter click REPLACES the current history entry rather than adding
    // one, so it is the /tvaryny visit itself, not "the unfiltered state,"
    // that one back-press escapes to — deliberately, so ten filter clicks
    // don't cost ten back-presses to undo. What still has to hold is that
    // back lands somewhere real (not stuck, not an error) and forward
    // faithfully restores the filtered rows, not just the filtered URL.
    await page.goto("/pro", { waitUntil: "load" });
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByTestId("filter-rail").getByRole("link", { name: "Малий" }).click();
    await page.waitForURL(/rozmir=small/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const namesAfterFiltering = await cardNames(page);

    await page.goBack();
    await expect(
      page,
      "one back-press should return to the real page visited before /tvaryny",
    ).toHaveURL("/pro");

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
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: SPOOFED_IP_HEADERS,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ROUTE, { waitUntil: "load" });
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const namesBefore = await cardNames(page);

    // No JS: the trigger is a plain <a href="#tvaryny-filters"> revealed by
    // the :target CSS rule, and the form is a real <form method="GET">.
    await page.getByTestId("filter-sheet-trigger").click();
    // The reveal itself, asserted rather than left implicit in a later
    // click's actionability timeout: with no JS this is `:target` and the
    // one ID-scoped rule in globals.css doing all of the work, and if that
    // rule were dropped the dialog would stay `display: none` from the UA
    // stylesheet's own `dialog:not([open])`.
    await expect(
      page.locator(SHEET),
      "the <dialog> should be revealed by the :target rule alone, with no JS",
    ).toBeVisible();
    const speciesCheckbox = page.locator(`${SHEET} input[name="vyd"][value="dog"]`);
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
    await page.locator(`${SHEET} button[type="submit"]`).click();

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
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: SPOOFED_IP_HEADERS,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ROUTE, { waitUntil: "load" });
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const firstCardHref = await page.locator(CARD).first().getAttribute("href");

    // Real Tab presses, not `locator.focus()`: `focus()` succeeds on an
    // element with `tabindex="-1"`, so a card deliberately removed from the
    // tab order would still pass a focus()-based assertion — the exact
    // "would this fail if the thing it guards were broken" case
    // docs/standing-constraints.md rules out. Walking the tab order is the
    // only version of this test that can fail for the reason it names.
    /**
     * 12 before Phase T, 14 after: `SiteHeader` added two site-nav links
     * («Для притулків», «Про проєкт») ahead of the content, which is exactly
     * the order docs/design/README.md:763 specifies — header, then rail, then
     * sort, then cards in reading order.
     *
     * Kept tight rather than made generous. Its job is not only "the card is
     * reachable at all" — a roving tabindex would leave it unreachable at any
     * bound — but "the content is not receding behind chrome," and a number
     * nudged upward whenever something is added to the header would quietly
     * stop measuring the second thing.
     */
    const MAX_TAB_PRESSES = 14;
    let presses = 0;
    let reachedFirstCard = false;
    while (presses < MAX_TAB_PRESSES && !reachedFirstCard) {
      await page.keyboard.press("Tab");
      presses += 1;
      reachedFirstCard = await page.evaluate(
        (href) => document.activeElement?.getAttribute("href") === href,
        firstCardHref,
      );
    }

    expect(
      reachedFirstCard,
      `the first card was not reached within ${MAX_TAB_PRESSES} Tab presses — with no JS it ` +
        `must sit in the natural tab order (no tabindex="-1" roving scheme that only a ` +
        `script would ever repair)`,
    ).toBe(true);

    await context.close();
  });
});
