/**
 * E3's own verification list (docs/build-plan.md doesn't spell these out
 * per-phase, but the phase brief does): numbered pages render with the real
 * corpus's page count, the active page carries `aria-current="page"`,
 * clicking a page link is a real `push` (unlike E2's filter `replace` -
 * docs/gallery-contract-decisions.md §7), the skip link actually moves focus
 * past the grid, and at least one page transition works with JavaScript
 * disabled.
 *
 * 2026-10-20: the target-size (>=56px), active-page colour and skip-link size
 * checks measured appearance and were removed (Oleksii, 2026-10-20, verbatim:
 * "Drop the rest that measure appearance."; CLAUDE.md, "Test logic, not
 * looks").
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/**
 * `proxy.ts` rate-limits `/tvaryny` at 100 req/min per IP, shared across
 * every harness file hitting it under the real local identity - see
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

test.describe("/tvaryny pagination", () => {
  test("the seeded corpus is genuinely multi-page - a precondition for every test below", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await expect(
      page.locator(NAV),
      "gallery-pagination did not render at all - either totalPages <= 1 (the seed " +
        "corpus shrank below one page) or the component is broken. Every other test in " +
        "this file assumes a real multi-page corpus.",
    ).toBeAttached();
  });

  test("the active page carries aria-current and is not a link to itself", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const active = page.locator(`${NAV} [data-active='true']`);
    await expect(active, "exactly one page should be marked active on load").toHaveCount(1);
    await expect(active).toHaveAttribute("aria-current", "page");
    await expect(active, "page 1 is active on a bare /tvaryny visit").toHaveText(/^1/);
    // The active page is a <span>, not an <a> - clicking "the page you're
    // already on" has nothing to do, so it should not be a navigation target.
    expect(await active.evaluate((el) => el.tagName)).toBe("SPAN");
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

  test("clicking a page number is a real push - three separate back-presses undo three page moves", async ({
    page,
  }) => {
    // A real prior page, the same reasoning gallery-filters.harness.ts's own
    // push/replace test uses (including why it's /pro and not / - see that
    // file's own comment): what this proves is push, specifically, by
    // contrast with E2's filter replace - ten filter clicks collapse to one
    // history entry, but page navigation must not collapse the same way, or
    // "back" from page 4 would skip straight past 3 and 2 to the pre-gallery
    // page instead of landing on 3.
    await page.goto("/pro", { waitUntil: "load" });
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
    await expect(page, "a third back-press should reach the real prior page").toHaveURL("/pro");
  });

  test("activating the skip link moves focus to the pagination nav", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const skipLink = page.getByTestId("pagination-skip-link");
    await skipLink.focus();
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
    // The computed name, not the `aria-label` attribute: the attribute is
    // only one of the inputs to it, and this test's claim is about what a
    // screen reader actually announces. "Сторінка 2" also contains the
    // visible label ("2"), which is what keeps it on the right side of WCAG
    // 2.5.3 while prev/next carry their text directly.
    await expect(secondPageLink).toHaveAccessibleName("Сторінка 2");
  });

  /**
   * gallery-v3 (Figma `58:1617`): prev/next are icon-only chevrons now, not
   * the old design's own visible "← Назад" / "Далі →" text this test used
   * to pin. Icon-only is *not* a reversion to the WCAG 2.5.3 bug the old
   * test existed to catch (an aria-label that doesn't contain visible
   * text) - that rule only applies when there IS visible text; with none
   * at all, a plain `aria-label` naming the action is the standard,
   * compliant pattern (`GalleryPageNav.tsx`'s own top comment has the full
   * reasoning). This test is what would catch a regression back to
   * mismatched visible text instead.
   */
  test("prev/next carry no visible text - the accessible name alone says what they do", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await expect(page.getByTestId("pagination-next")).toHaveText("");
    await expect(page.getByTestId("pagination-next")).toHaveAccessibleName("Далі →");
  });

  /**
   * V2 repoint (docs/design/README.md, "Pagination — not infinite scroll"):
   * "«з N» renders only when the number list is truncated with an ellipsis
   * - while every number is on screen the counter just restates what you
   * can count." Previously unconditional; `GalleryPagination.tsx` now
   * gates it on `isTruncated`. This assertion's outcome is unchanged
   * because the seeded corpus (256 discoverable animals / 24 per page ≈ 11
   * pages) is genuinely past `ALWAYS_EXPANDED_THRESHOLD` (7) and always
   * truncates at the default, unfiltered view this test loads - the
   * untruncated case (no "з N") is covered instead in
   * `GalleryPagination.test.tsx`, where a small `totalPages` is a prop, not
   * something that needs 8+ real seeded pages to reach.
   */
  test("the number group ends with the design's own 'з N' count, because this corpus truncates", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const navText = await page.locator(NAV).innerText();
    expect(
      navText,
      `expected a "з N" count somewhere in the pagination nav, got: ${navText}`,
    ).toMatch(/з \d+/);
  });
});
