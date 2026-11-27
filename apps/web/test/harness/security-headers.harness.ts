/**
 * Audit F5, against the real server: the security headers reach real
 * responses (a page, an API answer), and the report-only policy reports
 * nothing on the pages a visitor opens first, so enforcing it
 * later would not break them. Its own `x-forwarded-for`, so its requests never
 * spend another spec's per-IP budget.
 */
import { harnessPort } from "@opika/db/test";
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  test,
} from "@playwright/test";

const ORIGIN = `http://127.0.0.1:${harnessPort()}`;

const IP_HEADERS = { "x-forwarded-for": "198.51.100.60" };
const ENFORCED_CSP =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
test.use({ extraHTTPHeaders: IP_HEADERS });

/** The ones the owner wants enforced, on every response, page code or not. */
function expectEnforced(headers: Record<string, string>, what: string) {
  expect(headers["x-content-type-options"], what).toBe("nosniff");
  expect(headers["content-security-policy"], what).toBe(ENFORCED_CSP);
  expect(headers["cross-origin-opener-policy"], what).toBe("same-origin");
  expect(headers["strict-transport-security"], what).toBe("max-age=63072000; includeSubDomains");
}

function expectSecurityHeaders(headers: Record<string, string>, what: string) {
  expectEnforced(headers, what);
  expect(headers["content-security-policy-report-only"], what).toContain("default-src 'self'");
  expect(headers["referrer-policy"], what).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"], what).toBe(
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  expect(headers["x-powered-by"], what).toBeUndefined();
}

test.describe("security headers (audit F5)", () => {
  test("a page and an API answer both carry them", async ({ request }) => {
    const page = await request.get("/", { headers: IP_HEADERS });
    expect(page.status()).toBe(200);
    expectSecurityHeaders(page.headers(), "GET /tvaryny");

    const api = await request.post("/api/rpc/animals/cardsByIds", {
      headers: { ...IP_HEADERS, origin: ORIGIN },
      data: { json: { animalIds: [] } },
    });
    expect(api.status()).toBe(200);
    expectSecurityHeaders(api.headers(), "POST /api/rpc/animals/cardsByIds");
  });

  // Audit part B §4: the one next.config rule covers these too; until now nothing asserted it.
  // Sign-in is off on this server, so the kabinet and auth APIs answer with their refusals.
  test("the kabinet and auth APIs, both OG images and an email asset carry them", async ({
    request,
  }) => {
    const checks: [string, () => Promise<APIResponse>, number][] = [
      [
        "POST /api/kabinet/shelter/get",
        () =>
          request.post("/api/kabinet/shelter/get", {
            headers: { ...IP_HEADERS, origin: ORIGIN },
            data: { json: {} },
          }),
        503,
      ],
      ["GET /api/auth/get-session", () => request.get("/api/auth/get-session"), 503],
      ["GET /opengraph-image", () => request.get("/opengraph-image"), 200],
      [
        "GET /tvaryny/<id>/opengraph-image",
        () => request.get("/tvaryny/00000000-0000-4000-8000-000000000000/opengraph-image"),
        200,
      ],
      ["GET /email/logo@2x-v1.png", () => request.get("/email/logo@2x-v1.png"), 200],
    ];
    for (const [what, send, status] of checks) {
      const response = await send();
      expect(response.status(), what).toBe(status);
      expectSecurityHeaders(response.headers(), what);
    }
  });

  test("a 404 page, a build asset and a public file carry them", async ({ request }) => {
    const notFound = await request.get("/tvaryny/not-a-real-id", { headers: IP_HEADERS });
    expect(notFound.status()).toBe(404);
    expectEnforced(notFound.headers(), "the 404 page");

    const gallery = await (await request.get("/", { headers: IP_HEADERS })).text();
    const asset = /\/_next\/static\/[^"'\s]+\.js/.exec(gallery)?.[0];
    expect(asset, "the gallery links a build asset").toBeDefined();
    const built = await request.get(asset ?? "", { headers: IP_HEADERS });
    expect(built.status()).toBe(200);
    expectEnforced(built.headers(), `the build asset ${asset}`);

    const publicFile = await request.get("/brand-v3/logo.svg", { headers: IP_HEADERS });
    expect(publicFile.status()).toBe(200);
    expectEnforced(publicFile.headers(), "a file under /public");
  });

  /**
   * Spends one budget on a unique spoofed IP (nothing in front of the harness server rewrites
   * it) and returns the first 429. The budgets are the limiters' own, in `api/rate-limit.ts`
   * and `kabinet/rate-limits.ts`.
   */
  async function firstRefusal(
    request: APIRequestContext,
    path: string,
    budget: number,
    ip: string,
  ) {
    for (let i = 0; i < budget + 1; i++) {
      const response = await request.get(path, {
        headers: { "x-forwarded-for": ip },
        maxRedirects: 0,
      });
      if (response.status() === 429) {
        expect(i, `${path} refused before its budget of ${budget}`).toBe(budget);
        return response;
      }
    }
    throw new Error(`${path} never answered 429 within ${budget + 1} requests`);
  }

  // The F5 headers come from next.config, not page code, so a response the proxy builds must
  // still carry them; no other check reaches that path. Since 2026-11-20 (owner) a /kabinet page
  // navigation's 429 is the styled page, as /tvaryny's is; only a server action's POST still gets
  // the proxy's own plain 429 ("Too Many Requests" pins that branch).
  // Each test's IP (.67, .68) is used by no other spec: its budget is spent on purpose.
  test("a /kabinet page's 429 is the styled page, and the proxy's own 429 for an action carries them", async ({
    request,
  }) => {
    const ip = "198.51.100.67";
    const refused = await firstRefusal(request, "/kabinet", 300, ip);
    expect(await refused.text()).toContain("Забагато запитів. Спробуйте ще раз пізніше.");
    expect(refused.headers()["retry-after"]).toBeDefined();
    expect(refused.headers()["x-robots-tag"]).toBe("noindex");
    expectEnforced(refused.headers(), "the /kabinet page's 429");
    const action = await request.post("/kabinet/vkhid", {
      headers: { "x-forwarded-for": ip, "next-action": "0" },
      maxRedirects: 0,
    });
    expect(action.status()).toBe(429);
    expect(await action.text()).toBe("Too Many Requests");
    expectEnforced(action.headers(), "the proxy's own 429");
  });

  test("the proxy's rate-limit rewrite on a gallery page carries them", async ({ request }) => {
    const refused = await firstRefusal(request, "/", 100, "198.51.100.68");
    expect(refused.headers()["retry-after"]).toBeDefined();
    expectEnforced(refused.headers(), "the proxy's /tvaryny 429");
  });

  /** Every value of a header on the response, duplicates included. */
  const valuesOf = (response: APIResponse, name: string) =>
    response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === name)
      .map((header) => header.value);

  // Owner, 2026-11-16: one Referrer-Policy on every kabinet response, `strict-origin`, from next.config
  // alone. Sign-in is off on this server, so these are 404s, the confirm page's from its own handler.
  test("every kabinet response sends strict-origin once; public pages keep theirs", async ({
    request,
  }) => {
    for (const path of [
      "/kabinet",
      "/kabinet/vkhid",
      "/kabinet/vkhid?zaproshennia=x",
      "/kabinet/vkhid/novyi-parol?token=x",
      `/kabinet/vkhid/pidtverdzhennia?token=${"A".repeat(32)}`,
    ]) {
      const response = await request.get(path, { headers: IP_HEADERS, maxRedirects: 0 });
      expect(valuesOf(response, "referrer-policy"), path).toEqual(["strict-origin"]);
    }
    for (const path of ["/", "/prytulkam", "/zberezheni", "/pro"]) {
      const response = await request.get(path, { headers: IP_HEADERS, maxRedirects: 0 });
      expect(valuesOf(response, "referrer-policy"), path).toEqual([
        "strict-origin-when-cross-origin",
      ]);
    }
  });

  // The harness builds with no Sentry DSN (playwright.config.ts), so nothing may report anywhere.
  test("without a DSN no response names a CSP reporting endpoint", async ({ request }) => {
    for (const path of [
      "/",
      "/prytulkam",
      "/zberezheni",
      "/pro",
      "/kabinet/vkhid?zaproshennia=x",
    ]) {
      const response = await request.get(path, { headers: IP_HEADERS, maxRedirects: 0 });
      expect(valuesOf(response, "reporting-endpoints"), path).toEqual([]);
      const policy = valuesOf(response, "content-security-policy-report-only");
      expect(policy, path).toHaveLength(1);
      expect(policy[0], path).toContain("default-src 'self'");
      expect(policy[0], path).not.toMatch(/report-(uri|to)/);
    }
  });

  /** Every CSP violation the page raises, report-only or enforced, as the browser fires them. */
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
  for (const path of ["/", "/prytulkam", "/zberezheni", "/pro"]) {
    test(`the report-only policy reports nothing on ${path}`, async ({ page }) => {
      expect(await violationsOn(page, path)).toEqual([]);
    });
  }
});
