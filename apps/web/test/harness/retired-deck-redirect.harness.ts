/**
 * The retired swipe deck's URLs against a real server: 308 to the gallery, sub-path and query
 * included. Own forwarded IP so no other spec's per-IP budget is spent.
 */
import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.62" } });

test.describe("the retired deck routes redirect to the gallery", () => {
  for (const [from, to] of [
    ["/tvaryny/gortaty", "/tvaryny"],
    ["/tvaryny/gortaty/extra/path", "/tvaryny"],
    ["/tvaryny/gortaty?vyd=cat&total=5", "/tvaryny?vyd=cat&total=5"],
    ["/discovery", "/tvaryny"],
  ] as const) {
    test(`${from} -> ${to} (308)`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      const location = new URL(response.headers().location ?? "", "http://x");
      expect(location.pathname + location.search).toBe(to);
    });
  }
});
