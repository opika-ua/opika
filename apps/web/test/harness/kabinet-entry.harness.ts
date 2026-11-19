/**
 * Owner, 2026-11-16: a public page enters /kabinet by a full document load (`KabinetEntryLink`), so
 * the kabinet never runs inside a public document, whose report-only CSP may report to Sentry and
 * whose referrer policy is the public one. A next/link would keep the document: a window marker set
 * before the click would survive it. The static half is `ui-guards.test.ts` guard 8.
 *
 * Sign-in is off on this server, so the kabinet answers its own 404: still a kabinet document. Its
 * own `x-forwarded-for` (TEST-NET-2), as every sibling gives: the per-IP limiters are app-wide.
 */
import { expect, type Page, type Response, test } from "@playwright/test";
import { expectReachableByTab } from "./harness";

test.use({
  extraHTTPHeaders: { "x-forwarded-for": "198.51.100.121" },
  viewport: { width: 1440, height: 900 },
});

type Marked = Window & { __beforeClick?: boolean };

/** Every top-level document response under /kabinet, redirects included, in arrival order. */
function kabinetDocuments(page: Page): Response[] {
  const seen: Response[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      new URL(response.url()).pathname.startsWith("/kabinet")
    ) {
      seen.push(response);
    }
  });
  return seen;
}

/** React has hydrated the element: before that even a next/link click is a full load. */
async function hydrated(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el !== null && Object.keys(el).some((key) => key.startsWith("__reactFiber"));
  }, selector);
}

/** Presence only is read (`kabinetSignedInFrom`), so a placeholder value shows the shelter's header. */
async function signedInHint(page: Page): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "kabinet.session_token", value: "hint", domain: "127.0.0.1", path: "/" }]);
}

async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Marked).__beforeClick = true;
  });
  expect(await page.evaluate(() => (window as Marked).__beforeClick === true)).toBe(true);
}

/** The new document is the kabinet's, loaded in full, with the kabinet's headers and no reporting. */
async function expectKabinetDocument(page: Page, documents: Response[]): Promise<void> {
  await page.waitForURL((url) => url.pathname.startsWith("/kabinet"));
  await page.waitForLoadState("load");
  expect(await page.evaluate(() => (window as Marked).__beforeClick === undefined)).toBe(true);

  const navigation = await page.evaluate(
    () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name,
  );
  expect(new URL(navigation).pathname).toBe(new URL(page.url()).pathname);
  expect(new URL(navigation).pathname.startsWith("/kabinet")).toBe(true);

  expect(documents.length).toBeGreaterThan(0);
  for (const response of documents) {
    const what = `${response.status()} ${new URL(response.url()).pathname}`;
    expect(await response.headerValues("referrer-policy"), what).toEqual(["strict-origin"]);
    // These two only bite with a DSN, and this harness builds without one; the window marker
    // above is the proof of a full load.
    expect(await response.headerValues("reporting-endpoints"), what).toEqual([]);
    const policy = await response.headerValues("content-security-policy-report-only");
    expect(policy.join(" "), what).not.toMatch(/report-(uri|to)/);
  }
}

test.describe("public pages enter the kabinet by a full document load", () => {
  test("/prytulkam's «Увійти в кабінет», by Tab and Enter", async ({ page }) => {
    const documents = kabinetDocuments(page);
    await page.goto("/prytulkam", { waitUntil: "load" });
    const link = page.getByRole("link", { name: "Увійти в кабінет" });
    await expect(link).toHaveAttribute("href", "/kabinet/vkhid");
    await hydrated(page, 'a[href="/kabinet/vkhid"]');

    await markDocument(page);
    await expectReachableByTab(page, { label: "«Увійти в кабінет»", locator: link }, 40);
    await page.keyboard.press("Enter");

    await expectKabinetDocument(page, documents);
    expect(new URL(page.url()).pathname).toBe("/kabinet/vkhid");
  });

  test("the header's «Кабінет притулку» button for a signed-in shelter, clicked", async ({
    page,
  }) => {
    await signedInHint(page);
    const documents = kabinetDocuments(page);
    await page.goto("/pro", { waitUntil: "load" });
    const button = page.locator("[data-testid='nav-kabinet']");
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName("Кабінет притулку");
    await hydrated(page, "[data-testid='nav-kabinet']");

    await markDocument(page);
    await button.click();

    await expectKabinetDocument(page, documents);
  });

  // Phone (M2, 2026-11-19): the entry is the menu's last item, not in the header row.
  test("the phone menu's «Кабінет притулку», by keyboard", async ({ page }) => {
    await signedInHint(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const documents = kabinetDocuments(page);
    await page.goto("/pro", { waitUntil: "load" });
    await expect(page.locator("[data-testid='nav-kabinet']")).toBeHidden();
    const trigger = page.locator("[data-testid='nav-menu-trigger']");
    await hydrated(page, "[data-testid='nav-menu-trigger']");

    await expectReachableByTab(page, { label: "the menu trigger", locator: trigger });
    await page.keyboard.press("Enter");
    const entry = page.locator("[data-testid='nav-kabinet-menu']");
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAccessibleName("Кабінет притулку");

    await markDocument(page);
    await expectReachableByTab(page, { label: "the menu's «Кабінет притулку»", locator: entry });
    await page.keyboard.press("Enter");

    await expectKabinetDocument(page, documents);
  });
});
