/**
 * Owner-requested regression guard (a geometry check, an exception to "test logic, not looks"):
 * on a 393 px phone a focused text field's focus ring, in a `flush` FormSection inside the Card's
 * `overflow-clip`, lies fully inside the Card, so the ring is not cut on the left and right.
 * Read from computed styles, not hard-coded numbers. Fictional verified shelter. Named zz-* to run
 * last (see fictional-shelter.ts). Own `x-forwarded-for` (.96).
 */

import { expect, test } from "@playwright/test";
import { createFixture, HARNESS_DATABASE_URL, LOCATION_ENV, signedIn } from "./fictional-shelter";
import { startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.96";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

test("393 px: a focused text field's ring lies inside its flush FormSection's Card", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const server = await startSignInServer(HARNESS_DATABASE_URL, LOCATION_ENV);
  const fixture = await createFixture("flushring", (operatorId, now) => ({
    status: "verified",
    verifiedAt: now,
    verifiedBy: operatorId,
    evidence: { items: [], submittedAt: now },
  }));
  const admin = await signedIn(browser, server, fixture.adminEmail, FORWARDED_FOR);
  try {
    const page = await admin.newPage();
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(`/kabinet/tvaryny/${fixture.animalId}`);

    const card = page.locator("section#basics");
    const field = card.locator("input:not([type])").first();
    await expect(field).toBeVisible();
    await field.focus();

    const measured = await page.evaluate(() => {
      const section = document.querySelector("section#basics");
      const input = section?.querySelector("input:not([type])");
      if (!section || !input) throw new Error("no flush section with a text field");
      // The ring is drawn on the control (the input, or the wrapper that has focus-within).
      const ringed = [input, input.parentElement].flatMap((el) => (el ? [el] : []));
      const ringHost = ringed.find((el) => getComputedStyle(el).outlineStyle !== "none") ?? input;
      const style = getComputedStyle(ringHost);
      const reach = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
      const box = ringHost.getBoundingClientRect();
      const frame = section.getBoundingClientRect();
      return {
        reach,
        width: Number.parseFloat(style.outlineWidth),
        offset: Number.parseFloat(style.outlineOffset),
        ringLeft: box.left - reach,
        ringRight: box.right + reach,
        cardLeft: frame.left,
        cardRight: frame.right,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });

    // The global focus-ring (3px + 3px) must not win over the text field's thinner 2px + 2px ring.
    expect([measured.width, measured.offset], "outline width and offset").toEqual([2, 2]);
    expect(measured.ringLeft, "ring inside the Card on the left").toBeGreaterThanOrEqual(
      measured.cardLeft - 0.5,
    );
    expect(measured.ringRight, "ring inside the Card on the right").toBeLessThanOrEqual(
      measured.cardRight + 0.5,
    );
    expect(measured.scrollWidth, "no horizontal page scroll").toBeLessThanOrEqual(
      measured.clientWidth,
    );
  } finally {
    await admin.close();
    await server.stop();
  }
});
