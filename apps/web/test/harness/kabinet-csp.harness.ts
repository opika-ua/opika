/**
 * Audit B1 (owner, 2026-11-24: "CSP: yes, nonce-based, /kabinet/* first"), against real servers:
 * every /kabinet page enforces a script policy with a fresh nonce that Next stamps on its own
 * scripts; an inline script without it is blocked; public pages keep today's headers, no nonce.
 * The zero-violation check on every kabinet flow is `csp-watch.ts`, imported by those specs.
 *
 * On the sign-in server (`sign-in-server.ts`): on the main one every /kabinet page is a 404.
 */
import { createHash } from "node:crypto";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type APIResponse, expect, type Page, test } from "@playwright/test";
import { Window } from "happy-dom";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.94";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

/** The site-wide enforced policy (audit F5), on every response, the kabinet's included. */
const SITE_WIDE_CSP =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

/**
 * Pages that render without a session; dummy tokens give the links' error cards. The confirm page
 * is a route handler that writes its own HTML, with one inline script.
 */
const KABINET_PAGES = [
  "/kabinet/vkhid",
  "/kabinet/vkhid/zabuly",
  "/kabinet/vkhid?zaproshennia=dummy-token",
  "/kabinet/vkhid/novyi-parol?token=dummy-token",
  `/kabinet/vkhid/pidtverdzhennia?token=${"A".repeat(32)}`,
];

const PUBLIC_PAGES = ["/", "/prytulkam", "/pro", "/zberezheni"];

const valuesOf = (response: APIResponse, name: string): string[] =>
  response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === name)
    .map((header) => header.value);

/** The directives of a policy, by name. */
function directivesOf(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

/** The kabinet's own policy: the one CSP value with a nonce. */
function kabinetPolicyOf(response: APIResponse, what: string): { policy: string; nonce: string } {
  const withNonce = valuesOf(response, "content-security-policy").filter((value) =>
    value.includes("'nonce-"),
  );
  expect(withNonce, `${what}: one enforced policy with a nonce`).toHaveLength(1);
  const policy = withNonce[0] ?? "";
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)?.[1] ?? "";
  return { policy, nonce };
}

/** Every `<script>` in a document, as an HTML parser reads it; nothing in it runs or loads. */
function scriptsOf(html: string) {
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  try {
    const document = new window.DOMParser().parseFromString(html, "text/html");
    return [...document.querySelectorAll("script")].map((script) => ({
      nonce: script.getAttribute("nonce"),
      src: script.getAttribute("src"),
      body: script.textContent ?? "",
    }));
  } finally {
    void window.happyDOM.close();
  }
}

const sha256 = (text: string) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

test.describe("kabinet CSP (audit B1)", () => {
  let server: SignInServer | undefined;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    server = await startSignInServer(HARNESS_DATABASE_URL);
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  const origin = () => {
    if (server === undefined) throw new Error("no server");
    return server.origin;
  };

  test("each kabinet page enforces a nonce policy, fresh per request, that its scripts carry", async ({
    request,
  }) => {
    for (const path of KABINET_PAGES) {
      const first = await request.get(`${origin()}${path}`, { maxRedirects: 0 });
      const second = await request.get(`${origin()}${path}`, { maxRedirects: 0 });
      expect(first.status(), path).toBeLessThan(500);
      const a = kabinetPolicyOf(first, path);
      const b = kabinetPolicyOf(second, path);
      expect(a.nonce.length, path).toBeGreaterThanOrEqual(22);
      expect(a.nonce, `${path}: a new nonce per request`).not.toBe(b.nonce);

      const directives = directivesOf(a.policy);
      const scriptSrc = directives.get("script-src") ?? [];
      expect(scriptSrc, path).toContain(`'nonce-${a.nonce}'`);
      expect(scriptSrc, path).toContain("'strict-dynamic'");
      expect(scriptSrc, path).not.toContain("'unsafe-inline'");
      expect(scriptSrc, path).not.toContain("'unsafe-eval'");
      expect(directives.has("script-src-elem") || directives.has("script-src-attr"), path).toBe(
        false,
      );
      // The site-wide enforced directives hold here too, whichever header a browser reads.
      for (const rule of SITE_WIDE_CSP.split("; ")) expect(a.policy, path).toContain(rule);
      for (const value of valuesOf(first, "content-security-policy")) {
        expect([SITE_WIDE_CSP, a.policy], path).toContain(value);
      }

      // Never stored, by the browser or a CDN: a nonce served twice can be read before it is used.
      const cacheControl = first.headers()["cache-control"] ?? "";
      expect(cacheControl, path).toContain("no-store");
      expect(cacheControl, path).not.toMatch(/public|s-maxage|immutable/);

      // Every script Next renders carries this response's nonce; the one that doesn't is the
      // root layout's pre-paint script, allowed by its hash.
      const html = await first.text();
      const scripts = scriptsOf(html);
      expect(scripts.length, path).toBeGreaterThan(0);
      for (const { nonce, src, body } of scripts) {
        if (nonce === a.nonce) continue;
        expect(src, `${path}: a script without the nonce`).toBeNull();
        expect(scriptSrc, `${path}: an inline script outside the policy`).toContain(sha256(body));
      }
    }
  });

  test("an injected inline script without the nonce is blocked, and the page still works", async ({
    page,
  }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        (window as unknown as { __csp?: string[] }).__csp ??= [];
        (window as unknown as { __csp: string[] }).__csp.push(
          `${event.effectiveDirective} ${event.disposition}`,
        );
      });
    });
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });
    // As if the server had rendered attacker text: an inline script, an inline handler, and a
    // control script carrying the real nonce, so the block is the nonce's doing, not the injection's.
    await page.route(`${origin()}/kabinet/vkhid`, async (route) => {
      const response = await route.fetch();
      const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(
        response.headers()["content-security-policy"] ?? "",
      )?.[1];
      expect(nonce, "the response carries a nonce").toBeDefined();
      const injected = [
        "<script>window.__injected = true</script>",
        `<img src="data:," alt="" onerror="window.__handler = true">`,
        `<script nonce="${nonce}">window.__control = true</script>`,
      ].join("");
      const body = (await response.text()).replace("</head>", `${injected}</head>`);
      await route.fulfill({ response, body });
    });

    await page.goto(`${origin()}/kabinet/vkhid`, { waitUntil: "load" });
    expect(await page.evaluate(() => "__control" in window), "the nonce'd control runs").toBe(true);
    expect(await page.evaluate(() => "__injected" in window), "the injected script").toBe(false);
    expect(await page.evaluate(() => "__handler" in window), "the injected handler").toBe(false);
    const fired = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp);
    expect(fired).toEqual(
      expect.arrayContaining(["script-src-elem enforce", "script-src-attr enforce"]),
    );
    expect(violations.length).toBeGreaterThanOrEqual(2);

    await expectHydrated(page);
  });

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
    await page.waitForURL((url) => url.pathname === "/");
    expect(await page.evaluate(() => "__sameDocument" in window), "a client navigation").toBe(true);
  }

  test("a kabinet page and a public page reached from it inside its document raise no violation", async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });
    await page.goto(`${origin()}/kabinet/vkhid`, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    await expectHydrated(page);
    // The gallery, then an animal page with its JSON-LD, both under the kabinet's policy.
    // An animal card, not the species switch's `/tvaryny/vyd/…` links ahead of it.
    await page.locator("a[data-testid='animal-card']").first().click();
    await page.waitForURL((url) => /^\/tvaryny\/[0-9a-f-]{36}$/.test(url.pathname));
    await expect(page.locator("script[type='application/ld+json']").first()).toBeAttached();
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("a look-alike path is not the kabinet: /kabinetx keeps the site-wide policy", async ({
    request,
  }) => {
    for (const path of ["/kabinetx", "/kabinet-x", "/api/kabinet/x"]) {
      const response = await request.get(`${origin()}${path}`, { maxRedirects: 0 });
      expect(valuesOf(response, "content-security-policy"), path).toEqual([SITE_WIDE_CSP]);
    }
  });
});

test.describe("public pages keep today's headers (audit B1)", () => {
  test("one enforced policy, the site-wide one, and no nonce anywhere in the page", async ({
    request,
  }) => {
    for (const path of PUBLIC_PAGES) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(valuesOf(response, "content-security-policy"), path).toEqual([SITE_WIDE_CSP]);
      const reportOnly = valuesOf(response, "content-security-policy-report-only");
      expect(reportOnly, path).toHaveLength(1);
      expect(directivesOf(reportOnly[0] ?? "").get("script-src"), path).toEqual([
        "'self'",
        "'unsafe-inline'",
      ]);
      expect(await response.text(), path).not.toContain("nonce=");
    }
  });
});
