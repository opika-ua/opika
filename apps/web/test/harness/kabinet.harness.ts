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

/**
 * The read-only profile at `/kabinet` (KS-Q1). Its geometry needs a signed-in
 * shelter admin on a production build, which can't exist until the invite PR
 * turns production sign-in on (KS-T3). Written now so the checks exist, and
 * marked `fixme` (never silently skipped): the invite PR turns them on,
 * signing a seeded admin in through the real magic-link route.
 */
test.describe("/kabinet read-only profile (needs production sign-in, invite PR)", () => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test.fixme(`at ${viewport.width}px: no horizontal scroll, every row's value fits its card`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/kabinet");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      for (const value of await page.locator("dd").all()) {
        const box = await value.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
      }
    });
  }

  test.fixme("sign-out is a 48px target with a visible focus ring", async ({ page }) => {
    await page.goto("/kabinet");
    const signOut = page.getByRole("button").first();
    const box = await signOut.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    await page.keyboard.press("Tab");
    await expect(signOut).toBeFocused();
    const outline = await signOut.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });
});
