/**
 * E4's error state and out-of-range notice — both rendered assertions, per
 * `docs/build-plan.md`'s own words for the notice ("the note must actually
 * render") and this project's standing rule that a UI item isn't done on
 * the basis of inspecting markup.
 *
 * No loading.tsx coverage here: it was built, found to break the no-JS
 * path, and reverted — see `docs/gallery-contract-decisions.md`'s note and
 * the commit that reverted it. Nothing to test until it's rebuilt
 * client-side.
 */

import { MAX_GALLERY_PAGE } from "@opika/contracts";
import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP } from "./viewports";

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const NOTICE = "[data-testid='gallery-out-of-range-notice']";
const ERROR_CARD = "[data-testid='gallery-error']";
const RETRY = "[data-testid='gallery-error-retry']";

test.describe("/tvaryny out-of-range page", () => {
  /**
   * `docs/design/README.md`, "Out-of-range page (P1/P2)": `?stor=50` with
   * 10 real pages returns the last page, 200, with a visible notice — not
   * a 404, not a silent redirect. The seeded corpus's own page count
   * (`gallery-pagination.harness.ts`'s "genuinely multi-page" precondition)
   * is 10, so 50 is comfortably past it without being past
   * `MAX_GALLERY_PAGE`.
   */
  test("?stor=50 against a 10-page corpus clamps to the last page AND shows the notice", async ({
    page,
  }) => {
    await openRoute(page, `${ROUTE}?stor=50`, DESKTOP, { readySelector: CARD });

    await expect(page.locator(NOTICE)).toBeVisible();
    await expect(page.locator(NOTICE)).toContainText("Сторінки 50 не існує");
    await expect(page.locator(NOTICE)).toContainText("сторінку 10");

    // The clamp actually happened, not just the notice: real cards render,
    // and the pagination nav (if present) agrees this is page 10.
    await expect(page.locator(CARD).first()).toBeVisible();
    const activePage = page
      .getByTestId("pagination-page")
      .and(page.locator('[data-active="true"]'));
    await expect(activePage).toContainText("10");
  });

  /**
   * Beyond `MAX_GALLERY_PAGE` (2000), oRPC's own input-schema validation
   * rejects the request before `gallery.list`'s handler runs at all — a
   * genuinely different case from a page beyond `totalPages`, which
   * clamps. This one throws, and lands in `error.tsx`, not the notice.
   */
  test(`?stor=${MAX_GALLERY_PAGE + 1} (beyond MAX_GALLERY_PAGE) is an error, not a notice`, async ({
    page,
  }) => {
    await openRoute(page, `${ROUTE}?stor=${MAX_GALLERY_PAGE + 1}`, DESKTOP, {
      readySelector: ERROR_CARD,
    });

    await expect(page.locator(ERROR_CARD)).toBeVisible();
    await expect(page.locator(NOTICE)).toHaveCount(0);
    await expect(page.locator(CARD)).toHaveCount(0);
  });
});

test.describe("/tvaryny error state", () => {
  /**
   * What this test actually proves, and why it's scoped this way: an
   * earlier version tried to force a *transient* failure by aborting the
   * client-side RSC fetch behind a filter-chip click, then letting a
   * second attempt through, expecting error.tsx to catch the first and
   * retry to recover into the second. It didn't — Next's client router
   * does not reliably surface a failed client-side navigation fetch to
   * the nearest error boundary the way a genuine server-side throw does
   * (see `MAX_GALLERY_PAGE`'s test above, which does trigger error.tsx
   * reliably, every time). That distinction isn't documented anywhere
   * accessible; empirically, network-level client fetch failures did not
   * reach `error.tsx` in this app's current Next.js version, while a
   * `gallery.list` call that throws server-side always did.
   *
   * So: this test uses the reliable trigger (a filtered URL past
   * `MAX_GALLERY_PAGE`, which always fails, deterministically) and proves
   * what `reset()` actually guarantees — a re-render of the *same* URL,
   * not a navigation elsewhere — rather than proving recovery succeeds,
   * which depends on the failure's cause being fixable and isn't this
   * component's job to guarantee. `error.tsx.test.tsx` (component-level)
   * proves the button calls `reset()` at all; this proves that call
   * doesn't drop the filter that was already in the URL.
   */
  test("retry re-renders the same URL — the filter already in it survives the click", async ({
    page,
  }) => {
    const url = `${ROUTE}?vyd=dog&stor=${MAX_GALLERY_PAGE + 1}`;
    await openRoute(page, url, DESKTOP, { readySelector: ERROR_CARD });

    expect(page.url()).toContain("vyd=dog");

    await page.locator(RETRY).click();

    // Deterministic failure — retrying the exact same invalid page number
    // fails again, correctly. What matters here is that it failed against
    // the SAME state, not a different one: the filter is still in the URL,
    // and it's still the error card, not a silent fall-through to
    // something else.
    await expect(page.locator(ERROR_CARD)).toBeVisible();
    expect(page.url()).toContain("vyd=dog");
  });
});

test.describe("/tvaryny no-match — relaxation counts are real numbers", () => {
  /**
   * `gallery.relaxationCounts` (E2) had no verified consumer through a
   * real browser render before this test — `NoMatch.tsx`'s own unit-level
   * coverage (`server-client.test.ts`) asserts the query directly, not
   * that the rendered suggestion and the number it promises agree.
   * `vyd=cat&rozmir=large` is zero-result city-wide in the seeded corpus
   * (cats are never bucketed "large") — self-verifying, not asserted
   * against a hardcoded expectation: whatever number the suggestion
   * claims, following it should produce exactly that many results, since
   * the current (no-match) total is 0 and `additional` is defined as the
   * delta.
   */
  test("the no-match suggestion's claimed count matches the result set you get by following it", async ({
    page,
  }) => {
    await openRoute(page, `${ROUTE}?vyd=cat&rozmir=large`, DESKTOP, {
      readySelector: "[data-testid='gallery-no-match']",
    });

    const suggestion = page.getByTestId("no-match-suggestion").first();
    const suggestionText = await suggestion.innerText();
    const claimed = suggestionText.match(/\+(\d+)/);
    expect(
      claimed,
      `expected a "+N" count in the suggestion text, got: ${suggestionText}`,
    ).not.toBeNull();
    const claimedCount = Number(claimed?.[1]);
    expect(claimedCount).toBeGreaterThan(0);

    await suggestion.click();

    await expect(page.locator(CARD).first()).toBeVisible();
    const resultCount = page.getByText(/Знайдено \d+/);
    await expect(resultCount).toContainText(`Знайдено ${claimedCount} `);
  });
});
