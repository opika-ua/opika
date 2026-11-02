/**
 * BR-7 against a real server: the animal page's og:image and twitter:image point at a route that
 * answers a 1200x630 PNG, and the site card is fetchable without the pre-launch gate cookie.
 */

import { expect, test } from "@playwright/test";
import { HARNESS_PRELAUNCH_GATE_SECRET } from "../harness-env";
import { openRoute } from "./harness";
import { DETAIL_DESKTOP } from "./viewports";

// The gate opens by query parameter here: the APIRequestContext does not send the Secure gate cookie over http.
const GATE = `gate=${HARNESS_PRELAUNCH_GATE_SECRET}`;
const CARD = "[data-testid='animal-card']";
// TEST-NET-3: this file's own request budget, apart from the other specs' addresses.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.41" } });

function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("an animal page's preview tags point at a 1200x630 PNG that renders", async ({ page }) => {
  await openRoute(page, "/tvaryny", DETAIL_DESKTOP, { readySelector: CARD });
  const href = await page.locator(CARD).first().getAttribute("href");
  await page.goto(href as string);

  const meta = (selector: string) => page.locator(selector).first().getAttribute("content");
  const ogImage = await meta("meta[property='og:image']");
  const twitterImage = await meta("meta[name='twitter:image']");
  expect(await meta("meta[name='twitter:card']")).toBe("summary_large_image");
  expect(await meta("meta[property='og:image:width']")).toBe("1200");
  expect(await meta("meta[property='og:image:height']")).toBe("630");
  expect(ogImage).toContain("/opengraph-image");
  expect(twitterImage).toContain("/opengraph-image");

  // The tag carries the public origin; the test server answers on its own host.
  const path = new URL(ogImage as string).pathname + new URL(ogImage as string).search;
  const response = await page.request.get(`${path}${path.includes("?") ? "&" : "?"}${GATE}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const body = await response.body();
  expect(pngSize(body)).toEqual({ width: 1200, height: 630 });
  // A seeded animal has a photo, so this is well beyond the few KB of an empty card.
  expect(body.length).toBeGreaterThan(50_000);
});

test("the site card renders without the gate cookie, an unknown animal falls back to a card", async ({
  playwright,
  baseURL,
}) => {
  const anonymous = await playwright.request.newContext({
    baseURL: baseURL as string,
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.41" },
  });
  const site = await anonymous.get("/opengraph-image");
  expect(site.status()).toBe(200);
  expect(pngSize(await site.body())).toEqual({ width: 1200, height: 630 });
  // The per-animal image stays behind the gate with its page.
  expect(
    (await anonymous.get("/tvaryny/00000000-0000-4000-8000-000000000000/opengraph-image")).status(),
  ).toBe(403);
  const missing = await anonymous.get(
    `/tvaryny/00000000-0000-4000-8000-000000000000/opengraph-image?${GATE}`,
  );
  expect(missing.status()).toBe(200);
  expect(pngSize(await missing.body())).toEqual({ width: 1200, height: 630 });
  await anonymous.dispose();
});
