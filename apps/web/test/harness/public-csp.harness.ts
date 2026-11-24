/**
 * The public pages' CSP trial (owner, 2026-11-24, D1-D5), against the real server: every public
 * page reports, never enforces, against the kabinet's nonce policy, with a fresh nonce Next stamps
 * on its scripts. Enforced headers stay the site-wide set; `/rate-limited` keeps the site-wide
 * policies and no nonce. Zero violations on the public flows: the specs that import `csp-watch.ts`.
 */
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { directivesOf, nonceOf, SITE_WIDE_CSP, scriptsOf, sha256, valuesOf } from "./csp-inspect";

// TEST-NET-2, an address no other spec uses: `proxy.ts` rate-limits `/tvaryny` pages per IP.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.150" }, trace: "off" });

const REPORT_ONLY = "content-security-policy-report-only";

/** The fixed public routes; an animal and a shelter page are found from the seeded gallery. */
const FIXED_ROUTES: [path: string, status: number][] = [
  ["/tvaryny", 200],
  ["/tvaryny/misto/brovary", 200],
  ["/pro", 200],
  ["/prytulkam", 200],
  ["/zberezheni", 200],
  ["/polityka-konfidentsiinosti", 200],
  ["/tvaryny/not-a-real-id", 404],
  ["/prytulky/not-a-real-id", 404],
  ["/some-page-that-does-not-exist", 404],
];

/** An animal page and its shelter's page, read from the gallery's and the animal's HTML. */
async function seededRoutes(request: APIRequestContext): Promise<[string, number][]> {
  const gallery = await (await request.get("/tvaryny")).text();
  const animal = /href="(\/tvaryny\/[0-9a-f-]{36})"/.exec(gallery)?.[1];
  expect(animal, "the gallery links an animal").toBeDefined();
  const animalHtml = await (await request.get(animal ?? "")).text();
  const shelter = /href="(\/prytulky\/[0-9a-f-]{36})"/.exec(animalHtml)?.[1];
  expect(shelter, "the animal page links its shelter").toBeDefined();
  return [
    [animal ?? "", 200],
    [shelter ?? "", 200],
  ];
}

/** The response's one report-only policy, which must carry a nonce. */
function reportOnlyPolicyOf(response: APIResponse, what: string) {
  const values = valuesOf(response, REPORT_ONLY);
  expect(values, `${what}: one report-only policy`).toHaveLength(1);
  const policy = values[0] ?? "";
  return { policy, nonce: nonceOf(policy) };
}

test.describe("public pages: the report-only nonce policy (CSP trial)", () => {
  test("every public route reports against a fresh nonce its scripts carry, never stored", async ({
    request,
  }) => {
    for (const [path, status] of [...FIXED_ROUTES, ...(await seededRoutes(request))]) {
      const first = await request.get(path, { maxRedirects: 0 });
      const second = await request.get(path, { maxRedirects: 0 });
      expect(first.status(), path).toBe(status);

      // Enforced headers are as before: the site-wide policy alone.
      expect(valuesOf(first, "content-security-policy"), path).toEqual([SITE_WIDE_CSP]);

      const a = reportOnlyPolicyOf(first, path);
      const b = reportOnlyPolicyOf(second, path);
      expect(a.nonce.length, path).toBeGreaterThanOrEqual(22);
      expect(a.nonce, `${path}: a new nonce per request`).not.toBe(b.nonce);
      const directives = directivesOf(a.policy);
      const scriptSrc = directives.get("script-src") ?? [];
      expect(scriptSrc, path).toContain(`'nonce-${a.nonce}'`);
      expect(scriptSrc, path).toContain("'strict-dynamic'");
      expect(scriptSrc, path).not.toContain("'unsafe-inline'");
      expect(scriptSrc, path).not.toContain("'unsafe-eval'");
      // Report-only ignores it and the browser logs a warning; the enforced header carries it.
      expect(directives.has("frame-ancestors"), path).toBe(false);
      // The harness builds with no Sentry DSN, so nothing names a reporting endpoint.
      expect(directives.has("report-to") || directives.has("report-uri"), path).toBe(false);

      // A nonce served twice can be read before it is used: no browser or CDN may store the page.
      const cacheControl = first.headers()["cache-control"] ?? "";
      expect(cacheControl, path).toContain("no-store");
      expect(cacheControl, path).not.toMatch(/public|s-maxage|immutable/);

      // Every script Next renders carries this response's nonce; an inline one without it is
      // allowed by its hash (the pre-paint script). JSON-LD is data, never run, so CSP skips it.
      const scripts = scriptsOf(await first.text());
      expect(scripts.length, path).toBeGreaterThan(0);
      for (const { nonce, src, type, body } of scripts) {
        if (nonce === a.nonce || type === "application/ld+json") continue;
        expect(src, `${path}: a script without the nonce`).toBeNull();
        expect(scriptSrc, `${path}: an inline script outside the policy`).toContain(sha256(body));
      }
    }
  });

  /** Injects attacker-style markup into `/pro`, with the policy as served or swapped to enforced. */
  async function openInjected(page: Page, mode: "report" | "enforce"): Promise<string[]> {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __csp: string[] }).__csp = seen;
      document.addEventListener("securitypolicyviolation", (event) => {
        seen.push(`${event.effectiveDirective} ${event.disposition}`);
      });
    });
    await page.route(
      (url) => url.pathname === "/pro",
      async (route) => {
        const response = await route.fetch();
        const policy = response.headers()[REPORT_ONLY] ?? "";
        const nonce = nonceOf(policy);
        expect(nonce, "the response carries a nonce").not.toBe("");
        // An inline script, an inline handler, and a control carrying the real nonce, so any block is
        // the nonce's doing, not the injection's.
        const injected = [
          "<script>window.__injected = true</script>",
          `<img src="data:," alt="" onerror="window.__handler = true">`,
          `<script nonce="${nonce}">window.__control = true</script>`,
        ].join("");
        const body = (await response.text()).replace("</head>", `${injected}</head>`);
        const headers = { ...response.headers() };
        delete headers["content-length"];
        delete headers["content-encoding"];
        if (mode === "enforce") {
          delete headers[REPORT_ONLY];
          headers["content-security-policy"] = policy;
        }
        await route.fulfill({ response, body, headers });
      },
    );
    await page.goto("/pro", { waitUntil: "load" });
    expect(await page.evaluate(() => "__control" in window), "the nonce'd control runs").toBe(true);
    return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  }

  /** A header link navigates without a document load: React hydrated and the router runs. */
  async function expectHydrated(page: Page): Promise<void> {
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });
    await page
      .getByTestId("site-header")
      .getByRole("link", { name: "Тварини", exact: true })
      .first()
      .click();
    await page.waitForURL((url) => url.pathname === "/tvaryny");
    expect(await page.evaluate(() => "__sameDocument" in window), "a client navigation").toBe(true);
  }

  test("as served, an injected inline script and handler are reported and still run", async ({
    page,
  }) => {
    const fired = await openInjected(page, "report");
    expect(await page.evaluate(() => "__injected" in window), "the injected script").toBe(true);
    expect(await page.evaluate(() => "__handler" in window), "the injected handler").toBe(true);
    expect(fired).toEqual(
      expect.arrayContaining(["script-src-elem report", "script-src-attr report"]),
    );
    expect(
      fired.every((entry) => entry.endsWith(" report")),
      fired.join(", "),
    ).toBe(true);
    await expectHydrated(page);
  });

  test("the same policy enforced blocks both, and the page still hydrates", async ({ page }) => {
    const fired = await openInjected(page, "enforce");
    expect(await page.evaluate(() => "__injected" in window), "the injected script").toBe(false);
    expect(await page.evaluate(() => "__handler" in window), "the injected handler").toBe(false);
    // Exactly the two injections: none of the page's own scripts is blocked.
    expect([...fired].sort()).toEqual(["script-src-attr enforce", "script-src-elem enforce"]);
    await expectHydrated(page);
  });
});

/** Owner, D5: the 429 page re-serves a static screen whose scripts carry no nonce. */
test("/rate-limited keeps the site-wide policies, and its page carries no nonce", async ({
  request,
}) => {
  const response = await request.get("/rate-limited", { maxRedirects: 0 });
  expect(response.status()).toBe(429);
  expect(valuesOf(response, "content-security-policy")).toEqual([SITE_WIDE_CSP]);
  const reportOnly = valuesOf(response, REPORT_ONLY);
  expect(reportOnly).toHaveLength(1);
  expect(directivesOf(reportOnly[0] ?? "").get("script-src")).toEqual([
    "'self'",
    "'unsafe-inline'",
  ]);
  expect(await response.text()).not.toContain("nonce=");
});
