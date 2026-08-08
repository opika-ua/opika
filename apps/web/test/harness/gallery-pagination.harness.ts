/**
 * E3's own verification list (docs/build-plan.md doesn't spell these out
 * per-phase, but the phase brief does): numbered pages render with the real
 * corpus's page count, all pagination targets are actually >=44px (measured,
 * not read off a class name), the active page is leaf-filled and carries
 * `aria-current="page"`, clicking a page link is a real `push` (unlike E2's
 * filter `replace` — docs/gallery-contract-decisions.md §7), the skip link
 * is invisible until focused and actually moves focus past the grid, and at
 * least one page transition works with JavaScript disabled.
 */

import { expect, test } from "@playwright/test";
import { openRoute, rectOf } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/**
 * `proxy.ts` rate-limits `/tvaryny` at 100 req/min per IP, shared across
 * every harness file hitting it under the real local identity — see
 * `gallery-arrow-nav.harness.ts` for the full story and why this is
 * TEST-NET-2 (198.51.100.0/24) rather than the TEST-NET-3 block
 * `gallery-rate-limit.harness.ts` draws a random host from. `.24`: the next
 * unused host in this file's family (`.21` arrow-nav, `.22` filters, `.23`
 * layout).
 */
const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.24" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const NAV = "[data-testid='gallery-pagination']";
const PAGE_LINK = "[data-testid='pagination-page']";
const MIN_TARGET_PX = 44;

test.describe("/tvaryny pagination", () => {
  test("the seeded corpus is genuinely multi-page — a precondition for every test below", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await expect(
      page.locator(NAV),
      "gallery-pagination did not render at all — either totalPages <= 1 (the seed " +
        "corpus shrank below one page) or the component is broken. Every other test in " +
        "this file assumes a real multi-page corpus.",
    ).toBeAttached();
  });

  test("all pagination targets are measurably >=44px, not just styled that way", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const targets = page.locator(
      `${NAV} a, ${NAV} [data-testid='pagination-page'], ${NAV} [data-testid$='-disabled']`,
    );
    const count = await targets.count();
    expect(count, "expected at least prev, one page number, and next").toBeGreaterThan(2);

    for (let i = 0; i < count; i++) {
      const rect = await rectOf(targets.nth(i), `pagination target ${i}`);
      expect(rect.height, `target ${i} height`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(rect.width, `target ${i} width`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  });

  test("the active page is leaf-filled, carries aria-current, and is not a link to itself", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const active = page.locator(`${NAV} [data-active='true']`);
    await expect(active, "exactly one page should be marked active on load").toHaveCount(1);
    await expect(active).toHaveAttribute("aria-current", "page");
    await expect(active, "page 1 is active on a bare /tvaryny visit").toHaveText(/^1/);
    // A leaf-filled pill is a <span>, not an <a> — clicking "the page you're
    // already on" has nothing to do, so it should not be a navigation target.
    expect(await active.evaluate((el) => el.tagName)).toBe("SPAN");

    const bg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
    // #4f6b3a = rgb(79, 107, 58) — globals.css's --color-leaf, read live
    // rather than trusted from the class name.
    expect(bg, "the active page's background should be the leaf token").toBe("rgb(79, 107, 58)");
  });

  test("prev is absent on page 1; clicking next moves the active page and the URL", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await expect(page.getByTestId("pagination-prev")).toHaveCount(0);
    await expect(page.getByTestId("pagination-prev-disabled")).toHaveCount(1);

    await page.getByTestId("pagination-next").click();
    await page.waitForURL(/stor=2/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const active = page.locator(`${NAV} [data-active='true']`);
    await expect(active).toHaveText(/^2/);
  });

  test("clicking a page number is a real push — three separate back-presses undo three page moves", async ({
    page,
  }) => {
    // A real prior page, the same reasoning gallery-filters.harness.ts's own
    // push/replace test uses: what this proves is push, specifically, by
    // contrast with E2's filter replace — ten filter clicks collapse to one
    // history entry, but page navigation must not collapse the same way, or
    // "back" from page 4 would skip straight past 3 and 2 to the pre-gallery
    // page instead of landing on 3.
    await page.goto("/", { waitUntil: "load" });
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByTestId("pagination-next").click();
    await page.waitForURL(/stor=2/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    await page.getByTestId("pagination-next").click();
    await page.waitForURL(/stor=3/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    await page.goBack();
    await expect(page, "one back-press from page 3 should land on page 2").toHaveURL(/stor=2/);

    await page.goBack();
    await expect(
      page,
      "a second back-press should land on page 1 (no ?stor at all), not skip past it",
    ).not.toHaveURL(/stor=/);

    await page.goBack();
    await expect(page, "a third back-press should reach the real prior page").toHaveURL("/");
  });

  test("the skip link is invisible until focused, and activating it moves focus to the pagination nav", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const skipLink = page.getByTestId("pagination-skip-link");
    // `sr-only` clips to a real-but-tiny (1px x 1px) box rather than
    // `display:none` — boundingBox() still returns a rect, so the assertion
    // is "clipped to ~1px", not "null".
    const before = await skipLink.boundingBox();
    expect(
      before?.width,
      "the skip link should be clipped to ~1px before focus",
    ).toBeLessThanOrEqual(1);
    expect(
      before?.height,
      "the skip link should be clipped to ~1px before focus",
    ).toBeLessThanOrEqual(1);

    await skipLink.focus();
    const after = await rectOf(skipLink, "skip link, focused");
    expect(after.width, "the skip link should have real size once focused").toBeGreaterThan(0);
    expect(after.height, "the skip link should have real size once focused").toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    const navIsActive = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") === "gallery-pagination",
    );
    expect(
      navIsActive,
      'activating the skip link should move focus to the pagination nav (id="pagination", ' +
        "tabIndex={-1}), not merely scroll the page",
    ).toBe(true);
  });

  test("page links work with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: SPOOFED_IP_HEADERS,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ROUTE, { waitUntil: "load" });
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const namesBefore = await page.locator(`${CARD} [data-testid='card-name']`).allTextContents();

    await page.getByTestId("pagination-next").click();
    await page.waitForURL(/stor=2/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const namesAfter = await page.locator(`${CARD} [data-testid='card-name']`).allTextContents();
    expect(
      namesAfter,
      "a plain <a href> page link should navigate and render a different page with no JS",
    ).not.toEqual(namesBefore);

    await context.close();
  });

  test("a page number's accessible name states which page it is", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const secondPageLink = page.locator(PAGE_LINK).filter({ hasText: /^2$/ });
    await expect(secondPageLink).toHaveAttribute("aria-label", "Сторінка 2");
  });
});
