/**
 * Anchored popovers (ComboboxMulti list, InfoTip): while the trigger is visible the card follows
 * it on scroll; once the trigger slides under the sticky header or off screen the card closes.
 * State only, found by role and label; positions are compared between trigger and card.
 */

import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import type { Viewport } from "./viewports";

const WIDE: Viewport = { name: "1440x900 desktop", width: 1440, height: 900 };
const CARD = "[data-testid='animal-card']";

// One TEST-NET-1 address per repetition: `/tvaryny` is rate-limited per IP and `--repeat-each` loads it often.
test.beforeEach(async ({ page }, testInfo) => {
  const lastOctet = 1 + (testInfo.repeatEachIndex % 254);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${lastOctet}` });
});

const scrollTo = (page: Page, y: number) => page.evaluate((top) => window.scrollTo(0, top), y);

async function docBox(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const rect = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
    return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY };
  }, selector);
}

test("the Місто list follows its field on scroll, then closes when the field goes under the header", async ({
  page,
}) => {
  await openRoute(page, "/tvaryny", WIDE, { readySelector: CARD });
  const field = page.getByRole("combobox", { name: "Місто" });
  await field.click();
  const list = page.getByRole("listbox", { name: "Місто" });
  await expect(list).toBeVisible();

  // Scroll a little: the list stays under its field.
  const before = await docBox(page, "[role='combobox'][aria-label^='Місто']");
  await scrollTo(page, 30);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(30);
  const gap = async () => {
    const fieldBox = await field.boundingBox();
    const listBox = await list.boundingBox();
    return (listBox?.y ?? -1000) - ((fieldBox?.y ?? 0) + (fieldBox?.height ?? 0));
  };
  const gapAtRest = await gap();
  await scrollTo(page, 60);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(60);
  expect(Math.abs((await gap()) - gapAtRest)).toBeLessThanOrEqual(2);
  await expect(list).toBeVisible();

  // Scroll until the field is under the header: the list is gone, not hidden.
  await scrollTo(page, before.bottom - 10);
  await expect(list).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Місто" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("an InfoTip follows its «?» on scroll, then closes when the «?» leaves the screen", async ({
  page,
}) => {
  await openRoute(page, "/dev/ui", WIDE, { readySelector: "h1" });
  const trigger = page.getByRole("button", { name: "How the list is ordered", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const card = page.getByRole("note", { name: "How the list is ordered" });
  await expect(card).toBeVisible();

  const offset = async () => {
    const t = await trigger.boundingBox();
    const c = await card.boundingBox();
    return (c?.y ?? -1000) - ((t?.y ?? 0) + (t?.height ?? 0));
  };
  const atRest = await offset();
  const y0 = await page.evaluate(() => window.scrollY);
  await scrollTo(page, y0 + 40);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y0 + 40);
  expect(Math.abs((await offset()) - atRest)).toBeLessThanOrEqual(2);
  await expect(card).toBeVisible();

  await scrollTo(page, 0);
  await expect(card).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});
