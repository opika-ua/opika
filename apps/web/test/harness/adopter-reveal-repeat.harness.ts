/**
 * The contact reveal from the adopter's side: the first reveal records the shelter's contact, and a
 * repeat reveal of the same animal (reload, same session) answers with the very same record rather
 * than a new one. Seeded animals, the harness's own server. Own `x-forwarded-for` (TEST-NET-2 .73).
 */

import { expect, type Page, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.73" } });

const REVEAL_URL = /\/api\/rpc\/animals\/reveal$/;

async function reveal(page: Page): Promise<string> {
  const answered = page.waitForResponse(
    (response) =>
      REVEAL_URL.test(new URL(response.url()).pathname) && response.request().method() === "POST",
  );
  await page.getByTestId("reveal-trigger").click();
  const response = await answered;
  expect(response.status()).toBe(200);
  const dialog = page.getByRole("dialog", { name: "Як звʼязатися з притулком" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("reveal-contact-row").first()).toBeVisible();
  return response.text();
}

test("first reveal shows the contact; a repeat reveal of the same animal returns the same record", async ({
  page,
}) => {
  await page.goto("/tvaryny");
  const card = page.locator("[data-testid='animal-card']").first();
  const href = await card.getAttribute("href");
  expect(href).not.toBeNull();
  await page.goto(href as string);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const first = await reveal(page);
  expect(first.length).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reveal-dialog")).toHaveCount(0);

  // Same session, fresh page load: the second reveal must be the stored one, not a new record.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await reveal(page)).toBe(first);
});
