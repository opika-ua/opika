/**
 * The filter selectors (handoff `88:1906`) as flows in a real browser: a popup of pills with
 * counts on desktop, the same groups in the sheet below 1024px. Behaviour only (CLAUDE.md, "Test
 * logic, not looks"): found by role, label or text, nothing measured. Each flow also checks a
 * pill's count against the result count the page then reports - the two come from different
 * queries, so this is where a count that disagrees with the list would show.
 */

import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/** TEST-NET-2, `.47`: the next address no other harness file claims (see `gallery-filters.harness.ts`). */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.47" } });

const CARD = "[data-testid='animal-card']";

const foundCount = async (page: Page): Promise<number> => {
  const text = await page
    .getByText(/Знайдено \d+/)
    .first()
    .innerText();
  return Number(text.match(/Знайдено (\d+)/)?.[1]);
};

/** «Київ, 34 тварини» → ["Київ", 34]. */
const nameAndCount = (accessibleName: string | null): [string, number] => {
  const match = accessibleName?.match(/^(.+), (\d+) тварин/);
  if (!match) throw new Error(`not a pill's name with a count: ${accessibleName}`);
  return [match[1] as string, Number(match[2])];
};

test.describe("/tvaryny filter selectors", () => {
  test("a selector opens pills with counts, focus goes in, a pill applies at once, Esc returns focus", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", DESKTOP, { readySelector: CARD });
    const trigger = page.getByRole("button", { name: "Місто: Місто" });

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const group = page.getByRole("group", { name: "Місто" });
    await expect(group).toBeVisible();
    // Focus moved into the panel, onto a pill that can do something.
    const focused = group.locator(":focus");
    await expect(focused).toHaveCount(1);
    await expect(focused).toHaveAttribute("aria-pressed", "false");
    await expect(focused).not.toHaveAttribute("aria-disabled", "true");

    const [city, count] = nameAndCount(await focused.getAttribute("aria-label"));
    await focused.click();
    await page.waitForURL(/misto=/);
    await page.locator(CARD).first().waitFor({ state: "visible" });

    // Applied with no Apply button; the panel stayed open; the pill is pressed.
    await expect(group).toBeVisible();
    await expect(group.getByRole("button", { name: new RegExp(`^${city}, `) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: `Місто: ${city}` })).toBeVisible();
    // The count the pill promised is the count the list found.
    expect(await foundCount(page)).toBe(count);

    await page.keyboard.press("Escape");
    await expect(group).toBeHidden();
    await expect(page.getByRole("button", { name: `Місто: ${city}` })).toBeFocused();
  });

  /** The seed never buckets a cat as large (`gallery-error.harness.ts` relies on the same fact). */
  test("an option with nothing to find is disabled, but stays usable while chosen, to clear it", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny?vyd=cat", DESKTOP, { readySelector: CARD });
    await page.getByRole("button", { name: "Розмір: Розмір" }).click();
    const large = page.getByRole("button", { name: "Великий, 0 тварин" });
    await expect(large).toHaveAttribute("aria-disabled", "true");
    await large.click({ force: true });
    // A press that did anything would flip the pill at once (the toggle is optimistic).
    await expect(large).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/\/tvaryny\?vyd=cat$/);

    await openRoute(page, "/tvaryny?vyd=cat&rozmir=large", DESKTOP);
    await page.getByRole("button", { name: "Розмір: Великий" }).click();
    const chosen = page.getByRole("button", { name: "Великий, 0 тварин" });
    await expect(chosen).toHaveAttribute("aria-pressed", "true");
    await expect(chosen).not.toHaveAttribute("aria-disabled", "true");
    await chosen.click();
    await page.waitForURL((url) => !url.search.includes("rozmir="));
    await page.locator(CARD).first().waitFor({ state: "visible" });
  });

  test("a press outside closes the panel", async ({ page }) => {
    await openRoute(page, "/tvaryny", DESKTOP, { readySelector: CARD });
    await page.getByRole("button", { name: "Вік: Вік" }).click();
    const group = page.getByRole("group", { name: "Вік" });
    await expect(group).toBeVisible();

    await page.getByRole("heading", { level: 1 }).click();
    await expect(group).toBeHidden();
  });

  test("the sheet carries the same groups with counts; a ticked pill finds what it promised", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", PHONE, { readySelector: CARD });
    await page.getByTestId("filter-sheet-trigger").click();
    const sheet = page.getByTestId("filter-sheet");
    const size = sheet.getByRole("group", { name: "Розмір" });
    const small = size.getByRole("checkbox", { name: /^Малий, / });
    const [, count] = nameAndCount(await small.getAttribute("aria-label"));
    expect(count).toBeGreaterThan(0);

    await size.getByText("Малий", { exact: true }).click();
    await sheet.getByRole("button", { name: /Показати/ }).click();
    await page.waitForURL(/rozmir=small/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    expect(await foundCount(page)).toBe(count);
  });
});
