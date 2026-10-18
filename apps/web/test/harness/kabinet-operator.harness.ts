/**
 * The operator's screens (R-UI 1), as flows found by role, label and text
 * only (test logic, not looks; nothing here measures anything).
 *
 * The main server is production-mode with sign-in off, so these run on the
 * sign-in server pattern (`sign-in-server.ts`): the same build, sign-in
 * available through the development console sender, the magic link read off
 * that server's stdout. It also gets `LOCATION_HMAC_SECRET`: without it the
 * operator's pages answer 404 (RU-T5), and a shelter admin's 404 here must be
 * the access decision's, not the missing key's (the operator's 200 on the
 * same server is the control).
 *
 * Own `x-forwarded-for` (TEST-NET-2 .40), so proxy.ts's shared limiter
 * budget isn't drawn from another file's. Tracing off: the links are
 * credentials, even test ones.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.40";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

test.describe("the operator's list and shelter page (R-UI 1)", () => {
  let server: SignInServer | undefined;
  let operator: BrowserContext | undefined;
  let shelterAdmin: BrowserContext | undefined;
  let adminShelterId = "";

  /** Signs `email` in the real way and returns its browser context, on the page sign-in lands on. */
  async function signIn(browser: Browser, email: string): Promise<BrowserContext> {
    if (server === undefined) throw new Error("no server");
    const { origin } = server;
    const requested = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-forwarded-for": FORWARDED_FOR },
      body: JSON.stringify({ email }),
    });
    expect(requested.status).toBe(200);
    const link = await server.linkFor(email);
    const context = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
    });
    const page = await context.newPage();
    expect((await page.goto(link))?.status()).toBe(200);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== new URL(link).pathname),
      page.getByRole("button").click(),
    ]);
    await page.close();
    return context;
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    server = await startSignInServer(HARNESS_DATABASE_URL, {
      LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET,
    });
    const db = createDatabase(HARNESS_DATABASE_URL);
    const now = new Date();

    // The operator: a user and an active super_admin grant (`super_admins`, HS-T2).
    const operatorEmail = `harness-operator-${randomUUID()}@example.test`;
    const operatorId = randomUUID();
    await db.insert(authUser).values({
      id: operatorId,
      name: "Harness operator",
      email: operatorEmail,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(superAdmins).values({ id: randomUUID(), userId: operatorId, grantedAt: now });

    // A shelter admin of one seeded (fictional) shelter, as kabinet.harness.ts sets one up.
    const adminEmail = `harness-operator-spec-admin-${randomUUID()}@example.test`;
    const adminId = randomUUID();
    await db.insert(authUser).values({
      id: adminId,
      name: "Harness admin",
      email: adminEmail,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const shelter = (
      await db.select({ id: shelters.id, organizationId: shelters.organizationId }).from(shelters)
    ).find((row) => row.organizationId === null);
    if (shelter === undefined) throw new Error("no seeded shelter without an organization");
    adminShelterId = shelter.id;
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      shelter.id,
      { organizationId: randomUUID() },
      now,
    );
    await db
      .insert(authMember)
      .values({ id: randomUUID(), organizationId, userId: adminId, role: "admin", createdAt: now });

    operator = await signIn(browser, operatorEmail);
    shelterAdmin = await signIn(browser, adminEmail);
  });

  test.afterAll(async () => {
    await operator?.close();
    await shelterAdmin?.close();
    await server?.stop();
  });

  test("an operator lands on «Притулки» from /kabinet, opens a shelter and sees its history", async () => {
    if (operator === undefined) throw new Error("not signed in");
    const page = await operator.newPage();
    await page.goto("/kabinet");
    await page.waitForURL((url) => url.pathname === "/kabinet/prytulky");
    await expect(page.getByRole("heading", { level: 1, name: "Притулки" })).toBeVisible();
    const rows = page.getByRole("list", { name: "Притулки" });
    const open = rows.getByRole("link", { name: /^Відкрити / }).first();
    await Promise.all([
      page.waitForURL((url) => /^\/kabinet\/prytulky\/[0-9a-f-]{36}$/.test(url.pathname)),
      open.click(),
    ]);
    await expect(page.getByRole("heading", { level: 2, name: "Історія" })).toBeVisible();
    await expect(page.getByRole("link", { name: "← Притулки" })).toBeVisible();
    await page.close();
  });

  test("a shelter admin gets 404 at the operator's pages, and keeps their own cabinet", async () => {
    if (shelterAdmin === undefined) throw new Error("not signed in");
    const page = await shelterAdmin.newPage();
    expect((await page.goto("/kabinet/prytulky"))?.status()).toBe(404);
    expect((await page.goto(`/kabinet/prytulky/${adminShelterId}`))?.status()).toBe(404);
    // Signed in all along: their own page still opens.
    expect((await page.goto("/kabinet"))?.status()).toBe(200);
    await page.close();
  });

  test("the sign-in page sends a signed-in operator on to their list", async () => {
    if (operator === undefined) throw new Error("not signed in");
    const page = await operator.newPage();
    await page.goto("/kabinet/vkhid");
    await page.waitForURL((url) => url.pathname === "/kabinet/prytulky");
    await expect(page.getByRole("heading", { level: 1, name: "Притулки" })).toBeVisible();
    await page.close();
  });
});
