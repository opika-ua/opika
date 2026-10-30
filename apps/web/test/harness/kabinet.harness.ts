/**
 * The kabinet's pages, both sides of the production gate.
 *
 * **On the main server** (production mode, no `VERCEL_ENV`): production
 * sign-in can't identify the deployment, so `productionSignInOf` is off and
 * every `/kabinet` page answers 404, the same condition under which
 * `/api/kabinet/*` answers 503 (fail closed, IN-R2). A Preview gets the same
 * answer for its own reason.
 *
 * **Signed in** (KS-T3's specs, `test.fixme` until the wiring commit):
 * Головна at `/kabinet` (kabinet redesign Phase 2 PR 1 - the landing page,
 * replacing K4's read-only profile in that slot, KS-Q1) and its sign-out.
 * (Its sideways overflow at 360 and 1440 and the sign-out's 48px box and
 * outline were measured here until 2026-10-20, removed with the other
 * UI-measuring tests.) Production sign-in needs a real email provider, which the harness
 * must never reach, so these run on a second server on the same build with
 * sign-in available through the development console sender
 * (`sign-in-server.ts`, the confirm spec's pattern). The admin signs in the
 * real way: the magic-link request, the link read off that server's stdout,
 * the confirm page's «Увійти» pressed in the browser. K1 itself stays pinned
 * at component level (`src/features/kabinet/SignInCard.test.tsx`).
 *
 * Own `x-forwarded-for` (TEST-NET-2 .34), so proxy.ts's shared limiter budget
 * isn't drawn from another harness file's. Tracing off: the link is a
 * credential, even a test one, and a retained trace would record it.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type BrowserContext, expect, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.34";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

// The operator's pages (R-UI 1) answer the same 404 while production sign-in is off.
for (const path of [
  "/kabinet",
  "/kabinet/vkhid",
  // PW-1: «Забули пароль?» and the reset link's page.
  "/kabinet/vkhid/zabuly",
  "/kabinet/vkhid/novyi-parol",
  "/kabinet/prytulky",
  "/kabinet/prytulky/00000000-0000-4000-8000-000000000000",
]) {
  test(`${path} answers 404 while production sign-in is off`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  });
}

test.describe("/kabinet read-only profile, signed in (KS-T3)", () => {
  let server: SignInServer | undefined;
  let context: BrowserContext | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    server = await startSignInServer(HARNESS_DATABASE_URL);
    const { origin } = server;

    // A shelter admin of one seeded (fictional) shelter: the user, then the
    // membership, as the confirm spec sets one up.
    const email = `harness-kabinet-${randomUUID()}@example.test`;
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
      headers: {
        "content-type": "application/json",
        origin,
        "x-forwarded-for": FORWARDED_FOR,
      },
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
    // «Увійти», then signed in once the page is the cabinet: waited on by the URL and the
    // heading, not by the GET's response event, which CI has missed with /kabinet already
    // rendered (#120's run 39144246376; the same fix as b598d93's for K4). Each test's own
    // `goto("/kabinet")` asserts 200.
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/tvaryny"),
      page.getByRole("button").click(),
    ]);
    // Kabinet redesign Phase 2 PR 1: /kabinet now lands on Тварини.
    await expect(page.getByRole("heading", { level: 1, name: "Тварини" })).toBeVisible();
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

  test("after the skip link the header's Tab stops are «Переглянути сайт» (a new tab), then «Вийти»", async () => {
    const page = await signedInPage();
    await page.goto("/kabinet");
    // Transcribed: K4's «Вийти» (`kabinet.profile.signOut`).
    const signOut = page.getByRole("button", { name: "Вийти" });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Перейти до вмісту" })).toBeFocused();
    await page.keyboard.press("Tab");
    const viewSite = page.getByRole("link", { name: /^Переглянути сайт/ });
    await expect(viewSite).toBeFocused();
    await expect(viewSite).toHaveAttribute("target", "_blank");
    await expect(viewSite).toHaveAttribute("rel", /noopener/);
    await page.keyboard.press("Tab");
    await expect(signOut).toBeFocused();
    await page.close();
  });

  /**
   * Pressing «Вийти» really signs out (review of the wiring commit, finding
   * 5): the server forgets the session, not only the page moving on. Last in
   * this block on purpose, since it ends the session the others share (the
   * harness runs one worker, not fully parallel, so a file's tests run in order).
   */
  test("«Вийти» signs out: get-session answers null and /kabinet goes to the sign-in page", async () => {
    const page = await signedInPage();
    expect((await page.goto("/kabinet"))?.status()).toBe(200);
    // `page.request` carries this context's cookies, so it asks as the browser does.
    const before = await page.request.get("/api/auth/get-session");
    expect(before.status()).toBe(200);
    expect(await before.json(), "signed in before the press").not.toBeNull();

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/vkhid"),
      page.getByRole("button", { name: "Вийти" }).click(),
    ]);

    const after = await page.request.get("/api/auth/get-session");
    expect(after.status()).toBe(200);
    expect(await after.json(), "the server's answer after the press").toBeNull();
    await page.goto("/kabinet");
    expect(new URL(page.url()).pathname).toBe("/kabinet/vkhid");
    await page.close();
  });
});
