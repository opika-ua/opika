/**
 * Gallery cards and the shelter page on phones: no sideways scroll at 360 and 393, the card is one
 * link with no button, «Фільтри» and the sort share one row, and at least four cards fit a 393x852
 * screen. Flows by role and label; the only measurements are accessibility floors and overflow.
 */

import { createDatabase } from "@opika/db";
import { shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, test } from "@playwright/test";
import { expectMinTargetHeight, noSidewaysScroll, openRoute } from "./harness";
import type { Viewport } from "./viewports";

/** TEST-NET-2, `.63`: unclaimed by the sibling harness files. */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.63" } });

const CARD = "[data-testid='animal-card']";
const P360: Viewport = { name: "360x740 phone", width: 360, height: 740 };
const P393: Viewport = { name: "393x852 phone", width: 393, height: 852 };
const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

for (const viewport of [P360, P393]) {
  test.describe(`gallery at ${viewport.name}`, () => {
    test("no sideways scroll; each card is one link with no button inside", async ({ page }) => {
      await openRoute(page, "/tvaryny", viewport, { readySelector: CARD });
      expect(await noSidewaysScroll(page)).toBe(true);
      const cards = page.locator(CARD);
      expect(await cards.count()).toBeGreaterThan(1);
      await expect(cards.first().getByRole("button")).toHaveCount(0);
      await expect(cards.first().getByText("Познайомитися")).toBeHidden();
    });

    test("«Фільтри» and the sort are on one row", async ({ page }) => {
      await openRoute(page, "/tvaryny", viewport, { readySelector: CARD });
      const filters = await page.getByTestId("filter-sheet-trigger").boundingBox();
      // `getByRole` skips the desktop copy (display: none on a phone).
      const sort = await page.getByRole("navigation", { name: "Сортування" }).boundingBox();
      expect(filters).not.toBeNull();
      expect(sort).not.toBeNull();
      // Same row: the two boxes overlap vertically.
      const top = Math.max(filters?.y ?? 0, sort?.y ?? 0);
      const bottom = Math.min(
        (filters?.y ?? 0) + (filters?.height ?? 0),
        (sort?.y ?? 0) + (sort?.height ?? 0),
      );
      expect(bottom).toBeGreaterThan(top);
    });
  });
}

test("at 393x852 four cards fit the first screen", async ({ page }) => {
  await openRoute(page, "/tvaryny", P393, { readySelector: CARD });
  const inView = await page
    .locator(CARD)
    .evaluateAll(
      (cards, height) =>
        cards.filter((card) => card.getBoundingClientRect().top < (height as number) - 100).length,
      P393.height,
    );
  expect(inView).toBeGreaterThanOrEqual(4);
});

test.describe("a shelter page on phones", () => {
  for (const viewport of [P360, P393]) {
    test(`no sideways scroll at ${viewport.name}; the back link is a 48px target`, async ({
      page,
    }) => {
      const db = createDatabase(HARNESS_DATABASE_URL);
      const verified = (
        await db.select({ id: shelters.id, status: shelters.verificationStatus }).from(shelters)
      ).find((row) => row.status === "verified");
      if (verified === undefined) throw new Error("the seed has no verified shelter");
      await openRoute(page, `/prytulky/${verified.id}`, viewport, { readySelector: CARD });
      expect(await noSidewaysScroll(page)).toBe(true);
      await expect(page.getByTestId("shelter-trust-line")).toBeVisible();
      await expectMinTargetHeight(page.getByTestId("shelter-back-link"));
    });
  }
});
