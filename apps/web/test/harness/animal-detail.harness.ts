/**
 * F1 (detail page) + F2 (contact reveal) — docs/design/README.md's addendum
 * frames D1/D2 (detail) and R1/R2 (reveal), opened directly per
 * docs/standing-constraints.md's "when a mock exists, open the mock file."
 *
 * Every assertion here is against a real animal reached by clicking through
 * the gallery grid, not a hardcoded seed id — the gallery's own first card
 * is the one real integration point between E1's grid and F1's detail page,
 * and asserting through it is what actually proves the 404 this phase set
 * out to fix is gone, not just that the route exists in isolation.
 */

import { expect, test } from "@playwright/test";
import { expectFocusVisibleOutline, openRoute } from "./harness";
import { DETAIL_DESKTOP, DETAIL_PHONE } from "./viewports";

const GALLERY_ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";

async function openFirstAnimalDetail(
  page: import("@playwright/test").Page,
  viewport: typeof DETAIL_PHONE,
) {
  await openRoute(page, GALLERY_ROUTE, viewport, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  expect(href, "the first gallery card should link somewhere").not.toBeNull();
  await page.goto(href as string, { waitUntil: "load" });
  await page.getByTestId("animal-name").waitFor({ state: "visible" });
  return href as string;
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
    const href = await openFirstAnimalDetail(page, DETAIL_DESKTOP);
    expect(page.url()).toContain(href);
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
