import { test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.91" } });
test("zz animal page html bytes", async ({ page, request }) => {
  await page.goto("/tvaryny/gortaty");
  await page.waitForSelector("[data-testid='animal-card']");
  const hrefs = await page
    .locator("[data-testid='animal-card']")
    .evaluateAll((els) => els.slice(0, 5).map((el) => el.getAttribute("href") ?? ""));
  const out: string[] = [];
  for (const h of hrefs) out.push(`${h} ${(await (await request.get(h)).body()).length}`);
  throw new Error(`ZZBYTES ${JSON.stringify(out)}`);
});
