/**
 * Designer round 1, S3: the fur filter as a flow in a real browser. Behaviour
 * only (CLAUDE.md, "Test logic, not looks"): elements found by role, label or
 * text, nothing measured. Expected strings are his copy (`docs/designer-round-1.md`
 * §11), typed here, not read from the catalogue.
 *
 * The no-match case leans on the seeded corpus (`packages/db/src/seed.ts`):
 * every large dog under a year old has short fur or none recorded, so
 * `vyd=dog&rozmir=large&vik=baby&sherst=long` matches nobody while dropping
 * fur alone finds some. Ages are birth dates relative to the seed's own run,
 * so this holds on any day. Like `gallery-error.harness.ts`'s relaxation test,
 * the count is self-verifying: whatever «+N» claims, following it shows N.
 */

import { expect, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

/** TEST-NET-2, `.43`: the next address no other harness file claims (see `gallery-filters.harness.ts`). */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.43" } });

const CARD = "[data-testid='animal-card']";

const foundCount = async (page: import("@playwright/test").Page): Promise<number> => {
  const text = await page
    .getByText(/Знайдено \d+/)
    .first()
    .innerText();
  return Number(text.match(/Знайдено (\d+)/)?.[1]);
};

test.describe("/tvaryny fur filter", () => {
  /**
   * gallery-v3 (Figma `58:1617`): fur also has its own desktop dropdown
   * now (`GalleryFilterDropdowns.tsx`, GV3-Q1), but this test deliberately
   * exercises `FilterSheet` at phone width instead - its real `<form>`
   * submit is a genuinely different interaction from the dropdown's
   * click-to-navigate links, not a cosmetic selector swap, and is the only
   * path at phone width (the sheet is the gallery's sole filter UI below
   * `desktop:`).
   */
  test("«Довгошерсті» narrows the list, writes `sherst=long`, and a listed animal's page shows a «Довгошерсті» chip", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny", PHONE, { readySelector: CARD });
    const everyone = await foundCount(page);

    await page.getByTestId("filter-sheet-trigger").click();
    // The checkbox is visually `sr-only`; its wrapping <label> is what a
    // real tap lands on, the same idiom `gallery-filters.harness.ts`'s own
    // no-JS test uses for the identical reason.
    await page.getByText("Довгошерсті", { exact: true }).click();
    await page.getByRole("button", { name: /Показати/ }).click();
    await page.waitForURL(/sherst=long/);
    await page.locator(CARD).first().waitFor({ state: "visible" });
    const longHaired = await foundCount(page);
    expect(longHaired).toBeGreaterThan(0);
    expect(longHaired).toBeLessThan(everyone);

    // Pet card PR 5: coat length moved from a "Шерсть: Довга" fact row
    // (`CoatFact`, deleted) into a filterable «Про мене» chip, the filter
    // dropdown's own plural word - the same text this very filter just used.
    await page.locator(CARD).first().click();
    const overlay = page.getByRole("dialog");
    await expect(overlay.getByText("Довгошерсті", { exact: true })).toBeVisible();
  });

  test("no match because of fur offers «Будь-яка шерсть: +N», and following it shows N", async ({
    page,
  }) => {
    await openRoute(page, "/tvaryny?vyd=dog&rozmir=large&vik=baby&sherst=long", DESKTOP, {
      readySelector: "[data-testid='gallery-no-match']",
    });

    const suggestion = page.getByRole("link", { name: /^Будь-яка шерсть: \+\d+$/ });
    const claimed = Number((await suggestion.innerText()).match(/\+(\d+)/)?.[1]);
    expect(claimed).toBeGreaterThan(0);

    await suggestion.click();
    await page.locator(CARD).first().waitFor({ state: "visible" });
    expect(page.url()).not.toContain("sherst=");
    expect(page.url()).toContain("vik=baby");
    expect(await foundCount(page)).toBe(claimed);
  });
});
