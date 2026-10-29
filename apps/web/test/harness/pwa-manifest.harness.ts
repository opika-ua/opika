/**
 * The manifest and its icons against a real server, with no gate cookie: a browser fetches them
 * without credentials, so the pre-launch gate must let exactly these through. Own forwarded IP so
 * no other spec's per-IP budget is spent.
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
    const apple = await request.get("/icons/apple-touch-icon.png");
    expect(apple.status()).toBe(200);
    expect(apple.headers()["content-type"]).toBe("image/png");
  });

  test("the gate still denies a page without a cookie", async ({ request }) => {
    expect((await request.get("/tvaryny")).status()).toBe(403);
  });
});
