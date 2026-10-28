/**
 * Audit F5, against the real server: the security headers reach real
 * responses (a page, an API answer), and the report-only policy reports
 * nothing on the pages a visitor opens first, so enforcing it
 * later would not break them. Its own `x-forwarded-for`, so its requests never
 * spend another spec's per-IP budget.
 */
import { expect, type Page, test } from "@playwright/test";
import { PRELAUNCH_GATE_QUERY_PARAM } from "../../src/api/prelaunch-gate";
import { HARNESS_PRELAUNCH_GATE_SECRET } from "../harness-env";

const IP_HEADERS = { "x-forwarded-for": "198.51.100.60" };
test.use({ extraHTTPHeaders: IP_HEADERS });

const GATE = `${PRELAUNCH_GATE_QUERY_PARAM}=${HARNESS_PRELAUNCH_GATE_SECRET}`;

function expectSecurityHeaders(headers: Record<string, string>, what: string) {
  expect(headers["x-content-type-options"], what).toBe("nosniff");
  expect(headers["content-security-policy"], what).toBe("frame-ancestors 'none'");
  expect(headers["strict-transport-security"], what).toBe("max-age=63072000; includeSubDomains");
  expect(headers["content-security-policy-report-only"], what).toContain("default-src 'self'");
}

test.describe("security headers (audit F5)", () => {
  test("a page and an API answer both carry them", async ({ request }) => {
    const page = await request.get(`/tvaryny?${GATE}`, { headers: IP_HEADERS });
    expect(page.status()).toBe(200);
    expectSecurityHeaders(page.headers(), "GET /tvaryny");

    const api = await request.post("/api/rpc/animals/cardsByIds", {
      headers: IP_HEADERS,
      data: { json: { animalIds: [] } },
    });
    expect(api.status()).toBe(200);
    expectSecurityHeaders(api.headers(), "POST /api/rpc/animals/cardsByIds");
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
  for (const path of ["/tvaryny", "/tvaryny/gortaty", "/prytulkam", "/zberezheni", "/pro"]) {
    test(`the report-only policy reports nothing on ${path}`, async ({ page }) => {
      expect(await violationsOn(page, path)).toEqual([]);
    });
  }
});
