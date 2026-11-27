/**
 * The gallery's server HTML preloads exactly one card photo, the LCP one, at high priority.
 * React's SSR preloads every image that is neither lazy nor low priority, so the first row's
 * eager photos once went into `<head>` beside it and shared a phone's bandwidth (PSI, 2026-11-16).
 */

import { expect, test } from "@playwright/test";

/** TEST-NET-2, `.97`: unclaimed by the sibling harness files. */
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.97" } });

const IMAGE_PRELOAD = /<link\b[^>]*\brel="preload"[^>]*\bas="image"[^>]*>/gi;

test("only the LCP card photo is preloaded, and at high priority", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();

  // The first row's other photos are on the page, fetched at low priority instead.
  expect(html.match(/<img\b[^>]*\bfetchPriority="low"/gi)?.length ?? 0).toBeGreaterThan(0);

  // Card photos carry a srcset; the header logo's preload is a plain href.
  const cardPreloads = (html.match(IMAGE_PRELOAD) ?? []).filter((link) =>
    /\bimageSrcSet=/i.test(link),
  );
  expect(cardPreloads).toHaveLength(1);
  expect(cardPreloads[0]).toMatch(/\bfetchPriority="high"/i);
});
