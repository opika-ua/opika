/**
 * The kabinet's pages behind the 503 (Oleksii, Q0: "screens PR first, behind
 * the 503"). This harness serves a production build, where kabinet sign-in is
 * always unavailable until the invite PR adds an email sender
 * (`kabinetAuthAvailability`), so every `/kabinet` page must answer 404 here,
 * the same condition under which `/api/kabinet/*` answers 503.
 *
 * The K1 layout, 360px and focus checks can't run against this server yet:
 * the page has no available state in production. They land with the invite
 * PR, when production sign-in turns on. Until then, K1's behaviour is pinned
 * by `src/features/kabinet/SignInCard.test.tsx` (component level, which
 * measures no geometry).
 *
 * Own `x-forwarded-for` (TEST-NET-2 .34), so proxy.ts's shared limiter budget
 * isn't drawn from another harness file's.
 */

import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.34" } });

for (const path of ["/kabinet", "/kabinet/vkhid"]) {
  test(`${path} answers 404 while kabinet sign-in is unavailable`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  });
}
