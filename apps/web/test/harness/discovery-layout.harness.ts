/**
 * Layout assertions for the deck.
 *
 * Each test here corresponds to a defect that shipped through a green CI and a
 * "renders correctly" sign-off, because the only check applied was that the
 * text appeared somewhere in the HTML. Text in the HTML is exactly what all
 * three of these had.
 *
 * E5: migrated from `/discovery` (retired, now a redirect) to
 * `/tvaryny/gortaty` — the deck's real route on real `feed.list` data. Every
 * assertion here is pure geometry, none of it about specific card content, so
 * the migration is the route, a rate-limit IP identity, and nothing else.
 */

import { uk } from "@opika/i18n";
import { expect, type Page, test } from "@playwright/test";
import {
  expectContainedBy,
  expectFocusVisibleOutline,
  expectMinimumBottomMargin,
  expectNoOverlap,
  expectNoViewportOverflow,
  openRoute,
  rectOf,
} from "./harness";
import {
  ANDROID_PHONE,
  DESKTOP,
  NARROW_PHONE,
  PHONE,
  SHORT_PHONE,
  type Viewport,
} from "./viewports";

const ROUTE = "/tvaryny/gortaty";
const CARD = "[data-testid='swipe-card']";

/**
 * TEST-NET-2 (198.51.100.0/24), `.28` — same reasoning as
 * `discovery-gesture.harness.ts`'s `.27`. `.21`-`.27` are already claimed.
 */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.28" } });

/**
 * Minimum bottom margin the shelter line must keep above the card's edge,
 * per viewport. Not the measured value (that would just re-encode "whatever
 * it happens to be today" as a second copy) and not zero (that's what
 * `expectContainedBy` already covers) — a real floor with slack where slack
 * still exists (see viewports.ts).
 *
 * V2 repoint, in two stages. First (name growing 26px -> display-m 34px):
 * PHONE 46.5px -> 16.0px, DESKTOP unchanged at 16.0px, SHORT_PHONE 16.0px
 * -> 0.0px — the photo was already pinned at its 200px `min-h-50` floor at
 * that size, so the whole increase landed on the margin with nowhere else
 * to go. Second (the deck text block's own spacing corrected to
 * `Opika Registry System.dc.html`'s actual values — the sentence at 15/22
 * not body-l's 17/26, freshness block padding 16 not 12, min-height 88 not
 * 108, text block gap 12/padding `0 8` not the old spacing tokens):
 * SHORT_PHONE's margin recovered to a measured 12.0px, PHONE and DESKTOP
 * unaffected (their photos had room to give and already absorbed stage
 * one). Floors below carry a few px of slack under each measured value,
 * matching the margin already recorded for PHONE.
 */
const MIN_SHELTER_MARGIN_PX = new Map<Viewport, number>([
  [PHONE, 12],
  [SHORT_PHONE, 8],
  [DESKTOP, 4],
  // Both added with DECK-1, which made the photo genuinely elastic. Every
  // 640-tall viewport now measures a 12px margin — the card's own `p-3` bottom
  // padding, i.e. the text ends exactly where the card's padding says it
  // should — so 8 keeps the same few px of slack the entries above carry.
  // Before DECK-1 these measured 0 (360) and -22 (320).
  [ANDROID_PHONE, 8],
  [NARROW_PHONE, 8],
]);

/**
 * `SwipeCard`'s `min-h-38`. Below this the photo stops being a photograph of
 * an animal and becomes a strip.
 *
 * Asserted rather than assumed because it is the *other* half of DECK-1's
 * invariant. Making the photo absorb all the slack is only safe if running out
 * of slack is loud: without this, a future layout change that needs more room
 * than the photo can give would silently return to clipping the shelter line,
 * which is the exact defect DECK-1 fixed. Text is never clipped; the photo
 * absorbs; and if the photo cannot absorb enough, *this* fails.
 */
const MIN_PHOTO_HEIGHT_PX = 152;

/**
 * docs/design/README.md:200 — 48 minimum touch target anywhere, stated there
 * as a civic-trust metric rather than the WCAG floor.
 *
 * Both of the deck's own buttons were `min-h-11` (44) until Phase D raised
 * them. Measured rather than trusted to the class list for two reasons: a
 * `min-h-*` with no assertion behind it is documentation and decays at
 * exactly the rate the layout changes (`docs/standing-constraints.md`), and
 * `min-height` is not the rendered height — a flex parent, a line box or a
 * later padding change can leave the real target short of the class's number
 * without the class ever changing.
 */
const MIN_TOUCH_TARGET_PX = 48;

/**
 * Keyed by the viewport object, not its `name`, and loud when absent.
 * `MIN_SHELTER_MARGIN_PX[v.name] ?? 0` would turn a renamed viewport — or a
 * newly added one — into a silently vacuous assertion: a 0 floor passes for
 * anything `expectContainedBy` already passes, so the test would still be
 * green while asserting nothing.
 */
function minShelterMarginFor(viewport: Viewport): number {
  const px = MIN_SHELTER_MARGIN_PX.get(viewport);
  if (px === undefined) {
    throw new Error(
      `no shelter-line margin floor recorded for ${viewport.name}. Measure the margin at ` +
        `that size and add an entry to MIN_SHELTER_MARGIN_PX — defaulting to 0 would leave ` +
        `this assertion passing without checking anything.`,
    );
  }
  return px;
}

/**
 * `SHORT_PHONE` added in Phase D. It has had a `MIN_SHELTER_MARGIN_PX` entry
 * since V2 and **nothing ever exercised it** — which is precisely how its
 * margin reached exactly 8.0px, its own floor, with zero remaining headroom,
 * unnoticed. A documented limit with no test exercising it is not a limit;
 * see `docs/standing-constraints.md`.
 *
 * `ANDROID_PHONE` (360) and `NARROW_PHONE` (320) joined the loop with DECK-1,
 * which is what made them assertable: before it, 360 measured a 0.0px margin
 * and 320 measured -22px, so including them would have turned the suite red
 * for a pre-existing clip rather than guarding against a new one. Now every
 * one of them lands on 12px and the photo absorbs the difference.
 */
for (const viewport of [
  NARROW_PHONE,
  ANDROID_PHONE,
  SHORT_PHONE,
  PHONE,
  DESKTOP,
] satisfies Viewport[]) {
  test.describe(`/tvaryny/gortaty at ${viewport.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });
    });

    // Lost fix 1.
    test("the action row sits below the card, not on top of it", async ({ page }) => {
      await expectNoOverlap(
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
        { label: "action row", locator: page.getByTestId("action-row") },
      );
    });

    // Lost fix 2, the property that matters at any size. Text sliding under
    // the card's `overflow: hidden` edge is invisible in markup — the sentence
    // is present in the DOM and simply not painted.
    test("the freshness block is fully visible inside the card", async ({ page }) => {
      await expectContainedBy(
        { label: "freshness block", locator: page.getByTestId("freshness-block") },
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
      );
    });

    // The shelter's own words are the last thing in the card and therefore the
    // first thing to be clipped by anything above them growing.
    test("the shelter line is fully visible inside the card", async ({ page }) => {
      await expectContainedBy(
        { label: "shelter line", locator: page.getByTestId("shelter-line") },
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
      );
    });

    // Task E: the containment check above is a correctness bar, not an early
    // warning — it only fails once spill turns positive. This is the
    // separate assertion that the margin measured with real fonts loaded
    // (see MIN_SHELTER_MARGIN_PX) hasn't quietly eroded.
    test("the shelter line keeps a real margin, not a vanishing one", async ({ page }) => {
      await expectMinimumBottomMargin(
        { label: "shelter line", locator: page.getByTestId("shelter-line") },
        { label: "swipe card", locator: page.getByTestId("swipe-card") },
        minShelterMarginFor(viewport),
      );
    });

    /**
     * The other half of DECK-1's invariant, and the reason making the photo
     * elastic is safe. The margin assertion above says text is never clipped;
     * this says the photo is what pays for that, and only down to a stated
     * limit. Running out of room becomes a named failure instead of the
     * invisible clip it used to be — the photo was pinned at exactly its old
     * 200px floor on every 640-tall viewport while the shelter line spilled
     * out of the card, and nothing anywhere went red.
     */
    test("the photo absorbs the slack, but never below its floor", async ({ page }) => {
      const photo = await rectOf(page.getByTestId("card-photo"), "card photo");

      expect(
        photo.height,
        `the photo is ${photo.height.toFixed(1)}px tall at ${viewport.name}; the floor is ` +
          `${MIN_PHOTO_HEIGHT_PX}px (SwipeCard's own min-h-38). The photo absorbs whatever the ` +
          `text below it needs — so reaching this floor means the text needs more room than ` +
          `the card has, and the next thing to give would be the shelter line spilling past ` +
          `the card's overflow-hidden edge, unpainted and unreported. Recover height or state ` +
          `that this viewport is unsupported; do not lower the floor to make this pass.`,
      ).toBeGreaterThanOrEqual(MIN_PHOTO_HEIGHT_PX);
    });

    /**
     * In the loop, not once at one size: this is the button DECK-2 raised,
     * and the narrow viewports are exactly where a header row runs out of
     * width and a control gets squeezed. The back button is also the deck's
     * only exit for a touch user.
     */
    test(`the back-to-list button is at least ${MIN_TOUCH_TARGET_PX}px tall`, async ({ page }) => {
      const button = await rectOf(page.getByTestId("deck-back-to-list"), "back-to-list button");

      expect(
        button.height,
        `the back-to-list button is ${button.height.toFixed(1)}px tall at ${viewport.name}; ` +
          `docs/design/README.md:200 sets ${MIN_TOUCH_TARGET_PX} as the minimum touch target ` +
          `anywhere. It was 44 before Phase D, and the 4px that closed the gap comes out of ` +
          `the photo (see SwipeCard's own note), so a regression here and a regression in the ` +
          `photo floor above are the same budget seen from two ends.`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    });

    // Lost fix 3.
    test("the page does not overflow the viewport in either axis", async ({ page }) => {
      await expectNoViewportOverflow(page, viewport);
    });
  });
}

/**
 * Lost fix 2, the other half: which of the design doc's two photo dimensions
 * won.
 *
 * README:191 gives the photo AREA height as 396. README:307's "photo 4:5"
 * describes the source photography — :39 and :353 both say so, and say it is
 * cropped `object-fit: cover`. So 4:5 is the asset's shape and 396 is the
 * slot's; cover is what reconciles them. 4:5 applied to the container makes it
 * 417.5px on the 334px content box, 21.5px taller than specified.
 *
 * Phone only, deliberately. 396 is a statement about the viewport the design
 * was drawn at. At 1280x800 the card is shorter and the photo is *supposed* to
 * shrink below 396 — it is the flex item that gives way so the shelter's words
 * never do. Asserting 396 everywhere would forbid that.
 */
test.describe(`/tvaryny/gortaty photo sizing at ${PHONE.name}`, () => {
  /**
   * V2 repoint: 396 -> 388 -> back to 396. The first repoint (name growing
   * to display-m, 34px up from 26px) was real, but the text block below it
   * was oversized at the time — 17/26 shelter sentence instead of the B7
   * frame's own 15/22, and padding/gap values that didn't match
   * `Opika Registry System.dc.html` (12/8 padding, 12 gap, not the pre-V2
   * spacing tokens the migration had left in place). Correcting those gave
   * the photo its room back; 396 is what the card's real content actually
   * yields, not a coincidence that it matches the pre-V2 number. This test
   * exists to catch an *accidental* shift (something above the photo
   * growing further, or the card getting shorter), not to keep any one
   * number pinned regardless of why it changed.
   *
   * R2 repoint: 396 -> 386 (Phase R, `docs/build-plan.md`). Real, deliberate
   * cause, not an accident: `SwipeDeck.tsx` gained its own permanent
   * not-a-judgement notice under the action row (moved from its interim
   * home on the detail page), which this exact frame is wide enough to
   * show (`min-[360px]:block` — see the notice's own comment for why
   * `NARROW_PHONE` at 320 is the one width it's hidden at instead). Two
   * spacing reclaims already absorbed part of the new line's cost before
   * this number was allowed to move at all — the action row's own
   * card-to-button margin (`mt-group` -> `mt-row`, -8px) and the notice's
   * own margin above it (`mt-row` -> `mt-label`, -4px) — 386 is what's
   * left once both of those and the notice's own line-height are actually
   * accounted for, measured with the real Ukrainian sentence rendered, not
   * assumed.
   */
  test("the photo area is the height the feed screen specifies", async ({ page }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    const photo = await rectOf(page.getByTestId("card-photo"), "photo area");

    expect(
      Math.round(photo.height),
      `photo area is ${photo.height}px; expected 386 (V2's name/meta/freshness ` +
        `block, plus R2's not-a-judgement notice, at ${PHONE.name}, ` +
        `docs/design/README.md's "The deck").\n` +
        `        Anything else means something above the photo grew, or the card\n` +
        `        got shorter and the photo shrank to protect the text — check the\n` +
        `        card height before assuming this is about the ratio.`,
    ).toBe(386);
  });

  /**
   * The photo must be able to give way, and this is a separate lock from the
   * one above rather than a second opinion on it: pinning the photo at a fixed
   * height with `flex-shrink: 0` passes the height assertion and reintroduces
   * the clipping on any shorter card. Neither assertion implies the other.
   */
  test("the photo yields to the text when the card is short", async ({ page }) => {
    await openRoute(page, ROUTE, SHORT_PHONE, { readySelector: CARD });

    const photo = await rectOf(page.getByTestId("card-photo"), "photo area");
    expect(
      photo.height,
      // 396 is `max-h-99`, the photo's own ceiling — unchanged by R2's
      // notice, which only ever affects the *canonical* PHONE frame's
      // measured height (386, see the test above), not this component's
      // hard cap. A 640px-tall screen should shrink well below either.
      "on a 640px-tall screen the photo should have shrunk below its 396px ceiling (max-h-99)",
    ).toBeLessThan(396);

    await expectContainedBy(
      { label: "shelter line", locator: page.getByTestId("shelter-line") },
      { label: "swipe card", locator: page.getByTestId("swipe-card") },
    );
    await expectMinimumBottomMargin(
      { label: "shelter line", locator: page.getByTestId("shelter-line") },
      { label: "swipe card", locator: page.getByTestId("swipe-card") },
      minShelterMarginFor(SHORT_PHONE),
    );
  });
});

/**
 * R2 (Phase R, `docs/build-plan.md`): the deck's own permanent home for
 * `docs/standing-constraints.md`'s "The swipe is filtering, not judging" —
 * moved here from its interim home on the detail page
 * (`animal-detail.harness.ts` no longer covers it). Real Ukrainian,
 * recovered verbatim, not redrafted. Visible from `ANDROID_PHONE` (360,
 * `docs/stack-decision.md`'s actual stated target) up; hidden at
 * `NARROW_PHONE` (320) specifically — see the notice's own comment in
 * `SwipeDeck.tsx` for the measured reason (a real shelter-line clip at
 * 320, not a style preference).
 */
test.describe("/tvaryny/gortaty not-a-judgement notice", () => {
  for (const viewport of [ANDROID_PHONE, SHORT_PHONE, PHONE, DESKTOP]) {
    test(`shows below the action row, real Ukrainian, at ${viewport.name}`, async ({ page }) => {
      await openRoute(page, ROUTE, viewport, { readySelector: CARD });

      const notice = page.getByTestId("not-a-judgement-notice");
      await expect(notice).toBeVisible();
      // Transcribed from the design's own recovered copy, not compared
      // against `uk.actions.notAJudgementNotice` itself — a self-comparing
      // assertion passes against any value the constant happens to hold.
      await expect(notice).toHaveText("«Не зараз» — це просто фільтр, а не оцінка тварини.");

      const actionRow = await rectOf(page.getByTestId("action-row"), "action row");
      const noticeRect = await rectOf(notice, "not-a-judgement-notice");
      expect(
        noticeRect.y,
        `at ${viewport.name}, the not-a-judgement notice should sit below the action row, ` +
          `not above or overlapping it`,
      ).toBeGreaterThanOrEqual(actionRow.y + actionRow.height - 1);
    });
  }

  test(`is hidden at ${NARROW_PHONE.name} — the one width narrower than this product's stated audience`, async ({
    page,
  }) => {
    await openRoute(page, ROUTE, NARROW_PHONE, { readySelector: CARD });

    await expect(page.getByTestId("not-a-judgement-notice")).toBeHidden();

    // Hidden, not silently broken: the shelter line this hide exists to
    // protect must actually be intact at this width, not just "the notice
    // isn't visible for some unrelated reason."
    await expectContainedBy(
      { label: "shelter line", locator: page.getByTestId("shelter-line") },
      { label: "swipe card", locator: page.getByTestId("swipe-card") },
    );
    await expectMinimumBottomMargin(
      { label: "shelter line", locator: page.getByTestId("shelter-line") },
      { label: "swipe card", locator: page.getByTestId("swipe-card") },
      minShelterMarginFor(NARROW_PHONE),
    );
  });
});

/**
 * The recorded desktop gap.
 *
 * TODO(responsive): /tvaryny/gortaty is a 390px phone column centred in whatever
 * width it is given. This assertion states the requirement — the deck should
 * use the space a laptop has — and is expected to fail until the responsive
 * pass lands. `test.fail()` keeps it running rather than skipped, so when the
 * layout does become responsive Playwright reports an *unexpected pass* and
 * whoever fixed it is told to delete this marker. A `skip` would go quiet
 * instead, which is how a known gap turns into a forgotten one.
 */
test.describe("/tvaryny/gortaty responsive gap", () => {
  test.fail();

  test(`the deck uses the available width at ${DESKTOP.name}`, async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    const card = await rectOf(page.getByTestId("swipe-card"), "swipe card");

    expect(
      card.width,
      `the card is ${card.width}px wide in a ${DESKTOP.width}px viewport — the layout is ` +
        `phone-only and does not adapt`,
    ).toBeGreaterThan(500);
  });
});

/**
 * D-1/D-2 (Oleksii, Phase D decisions): `REGISTRY_HAS_NO_REAL_SHELTERS` is
 * true in the build this harness runs against — the same value production
 * runs — so the deck header shows the demo banner in place of the filters
 * phrase, real Ukrainian ("Демо"), landed 2026-09-06. Asserts the two
 * invariants D-1/D-2 make: "compact" (the text actually fits — `truncate`
 * silently eating it would defeat the point of showing it at all) and
 * "zero new height" (the header stays at its `min-h-12` floor). The
 * position count stays and the progress bar degrades instead (D-1's
 * degrade order — the count alone already answers README.md:597-600's
 * "otherwise invisible" argument, the bar only duplicates it).
 */
test.describe("/tvaryny/gortaty demo banner", () => {
  for (const viewport of [NARROW_PHONE, ANDROID_PHONE, SHORT_PHONE, PHONE]) {
    test(`shows real demo copy, fits without clipping, count present, bar hidden, zero extra height, at ${viewport.name}`, async ({
      page,
    }) => {
      // `?total=34`: without it (a bare bookmark/reload), `total` is `null` and
      // neither the position nor the bar renders at all, regardless of the demo
      // flag (`docs/design/README.md`'s "Position/progress total is carried, not
      // 'otherwise invisible'" deviation) — this test is specifically about the
      // row that includes them, so it enters the way `deckEntryHref` actually
      // does.
      await openRoute(page, `${ROUTE}?total=34`, viewport, { readySelector: CARD });

      const banner = page.getByTestId("deck-demo-banner");
      // Transcribed from `uk.ts`, not compared against `uk.demo.deckLabel`
      // itself — a self-comparing assertion passes against any value the
      // constant happens to hold, including an empty string.
      await expect(banner).toHaveText("Демо");

      const { scrollWidth, clientWidth } = await banner.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(
        scrollWidth,
        `the demo banner is clipped at ${viewport.name}: needs ${scrollWidth}px, has ` +
          `${clientWidth}px. The whole point of D-2 is that a real visitor can read this.`,
      ).toBeLessThanOrEqual(clientWidth);

      const header = await rectOf(page.locator("header"), "deck header");
      expect(
        header.height,
        `the deck header is ${header.height}px tall at ${viewport.name} — D-2's own row says ` +
          `"zero new height", i.e. the header's min-h-12 (48px) floor`,
      ).toBeLessThanOrEqual(48);

      await expect(
        page.getByTestId("deck-position"),
        `the position count is missing at ${viewport.name} — demo mode must not drop it, ` +
          `Oleksii's Phase D decision`,
      ).toBeVisible();

      await expect(
        page.getByTestId("deck-progress-bar"),
        `the progress bar is visible at ${viewport.name} alongside the demo banner — it should ` +
          `degrade first (D-1's degrade order), before the count`,
      ).toBeHidden();
    });
  }
});

/**
 * docs/standing-constraints.md: "An interactive element ships with its
 * focus-visible styling and a test."
 */
test.describe("/tvaryny/gortaty keyboard focus", () => {
  test("the back-to-list button shows a real focus-visible outline", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await expectFocusVisibleOutline(page, {
      label: "back-to-list button",
      locator: page.getByTestId("deck-back-to-list"),
    });
  });

  /**
   * R2's own rewrite of `ActionButton`'s variant union is exactly the kind
   * of change `docs/standing-constraints.md`'s rule exists for — caught on
   * review that neither remaining variant («Не зараз», outlined; «Написати»,
   * primary) had ever carried focus-visible styling or a test, unlike
   * every other focusable control in this app.
   */
  for (const [label, buttonLabel] of [
    ["not-now button", uk.actions.notNow],
    ["write button", uk.actions.write],
  ] as const) {
    test(`the ${label} shows a real focus-visible outline`, async ({ page }) => {
      await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

      await expectFocusVisibleOutline(page, {
        label,
        locator: page.getByRole("button", { name: buttonLabel }),
      });
    });
  }
});

/**
 * The deck's error state, which had no harness coverage of any kind before
 * Phase D — so the retry button's 44px target and its complete absence of
 * focus styling both survived every gate until a manual sweep looked.
 *
 * Reached by aborting the one request the deck makes from the browser
 * (`feed.list` over `/api/rpc`, `use-feed-deck.ts`). A refused fetch is a
 * `TypeError` at the fetch layer, which that hook maps to the `offline`
 * reason — the copy differs per reason, but the retry button is the same
 * element in all three, so this covers the control rather than one message.
 *
 * `readySelector: RETRY` is load-bearing, not boilerplate: the error state is
 * client-rendered after a failed fetch, so measuring without waiting for the
 * button would race hydration. It also makes a disappeared retry button fail
 * as a timeout naming the selector, rather than as a `rectOf` null-box further
 * down with less to say.
 */
test.describe("/tvaryny/gortaty error state", () => {
  const RETRY = "[data-testid='deck-error-retry']";

  async function openFailedDeck(page: Page): Promise<void> {
    await page.route("**/api/rpc**", (route) => route.abort());
    await openRoute(page, ROUTE, PHONE, { readySelector: RETRY });
  }

  test(`the retry button is at least ${MIN_TOUCH_TARGET_PX}px tall`, async ({ page }) => {
    await openFailedDeck(page);
    const button = await rectOf(page.locator(RETRY), "deck retry button");

    expect(
      button.height,
      `the deck's retry button is ${button.height.toFixed(1)}px tall; ` +
        `docs/design/README.md:200 sets ${MIN_TOUCH_TARGET_PX} as the minimum touch target ` +
        `anywhere. It was 44 before Phase D.`,
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  test("the retry button shows a real focus-visible outline", async ({ page }) => {
    await openFailedDeck(page);

    await expectFocusVisibleOutline(page, {
      label: "deck retry button",
      locator: page.locator(RETRY),
    });
  });
});
