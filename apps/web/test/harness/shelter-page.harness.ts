/**
 * Designer round 1, S6: the shelter page in a real browser. Flows only, found
 * by role, label and text (CLAUDE.md, "Test logic, not looks"): the way from
 * an animal to its shelter's page, what that page lists, the 404 for a shelter
 * adopters can't see, and the keyboard reaching every card and the pages.
 *
 * His copy is transcribed from his message (`docs/designer-round-1.md` §11
 * item 4), never read from the catalogue. Its own `x-forwarded-for` addresses
 * (TEST-NET-2, .51 to .53), one per group, for the same reason as its
 * siblings: `proxy.ts`'s limiter is per IP, and it covers `/prytulky` too.
 */

import { createDatabase } from "@opika/db";
import { shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DETAIL_DESKTOP } from "./viewports";

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const ipHeaders = (lastOctet: number) => ({ "x-forwarded-for": `198.51.100.${lastOctet}` });

const CARD = "[data-testid='animal-card']";
/** His `detail.shelterRowLink`: «Сторінка притулку «{name}»». */
const ROW_LINK = /^Сторінка притулку «(.+)»$/;
/** His `shelterPage.animalsHeading`: «Шукають дім: {count}». */
const ANIMALS_LIST = /^Шукають дім: \d+$/;

/** A gallery card's animal, read from the gallery before anything is clicked. */
async function firstGalleryAnimal(page: Page) {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const card = page.locator(CARD).first();
  const href = await card.getAttribute("href");
  const name = (await card.getByTestId("card-name").textContent())?.trim() ?? "";
  expect(href, "a gallery card links to its animal").toMatch(/^\/tvaryny\/[0-9a-f-]{36}$/);
  return { href: href as string, name };
}

/** The animal page's shelter row link, and the shelter name its accessible name gives. */
async function shelterRowLinkOn(scope: Page | ReturnType<Page["getByRole"]>) {
  const link = scope.getByRole("link", { name: ROW_LINK });
  await expect(link).toHaveCount(1);
  const label = (await link.getAttribute("aria-label")) ?? "";
  const shelterName = ROW_LINK.exec(label)?.[1] ?? "";
  expect(shelterName.length, "the row link names the shelter").toBeGreaterThan(0);
  return { link, shelterName };
}

test.describe("from an animal to its shelter's page", () => {
  test.use({ extraHTTPHeaders: ipHeaders(51) });

  test("gallery → the animal's full page → its shelter row → the shelter page, which lists the animal", async ({
    page,
  }) => {
    const animal = await firstGalleryAnimal(page);
    // The full page: a document load of the card's URL, never the overlay.
    await page.goto(animal.href, { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1, name: animal.name })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const { link, shelterName } = await shelterRowLinkOn(page);
    await link.click();

    await expect(page).toHaveURL(/\/prytulky\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shelterName);
    const list = page.getByRole("list", { name: ANIMALS_LIST });
    await expect(list).toBeVisible();
    await expect(list.locator(`a[href="${animal.href}"]`)).toHaveCount(1);
    // The sentence and «Слова притулку» are here, under their (screen-reader) heading, and the
    // animal page this came from showed neither (pinned in the unit suite).
    await expect(page.getByRole("heading", { level: 2, name: "Слова притулку" })).toBeVisible();
  });

  test("the gallery's overlay of the animal page leads to the shelter page too, leaving no overlay", async ({
    page,
  }) => {
    const animal = await firstGalleryAnimal(page);
    await page.locator(CARD).first().click();
    const dialog = page.getByRole("dialog", { name: animal.name });
    await expect(dialog).toBeVisible();

    const { link, shelterName } = await shelterRowLinkOn(dialog);
    await link.click();

    await expect(page).toHaveURL(/\/prytulky\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shelterName);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("a shelter adopters can't see", () => {
  test.use({ extraHTTPHeaders: ipHeaders(52) });

  test("a suspended shelter's id answers the 404 page, with nothing of the shelter on it", async ({
    page,
  }) => {
    const db = createDatabase(HARNESS_DATABASE_URL);
    const suspended = (
      await db
        .select({
          id: shelters.id,
          displayName: shelters.displayName,
          status: shelters.verificationStatus,
        })
        .from(shelters)
    ).find((row) => row.status === "suspended");
    if (suspended === undefined) throw new Error("the seed has no suspended shelter");

    await page.setViewportSize({ width: DETAIL_DESKTOP.width, height: DETAIL_DESKTOP.height });
    const response = await page.goto(`/prytulky/${suspended.id}`, { waitUntil: "load" });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "НЕ ЗНАЙДЕНО" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Усі тварини" })).toHaveAttribute(
      "href",
      "/tvaryny",
    );
    await expect(page.getByText(suspended.displayName)).toHaveCount(0);
  });
});

test.describe("the keyboard on the shelter page", () => {
  test.use({ extraHTTPHeaders: ipHeaders(53) });

  test("Tab reaches every card and the pagination, and a page link stays on this shelter's page", async ({
    page,
  }) => {
    // The seeded shelter with the most animals has more than one page.
    const db = createDatabase(HARNESS_DATABASE_URL);
    const verified = (
      await db.select({ id: shelters.id, status: shelters.verificationStatus }).from(shelters)
    ).filter((row) => row.status === "verified");
    let paged: string | null = null;
    for (const { id } of verified) {
      await openRoute(page, `/prytulky/${id}`, DETAIL_DESKTOP);
      if ((await page.getByRole("navigation", { name: "Сторінки" }).count()) > 0) {
        paged = id;
        break;
      }
    }
    if (paged === null) throw new Error("no seeded shelter has a second page of animals");

    const list = page.getByRole("list", { name: ANIMALS_LIST });
    const cardHrefs = await list
      .locator(CARD)
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("href")));
    expect(cardHrefs.length).toBeGreaterThan(0);
    const nextPage = page.getByRole("navigation", { name: "Сторінки" }).getByRole("link", {
      name: "Далі →",
    });

    const reached = new Set<string>();
    let pagination = false;
    for (let press = 0; press < cardHrefs.length + 30 && !pagination; press += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => ({
        href: document.activeElement?.getAttribute("href") ?? null,
        card: document.activeElement?.matches("[data-testid='animal-card']") ?? false,
      }));
      if (focused.card && focused.href) reached.add(focused.href);
      pagination = await nextPage.evaluate((el) => el === document.activeElement);
    }
    expect([...reached].sort()).toEqual([...cardHrefs].sort());
    expect(pagination, "Tab reached «Далі →»").toBe(true);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/prytulky/${paged}\\?stor=2$`));
    await expect(page.getByRole("list", { name: ANIMALS_LIST })).toBeVisible();
  });
});
