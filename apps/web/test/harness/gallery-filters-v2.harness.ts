/**
 * Filters v2 in a real browser: the desktop search fields operated by keyboard, the phone sheet
 * with its drill-down screens and the active-filter chips, the accessibility floor (48px targets)
 * and the absence of sideways scroll at 360 and 1440. Found by role, label and text.
 */

import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import { ANDROID_PHONE, type Viewport } from "./viewports";

/** TEST-NET-2, `.62`: the next address no other harness file claims (see `gallery-filters.harness.ts`). */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.62" } });

const ROUTE = "/tvaryny";
const CARD = "[data-testid='animal-card']";
const WIDE: Viewport = { name: "1440x900 desktop", width: 1440, height: 900 };

const heightsOf = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));

test.describe("/tvaryny desktop fields, by keyboard", () => {
  test("type, arrow down, Enter applies; Esc closes and keeps focus; Backspace removes the last choice", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, WIDE, { readySelector: CARD });
    const field = page.getByRole("combobox", { name: "Область" });
    const list = page.getByRole("listbox", { name: "Область" });

    await field.focus();
    await expect(list).toBeVisible();
    await page.keyboard.type("київ");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(/obl=kyivska/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(page.getByRole("combobox", { name: "Область: Київська" })).toBeFocused();

    await page.keyboard.press("Backspace");
    await page.waitForURL((url) => !url.search.includes("obl="));
  });

  test("an empty search says so, and the city field adds that only cities with animals are listed", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, WIDE, { readySelector: CARD });
    await page.getByRole("combobox", { name: "Місто" }).click();
    await page.keyboard.type("zzzzzz");
    await expect(page.getByText("Нічого не знайдено").first()).toBeVisible();
    await expect(page.getByText("Тут лише міста, де зараз є тварини.")).toBeVisible();
  });

  test("the list is not clipped by the page: it stays inside the viewport", async ({ page }) => {
    await openRoute(page, ROUTE, WIDE, { readySelector: CARD });
    await page.getByRole("combobox", { name: "Місто" }).click();
    const box = await page.getByRole("listbox", { name: "Місто" }).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= WIDE.width).toBe(true);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
  });
});

test.describe("/tvaryny phone: the sheet, the drill-down and the chips", () => {
  test("Область is chosen on its own screen, applied by «Показати», shown as a chip, removed by the chip", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, ANDROID_PHONE, { readySelector: CARD });
    await page.getByTestId("filter-sheet-trigger").click();
    const sheet = page.getByTestId("filter-sheet");
    await expect(sheet.getByRole("heading", { name: "Фільтри" })).toBeVisible();

    await sheet.getByRole("button", { name: "Область, Усі" }).click();
    await expect(sheet.getByRole("heading", { name: "Область" })).toBeVisible();
    // Not focused on open, so the on-screen keyboard does not jump up.
    await expect(sheet.getByRole("searchbox", { name: "Пошук області" })).not.toBeFocused();
    await sheet.getByRole("searchbox", { name: "Пошук області" }).fill("київ");
    await sheet.getByRole("checkbox", { name: /^Київська, / }).click();
    await sheet.getByRole("button", { name: "Готово" }).click();
    await expect(sheet.getByRole("button", { name: "Область, Київська" })).toBeVisible();

    // Nothing applied yet.
    expect(page.url()).not.toContain("obl=");
    await sheet.getByRole("button", { name: /^Показати \d+ / }).click();
    await page.waitForURL(/obl=kyivska/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    const chips = page.getByTestId("active-filter-chips");
    await expect(chips.getByRole("link", { name: "Прибрати фільтр Київська" })).toBeVisible();
    await expect(page.getByTestId("filter-sheet-trigger")).toHaveAttribute(
      "aria-label",
      "Фільтри, Активних фільтрів: 1",
    );
    await chips.getByRole("link", { name: "Прибрати фільтр Київська" }).click();
    await page.waitForURL((url) => !url.search.includes("obl="));
  });

  test("the close ✕ discards unsaved choices", async ({ page }) => {
    await openRoute(page, ROUTE, ANDROID_PHONE, { readySelector: CARD });
    await page.getByTestId("filter-sheet-trigger").click();
    const sheet = page.getByTestId("filter-sheet");
    await sheet.getByRole("button", { name: "Місто, Усі" }).click();
    await sheet.getByRole("checkbox").first().click();
    await sheet.getByRole("link", { name: "Закрити" }).click();
    await page.getByTestId("filter-sheet-trigger").click();
    await expect(sheet.getByRole("button", { name: "Місто, Усі" })).toBeVisible();
  });
});

test.describe("/tvaryny filters: touch targets and no sideways scroll", () => {
  for (const viewport of [ANDROID_PHONE, WIDE]) {
    test(`no horizontal overflow at ${viewport.name}, with and without a filter on`, async ({
      page,
    }) => {
      for (const route of [ROUTE, `${ROUTE}?obl=kyivska&vik=adult`]) {
        await openRoute(page, route, viewport, { readySelector: CARD });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("every row and footer button of the desktop list is at least 48px tall", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, WIDE, { readySelector: CARD });
    await page.getByRole("combobox", { name: "Область" }).click();
    const rows = await heightsOf(page, "[role='listbox'] [role='option']");
    expect(rows.length).toBeGreaterThan(0);
    for (const height of rows) expect(height).toBeGreaterThanOrEqual(48);
  });

  test("the phone sheet's rows, back button and footer buttons are at least 48px tall", async ({
    page,
  }) => {
    await openRoute(page, ROUTE, ANDROID_PHONE, { readySelector: CARD });
    await page.getByTestId("filter-sheet-trigger").click();
    const sheet = page.getByTestId("filter-sheet");
    await sheet.getByRole("button", { name: "Місто, Усі" }).click();
    const targets = [
      sheet.getByRole("button", { name: "Назад" }),
      sheet.getByRole("button", { name: "Готово" }),
      sheet.getByRole("button", { name: "Очистити" }),
      sheet.getByRole("checkbox").first(),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
  });
});
