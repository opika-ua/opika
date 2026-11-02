/**
 * The shared header frame: the logo sits at the same x on the public site and on the signed-in
 * kabinet at every width we support, and neither page scrolls sideways at 320. The sign-in
 * mirrors `kabinet.harness.ts`. Own `x-forwarded-for`: proxy.ts's limiter is app-wide.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { noSidewaysScroll } from "./harness";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.62";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const WIDTHS = [1024, 1440, 1920, 2560] as const;

async function logoX(page: Page, headerSelector: string): Promise<number> {
  const box = await page.locator(`${headerSelector} img`).first().boundingBox();
  if (box === null) throw new Error(`no logo in ${headerSelector}`);
  return Math.round(box.x);
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
    test(`the logo is at the same x on /tvaryny and /kabinet at ${width}`, async () => {
      const page = await signedInPage();
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/tvaryny");
      const publicX = await logoX(page, "[data-testid='site-header']");
      await page.goto("/kabinet");
      const kabinetX = await logoX(page, "header");
      expect(kabinetX).toBe(publicX);
      await page.close();
    });
  }

  test("neither header scrolls sideways at 320", async () => {
    const page = await signedInPage();
    await page.setViewportSize({ width: 320, height: 700 });
    for (const path of ["/tvaryny", "/kabinet"]) {
      await page.goto(path);
      expect(await noSidewaysScroll(page), path).toBe(true);
    }
    await page.close();
  });
});
