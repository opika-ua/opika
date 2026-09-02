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

/**
 * TEST-NET-2 (198.51.100.0/24), `.26` — the next unused address in this
 * block; `.21`-`.25` are already claimed by the other `/tvaryny` harness
 * files (`gallery-arrow-nav`, `gallery-filters`, `gallery-layout`,
 * `gallery-pagination`, `freshness-pip-contrast`). Without a distinct
 * identity this file's five tests would share `proxy.ts`'s 100/min-per-IP
 * budget with whichever of those runs concurrently — flaky, not obviously
 * this file's fault when it fails.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.26" } });

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

    /**
     * `Opika Registry Frames.dc.html`'s E1 frame's own literal text
     * (eyebrow, retry label) — not `uk.galleryError`'s own constant,
     * `docs/standing-constraints.md`: "A test may not compare output
     * against the same constant the code renders." The heading/body are
     * NOT asserted here on purpose — they're this phase's own adapted
     * copy (`docs/design/README.md`'s "Deviation, E4" note), not the
     * mock's literal text, so pinning them against the mock would be
     * asserting a value the code correctly does NOT render.
     */
    await expect(page.locator(ERROR_CARD)).toContainText("НЕ ЗАВАНТАЖИЛОСЯ");
    await expect(page.locator(RETRY)).toHaveText("Спробувати ще раз");
  });

  /**
   * E5's real escape hatch (see `error.tsx`'s own top comment for why a
   * filter rail here would not be one): a plain link to the bare,
   * unfiltered gallery. Asserted end to end — following it actually
   * lands on a working page with real cards and no leftover filter, not
   * just that the href string looks right.
   */
  test("the 'show all animals' link recovers to a real, unfiltered gallery", async ({ page }) => {
    await openRoute(page, `${ROUTE}?vyd=dog&stor=${MAX_GALLERY_PAGE + 1}`, DESKTOP, {
      readySelector: ERROR_CARD,
    });

    await page.getByTestId("gallery-error-show-all").click();

    await page.waitForURL((url) => url.pathname === "/tvaryny" && url.search === "");
    await expect(page.locator(CARD).first()).toBeVisible();
    await expect(page.locator(ERROR_CARD)).toHaveCount(0);
  });
});

test.describe("/tvaryny error state", () => {
  /**
   * What this test actually proves, and what it doesn't — read before
   * trusting the title. Two things were tried and abandoned first, both
   * worth recording so nobody re-attempts them expecting a different
   * result from the same Next.js version:
   *
   * 1. Forcing a *transient* failure by aborting the client-side RSC
   *    fetch behind a filter-chip click, then letting a second attempt
   *    through, expecting error.tsx to catch the first and retry to
   *    recover into the second. It didn't — Next's client router does
   *    not reliably surface a failed client-side navigation fetch to the
   *    nearest error boundary the way a genuine server-side throw does
   *    (`MAX_GALLERY_PAGE`, used below, triggers error.tsx reliably every
   *    time; an aborted client fetch did not).
   * 2. Asserting that clicking retry issues a fresh network request, as
   *    independent proof `reset()` isn't a no-op. It doesn't, observably
   *    — logging every request for 2s after the click (against this
   *    page, reached via a full top-level navigation, not a client
   *    transition) showed none. Whether that's a cache hit, a batched
   *    request this logging missed, or something else about how `reset()`
   *    behaves when there was never a prior successful client-side render
   *    to diff against isn't settled here — it's genuinely not known, not
   *    swept under a passing assertion.
   *
   * What *is* proven, reliably: `error.tsx.test.tsx` (component-level)
   * asserts the button calls the `reset` prop, directly, via a mock — the
   * one thing that would catch `onClick={reset}` being deleted. This test
   * proves the other half: after clicking it, the URL — and therefore
   * whatever filter was in it — hasn't been dropped or navigated away
   * from, and the error boundary hasn't fallen through to something else.
   * Together they're the honest scope of "retry preserves filters" this
   * architecture can verify: the button calls the right function, and
   * calling it doesn't lose the state. Whether a *successful* retry
   * re-renders the previously-filtered grid is not independently proven
   * by either test — it follows from `page.tsx` always deriving its
   * rendered content from `searchParams` alone (already covered
   * extensively by the filter-URL tests elsewhere in this suite), not
   * from anything specific to the retry path.
   */
  test("retry calls reset() without dropping the filter already in the URL", async ({ page }) => {
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
