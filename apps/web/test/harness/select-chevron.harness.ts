/**
 * Every gallery filter select is one click target, the decorative chevron included: a click at the
 * chevron's centre opens the list, a second click there closes it, and the ✕ only clears.
 * Область and Місто are the kit's multi-select combobox; Вік, Розмір and Стать are its popover.
 */

import { expect, type Locator, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import type { Viewport } from "./viewports";

const WIDE: Viewport = { name: "1440x900 desktop", width: 1440, height: 900 };
const CARD = "[data-testid='animal-card']";

// One TEST-NET-1 address per repetition (offset past anchored-popover's): `/tvaryny` is limited per IP.
test.beforeEach(async ({ page }, testInfo) => {
  const lastOctet = 1 + ((100 + testInfo.repeatEachIndex) % 254);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${lastOctet}` });
});

/** A real pointer press at the middle of the decorative chevron inside `field`. */
async function clickChevron(page: Page, field: Locator): Promise<void> {
  const box = await field.locator("[aria-hidden='true']").last().boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
}

for (const name of ["Область", "Місто"]) {
  test(`${name}: a click at the chevron opens the list and focuses the input; a second click closes it`, async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", WIDE, { readySelector: CARD });
    const input = page.getByRole("combobox", { name });
    const field = input.locator("xpath=..");

    await clickChevron(page, field);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("listbox", { name })).toBeVisible();
    await expect(input).toBeFocused();

    await clickChevron(page, field);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("listbox", { name })).toHaveCount(0);
  });
}

for (const name of ["Вік", "Розмір", "Стать"]) {
  test(`${name}: a click at the chevron opens the panel; a second click closes it`, async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", WIDE, { readySelector: CARD });
    const trigger = page.getByRole("button", { name: `${name}: ${name}` });

    await clickChevron(page, trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("group", { name })).toBeVisible();

    await clickChevron(page, trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("group", { name })).toHaveCount(0);
  });
}

test("Область: the ✕ only clears, it does not also open the list", async ({ page }) => {
  await openRoute(page, "/tvaryny", WIDE, { readySelector: CARD });
  const field = page.getByRole("combobox", { name: "Область" });
  await field.focus();
  await page.keyboard.type("київ");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForURL(/obl=kyivska/);
  await page.keyboard.press("Escape");
  const chosen = page.getByRole("combobox", { name: "Область: Київська" });
  await expect(chosen).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Скинути Область" }).click();
  await page.waitForURL((url) => !url.search.includes("obl="));
  const cleared = page.getByRole("combobox", { name: "Область", exact: true });
  await expect(cleared).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox", { name: "Область" })).toHaveCount(0);
});

test("Стать: the ✕ only clears, it does not also open the panel", async ({ page }) => {
  await openRoute(page, "/tvaryny", WIDE, { readySelector: CARD });
  await page.getByRole("button", { name: "Стать: Стать" }).click();
  await page.getByRole("button", { name: /^Дівчинка, / }).click();
  await page.waitForURL(/stat=female/);
  await page.getByRole("link", { name: "Скинути Стать" }).click();
  await page.waitForURL((url) => !url.search.includes("stat="));
  const trigger = page.getByRole("button", { name: "Стать: Стать" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("group", { name: "Стать" })).toHaveCount(0);
});
