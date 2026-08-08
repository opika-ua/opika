/**
 * E2.5 (issue #28): `docs/design/README.md`'s "Keyboard" table — arrow keys
 * move focus by the grid's actual column count, Home/End jump to first/
 * last, edges never wrap. A real keyboard, not markup inspection: every
 * assertion here reads `document.activeElement` after a real
 * `page.keyboard.press()`, the same standard `docs/standing-constraints.md`
 * holds every other interaction in this harness to.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/**
 * `proxy.ts` rate-limits `/tvaryny` at 100 req/min per IP
 * (`api/rate-limit.ts`), keyed on the real client IP unless spoofed —
 * every test file that requests `/tvaryny` under its real identity shares
 * ONE budget with every other one, in the same 60s window, on a suite that
 * only grows. `gallery-rate-limit.harness.ts`'s own file comment named
 * this risk directly ("present or future" tests colliding) and solved it
 * for its own single test; it did not, and could not, solve it for a file
 * that didn't exist yet. Confirmed as the actual cause here, not assumed:
 * `pnpm check`'s harness step started failing two of gallery-layout's
 * content-width tests with a real 429 ("Too Many Requests") the moment
 * this file's ~9 additional real requests were added to the shared
 * budget — reproduced by running file combinations until the minimal
 * failing set (this file + gallery-filters + gallery-layout) was found.
 * A unique per-file `x-forwarded-for` isolates this file's own request
 * volume from every other file's, the same way `gallery-rate-limit.
 * harness.ts` already isolates its own deliberate budget exhaustion —
 * see that file for why spoofing this header is expected and harmless
 * in this environment.
 *
 * TEST-NET-2 (198.51.100.0/24, RFC 5737), NOT the TEST-NET-3 block the
 * rate-limit file uses: that file draws a *random* host in
 * `203.0.113.1-254` per run and then deliberately spends the whole
 * 100-request budget on it. A fixed per-file address inside that same /24
 * is a 1-in-254 collision every run. Today it runs last (files execute in
 * alphabetical order), so a collision would surface as its own "not
 * rate-limited before request 101" assertion failing early; reorder the
 * files and it flips to 429-ing whichever file it landed on instead. Either
 * way `retries: 0` (playwright.config.ts) makes it a red gate, not a retry.
 * Disjoint blocks make the collision impossible rather than unlikely.
 */
const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.21" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";

async function focusedIndex(page: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<number> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-testid='animal-card']"));
    return document.activeElement ? cards.indexOf(document.activeElement) : -1;
  });
}

test.describe("/tvaryny arrow-key grid navigation (desktop, 3 columns)", () => {
  test("ArrowRight/ArrowDown/ArrowLeft/ArrowUp move focus by the real column count", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().focus();
    expect(await focusedIndex(page), "starts focused on the first card").toBe(0);

    await page.keyboard.press("ArrowRight");
    expect(await focusedIndex(page), "ArrowRight moves to the next card in the row").toBe(1);

    await page.keyboard.press("ArrowDown");
    expect(await focusedIndex(page), "ArrowDown moves by the column count (3)").toBe(4);

    await page.keyboard.press("ArrowLeft");
    expect(await focusedIndex(page), "ArrowLeft moves back one").toBe(3);

    await page.keyboard.press("ArrowUp");
    expect(await focusedIndex(page), "ArrowUp moves back up by the column count").toBe(0);
  });

  test("edges do not wrap — the rightmost card in a row stays put on ArrowRight", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    // Card index 2 is the rightmost of the first 3-column row. Every card
    // keeps its native tabIndex (no roving state — see ArrowKeyGrid's own
    // doc comment for why), so focus() alone is enough to land here.
    await page.evaluate(() => {
      const card = document.querySelectorAll("[data-testid='animal-card']")[2] as HTMLElement;
      card.focus();
    });
    expect(await focusedIndex(page)).toBe(2);

    await page.keyboard.press("ArrowRight");
    expect(
      await focusedIndex(page),
      "the rightmost card in a row must not wrap to the next row's first card",
    ).toBe(2);
  });

  test("edges do not wrap — the leftmost card in a row stays put on ArrowLeft", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    // Card index 3 is the leftmost of the second row (row 1, columns=3).
    await page.evaluate(() => {
      const card = document.querySelectorAll("[data-testid='animal-card']")[3] as HTMLElement;
      card.focus();
    });
    expect(await focusedIndex(page)).toBe(3);

    await page.keyboard.press("ArrowLeft");
    expect(
      await focusedIndex(page),
      "the leftmost card in a row must not wrap to the previous row's last card",
    ).toBe(3);
  });

  test("Home jumps to the first card, End jumps to the last", async ({ page }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().focus();

    await page.keyboard.press("End");
    expect(await focusedIndex(page), "End jumps to the last of the 24 seeded cards").toBe(23);

    await page.keyboard.press("Home");
    expect(await focusedIndex(page), "Home jumps back to the first card").toBe(0);
  });

  test("every card keeps its native tabIndex — arrow navigation never removes a card from Tab order", async ({
    page,
  }) => {
    // The regression this guards: an earlier version of ArrowKeyGrid used a
    // roving tabindex (the APG grid pattern's usual pairing with arrow-key
    // movement), reverted on review because it silently removed 23 of 24
    // cards from the Tab sequence — a real, visible change to
    // docs/design/README.md's own Tab row ("cards in reading order"), not
    // the additive shortcut the design's Keyboard table asks for. Every
    // card's tabIndex should read exactly what the browser gives a plain
    // `<a href>` by default (0), before and after moving focus with arrows.
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    const before = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid='animal-card']")).map(
        (el) => (el as HTMLElement).tabIndex,
      ),
    );
    expect(
      before.every((t) => t === 0),
      `expected every card at tabIndex 0, got [${before}]`,
    ).toBe(true);

    await page.locator(CARD).first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");

    const after = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid='animal-card']")).map(
        (el) => (el as HTMLElement).tabIndex,
      ),
    );
    expect(
      after.every((t) => t === 0),
      `arrow navigation must not change any card's tabIndex, got [${after}]`,
    ).toBe(true);
  });

  test("arrow navigation still works against the card set a filter change rendered", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });

    await page.getByTestId("filter-rail").getByRole("link", { name: "Собаки" }).click();
    await page.waitForURL(/vyd=dog/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    await page.locator(CARD).first().focus();
    await page.keyboard.press("ArrowRight");
    expect(
      await focusedIndex(page),
      "arrow navigation must operate on the new, filtered card set — cardsOf() re-queries " +
        "the DOM fresh on every keypress rather than caching the pre-filter card list",
    ).toBe(1);
  });
});

test.describe("/tvaryny arrow-key grid navigation — the column count is read live", () => {
  test("a resize between two keypresses changes the vertical step, with no resize listener", async ({
    page,
  }) => {
    // The one property `columnCountOf`'s own comment claims and nothing else
    // in this file asserts: the track count is re-read on every keypress
    // rather than captured at mount. Every other test opens at a single
    // viewport and stays there, so a value cached at mount would satisfy all
    // of them — this is the only shape of test that can tell the two apart.
    await openRoute(page, ROUTE, DESKTOP, { readySelector: CARD });
    await page.locator(CARD).first().focus();

    await page.keyboard.press("ArrowDown");
    expect(await focusedIndex(page), "3 columns at desktop width, so ArrowDown steps by 3").toBe(3);

    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.keyboard.press("ArrowDown");
    expect(
      await focusedIndex(page),
      "after the resize the grid is 1 column, so ArrowDown must step by 1 — a column count " +
        "cached at mount would still step by 3 and land on 6",
    ).toBe(4);
  });
});

test.describe("/tvaryny arrow-key grid navigation — Tab order is never touched, JS or not", () => {
  test("with JS disabled, Tab still walks from the first card to the second", async ({
    browser,
  }) => {
    // ArrowKeyGrid deliberately never sets tabIndex (see its own doc
    // comment for why a roving scheme was tried and reverted), so this
    // should hold trivially — but "should hold" is exactly the kind of
    // claim this harness exists to verify rather than assume, and it is
    // cheap insurance against a future change reintroducing tabIndex
    // manipulation. `gallery-filters.harness.ts`'s own no-JS Tab test
    // cannot catch that on its own — it stops the moment it reaches the
    // FIRST card, which is precisely the card a roving scheme would still
    // leave reachable. The second card is the first one that actually
    // distinguishes "every card tabbable" from "only one is."
    //
    // `browser.newContext` needs the header passed by hand: `test.use()`
    // configures the implicit fixtures only, not a context a test builds
    // itself.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: SPOOFED_IP_HEADERS,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto(ROUTE, { waitUntil: "load" });
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const hrefs = await page
      .locator(CARD)
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    const [firstHref, secondHref] = hrefs;
    expect(secondHref, "the page needs at least two cards for this to mean anything").toBeTruthy();

    // Real Tab presses, never `focus()`: `focus()` succeeds on a
    // `tabindex="-1"` element, so a focus()-based version of this passes
    // against the exact defect it names.
    const MAX_TAB_PRESSES = 12;
    let reachedFirst = false;
    for (let i = 0; i < MAX_TAB_PRESSES && !reachedFirst; i++) {
      await page.keyboard.press("Tab");
      reachedFirst = await page.evaluate(
        (href) => document.activeElement?.getAttribute("href") === href,
        firstHref,
      );
    }
    expect(
      reachedFirst,
      `the first card was not reached within ${MAX_TAB_PRESSES} Tab presses`,
    ).toBe(true);

    await page.keyboard.press("Tab");
    const afterFirst = await page.evaluate(() => document.activeElement?.getAttribute("href"));
    expect(
      afterFirst,
      "with no JS, Tab must continue from the first card to the second — a roving tabindex " +
        "rendered by the server would leave the second card at tabindex=-1 and skip it",
    ).toBe(secondHref);

    await context.close();
  });
});

test.describe("/tvaryny arrow-key grid navigation (phone, 1 column)", () => {
  test("ArrowRight/ArrowLeft do nothing — a single column has no horizontal neighbour", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    await page.locator(CARD).first().focus();

    await page.keyboard.press("ArrowRight");
    expect(
      await focusedIndex(page),
      "at 1 column, every card is its own row — ArrowRight has no horizontal neighbour to move to",
    ).toBe(0);
  });

  test("ArrowDown moves to the next card — equivalent to reading order at 1 column", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, PHONE, { readySelector: CARD });
    await page.locator(CARD).first().focus();

    await page.keyboard.press("ArrowDown");
    expect(await focusedIndex(page)).toBe(1);
  });
});
