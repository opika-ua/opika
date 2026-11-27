/**
 * SEO PR 6: the gallery at `/` against a real server. Google reads the site name only from the
 * domain root, so `/` answers 200 with its own canonical and the WebSite data, and the former
 * gallery URL is a 308 to it. Own forwarded IP so no other spec's per-IP budget is spent.
 */
import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.150" } });

const CARD = "[data-testid='animal-card']";
const CANONICAL = "link[rel='canonical']";

test("`/` is the gallery: 200, its own canonical and the WebSite data with the root URL", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  await page.locator(CARD).first().waitFor({ state: "visible" });

  const canonical = await page.locator(CANONICAL).getAttribute("href");
  expect(new URL(canonical ?? "").pathname).toBe("/");
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
    (text) => JSON.parse(text),
  );
  const site = data.find((entry) => entry["@type"] === "WebSite");
  expect(new URL(site?.url).pathname).toBe("/");
});

for (const [from, to] of [
  ["/tvaryny", "/"],
  ["/tvaryny?vyd=dog", "/?vyd=dog"],
] as const) {
  test(`${from} -> ${to} (308)`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const location = new URL(response.headers().location ?? "", "http://x");
    expect(location.pathname + location.search).toBe(to);
  });
}

test("a link with UTM params lands on the gallery and keeps them", async ({ page }) => {
  const response = await page.goto("/?utm_source=instagram&utm_medium=bio");
  expect(response?.status()).toBe(200);
  expect(page.url()).toContain("/?utm_source=instagram&utm_medium=bio");
  await page.locator(CARD).first().waitFor({ state: "visible" });
});

test("animal and city pages keep their URLs: 200, self-canonical", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator(CARD).first().getAttribute("href");
  for (const path of [href ?? "", "/tvaryny/misto/brovary"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expect(new URL(page.url()).pathname, path).toBe(path);
    const canonical = await page.locator(CANONICAL).getAttribute("href");
    expect(new URL(canonical ?? "").pathname, path).toBe(path);
  }
});

test("the sitemap lists `/` once and no `/tvaryny` entry", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1] ?? "").pathname,
  );
  expect(locs.filter((path) => path === "/")).toHaveLength(1);
  expect(locs).not.toContain("/tvaryny");
});
