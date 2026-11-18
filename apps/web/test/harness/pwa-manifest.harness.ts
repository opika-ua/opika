/**
 * The manifest, its icons, the favicons and the home page's structured data against a real
 * server, without credentials, as a browser fetches them. Own forwarded IP so no other spec's
 * per-IP budget is spent.
 */
import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.61" } });

test.describe("web app manifest, against a real server", () => {
  test("serves valid JSON with a manifest content type, and the icons it lists", async ({
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/application\/(manifest\+)?json/);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    const manifest = await response.json();
    expect(manifest.start_url).toBe("/tvaryny");
    expect(manifest.display).toBe("standalone");

    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const file = await request.get(icon.src);
      expect(file.status(), icon.src).toBe(200);
      expect(file.headers()["content-type"], icon.src).toBe(icon.type);
    }
    const apple = await request.get("/apple-icon.png");
    expect(apple.status()).toBe(200);
    expect(apple.headers()["content-type"]).toBe("image/png");
  });

  test("the page head keeps the svg favicon and adds the apple touch icon", async ({ page }) => {
    await page.goto("/tvaryny");
    await expect(page.locator('link[rel="icon"][href*="/icon.svg"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"][href*="/apple-icon.png"]')).toHaveCount(
      1,
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test("serves /favicon.ico and declares it with the 48 and 192px PNG favicons", async ({
    page,
    request,
  }) => {
    const ico = await request.get("/favicon.ico", { maxRedirects: 0 });
    expect(ico.status()).toBe(200);
    expect(ico.headers()["content-type"]).toMatch(/^image\/(x-icon|vnd\.microsoft\.icon)/);

    await page.goto("/tvaryny");
    await expect(page.locator('link[rel="icon"][href*="/favicon.ico"]')).toHaveCount(1);
    for (const [file, sizes] of [
      ["/icon1.png", "48x48"],
      ["/icon2.png", "192x192"],
    ] as const) {
      const link = page.locator(`link[rel="icon"][href*="${file}"]`);
      await expect(link).toHaveAttribute("sizes", sizes);
      await expect(link).toHaveAttribute("type", "image/png");
      const png = await request.get((await link.getAttribute("href")) ?? file, {
        maxRedirects: 0,
      });
      expect(png.status(), file).toBe(200);
      expect(png.headers()["content-type"], file).toBe("image/png");
    }
  });

  test("structured data: WebSite and Organization on the home page only", async ({ page }) => {
    const emittedTypes = async () =>
      (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
        (text) => JSON.parse(text)["@type"],
      );
    await page.goto("/tvaryny");
    expect(await emittedTypes()).toEqual(["WebSite", "Organization"]);
    await page.goto("/pro");
    expect(await emittedTypes()).toEqual([]);
  });
});
