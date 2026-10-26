/**
 * F1 (detail page) + F2 (contact reveal) - docs/design/README.md's addendum
 * frames D1/D2 (detail) and R1/R2 (reveal), opened directly per
 * docs/standing-constraints.md's "when a mock exists, open the mock file."
 *
 * One test ("clicking a gallery card actually reaches a real detail page")
 * reaches the detail page by clicking through the gallery grid, the one real
 * integration point between E1's grid and F1's detail page, and is what
 * actually proves the 404 this phase set out to fix is gone, not just that
 * the route exists in isolation. Every other test below reuses that first
 * test's discovered href directly (see `discoverFirstAnimalHref` below) -
 * they assert against a real seeded animal, just not by re-navigating the
 * gallery to find one.
 *
 * A dedicated `x-forwarded-for` isolates this file's own request budget from
 * proxy.ts's shared 100 req/min limiter - the same reasoning
 * `gallery-filters.harness.ts` and siblings already give for their own IPs
 * (TEST-NET-2, 198.51.100.0/24; .21 through .28 are already claimed by
 * other harness files, this one is .29). Confirmed empirically (not just
 * reasoned about) that the dedicated IP alone is not enough: with caching
 * removed and only the IP isolation in place, "Esc closes the dialog" and
 * "Tab is trapped" still time out identically waiting on the gallery page -
 * this file's own ~20 tests, each doing a full gallery navigation, exhaust
 * its own budget before the file finishes. `discoverFirstAnimalHref` below
 * is a real fix, not a guess.
 */

import { citySlugOf } from "@opika/domain";
import { uk } from "@opika/i18n";
import { expect, test } from "@playwright/test";
import { expectReachableByTab, openRoute } from "./harness";
import { DETAIL_DESKTOP, DETAIL_PHONE } from "./viewports";

const SPOOFED_IP_HEADERS = { "x-forwarded-for": "198.51.100.29" };
test.use({ extraHTTPHeaders: SPOOFED_IP_HEADERS });

/**
 * `citySlugOf` (2026-09-12) takes a city's English name, not its Ukrainian
 * one - see `packages/domain/src/geography/city-slug.ts`'s own doc comment
 * for why the transliteration it used to do was dropped. This page renders
 * only the Ukrainian name, so the test below (which has no database access
 * of its own - see this file's top comment) can't ask `citySlugOf` to
 * resolve a name it scraped from the DOM anymore. Pinned to `seed.ts`'s own
 * `CITY_DATA`, the same real, only-ever corpus this repo seeds - confirmed
 * exactly 8 rows against Neon before this migration shipped (Oleksii,
 * 2026-09-12), same posture as `city-slug-backfill.test.ts`'s own
 * `REAL_SEEDED_CITIES` table.
 */
const KNOWN_CITY_NAME_UK_TO_EN: Readonly<Record<string, string>> = {
  Київ: "Kyiv",
  Бровари: "Brovary",
  Ірпінь: "Irpin",
  Буча: "Bucha",
  Вишгород: "Vyshhorod",
  Бориспіль: "Boryspil",
  Фастів: "Fastiv",
  "Біла Церква": "Bila Tserkva",
};

function expectedSlugFor(visibleCityNameUk: string): string {
  const nameEn = KNOWN_CITY_NAME_UK_TO_EN[visibleCityNameUk];
  if (nameEn === undefined) {
    throw new Error(
      `"${visibleCityNameUk}" is not one of the 8 known seeded cities - either the seed corpus ` +
        "grew (add it to KNOWN_CITY_NAME_UK_TO_EN above) or this is a real bug.",
    );
  }
  return citySlugOf(nameEn);
}

const GALLERY_ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";

/**
 * Discovered once per file run, not once per test: every test here already
 * proved (individually, before this existed) that it reaches a real detail
 * page - what they don't each need is their *own* gallery page load to get
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
  test("360 - name, photo, action row, and both back links are real and visible", async ({
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

  test("1920 - desktop back link, sticky photo column, and thumbnails are real and visible", async ({
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

    /**
     * O-12 (`docs/observations.md`): «← Усі тварини у {city}» has to
     * actually claim a real city, not the unfiltered gallery - the link's
     * own text is the claim being checked. Folded into this existing test
     * (rather than a standalone one) to add zero extra page loads:
     * `gallery-filters.harness.ts` already proves a `?misto=` link
     * genuinely narrows the gallery it lands on, so what's left to check
     * here is that this href is built at all (not the bare `/tvaryny` the
     * bug produced) and names *this animal's own* city, not a placeholder.
     *
     * A membership check against the known seeded slugs alone does not
     * prove that - every seeded slug is equally "real," so a mutation that
     * resolves the *wrong* city consistently (e.g. always Kyiv, for every
     * animal) still produces a value that passes a bare "is this a real
     * slug" assertion. The fix cross-checks two independently computed
     * fields instead - `backToListIn`'s own visible city name (from
     * `AnimalDetailScreen`'s `cityName` prop) and the href's `misto` slug
     * (from its separate `backToGalleryHref` prop) - which catches the two
     * fields disagreeing (one derivation swapped onto a different city than
     * the other). It does **not** catch both being wrong the *same* way -
     * a consistently-wrong `city` lookup in `page.tsx` that both props are
     * built from would still make the two sides agree. Proving "the right
     * one, not just a consistent one" needs an oracle outside this page
     * (the real seeded corpus's actual per-animal city assignment), which
     * costs a database read this harness test doesn't have - a real,
     * accepted gap, not something the assertion below overclaims to close.
     */
    const linkText = await desktopBack.textContent();
    const prefix = uk.detail.backToListIn.replace("{city}", "");
    expect(linkText?.startsWith(prefix), `"${linkText}" should start with "${prefix}"`).toBe(true);
    const visibleCityName = (linkText ?? "").slice(prefix.length).trim();
    expect(
      visibleCityName.length,
      "a real city name must remain after stripping the template",
    ).toBeGreaterThan(0);

    const href = await desktopBack.getAttribute("href");
    const url = new URL(href ?? "", "http://x");
    expect(url.pathname).toBe("/tvaryny");
    const citySlug = url.searchParams.get("misto");
    expect(
      citySlug,
      "O-12: the link claims a city, so the href must actually carry one",
    ).not.toBeNull();
    expect(
      citySlug,
      `the href's city ("${citySlug}") must match the link's own visible city ("${visibleCityName}")`,
    ).toBe(expectedSlugFor(visibleCityName));
  });

  test("clicking a gallery card actually reaches a real animal, not a 404", async ({ page }) => {
    // The one test in this file that does a genuine, uncached gallery visit
    // and click - every other test below reuses `discoverFirstAnimalHref`'s
    // cached result instead, to stay under proxy.ts's rate limit. This is
    // what actually proves the gallery→click→animal path works end to end,
    // not just that the detail route renders when opened directly.
    await openRoute(page, GALLERY_ROUTE, DETAIL_DESKTOP, { readySelector: CARD });
    const href = await page.locator(CARD).first().getAttribute("href");
    expect(href, "the first gallery card should link somewhere").not.toBeNull();
    // Since designer round 1 (S4b) the click opens this page in the gallery's
    // overlay, at this page's own URL; `gallery-animal-overlay.harness.ts`
    // covers the overlay and reloads the URL into this page. Not repeated
    // here: this file's request budget is spent.
    const name =
      (await page.locator(CARD).first().getByTestId("card-name").textContent())?.trim() ?? "";
    await page.locator(CARD).first().click();
    const overlay = page.getByRole("dialog", { name });
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole("heading", { level: 1, name })).toBeVisible();
    expect(page.url()).toContain(href as string);
    // A genuine assertion that this is F1's own page, not Next's bare 404 -
    // the not-found route renders uk.detail.notFound.title instead.
    await expect(page.getByText("Цієї картки більше немає.")).toHaveCount(0);
  });
});

test.describe("/tvaryny/[animalId] keyboard reachability", () => {
  test("the back-to-list link is reachable by Tab", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_PHONE);
    await expectReachableByTab(page, {
      label: "back-to-list link",
      locator: page.getByTestId("back-to-list"),
    });
  });

  test("the reveal trigger is reachable by Tab", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await expectReachableByTab(page, {
      label: "reveal-trigger button",
      locator: page.getByTestId("reveal-trigger"),
    });
  });

  test("the back-to-list-desktop link is reachable by Tab", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await expectReachableByTab(page, {
      label: "back-to-list-desktop link",
      locator: page.getByTestId("back-to-list-desktop"),
    });
  });

  test("the not-now link is reachable by Tab", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await expectReachableByTab(page, {
      label: "not-now-button link",
      locator: page.getByTestId("not-now-button"),
    });
  });

  test("the reveal dialog's close button is reachable by Tab", async ({ page }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await page.getByTestId("reveal-trigger").click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });
    await expectReachableByTab(page, {
      label: "reveal-close button",
      locator: page.getByTestId("reveal-close"),
    });
  });

  test("the reveal dialog's primary action and back-to-gallery controls are reachable by Tab", async ({
    page,
  }) => {
    await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    await page.getByTestId("reveal-trigger").click();
    await page.getByTestId("reveal-dialog").waitFor({ state: "visible" });

    const primaryAction = page.getByTestId("reveal-primary-action");
    if ((await primaryAction.count()) > 0) {
      await expectReachableByTab(page, {
        label: "reveal-primary-action link",
        locator: primaryAction,
      });
    }

    await expectReachableByTab(page, {
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

  test("the not-found page's action link is reachable by Tab", async ({ page }) => {
    await page.goto("/tvaryny/not-a-real-id", { waitUntil: "load" });
    await expectReachableByTab(page, {
      label: "not-found-action link",
      locator: page.getByTestId("not-found-action"),
    });
  });
});

/**
 * F2 - the reveal is the one interaction on this whole page that needs
 * JavaScript to work at all (session.bootstrap then animals.reveal, both
 * real network calls against the harness's own seeded database). "Before"
 * and "after" match the PR's own required screenshots.
 */
test.describe("/tvaryny/[animalId] contact reveal - before, after, and close", () => {
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

    // Real data, not a placeholder - the shelter's actual name from the
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

    // Tab far more times than the dialog has focusable elements - if the
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
 * Designer round 1, S6. Oleksii's DR1-Q1, verbatim: "the shelter’s freshness
 * sentence leaves the deck and animal pages and shows only on the shelter
 * page. «Оновлено … тому» stays on every card." This test used to require the
 * sentence here (it once quoted the shelter's description by mistake); it now
 * requires the opposite: the pips' day count and nothing of the shelter's
 * words, in a real browser. Whether this animal's shelter has a sentence is
 * the data's business; that it would not render if it had one is pinned with
 * a sentence present in `sentence-only-there.test.tsx`.
 */
test.describe("the detail page's freshness block is the day count only", () => {
  test("shows «Оновлено …» and neither the shelter's sentence nor «Слова притулку»", async ({
    page,
    browser,
  }) => {
    await openRoute(page, await discoverFirstAnimalHref(browser), DETAIL_DESKTOP, {
      readySelector: "[data-testid='detail-photo']",
    });
    await expect(page.getByTestId("freshness-block")).toContainText("Оновлено");
    await expect(page.getByText("Слова притулку")).toHaveCount(0);
    await expect(page.getByTestId("shelter-freshness-sentence")).toHaveCount(0);
  });
});

/**
 * D-2: `REGISTRY_HAS_NO_REAL_SHELTERS` (`apps/web/src/seo-flags.ts`) is a
 * hardcoded source constant, `true` in the build this harness runs against
 * - the same build production runs. This asserts the real, current state;
 * it cannot exercise the `false` branch, since that would need a second
 * build with the source flipped. That branch has no automated coverage at
 * all today (no component test file exists for `AnimalDetailScreen`) -
 * recorded here rather than silently assumed correct, same discipline
 * DECK-3 used for the text-scaling gap it also couldn't assert.
 */
test.describe("shelter-verified badge - suppressed while the registry holds no real shelters", () => {
  test("the manually-verified-years badge does not render on a real seeded animal's page", async ({
    page,
    browser,
  }) => {
    await openRoute(page, await discoverFirstAnimalHref(browser), DETAIL_DESKTOP, {
      readySelector: "[data-testid='detail-photo']",
    });

    await expect(page.getByText(/Перевірений вручну/)).toHaveCount(0);
  });
});

/**
 * Designer round 1, S7: the save toggle, in a real browser. `localStorage`
 * is per-origin and genuinely persists across a navigation in a way
 * happy-dom's component tests can't exercise - this is the flow those
 * tests can't cover, not a re-run of them. His DR1-Q3 text for both of the
 * button's accessible names.
 */
test.describe("the save toggle persists a save across a reload", () => {
  test("saving an animal, then reloading, shows it still saved", async ({ page, browser }) => {
    await openRoute(page, await discoverFirstAnimalHref(browser), DETAIL_DESKTOP, {
      readySelector: "[data-testid='detail-photo']",
    });

    const save = page.getByRole("button", { name: "Зберегти" });
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await save.click();
    await expect(page.getByRole("button", { name: "Збережено" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.reload();

    await expect(page.getByRole("button", { name: "Збережено" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

/**
 * The not-a-judgement notice's interim home was here, under the action
 * pair (Phase D). R2 (Phase R, `docs/build-plan.md`) moved it to its
 * permanent one, the deck itself (`SwipeDeck.tsx`) - see
 * `discovery-layout.harness.ts`'s own coverage for the notice now.
 */
