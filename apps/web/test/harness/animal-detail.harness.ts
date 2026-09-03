/**
 * F1 (detail page) + F2 (contact reveal) — docs/design/README.md's addendum
 * frames D1/D2 (detail) and R1/R2 (reveal), opened directly per
 * docs/standing-constraints.md's "when a mock exists, open the mock file."
 *
 * One test ("clicking a gallery card actually reaches a real detail page")
 * reaches the detail page by clicking through the gallery grid, the one real
 * integration point between E1's grid and F1's detail page, and is what
 * actually proves the 404 this phase set out to fix is gone, not just that
 * the route exists in isolation. Every other test below reuses that first
 * test's discovered href directly (see `discoverFirstAnimalHref` below) —
 * they assert against a real seeded animal, just not by re-navigating the
 * gallery to find one.
 *
 * A dedicated `x-forwarded-for` isolates this file's own request budget from
 * proxy.ts's shared 100 req/min limiter — the same reasoning
 * `gallery-filters.harness.ts` and siblings already give for their own IPs
 * (TEST-NET-2, 198.51.100.0/24; .21 through .28 are already claimed by
 * other harness files, this one is .29). Confirmed empirically (not just
 * reasoned about) that the dedicated IP alone is not enough: with caching
 * removed and only the IP isolation in place, "Esc closes the dialog" and
 * "Tab is trapped" still time out identically waiting on the gallery page —
 * this file's own ~20 tests, each doing a full gallery navigation, exhaust
 * its own budget before the file finishes. `discoverFirstAnimalHref` below
 * is a real fix, not a guess.
 */

import { expect, test } from "@playwright/test";
import { expectFocusVisibleOutline, openRoute } from "./harness";
import { DETAIL_DESKTOP, DETAIL_PHONE } from "./viewports";

const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.29" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

const GALLERY_ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";

/**
 * Discovered once per file run, not once per test: every test here already
 * proved (individually, before this existed) that it reaches a real detail
 * page — what they don't each need is their *own* gallery page load to get
 * there. ~20 tests × a full gallery navigation apiece was enough real
 * request volume to trip proxy.ts's 100 req/min limiter by itself, even
 * with this file's own dedicated IP (`SPOOFED_IP_HEADERS` above isolates
 * this file from every *other* harness file's requests, not from its own).
 * The one test that must still exercise the real gallery→detail hop
 * ("clicking a gallery card actually reaches a real detail page") does its
 * own separate navigation deliberately, not through this cache.
 */
let cachedAnimalHref: string | null = null;

async function discoverFirstAnimalHref(
  browser: import("@playwright/test").Browser,
): Promise<string> {
  if (cachedAnimalHref) return cachedAnimalHref;
  const page = await browser.newPage({ extraHTTPHeaders: SPOOFED_IP_HEADERS });
  try {
    await openRoute(page, GALLERY_ROUTE, DETAIL_DESKTOP, { readySelector: CARD });
    const href = await page.locator(CARD).first().getAttribute("href");
    expect(href, "the first gallery card should link somewhere").not.toBeNull();
    cachedAnimalHref = href as string;
    return cachedAnimalHref;
  } finally {
    await page.close();
  }
}

async function openFirstAnimalDetail(
  page: import("@playwright/test").Page,
  viewport: typeof DETAIL_PHONE,
) {
  const browser = page.context().browser();
  if (!browser) {
    throw new Error("expected the page's context to carry a live Browser instance");
  }
  const href = await discoverFirstAnimalHref(browser);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(href, { waitUntil: "load" });
  await page.getByTestId("animal-name").waitFor({ state: "visible" });
  return href;
}

test.describe("/tvaryny/[animalId] renders at both mock frame widths", () => {
  test("360 — name, photo, action row, and both back links are real and visible", async ({
    page,
  }) => {
    await openFirstAnimalDetail(page, DETAIL_PHONE);

    await expect(page.getByTestId("animal-name")).toBeVisible();
    await expect(page.getByTestId("detail-photo")).toBeVisible();
    await expect(page.getByTestId("not-now-button")).toBeVisible();
    await expect(page.getByTestId("reveal-trigger")).toBeVisible();

    const mobileBack = page.getByTestId("back-to-list");
    const desktopBack = page.getByTestId("back-to-list-desktop");
    await expect(mobileBack, "the mobile back link is the visible one at 360").toBeVisible();
    await expect(
      desktopBack,
      "the desktop back link should have no bounding box (display:none) at 360",
    ).toBeHidden();
  });

  test("1920 — desktop back link, sticky photo column, and thumbnails are real and visible", async ({
    page,
  }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);

    await expect(page.getByTestId("animal-name")).toBeVisible();
    await expect(page.getByTestId("detail-photo")).toBeVisible();

    const mobileBack = page.getByTestId("back-to-list");
    const desktopBack = page.getByTestId("back-to-list-desktop");
    await expect(desktopBack, "the desktop back link is the visible one at 1920").toBeVisible();
    await expect(
      mobileBack,
      "the mobile back link should have no bounding box (display:none) at 1920",
    ).toBeHidden();
  });

  test("clicking a gallery card actually reaches a real detail page, not a 404", async ({
    page,
  }) => {
    // The one test in this file that does a genuine, uncached gallery visit
    // and click — every other test below reuses `discoverFirstAnimalHref`'s
    // cached result instead, to stay under proxy.ts's rate limit. This is
    // what actually proves the gallery→click→detail path works end to end,
    // not just that the detail route renders when opened directly.
    await openRoute(page, GALLERY_ROUTE, DETAIL_DESKTOP, { readySelector: CARD });
    const href = await page.locator(CARD).first().getAttribute("href");
    expect(href, "the first gallery card should link somewhere").not.toBeNull();
    await page.locator(CARD).first().click();
    await page.getByTestId("animal-name").waitFor({ state: "visible" });
    expect(page.url()).toContain(href as string);
    // A genuine assertion that this is F1's own page, not Next's bare 404 —
    // the not-found route renders uk.detail.notFound.title instead.
    await expect(page.getByText("Цієї картки більше немає.")).toHaveCount(0);
  });
});

test.describe("/tvaryny/[animalId] keyboard focus", () => {
  test("the back-to-list link shows a real focus-visible outline", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_PHONE);
    await expectFocusVisibleOutline(page, {
      label: "back-to-list link",
      locator: page.getByTestId("back-to-list"),
    });
  });

  test("the reveal trigger shows a real focus-visible outline", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await expectFocusVisibleOutline(page, {
      label: "reveal-trigger button",
      locator: page.getByTestId("reveal-trigger"),
    });
  });

  test("the back-to-list-desktop link shows a real focus-visible outline", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await expectFocusVisibleOutline(page, {
      label: "back-to-list-desktop link",
      locator: page.getByTestId("back-to-list-desktop"),
    });
  });

  test("the not-now link shows a real focus-visible outline", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await expectFocusVisibleOutline(page, {
      label: "not-now-button link",
      locator: page.getByTestId("not-now-button"),
    });
  });

  test("the reveal dialog's close button shows a real focus-visible outline", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await page.getByTestId("reveal-trigger").click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });
    await expectFocusVisibleOutline(page, {
      label: "reveal-close button",
      locator: page.getByTestId("reveal-close"),
    });
  });

  test("the reveal dialog's primary action and back-to-gallery controls show a real focus-visible outline", async ({
    page,
  }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await page.getByTestId("reveal-trigger").click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    const primaryAction = page.getByTestId("reveal-primary-action");
    if ((await primaryAction.count()) > 0) {
      await expectFocusVisibleOutline(page, {
        label: "reveal-primary-action link",
        locator: primaryAction,
      });
    }

    await expectFocusVisibleOutline(page, {
      label: "reveal-back-to-gallery button",
      locator: page.getByTestId("reveal-back-to-gallery"),
    });
  });
});

test.describe("/tvaryny/[animalId] an unknown or malformed id 404s on-brand", () => {
  test("a well-formed but nonexistent id renders the detail not-found page", async ({ page }) => {
    await page.goto("/tvaryny/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", { waitUntil: "load" });
    await expect(page.getByText("Цієї картки більше немає.")).toBeVisible();
  });

  test("a malformed id renders the same not-found page, not a crash", async ({ page }) => {
    const response = await page.goto("/tvaryny/not-a-real-id", { waitUntil: "load" });
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Цієї картки більше немає.")).toBeVisible();
  });

  test("the not-found page's action link shows a real focus-visible outline", async ({ page }) => {
    await page.goto("/tvaryny/not-a-real-id", { waitUntil: "load" });
    await expectFocusVisibleOutline(page, {
      label: "not-found-action link",
      locator: page.getByTestId("not-found-action"),
    });
  });
});

/**
 * F2 — the reveal is the one interaction on this whole page that needs
 * JavaScript to work at all (session.bootstrap then animals.reveal, both
 * real network calls against the harness's own seeded database). "Before"
 * and "after" match the PR's own required screenshots.
 */
test.describe("/tvaryny/[animalId] contact reveal — before, after, and close", () => {
  test("before: the reveal trigger is present and the dialog is not", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await expect(page.getByTestId("reveal-trigger")).toBeVisible();
    await expect(page.getByTestId("reveal-dialog")).toHaveCount(0);
  });

  test("clicking the trigger performs a real reveal and shows real shelter contact details", async ({
    page,
  }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await page.getByTestId("reveal-trigger").click();

    const dialog = page.getByTestId("reveal-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // Real data, not a placeholder — the shelter's actual name from the
    // seeded database appears inside the dialog once the reveal resolves.
    const shelterLine = dialog.locator("text=/Притулок/");
    await expect(shelterLine.first()).toBeVisible();
  });

  test("focus moves to the dialog's own heading on open", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await page.getByTestId("reveal-trigger").click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    const heading = page.locator("#reveal-heading");
    await expect(heading).toBeFocused();
  });

  test("Esc closes the dialog and returns focus to the trigger", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    const trigger = page.getByTestId("reveal-trigger");
    await trigger.click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("reveal-dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("Tab is trapped inside the open dialog", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await page.getByTestId("reveal-trigger").click();
    const dialog = page.getByTestId("reveal-dialog");
    await dialog.waitFor({ state: "visible" });

    // Tab far more times than the dialog has focusable elements — if the
    // trap is broken, focus escapes onto the page behind it (the "Не
    // зараз" button, still present but supposed to be unreachable while
    // the dialog is open) rather than cycling within the dialog.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
    }

    const activeIsInsideDialog = await page.evaluate(() => {
      const dialogEl = document.querySelector('[data-testid="reveal-dialog"]');
      return dialogEl?.contains(document.activeElement) ?? false;
    });
    expect(activeIsInsideDialog, "focus should stay inside the dialog after repeated Tab").toBe(
      true,
    );
  });
});

/**
 * The freshness block quotes the shelter's *freshness sentence*, not its
 * general description.
 *
 * This is a regression guard for a real bug, and one that shipped precisely
 * because nothing asserted which field the block reads. It rendered
 * `shelter.description` — «Один з найбільших притулків Києва, працює з 2015
 * року…» — under the attribution «Слова притулку · дата автоматична», inside a
 * block about how current the listings are. Both fields are the shelter's own
 * words, both are prose, and the wrong one looks entirely plausible on screen.
 *
 * Found by verifying a claim in `/prytulkam`'s copy, which tells shelters their
 * sentence appears on the animal's page. `docs/design/README.md`'s freshness
 * section specifies a sentence "written once by the shelter at verification, in
 * their own words"; `SwipeCard` had always used the right field.
 */
test.describe("the detail page's freshness block quotes the right field", () => {
  test("shows the shelter's freshness sentence and not its description", async ({
    page,
    browser,
  }) => {
    await openRoute(page, await discoverFirstAnimalHref(browser), DETAIL_DESKTOP, {
      readySelector: "[data-testid='detail-photo']",
    });

    /**
     * Unconditional on purpose. The first version of this test skipped its
     * own assertions when the element was absent — and the element is absent
     * in exactly the broken state, because the wrong field carries no test
     * id. It passed against a deliberate reintroduction of the bug, which is
     * the "would this fail if the thing it guards were broken?" case
     * `docs/standing-constraints.md` rules out. Caught by mutation testing,
     * not by review.
     *
     * The seeded corpus's verified shelters all carry a freshness sentence,
     * so requiring it here is a real precondition rather than an assumption:
     * if a future corpus change removed them, this fails loudly and says so,
     * which is better than silently guarding nothing again.
     */
    const quoted = page.getByTestId("shelter-freshness-sentence");
    await expect(
      quoted,
      "no freshness sentence rendered in the freshness block. Either this animal's shelter has " +
        "no `freshnessSentence` in the seeded corpus (a fixture problem — say so and pick another " +
        "animal), or the block is reading a different field again, which is the bug this exists " +
        "for: it previously quoted `shelter.description` under the «Слова притулку» attribution.",
    ).toHaveCount(1);

    const text = ((await quoted.textContent()) ?? "").replace(/[“”]/g, "").trim();
    expect(text.length, "the freshness quote rendered empty").toBeGreaterThan(0);

    /**
     * The description is not rendered on this page, so it cannot be compared
     * against directly. What distinguishes the two fields in the seeded
     * corpus is subject: every description opens by describing the shelter
     * itself ("Один з найбільших притулків…", "Маленький сімейний притулок…"),
     * while every freshness sentence is about update cadence. Asserting the
     * quote does not begin like a shelter description catches the specific
     * regression without pinning either string.
     */
    expect(
      text.startsWith("Притулок") || text.includes("притулок у") || text.includes("притулків"),
      `the freshness block is quoting something that reads like the shelter's description ` +
        `rather than its freshness sentence: "${text}"`,
    ).toBe(false);

    // The attribution is what makes the quote a claim about freshness rather
    // than just a nice sentence from the shelter.
    await expect(page.getByText("Слова притулку · дата автоматична")).toBeVisible();
  });
});
