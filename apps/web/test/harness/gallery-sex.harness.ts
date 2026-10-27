/**
 * Sex-filter feature: the eighth dimension, as a flow in a real browser.
 * Behaviour only (CLAUDE.md, "Test logic, not looks"): elements found by
 * role, label or text, nothing measured. Unlike fur/temperament/colour, sex
 * has no own no-match sentence - it's a closed universe over a never-null
 * field, so `NoMatch.tsx`'s generic «Прибрати «…»» template covers it, and
 * that path is already exercised by the other dimensions that share it
 * (species/size/age) - no separate no-match case here.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/** TEST-NET-2, `.46`: the next address no other harness file claims (see `gallery-filters.harness.ts`). */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.46" } });

const CARD = "[data-testid='animal-card']";

const foundCount = async (page: import("@playwright/test").Page): Promise<number> => {
  const text = await page
    .getByText(/Знайдено \d+/)
    .first()
    .innerText();
  return Number(text.match(/Знайдено (\d+)/)?.[1]);
};

test.describe("/tvaryny sex filter", () => {
  test("the «Стать» dropdown: «Дівчинка» narrows the list, writes `stat=female`, and its own ✕ clears only it", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", DESKTOP, { readySelector: CARD });
    const everyone = await foundCount(page);

    await page.getByRole("button", { name: "Стать: Стать" }).click();
    await page.getByRole("link", { name: "Дівчинка" }).click();
    await page.waitForURL(/stat=female/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const females = await foundCount(page);
    expect(females).toBeGreaterThan(0);
    expect(females).toBeLessThan(everyone);
    await expect(page.getByRole("button", { name: "Стать: Дівчинка" })).toBeVisible();

    await page.getByRole("link", { name: "Скинути Стать" }).click();
    await page.waitForURL((url) => !url.search.includes("stat="));
    await page.locator(CARD).first().waitFor({ state: "visible" });
    expect(await foundCount(page)).toBe(everyone);
  });

  test("the sheet's «Стать» group: «Хлопчик» narrows the list and writes `stat=male`", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", PHONE, { readySelector: CARD });
    const everyone = await foundCount(page);

    await page.getByTestId("filter-sheet-trigger").click();
    // The checkbox is visually `sr-only`; its wrapping <label> is what a real
    // tap lands on, as in `gallery-coat.harness.ts`.
    await page.getByText("Хлопчик", { exact: true }).click();
    await page.getByRole("button", { name: /Показати/ }).click();
    await page.waitForURL(/stat=male/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const males = await foundCount(page);
    expect(males).toBeGreaterThan(0);
    expect(males).toBeLessThan(everyone);
  });
});
