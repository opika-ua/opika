import { expect, type Page } from "@playwright/test";

/**
 * The kit's one rule for toasts (owner, 2026-11-12): a shown toast sits above every fixed bottom
 * bar, so none of the bar's controls is covered. Checks the toast holding `text` against every
 * marked bar on screen (`BOTTOM_BAR`, fixed or sticky, displayed): their boxes don't cross, and
 * each enabled control in the bar still takes a click there (Playwright's hit-target check, no
 * click made). Returns how many bars were on screen, for the caller to expect.
 */
export async function expectToastClearOfBottomBars(page: Page, text: string): Promise<number> {
  const toast = page.locator('[aria-live="polite"] > div').filter({ hasText: text });
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox();
  if (box === null) throw new Error(`the toast «${text}» has no box`);
  let bars = 0;
  for (const bar of await page.locator("[data-bottom-bar]").all()) {
    if (!(await bar.isVisible())) continue;
    const position = await bar.evaluate((element) => getComputedStyle(element).position);
    if (position !== "fixed" && position !== "sticky") continue;
    const barBox = await bar.boundingBox();
    if (barBox === null) continue;
    bars += 1;
    const apart = box.y + box.height <= barBox.y || barBox.y + barBox.height <= box.y;
    expect(
      apart,
      `the toast (${box.y}–${box.y + box.height}) crosses a bar (${barBox.y}–${barBox.y + barBox.height})`,
    ).toBe(true);
    for (const control of await bar.locator("a, button:not([disabled])").all()) {
      if (await control.isVisible()) await control.click({ trial: true, timeout: 2000 });
    }
  }
  return bars;
}
