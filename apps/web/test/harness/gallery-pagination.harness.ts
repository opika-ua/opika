/**
 * E3's own verification list (docs/build-plan.md doesn't spell these out
 * per-phase, but the phase brief does): numbered pages render with the real
 * corpus's page count, all pagination targets are actually >=56px (V2
 * repoint from E3's original 44px — measured, not read off a class name),
 * the active page is leaf-filled and carries
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
// V2 repoint: 44 -> 56 (`Opika Registry System.dc.html`'s pagination row,
// lines 189/195: `min-height: 56px` on both prev and next). The component
// itself already renders 56 (`min-h-14`) — this assertion had gone stale
// against it, silently looser than the code it's meant to guard.
const MIN_TARGET_PX = 56;

/**
 * The mock's own literals (`docs/design/Opika Registry System.dc.html`,
 * lines 189/195), NOT `uk.pagination.prev`/`next`:
 * comparing the rendered text to the same constant the component renders
 * would hold no matter what that constant said, which is the one thing
 * these two assertions exist to pin. Copy drifting away from the design
 * should fail here and send the next reader back to the mock.
 */
const DESIGN_PREV = "← Назад";
const DESIGN_NEXT = "Далі →";

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

  test("all pagination targets are measurably >=56px, not just styled that way", async ({
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

  test("the active page is ink-filled, carries aria-current, and is not a link to itself", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const active = page.locator(`${NAV} [data-active='true']`);
    await expect(active, "exactly one page should be marked active on load").toHaveCount(1);
    await expect(active).toHaveAttribute("aria-current", "page");
    await expect(active, "page 1 is active on a bare /tvaryny visit").toHaveText(/^1/);
    // An ink-filled pill is a <span>, not an <a> — clicking "the page you're
    // already on" has nothing to do, so it should not be a navigation target.
    expect(await active.evaluate((el) => el.tagName)).toBe("SPAN");

    const bg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
    // V2 repoint: the active-page fill moved from --color-leaf (#4f6b3a,
    // green) to --color-rg-ink (#101112, black) — docs/design/README.md,
    // "Pagination — not infinite scroll": "active page #101112 filled."
    // The old system's leaf-green primary-action colour has no equivalent
    // in a token set with "no colour in the interface at all" apart from
    // the one registry blue, which pagination never uses.
    expect(bg, "the active page's background should be the rg-ink token").toBe("rgb(16, 17, 18)");
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
    // The computed name, not the `aria-label` attribute: the attribute is
    // only one of the inputs to it, and this test's claim is about what a
    // screen reader actually announces. "Сторінка 2" also contains the
    // visible label ("2"), which is what keeps it on the right side of WCAG
    // 2.5.3 while prev/next carry their text directly.
    await expect(secondPageLink).toHaveAccessibleName("Сторінка 2");
  });

  test("prev/next carry the design's own visible text, not a bare glyph with a separate label", async ({
    page,
  }) => {
    // docs/design's mock (`Opika Registry System.dc.html`, lines 189/195)
    // sets "← Назад" / "Далі →" as the buttons' own visible text —
    // an earlier draft used a bare "‹"/"›" glyph plus an aria-label that
    // didn't contain it, a WCAG 2.5.3 accessible-name mismatch caught on
    // review. Asserting the visible text (not just the aria-label) is what
    // would have caught that draft.
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await expect(page.getByTestId("pagination-prev-disabled")).toHaveText(DESIGN_PREV);
    await expect(page.getByTestId("pagination-next")).toHaveText(DESIGN_NEXT);
  });

  /**
   * V2 repoint (docs/design/README.md, "Pagination — not infinite scroll"):
   * "«з N» renders only when the number list is truncated with an ellipsis
   * — while every number is on screen the counter just restates what you
   * can count." Previously unconditional; `GalleryPagination.tsx` now
   * gates it on `isTruncated`. This assertion's outcome is unchanged
   * because the seeded corpus (256 discoverable animals / 24 per page ≈ 11
   * pages) is genuinely past `ALWAYS_EXPANDED_THRESHOLD` (7) and always
   * truncates at the default, unfiltered view this test loads — the
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
