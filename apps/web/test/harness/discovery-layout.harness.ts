/**
 * The deck's states, in a real browser: the not-a-judgement notice, the demo
 * banner, keyboard reachability of its controls, and the error state.
 *
 * Until 2026-10-20 this file was mostly geometry: the action row not
 * overlapping the card, the freshness block and shelter line contained by
 * the card with a margin floor, the photo's height and floor, touch-target
 * sizes, viewport overflow, the demo banner's clipping and the header's
 * height, focus-ring width and offset, and a `test.fail()` marker for the
 * deck not using a desktop's width. Those measured appearance and were
 * removed (Oleksii, 2026-10-20, verbatim: "UI-measuring tests: yes, keep
 * both V-B2 tests (the 48px shared controls and the focus indicator being
 * present). They’re accessibility guarantees, not looks. Drop the rest that
 * measure appearance."; CLAUDE.md, "Test logic, not looks"). The file keeps
 * its name so the pointers to it elsewhere still resolve.
 */

import { uk } from "@opika/i18n";
import { expect, type Page, test } from "@playwright/test";
import { expectReachableByTab, openRoute } from "./harness";
import { ANDROID_PHONE, DESKTOP, NARROW_PHONE, PHONE, SHORT_PHONE } from "./viewports";

const ROUTE = "/tvaryny/gortaty";
const CARD = "[data-testid='swipe-card']";

/**
 * TEST-NET-2 (198.51.100.0/24), `.28` - same reasoning as
 * `discovery-gesture.harness.ts`'s `.27`. `.21`-`.27` are already claimed.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.28" } });

/**
 * R2 (Phase R, `docs/build-plan.md`): the deck's own permanent home for
 * `docs/standing-constraints.md`'s "The swipe is filtering, not judging" -
 * moved here from its interim home on the detail page
 * (`animal-detail.harness.ts` no longer covers it). Real Ukrainian,
 * recovered verbatim, not redrafted. Visible from `ANDROID_PHONE` (360,
 * `docs/stack-decision.md`'s actual stated target) up; hidden at
 * `NARROW_PHONE` (320) specifically - see the notice's own comment in
 * `SwipeDeck.tsx` for the reason.
 */
test.describe("/tvaryny/gortaty not-a-judgement notice", () => {
  for (const viewport of [ANDROID_PHONE, SHORT_PHONE, PHONE, DESKTOP]) {
    test(`shows real Ukrainian at ${viewport.name}`, async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });

      const notice = page.getByTestId("not-a-judgement-notice");
      await expect(notice).toBeVisible();
      // Transcribed from the design's own recovered copy, not compared
      // against `uk.actions.notAJudgementNotice` itself - a self-comparing
      // assertion passes against any value the constant happens to hold.
      await expect(notice).toHaveText("«Не зараз» – це просто фільтр, а не оцінка тварини.");
    });
  }

  test(`is hidden at ${NARROW_PHONE.name} – the one width narrower than this product's stated audience`, async ({
    page,
  }) => {
    await openRoute(page, ROUTE, NARROW_PHONE, { readySelector: CARD });

    await expect(page.getByTestId("not-a-judgement-notice")).toBeHidden();
  });
});

/**
 * D-1/D-2 (Oleksii, Phase D decisions): `REGISTRY_HAS_NO_REAL_SHELTERS` is
 * true in the build this harness runs against - the same value production
 * runs - so the deck header shows the demo banner in place of the filters
 * phrase, real Ukrainian ("Демо"), landed 2026-09-06. The position count
 * stays and the progress bar degrades instead (D-1's degrade order - the
 * count alone already answers README.md:597-600's "otherwise invisible"
 * argument, the bar only duplicates it).
 */
test.describe("/tvaryny/gortaty demo banner", () => {
  for (const viewport of [NARROW_PHONE, ANDROID_PHONE, SHORT_PHONE, PHONE]) {
    test(`shows real demo copy, count present, bar hidden, at ${viewport.name}`, async ({
      page,
    }) => {
      // `?total=34`: without it (a bare bookmark/reload), `total` is `null` and
      // neither the position nor the bar renders at all, regardless of the demo
      // flag (`docs/design/README.md`'s "Position/progress total is carried, not
      // 'otherwise invisible'" deviation) — this test is specifically about the
      // row that includes them, so it enters the way `deckEntryHref` actually
      // does.
      await openRoute(page, `${ROUTE}?total=34`, viewport, { readySelector: CARD });

      // Transcribed from `uk.ts`, not compared against `uk.demo.deckLabel`
      // itself - a self-comparing assertion passes against any value the
      // constant happens to hold, including an empty string.
      await expect(page.getByTestId("deck-demo-banner")).toHaveText("Демо");

      await expect(
        page.getByTestId("deck-position"),
        `the position count is missing at ${viewport.name} – demo mode must not drop it, ` +
          `Oleksii's Phase D decision`,
      ).toBeVisible();

      await expect(
        page.getByTestId("deck-progress-bar"),
        `the progress bar is visible at ${viewport.name} alongside the demo banner – it should ` +
          `degrade first (D-1's degrade order), before the count`,
      ).toBeHidden();
    });
  }
});

/**
 * Keyboard operation: each of the deck's controls is in the real tab order.
 * Reachability only; how focus looks is not asserted (see `harness.ts`'s
 * `expectReachableByTab`).
 */
test.describe("/tvaryny/gortaty keyboard reachability", () => {
  test("the back-to-list button is reachable by Tab", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await expectReachableByTab(page, {
      label: "back-to-list button",
      locator: page.getByTestId("deck-back-to-list"),
    });
  });

  for (const [label, buttonLabel] of [
    ["not-now button", uk.actions.notNow],
    ["write button", uk.actions.write],
  ] as const) {
    test(`the ${label} is reachable by Tab`, async ({ page }) => {
      await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

      await expectReachableByTab(page, {
        label,
        locator: page.getByRole("button", { name: buttonLabel }),
      });
    });
  }
});

/**
 * The deck's error state. Reached by aborting the one request the deck makes
 * from the browser (`feed.list` over `/api/rpc`, `use-feed-deck.ts`). A
 * refused fetch is a `TypeError` at the fetch layer, which that hook maps to
 * the `offline` reason - the copy differs per reason, but the retry button is
 * the same element in all three, so this covers the control rather than one
 * message.
 *
 * `readySelector: RETRY` is load-bearing, not boilerplate: the error state is
 * client-rendered after a failed fetch, so a disappeared retry button fails
 * as a timeout naming the selector.
 */
test.describe("/tvaryny/gortaty error state", () => {
  const RETRY = "[data-testid='deck-error-retry']";

  async function openFailedDeck(page: Page): Promise<void> {
    await page.route("**/api/rpc**", (route) => route.abort());
    await openRoute(page, ROUTE, PHONE, { readySelector: RETRY });
  }

  test("the retry button is reachable by Tab", async ({ page }) => {
    await openFailedDeck(page);

    await expectReachableByTab(page, {
      label: "deck retry button",
      locator: page.locator(RETRY),
    });
  });
});
