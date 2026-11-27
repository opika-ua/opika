/**
 * The shared header frame: the logo sits at the left edge of the page content on the public site and
 * on the signed-in kabinet at every width we support, and neither page scrolls sideways at 320. The sign-in
 * mirrors `kabinet.harness.ts`. Own `x-forwarded-for`: proxy.ts's limiter is app-wide.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./csp-watch";
import { noSidewaysScroll } from "./harness";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.62";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const WIDTHS = [393, 1024, 1440, 1920, 2560] as const;

async function logoX(page: Page, headerSelector: string): Promise<number> {
  const box = await page.locator(`${headerSelector} img`).first().boundingBox();
  if (box === null) throw new Error(`no logo in ${headerSelector}`);
  return Math.round(box.x);
}

/** Left edge of the page's content box: the `Container` that is `main` (public) or main's parent (kabinet). */
async function contentX(page: Page, kabinet: boolean): Promise<number> {
  return page.evaluate((k) => {
    const main = document.querySelector("main");
    const el = k ? main?.parentElement : main;
    if (!el) throw new Error("no content container");
    return Math.round(
      el.getBoundingClientRect().x + Number.parseFloat(getComputedStyle(el).paddingLeft),
    );
  }, kabinet);
}

test.describe("header frame: public site and kabinet", () => {
  let server: SignInServer | undefined;
  let context: BrowserContext | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    server = await startSignInServer(HARNESS_DATABASE_URL);
    const { origin } = server;
    const email = `harness-frame-${randomUUID()}@example.test`;
    const db = createDatabase(HARNESS_DATABASE_URL);
    const now = new Date();
    const userId = randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Harness",
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const shelter = (
      await db.select({ id: shelters.id, organizationId: shelters.organizationId }).from(shelters)
    ).find((row) => row.organizationId === null);
    if (shelter === undefined) throw new Error("no seeded shelter without an organization");
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      shelter.id,
      { organizationId: randomUUID() },
      now,
    );
    await db
      .insert(authMember)
      .values({ id: randomUUID(), organizationId, userId, role: "admin", createdAt: now });
    const requested = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-forwarded-for": FORWARDED_FOR },
      body: JSON.stringify({ email }),
    });
    expect(requested.status).toBe(200);
    const link = await server.linkFor(email);
    context = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
    });
    const page = await context.newPage();
    expect((await page.goto(link))?.status()).toBe(200);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/tvaryny"),
      page.getByRole("button").click(),
    ]);
    await page.close();
  });

  test.afterAll(async () => {
    await context?.close();
    await server?.stop();
  });

  const signedInPage = async () => {
    if (context === undefined) throw new Error("not signed in");
    return context.newPage();
  };

  for (const width of WIDTHS) {
    test(`the logo is at the content's left edge on /tvaryny and /kabinet/tvaryny at ${width}`, async () => {
      const page = await signedInPage();
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      expect(await logoX(page, "[data-testid='site-header']")).toBe(await contentX(page, false));
      await page.goto("/kabinet/tvaryny");
      expect(await logoX(page, "header")).toBe(await contentX(page, true));
      await page.close();
    });
  }

  // Owner, 2026-11-20 (a geometry check by his request): the header moved ~8px between the short
  // sign-in page, with no scrollbar, and a long page with one. Its own browser draws scrollbars,
  // which Playwright hides by default.
  test("the logo has the same x on the short sign-in page and on long /prytulkam at 1440", async ({
    playwright,
  }) => {
    if (server === undefined) throw new Error("no sign-in server");
    const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const page = await browser.newPage({
        baseURL: server.origin,
        extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
        viewport: { width: 1440, height: 900 },
      });
      await page.goto("/prytulkam");
      const scrollbar = await page.evaluate(() => ({
        tall: document.documentElement.scrollHeight > window.innerHeight,
        drawn: window.innerWidth > document.documentElement.clientWidth,
      }));
      expect(scrollbar, "/prytulkam scrolls, with a drawn scrollbar").toEqual({
        tall: true,
        drawn: true,
      });
      const long = await logoX(page, "[data-testid='site-header']");
      await page.goto("/kabinet/vkhid");
      expect(await logoX(page, "[data-testid='site-header']")).toBe(long);
      await page.setViewportSize({ width: 390, height: 844 });
      for (const path of ["/kabinet/vkhid", "/prytulkam"]) {
        await page.goto(path);
        expect(await noSidewaysScroll(page), `${path} at 390`).toBe(true);
      }
    } finally {
      await browser.close();
    }
  });

  test("neither header scrolls sideways at 320", async () => {
    const page = await signedInPage();
    await page.setViewportSize({ width: 320, height: 700 });
    for (const path of ["/", "/kabinet/tvaryny"]) {
      await page.goto(path);
      expect(await noSidewaysScroll(page), path).toBe(true);
    }
    await page.close();
  });
});
