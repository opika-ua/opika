/**
 * E4's error state and out-of-range notice - both rendered assertions, per
 * `docs/build-plan.md`'s own words for the notice ("the note must actually
 * render") and this project's standing rule that a UI item isn't done on
 * the basis of inspecting markup.
 *
 * No loading.tsx coverage here: it was built, found to break the no-JS
 * path, and reverted - see `docs/gallery-contract-decisions.md`'s note and
 * the commit that reverted it. Nothing to test until it's rebuilt
 * client-side.
 */

import { MAX_GALLERY_PAGE } from "@opika/contracts";
import { expect, test } from "@playwright/test";
import { expectReachableByTab, openRoute } from "./harness";
import { DESKTOP } from "./viewports";

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const NOTICE = "[data-testid='gallery-out-of-range-notice']";
const ERROR_CARD = "[data-testid='gallery-error']";

/**
 * TEST-NET-2 (198.51.100.0/24), `.26` - the next unused address in this
 * block; `.21`-`.25` are already claimed by the other `/tvaryny` harness
 * files (`gallery-arrow-nav`, `gallery-filters`, `gallery-layout`,
 * `gallery-pagination`; `.25` was `freshness-pip-contrast`'s, removed
 * 2026-10-20). Without a distinct
 * identity this file's five tests would share `proxy.ts`'s 100/min-per-IP
 * budget with whichever of those runs concurrently - flaky, not obviously
 * this file's fault when it fails.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.26" } });

test.describe("/tvaryny out-of-range page", () => {
  /**
   * `docs/design/README.md`, "Out-of-range page (P1/P2)": `?stor=50` with
   * 10 real pages returns the last page, 200, with a visible notice - not
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
    await expect(page.locator(NOTICE)).toContainText("сторінка 10");

    // The clamp actually happened, not just the notice: real cards render,
    // and the pagination nav (if present) agrees this is page 10.
    await expect(page.locator(CARD).first()).toBeVisible();
    const activePage = page.locator("[data-testid='gallery-pagination'] [aria-current='page']");
    await expect(activePage).toContainText("10");
  });

  /**
   * Beyond `MAX_GALLERY_PAGE` (2000) the contract's input validation used to throw into `error.tsx`
   * (a 500 for a hostile URL, QA 2026-10-29). The page parser now clamps any huge number to that
   * ceiling and the repo clamps on to the last page: the same notice as `?stor=50`, never an error.
   * The error card is reached in a browser only through the test-only hook, below.
   */
  for (const stor of [String(MAX_GALLERY_PAGE + 1), "1e21", "999999999999999999999"]) {
    test(`?stor=${stor} clamps to the last page with the notice, not an error`, async ({
      page,
    }) => {
      const response = await page.goto(`${ROUTE}?stor=${stor}`, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator(CARD).first()).toBeVisible();
      await expect(page.locator(NOTICE)).toBeVisible();
      await expect(page.locator(ERROR_CARD)).toHaveCount(0);
    });
  }
});

test.describe("/tvaryny error card", () => {
  /**
   * The only way into `app/tvaryny/error.tsx` in a real browser: the test-only hook
   * (`features/gallery/test-only-failure.ts`) makes the page throw for `?opika_test_fail=1`.
   * Flow only: the card, its approved copy, Tab reach and both actions.
   */
  test("renders the error card; retry and the show-all link are reachable by Tab and work", async ({
    page,
  }) => {
    await page.goto(`${ROUTE}?opika_test_fail=1`, { waitUntil: "load" });

    const card = page.getByRole("alert").filter({ has: page.getByRole("heading", { level: 1 }) });
    await expect(card).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Сторінку не вдалося завантажити.",
    );
    await expect(card).toContainText("Це не ваша помилка і не помилка притулку.");

    const retry = page.getByRole("button", { name: "Спробувати ще раз" });
    const showAll = page.getByRole("link", { name: "Показати всіх тварин" });
    await expectReachableByTab(page, { label: "retry button", locator: retry });
    await expectReachableByTab(page, { label: "show-all link", locator: showAll });

    // The failure is still requested, so retry re-asks the server and lands on the card again.
    await retry.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Сторінку не вдалося завантажити.",
    );

    await page.getByRole("link", { name: "Показати всіх тварин" }).click();
    await expect(page.locator(CARD).first()).toBeVisible();
    await expect(page.locator(ERROR_CARD)).toHaveCount(0);
  });
});

test.describe("/tvaryny no-match – relaxation counts are real numbers", () => {
  /**
   * `gallery.relaxationCounts` (E2) had no verified consumer through a
   * real browser render before this test - `NoMatch.tsx`'s own unit-level
   * coverage (`server-client.test.ts`) asserts the query directly, not
   * that the rendered suggestion and the number it promises agree.
   * `vyd=cat&rozmir=large` is zero-result city-wide in the seeded corpus
   * (cats are never bucketed "large") - self-verifying, not asserted
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
    const resultCount = page.getByText(/Знайдено \d+/).first();
    await expect(resultCount).toContainText(`Знайдено ${claimedCount} `);
  });
});
