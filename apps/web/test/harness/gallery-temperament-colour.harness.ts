/**
 * Pet card PR 1b: the temperament and colour filters as flows in a real
 * browser, through the real query. Behaviour only (CLAUDE.md, "Test logic, not
 * looks"): elements found by role, label or text, nothing measured. Expected
 * strings are typed here, not read from the catalogue: his approved group
 * names and option words (PC1b-T2, PC-Q2, PC1-D4), and the two suggestion
 * sentences (inbox PC1b-C1).
 *
 * The no-match cases lean on the seeded corpus (`packages/db/src/seed.ts`): no
 * cream animal carries a temperament preset, so
 * `kharakter=playful&zabarvlennia=cream` matches nobody while dropping either
 * filter finds some. `seed-corpus.test.ts` pins that, so a seed change fails
 * there first. Like `gallery-coat.harness.ts`, each count is self-verifying:
 * whatever «+N» claims, following it shows N.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/** TEST-NET-2, `.45`: the next address no other harness file claims (see `gallery-filters.harness.ts`). */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.45" } });

const CARD = "[data-testid='animal-card']";
const NO_MATCH = "[data-testid='gallery-no-match']";

const foundCount = async (page: import("@playwright/test").Page): Promise<number> => {
  const text = await page
    .getByText(/Знайдено \d+/)
    .first()
    .innerText();
  return Number(text.match(/Знайдено (\d+)/)?.[1]);
};

test.describe("/tvaryny temperament and colour filters", () => {
  test("the «Характер» dropdown: «Соромʼязливі» narrows the list and writes `kharakter=shy`", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", DESKTOP, { readySelector: CARD });
    const everyone = await foundCount(page);

    await page.getByRole("button", { name: "Характер: Характер" }).click();
    await page.getByRole("link", { name: "Соромʼязливі" }).click();
    await page.waitForURL(/kharakter=shy/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const shy = await foundCount(page);
    expect(shy).toBeGreaterThan(0);
    expect(shy).toBeLessThan(everyone);
    await expect(page.getByRole("button", { name: "Характер: Соромʼязливі" })).toBeVisible();

    // Its own ✕ clears it, and only it.
    await page.getByRole("link", { name: "Скинути Характер" }).click();
    await page.waitForURL((url) => !url.search.includes("kharakter="));
    await page.locator(CARD).first().waitFor({ state: "visible" });
    expect(await foundCount(page)).toBe(everyone);
  });

  test("the sheet's «Забарвлення» group: «Смугасте» narrows the list and writes `zabarvlennia=tabby`", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", PHONE, { readySelector: CARD });
    const everyone = await foundCount(page);

    await page.getByTestId("filter-sheet-trigger").click();
    // The checkbox is visually `sr-only`; its wrapping <label> is what a real
    // tap lands on, as in `gallery-coat.harness.ts`.
    await page.getByText("Смугасте", { exact: true }).click();
    await page.getByRole("button", { name: /Показати/ }).click();
    await page.waitForURL(/zabarvlennia=tabby/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const tabby = await foundCount(page);
    expect(tabby).toBeGreaterThan(0);
    expect(tabby).toBeLessThan(everyone);
  });

  test("no match offers «Будь-який характер: +N», and following it shows N", async ({ page }) => {
    await openRoute(page, "/tvaryny?kharakter=playful&zabarvlennia=cream", DESKTOP, {
      readySelector: NO_MATCH,
    });

    const suggestion = page.getByRole("link", { name: /^Будь-який характер: \+\d+$/ });
    const claimed = Number((await suggestion.innerText()).match(/\+(\d+)/)?.[1]);
    expect(claimed).toBeGreaterThan(0);

    await suggestion.click();
    await page.locator(CARD).first().waitFor({ state: "visible" });
    expect(page.url()).not.toContain("kharakter=");
    expect(page.url()).toContain("zabarvlennia=cream");
    expect(await foundCount(page)).toBe(claimed);
  });

  test("no match offers «Будь-яке забарвлення: +N», and following it shows N", async ({ page }) => {
    await openRoute(page, "/tvaryny?kharakter=playful&zabarvlennia=cream", DESKTOP, {
      readySelector: NO_MATCH,
    });

    const suggestion = page.getByRole("link", { name: /^Будь-яке забарвлення: \+\d+$/ });
    const claimed = Number((await suggestion.innerText()).match(/\+(\d+)/)?.[1]);
    expect(claimed).toBeGreaterThan(0);

    await suggestion.click();
    await page.locator(CARD).first().waitFor({ state: "visible" });
    expect(page.url()).not.toContain("zabarvlennia=");
    expect(page.url()).toContain("kharakter=playful");
    expect(await foundCount(page)).toBe(claimed);
  });
});
