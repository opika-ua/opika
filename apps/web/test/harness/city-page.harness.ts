/**
 * SEO B3: the city landing page against a real server and the seeded corpus (Brovary, slug
 * `brovary`, has verified shelters' animals). Flows only, found by role, text and the served
 * `<head>`: the page answers, its canonical keeps the page number and drops the rest, an unknown
 * city 404s, `?misto=` keeps working with the city page as its canonical, and the animal page
 * links back to the city page.
 */

import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { openRoute } from "./harness";
import { DESKTOP, PHONE } from "./viewports";

// TEST-NET-2, a fixed address of its own: `proxy.ts` rate-limits `/` pages per IP.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.131" } });

const CITY_PAGE = "/tvaryny/misto/brovary";
const CARD = "[data-testid='animal-card']";
const CANONICAL = "link[rel='canonical']";

test("the city page answers with its heading, the approved intro, the city's cards and B2's title", async ({
  page,
}) => {
  const response = await page.goto(CITY_PAGE);
  expect(response?.status()).toBe(200);
  await page.locator(CARD).first().waitFor({ state: "visible" });

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Шукають дім: Бровари");
  await expect(
    page.getByText(
      "Тварини з притулків і від волонтерів із міста Бровари. Оберіть тварину й напишіть напряму – контакти на кожній картці.",
    ),
  ).toBeVisible();
  const title = await page.title();
  expect(title).toMatch(/^Взяти (собаку|кота|собаку чи кота) з притулку – Бровари( – Opika)?$/u);
  await expect(page.locator(CANONICAL)).toHaveAttribute("href", /\/tvaryny\/misto\/brovary$/);
});

test("the canonical keeps the page number and drops the sort and the filters", async ({ page }) => {
  await page.goto(`${CITY_PAGE}?vyd=dog&sort=longest_waiting&stor=2`);
  await expect(page.locator(CANONICAL)).toHaveAttribute(
    "href",
    /\/tvaryny\/misto\/brovary\?stor=2$/,
  );
});

test("a city with no page is a real 404, never an empty page", async ({ page }) => {
  const response = await page.goto("/tvaryny/misto/atlantis");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found-action")).toBeVisible();
});

test("?misto= keeps working, no redirect, with the city page as its canonical", async ({
  page,
}) => {
  await openRoute(page, "/?misto=brovary&stor=1", DESKTOP, { readySelector: CARD });
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.locator(CANONICAL)).toHaveAttribute("href", /\/tvaryny\/misto\/brovary$/);
});

test("a filter picked on the city page keeps the visitor there", async ({ page }) => {
  await openRoute(page, CITY_PAGE, DESKTOP, { readySelector: CARD });
  await page.getByTestId("species-cat").click();
  await page.waitForURL(
    (url) => url.pathname === "/tvaryny/misto/brovary" && url.search === "?vyd=cat",
  );
});

test("an animal page's way back is the city page", async ({ page }) => {
  await openRoute(page, CITY_PAGE, PHONE, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  await page.goto(href?.split("?")[0] as string);
  await expect(page.getByRole("link", { name: "Тварини – Бровари" })).toHaveAttribute(
    "href",
    "/tvaryny/misto/brovary",
  );
});

/** Every breadcrumb item of the page the browser is on: positions from 1, each URL answering 200. */
async function expectBreadcrumbItemsAnswer(
  page: Page,
  request: APIRequestContext,
  expectedPaths: readonly string[],
) {
  const lists = (await page.locator('script[type="application/ld+json"]').allTextContents())
    .map((text) => JSON.parse(text))
    .filter((entry) => entry["@type"] === "BreadcrumbList");
  expect(lists).toHaveLength(1);
  const items = lists[0].itemListElement as { position: number; item: string }[];
  expect(items.map((i) => i.position)).toEqual(items.map((_, index) => index + 1));
  expect(items.map((i) => new URL(i.item).pathname)).toEqual(expectedPaths);
  for (const { item } of items) {
    // The page links to the production origin; the server under test answers the same path.
    const response = await request.get(new URL(item).pathname, { maxRedirects: 0 });
    expect(response.status(), item).toBe(200);
  }
}

test("the city page's breadcrumbs are gallery > city, and every item answers 200", async ({
  page,
  request,
}) => {
  await page.goto(CITY_PAGE);
  await expectBreadcrumbItemsAnswer(page, request, ["/", CITY_PAGE]);
});

test("an animal page's breadcrumbs are gallery > city > animal, and every item answers 200", async ({
  page,
  request,
}) => {
  await openRoute(page, CITY_PAGE, PHONE, { readySelector: CARD });
  const animalPath = ((await page.locator(CARD).first().getAttribute("href")) as string).split(
    "?",
  )[0] as string;
  await page.goto(animalPath);
  await expectBreadcrumbItemsAnswer(page, request, ["/", CITY_PAGE, animalPath]);
});

test("a card on the city page opens the animal in the overlay, over the city page", async ({
  page,
}) => {
  await openRoute(page, CITY_PAGE, DESKTOP, { readySelector: CARD });
  const card = page.locator(CARD).first();
  const href = (await card.getAttribute("href")) as string;
  await card.click();
  await page.waitForURL((url) => url.pathname === href.split("?")[0]);
  await expect(page.getByRole("dialog")).toBeVisible();
  // The city page stays underneath: the overlay is drawn over it, not a full navigation.
  await expect(page.getByRole("heading", { level: 1, name: "Шукають дім: Бровари" })).toHaveCount(
    1,
  );
});
