/**
 * The shelter page's filters in a real browser: they appear only above 12 animals, work through
 * links on the shelter's own path (shareable, Back-correct), never offer Область or Місто, and the
 * page stays free of sideways scroll at 360, 393 and 1440. Found by role, label and text.
 */

import { createDatabase } from "@opika/db";
import { shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import type { Viewport } from "./viewports";

/** TEST-NET-2, `.64`: unclaimed by the sibling harness files. */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.64" } });

const CARD = "[data-testid='animal-card']";
const P360: Viewport = { name: "360x740 phone", width: 360, height: 740 };
const P393: Viewport = { name: "393x852 phone", width: 393, height: 852 };
const D1440: Viewport = { name: "1440x900 desktop", width: 1440, height: 900 };
const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** A seeded verified shelter with more than 12 animals  (the seeded shelters each hold one species, so the switch itself is covered by unit tests); at 12 or fewer the loader's unit tests apply. */
async function shelterPaths(page: Page) {
  const db = createDatabase(HARNESS_DATABASE_URL);
  const verified = (
    await db.select({ id: shelters.id, status: shelters.verificationStatus }).from(shelters)
  ).filter((row) => row.status === "verified");
  for (const { id } of verified) {
    await openRoute(page, `/prytulky/${id}`, P393, { readySelector: CARD });
    if ((await page.getByTestId("filter-sheet-trigger").count()) > 0) return { many: id };
  }
  throw new Error("no seeded shelter has more than 12 animals");
}

test("a shelter with more than 12 animals offers the filters, and a one-species shelter has no species switch", async ({
  page,
}) => {
  const { many } = await shelterPaths(page);
  await openRoute(page, `/prytulky/${many}`, P393, { readySelector: CARD });
  await expect(page.getByTestId("filter-sheet-trigger")).toBeVisible();
  await expect(page.getByTestId("species-toggle-mobile")).toHaveCount(0);
});

for (const viewport of [P360, P393]) {
  test(`phone ${viewport.name}: no sideways scroll, 48px «Фільтри», the sheet has no Область or Місто`, async ({
    page,
  }) => {
    const { many } = await shelterPaths(page);
    await openRoute(page, `/prytulky/${many}`, viewport, { readySelector: CARD });
    expect(await noSidewaysScroll(page)).toBe(true);
    const trigger = page.getByTestId("filter-sheet-trigger");
    expect((await trigger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "Фільтри" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Вік")).toBeVisible();
    await expect(sheet.getByText("Область")).toHaveCount(0);
    await expect(sheet.getByText("Місто")).toHaveCount(0);
  });
}

test("a filter in the URL: chip, count line, and «Скинути» back to the bare shelter page", async ({
  page,
}) => {
  const { many } = await shelterPaths(page);
  await openRoute(page, `/prytulky/${many}?rozmir=small`, P393, { readySelector: CARD });
  await expect(page.getByText(/^Знайдено \d+ тварин/).first()).toBeVisible();
  // The heading keeps the shelter's whole count.
  await expect(page.getByRole("heading", { level: 2, name: /^Шукають дім: \d+$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Прибрати фільтр/ })).toBeVisible();
  await page.getByRole("link", { name: "Скинути" }).click();
  await page.waitForURL((url) => url.pathname === `/prytulky/${many}` && url.search === "");
});

test("desktop 1440: Вік, Розмір, Стать, no Область or Місто, no sideways scroll; canonical stays the bare URL", async ({
  page,
}) => {
  const { many } = await shelterPaths(page);
  await openRoute(page, `/prytulky/${many}?rozmir=small`, D1440, { readySelector: CARD });
  expect(await noSidewaysScroll(page)).toBe(true);
  const row = page.getByTestId("gallery-filter-dropdowns");
  for (const name of ["Вік", "Розмір", "Стать"]) {
    await expect(row.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(row.getByRole("combobox", { name: /Область|Місто/ })).toHaveCount(0);
  await expect(page.locator("link[rel='canonical']")).toHaveAttribute(
    "href",
    new RegExp(`/prytulky/${many}$`),
  );
});
