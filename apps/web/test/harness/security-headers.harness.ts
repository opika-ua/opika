/**
 * Audit F5, against the real server: the security headers reach real
 * responses (a page, an API answer), and the report-only policy reports
 * nothing on the pages a visitor opens first, so enforcing it
 * later would not break them. Its own `x-forwarded-for`, so its requests never
 * spend another spec's per-IP budget.
 */
import { harnessPort } from "@opika/db/test";
import { expect, type Page, test } from "@playwright/test";
import { PRELAUNCH_GATE_QUERY_PARAM } from "../../src/api/prelaunch-gate";
import { HARNESS_PRELAUNCH_GATE_SECRET } from "../harness-env";

const ORIGIN = `http://127.0.0.1:${harnessPort()}`;

const IP_HEADERS = { "x-forwarded-for": "198.51.100.60" };
test.use({ extraHTTPHeaders: IP_HEADERS });

const GATE = `${PRELAUNCH_GATE_QUERY_PARAM}=${HARNESS_PRELAUNCH_GATE_SECRET}`;

function expectSecurityHeaders(headers: Record<string, string>, what: string) {
  expect(headers["x-content-type-options"], what).toBe("nosniff");
  expect(headers["content-security-policy"], what).toBe("frame-ancestors 'none'");
  expect(headers["strict-transport-security"], what).toBe("max-age=63072000; includeSubDomains");
  expect(headers["content-security-policy-report-only"], what).toContain("default-src 'self'");
  expect(headers["referrer-policy"], what).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"], what).toBe(
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  expect(headers["x-powered-by"], what).toBeUndefined();
}

test.describe("security headers (audit F5)", () => {
  test("a page and an API answer both carry them", async ({ request }) => {
    const page = await request.get(`/tvaryny?${GATE}`, { headers: IP_HEADERS });
    expect(page.status()).toBe(200);
    expectSecurityHeaders(page.headers(), "GET /tvaryny");

    const api = await request.post("/api/rpc/animals/cardsByIds", {
      headers: { ...IP_HEADERS, origin: ORIGIN },
      data: { json: { animalIds: [] } },
    });
    expect(api.status()).toBe(200);
    expectSecurityHeaders(api.headers(), "POST /api/rpc/animals/cardsByIds");
  });

  /** The three the owner wants enforced, on responses no page code shapes. */
  function expectEnforced(headers: Record<string, string>, what: string) {
    expect(headers["x-content-type-options"], what).toBe("nosniff");
    expect(headers["content-security-policy"], what).toBe("frame-ancestors 'none'");
    expect(headers["strict-transport-security"], what).toBe("max-age=63072000; includeSubDomains");
  }

  test("a 404 page, a build asset and a public file carry them", async ({ request }) => {
    const notFound = await request.get(`/tvaryny/not-a-real-id?${GATE}`, { headers: IP_HEADERS });
    expect(notFound.status()).toBe(404);
    expectEnforced(notFound.headers(), "the 404 page");

    const gallery = await (await request.get(`/tvaryny?${GATE}`, { headers: IP_HEADERS })).text();
    const asset = /\/_next\/static\/[^"'\s]+\.js/.exec(gallery)?.[0];
    expect(asset, "the gallery links a build asset").toBeDefined();
    const built = await request.get(asset ?? "", { headers: IP_HEADERS });
    expect(built.status()).toBe(200);
    expectEnforced(built.headers(), `the build asset ${asset}`);

    const publicFile = await request.get(`/brand-v3/logo.svg?${GATE}`, { headers: IP_HEADERS });
    expect(publicFile.status()).toBe(200);
    expectEnforced(publicFile.headers(), "a file under /public");
  });

  // Its own test: a request that carried the gate query earlier would leave the cookie in the
  // context's jar and make this one pass the gate.
  test.describe("without the project's gate cookie", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("the proxy's own refusal carries them", async ({ request }) => {
      expect(
        (await request.storageState()).cookies,
        "the request context must carry no gate cookie",
      ).toHaveLength(0);
      // `proxy.ts` answers this itself (the pre-launch gate), as it does its 429s.
      const gated = await request.get("/prytulkam", { headers: IP_HEADERS });
      expect(gated.status()).toBe(403);
      expectEnforced(gated.headers(), "the proxy's own refusal");
    });
  });

  /** Every report-only violation the page raises, collected as the browser fires them. */
  async function violationsOn(page: Page, path: string): Promise<string[]> {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __csp: string[] }).__csp = seen;
      document.addEventListener("securitypolicyviolation", (event) => {
        seen.push(`${event.effectiveDirective} ${event.blockedURI} (${event.disposition})`);
      });
    });
    const response = await page.goto(path, { waitUntil: "load" });
    expect(response?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  }

  // No exceptions: zod's eval probe is off in the browser (`src/instrumentation-client.ts`).
  for (const path of ["/tvaryny", "/prytulkam", "/zberezheni", "/pro"]) {
    test(`the report-only policy reports nothing on ${path}`, async ({ page }) => {
      expect(await violationsOn(page, path)).toEqual([]);
    });
  }
});
