/**
 * Phase T — the site-wide header, and the two measured type/size findings
 * that shipped alongside it.
 *
 * Everything here is geometry or reachability in a real browser, because
 * that is what the underlying findings were. The design critique measured
 * every one of them off the live DOM rather than reading markup, and a class
 * string in a component test cannot fail for the reason any of them failed:
 * `min-h-14` reads perfectly fine and is 56px.
 *
 * - **A2** — the header measured 56px at mobile and 68px at desktop against
 *   `docs/design/README.md:200`'s own 64/88, which that line calls a
 *   civic-trust metric rather than the WCAG floor.
 * - **A1** — the card name rendered at the compact 22/26 on *vertical* cards
 *   at desktop and wide, because `tablet:text-[22px]` was never un-set. Two
 *   of four documented breakpoints, and the majority of desktop visitors.
 * - **E5/E1/B2** — «Про проєкт» was reachable from one link in the whole
 *   app, and the detail page (the URL people paste into Telegram) carried no
 *   wordmark at all.
 * - **C1** — no name in the seed corpus exceeded six characters, so the
 *   design's own "names truncate to one line with ellipsis" had never been
 *   exercised anywhere near its limit.
 */

import { expect, test } from "@playwright/test";
import {
  expectFocusVisibleOutline,
  expectNoHorizontalOverflow,
  openRoute,
  rectOf,
} from "./harness";
import {
  DESKTOP,
  DETAIL_PHONE,
  GALLERY_PHONE_360,
  GALLERY_TABLET,
  GALLERY_WIDE,
  PHONE,
  type Viewport,
} from "./viewports";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.31" } });

const GALLERY = "/tvaryny";
const DECK = "/tvaryny/gortaty";
const ABOUT = "/pro";
const FOR_SHELTERS = "/prytulkam";

const HEADER = "[data-testid='site-header']";
const WORDMARK = "[data-testid='site-wordmark']";
const NAV_ABOUT = "[data-testid='nav-about']";
const NAV_SHELTERS = "[data-testid='nav-for-shelters']";
const CARD = "[data-testid='animal-card']";
const CARD_NAME = "[data-testid='card-name']";

/** docs/design/README.md:337 — "min-height 88 desktop / 64 mobile". */
const HEADER_MIN_HEIGHT_MOBILE_PX = 64;
const HEADER_MIN_HEIGHT_DESKTOP_PX = 88;
/** docs/design/README.md:200 — 48 minimum touch target anywhere. */
const MIN_TOUCH_TARGET_PX = 48;

let cachedAnimalHref: string | null = null;
async function firstAnimalHref(page: import("@playwright/test").Page): Promise<string> {
  if (cachedAnimalHref !== null) return cachedAnimalHref;
  await openRoute(page, GALLERY, PHONE, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  expect(href, "no animal card link on the gallery — cannot reach a detail page").toBeTruthy();
  cachedAnimalHref = href as string;
  return cachedAnimalHref;
}

test.describe("the header is on every user-facing surface except the deck", () => {
  for (const [name, route] of [
    ["gallery", GALLERY],
    ["about", ABOUT],
    ["for shelters", FOR_SHELTERS],
  ] as const) {
    test(`${name} carries the wordmark and both site links`, async ({ page }) => {
      await openRoute(page, route, PHONE, { readySelector: HEADER });

      await expect(page.locator(WORDMARK)).toHaveText("Opika");
      await expect(page.locator(NAV_ABOUT)).toHaveAttribute("href", ABOUT);
      await expect(page.locator(NAV_SHELTERS)).toHaveAttribute("href", FOR_SHELTERS);
    });
  }

  test("the detail page carries it too — this is the URL people paste into Telegram", async ({
    page,
  }) => {
    await openRoute(page, await firstAnimalHref(page), DETAIL_PHONE, { readySelector: HEADER });

    await expect(page.locator(WORDMARK)).toHaveText("Opika");
    await expect(page.locator(NAV_ABOUT)).toHaveAttribute("href", ABOUT);
    await expect(page.locator(NAV_SHELTERS)).toHaveAttribute("href", FOR_SHELTERS);
  });

  test("the deck does NOT carry it — docs/design/README.md:589, never two navigations at once", async ({
    page,
  }) => {
    await openRoute(page, DECK, PHONE, {
      readySelector: "[data-testid='back-to-deck-list'], header",
    });

    expect(
      await page.locator(HEADER).count(),
      "the deck's header replaces the gallery header by design — a site header here would be " +
        "the second navigation the design explicitly rules out, not a fix",
    ).toBe(0);
  });
});

test.describe("A2 — header height meets the design's own touch-target standard", () => {
  const CASES: ReadonlyArray<{ viewport: Viewport; min: number }> = [
    { viewport: PHONE, min: HEADER_MIN_HEIGHT_MOBILE_PX },
    { viewport: GALLERY_PHONE_360, min: HEADER_MIN_HEIGHT_MOBILE_PX },
    { viewport: GALLERY_TABLET, min: HEADER_MIN_HEIGHT_MOBILE_PX },
    { viewport: DESKTOP, min: HEADER_MIN_HEIGHT_DESKTOP_PX },
    { viewport: GALLERY_WIDE, min: HEADER_MIN_HEIGHT_DESKTOP_PX },
  ];

  for (const { viewport, min } of CASES) {
    test(`is at least ${min}px at ${viewport.name}`, async ({ page }) => {
      await openRoute(page, GALLERY, viewport, { readySelector: HEADER });
      const rect = await rectOf(page.locator(HEADER), "site header");

      expect(
        rect.height,
        `header measures ${rect.height.toFixed(1)}px at ${viewport.width}px wide; the design ` +
          `specifies at least ${min}px (README.md:200/:337, stated as a civic-trust metric, ` +
          `not the WCAG floor). It measured 56/68 before Phase T.`,
      ).toBeGreaterThanOrEqual(min);
    });
  }

  test("both nav links meet the 48px minimum touch target", async ({ page }) => {
    await openRoute(page, GALLERY, PHONE, { readySelector: HEADER });

    for (const selector of [NAV_ABOUT, NAV_SHELTERS]) {
      const rect = await rectOf(page.locator(selector), selector);
      expect(rect.height, `${selector} is ${rect.height.toFixed(1)}px tall`).toBeGreaterThanOrEqual(
        MIN_TOUCH_TARGET_PX,
      );
    }
  });
});

test.describe("the header does not push any page sideways", () => {
  /**
   * The reason `SiteHeader` wraps below `tablet:`. At 360 the detail page's
   * row is wordmark + «← До списку» + two nav links, which is wider than the
   * 328px content column — this is the assertion that would have caught it.
   */
  for (const [name, viewport] of [
    ["gallery at 360", GALLERY_PHONE_360],
    ["gallery at 390", PHONE],
    ["gallery at tablet", GALLERY_TABLET],
  ] as const) {
    test(`${name} has no horizontal overflow`, async ({ page }) => {
      await openRoute(page, GALLERY, viewport, { readySelector: HEADER });
      await expectNoHorizontalOverflow(page, viewport);
    });
  }

  test("the detail page at 360 has no horizontal overflow, header included", async ({ page }) => {
    await openRoute(page, await firstAnimalHref(page), GALLERY_PHONE_360, {
      readySelector: HEADER,
    });
    await expectNoHorizontalOverflow(page, GALLERY_PHONE_360);
  });
});

test.describe("A1 — the card name is display-s on every vertical card", () => {
  /**
   * The compact 22/26 step belongs to the 600-1023 *horizontal* card and
   * nothing else. Asserting the real computed `font-size` rather than a class
   * is the whole point: `tablet:text-[22px]` with no `desktop:` reset reads
   * entirely correct in the markup.
   */
  const CASES: ReadonlyArray<{ viewport: Viewport; expected: number; layout: string }> = [
    { viewport: PHONE, expected: 24, layout: "1 column, vertical card" },
    { viewport: GALLERY_TABLET, expected: 22, layout: "2 columns, horizontal card" },
    { viewport: DESKTOP, expected: 24, layout: "3 columns, vertical card" },
    { viewport: GALLERY_WIDE, expected: 24, layout: "4 columns, vertical card" },
  ];

  for (const { viewport, expected, layout } of CASES) {
    test(`is ${expected}px at ${viewport.name} (${layout})`, async ({ page }) => {
      await openRoute(page, GALLERY, viewport, { readySelector: CARD });

      const fontSize = await page
        .locator(CARD_NAME)
        .first()
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));

      expect(
        fontSize,
        `card name renders at ${fontSize}px at ${viewport.width}px wide; the design's Scale ` +
          `table gives ${expected}px for a ${layout}. The compact 22/26 step is specified only ` +
          `for the 600-1023 horizontal card.`,
      ).toBe(expected);
    });
  }
});

test.describe("C1 — a long name truncates rather than escaping its card", () => {
  /**
   * The seed corpus now carries a 30-character animal name and a
   * 44-character shelter name (`packages/db/src/seed.ts`), because every
   * other name in it was six characters or fewer and the `truncate` safety
   * net had never been exercised. Which page a given animal lands on depends
   * on freshness ordering, so this asserts the invariant across whatever
   * cards are on screen rather than hunting one name — the invariant is what
   * matters, and the long name is what makes it bite.
   */
  for (const viewport of [GALLERY_PHONE_360, PHONE, GALLERY_TABLET, DESKTOP, GALLERY_WIDE]) {
    test(`no card name overflows its card at ${viewport.name}`, async ({ page }) => {
      await openRoute(page, GALLERY, viewport, { readySelector: CARD });

      const worst = await page.evaluate(
        ({ cardSel, nameSel }) => {
          let overflow = 0;
          let offender = "";
          for (const card of document.querySelectorAll(cardSel)) {
            const name = card.querySelector(nameSel);
            if (!name) continue;
            const spill = name.getBoundingClientRect().right - card.getBoundingClientRect().right;
            if (spill > overflow) {
              overflow = spill;
              offender = name.textContent ?? "";
            }
          }
          return { overflow, offender };
        },
        { cardSel: CARD, nameSel: CARD_NAME },
      );

      expect(
        worst.overflow,
        `"${worst.offender}" spills ${worst.overflow.toFixed(2)}px past its card's right edge. ` +
          `The design specifies names truncate to one line with ellipsis; a name escaping the ` +
          `card means the truncate is not actually constraining it (a missing min-w-0 on a flex ` +
          `parent is the usual cause).`,
      ).toBeLessThanOrEqual(0.5);
    });
  }

  /**
   * Walks pages rather than assuming page 1. Which page the long name lands
   * on depends on freshness ordering, which is seeded data and not something
   * this test should pin — an assertion that silently passes because the
   * stressor happened to be elsewhere is exactly the decoration
   * `docs/standing-constraints.md` warns about, and this failed for that
   * reason on its first run before being made to walk.
   *
   * `LONG_NAME_MIN_CHARS` is the threshold C1 was raised about, not the
   * seed's exact string: the test should keep working if the corpus's long
   * name is reworded, and should fail if the corpus stops containing one.
   */
  const LONG_NAME_MIN_CHARS = 25;
  const GALLERY_PAGES = 10;

  test("a name long enough to need it exists in the corpus and is actually clipped", async ({
    page,
  }) => {
    let found: { name: string; clipped: boolean } | null = null;

    for (let stor = 1; stor <= GALLERY_PAGES && found === null; stor++) {
      await openRoute(page, `${GALLERY}?stor=${stor}`, GALLERY_PHONE_360, {
        readySelector: CARD,
      });
      found = await page.evaluate(
        ({ nameSel, minChars }) => {
          for (const el of document.querySelectorAll(nameSel)) {
            const name = (el.textContent ?? "").trim();
            if (name.length >= minChars) {
              return { name, clipped: el.scrollWidth > el.clientWidth + 1 };
            }
          }
          return null;
        },
        { nameSel: CARD_NAME, minChars: LONG_NAME_MIN_CHARS },
      );
    }

    expect(
      found,
      `no animal name of ${LONG_NAME_MIN_CHARS}+ characters exists anywhere in the seeded ` +
        `corpus's ${GALLERY_PAGES} pages. packages/db/src/seed.ts carries one deliberately ` +
        `(critique C1) precisely so truncation is exercised near its limit — if it was removed, ` +
        `the design's "names truncate to one line with ellipsis" goes back to being untested.`,
    ).not.toBeNull();

    expect(
      found?.clipped,
      `"${found?.name}" (${found?.name.length} characters) is not clipped at 360px, so the ` +
        `truncate is not engaging even at this length. Either the name box is far wider than ` +
        `expected or the truncate was dropped.`,
    ).toBe(true);
  });
});

test.describe("the header is reachable by keyboard", () => {
  test("the «Про проєкт» link has real focus-visible styling", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await expectFocusVisibleOutline(page, {
      label: "header «Про проєкт» link",
      locator: page.locator(NAV_ABOUT),
    });
  });

  test("the «Для притулків» link has real focus-visible styling", async ({ page }) => {
    await openRoute(page, ABOUT, PHONE, { readySelector: HEADER });
    await expectFocusVisibleOutline(page, {
      label: "header «Для притулків» link",
      locator: page.locator(NAV_SHELTERS),
    });
  });
});
