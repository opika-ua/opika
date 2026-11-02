/**
 * The kabinet shell (owner-approved 2026-11-02): the header with its account menu, the sidebar and
 * the phone's bottom bar (the first navigation level), the underlined tabs (the second), the
 * content column and the «Акаунт і пароль» page, for a shelter's admin, the operator and a support
 * view. Behaviour and structure only. With `KABINET_SHELL_SHOTS_DIR` set it also saves screenshots
 * at 393 and 1440 for the owner to review; without it the spec writes no files.
 *
 * Own `x-forwarded-for` (TEST-NET-2 .37), tracing off: the sign-in link is a credential.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.37";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const SHOTS_DIR = process.env.KABINET_SHELL_SHOTS_DIR;
const PHONE = { width: 393, height: 852 };
const DESKTOP = { width: 1440, height: 900 };

async function signedInContext(
  browser: Browser,
  server: SignInServer,
  email: string,
): Promise<BrowserContext> {
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
    page.waitForURL(
      (url) => url.pathname.startsWith("/kabinet") && !url.pathname.startsWith("/kabinet/vkhid"),
    ),
    page.getByRole("button").click(),
  ]);
  await page.close();
  return context;
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS_DIR === undefined) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(SHOTS_DIR, `${width}-${name}.png`), fullPage: false });
}

test.describe("/kabinet shell", () => {
  let server: SignInServer | undefined;
  let admin: BrowserContext | undefined;
  let operator: BrowserContext | undefined;
  let shelterId: string | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const db = createDatabase(HARNESS_DATABASE_URL);
    const now = new Date();
    const shelter = (
      await db
        .select({
          id: shelters.id,
          organizationId: shelters.organizationId,
          status: shelters.verificationStatus,
        })
        .from(shelters)
    ).find((row) => row.organizationId === null && row.status === "verified");
    if (shelter === undefined)
      throw new Error("no verified seeded shelter without an organization");
    shelterId = shelter.id;

    server = await startSignInServer(HARNESS_DATABASE_URL, {
      LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET,
      KABINET_OPERATOR_DISPLAY_NAME: "Ярина Перевіркова",
    });

    const adminEmail = `harness-shell-admin-${randomUUID()}@example.test`;
    const adminId = randomUUID();
    await db.insert(authUser).values({
      id: adminId,
      name: "Harness admin",
      email: adminEmail,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      shelter.id,
      { organizationId: randomUUID() },
      now,
    );
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId: adminId,
      role: "admin",
      createdAt: now,
    });

    const operatorEmail = `harness-shell-operator-${randomUUID()}@example.test`;
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

    admin = await signedInContext(browser, server, adminEmail);
    operator = await signedInContext(browser, server, operatorEmail);
  });

  test.afterAll(async () => {
    await admin?.close();
    await operator?.close();
    await server?.stop();
  });

  const open = async (context: BrowserContext | undefined, path: string, size = DESKTOP) => {
    if (context === undefined) throw new Error("not signed in");
    const page = await context.newPage();
    await page.setViewportSize(size);
    expect((await page.goto(path))?.status()).toBe(200);
    return page;
  };

  test("desktop: the sidebar starts on the header's gutter line, the column is at most 820px and left-aligned", async () => {
    const page = await open(admin, "/kabinet/prytulok");
    const logo = await page.getByRole("banner").locator("svg").first().boundingBox();
    const nav = await page.getByRole("navigation", { name: "Розділи кабінету" }).boundingBox();
    const main = await page.getByRole("main").boundingBox();
    if (logo === null || nav === null || main === null) throw new Error("no layout");
    expect(Math.abs(logo.x - nav.x)).toBeLessThanOrEqual(1);
    expect(main.width).toBeLessThanOrEqual(821);
    expect(main.x).toBeLessThan(nav.x + nav.width + 40);
    await shot(page, "prytulok-profil");
    await page.close();
  });

  for (const tab of ["kontakty", "zbir", "perevirka"] as const) {
    for (const size of [PHONE, DESKTOP]) {
      test(`Притулок, ${tab} at ${size.width}: no sideways scroll, one underlined tab`, async () => {
        const page = await open(admin, `/kabinet/prytulok?tab=${tab}`, size);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
        await shot(page, `prytulok-${tab}`);
        await page.close();
      });
    }
  }

  test("phone: a text-only bottom bar of 48px tabs, and nothing of the content hides behind it", async () => {
    const page = await open(admin, "/kabinet/prytulok", PHONE);
    const bar = page.getByRole("navigation", { name: "Розділи кабінету" });
    const links = bar.getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(bar.locator("svg, img")).toHaveCount(0);
    for (let index = 0; index < 2; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barBox = await bar.boundingBox();
    const lastPanel = await page.getByRole("main").boundingBox();
    if (barBox === null || lastPanel === null) throw new Error("no layout");
    // The page scrolled to its end: the content column's bottom edge clears the fixed bar.
    expect(lastPanel.y + lastPanel.height).toBeLessThanOrEqual(barBox.y + 1);
    await shot(page, "prytulok-profil");
    await page.close();
  });

  test("the list page: the sidebar shows the animal count, the phone menu is a sheet with «На сайт»", async () => {
    const page = await open(admin, "/kabinet/tvaryny");
    await expect(
      page
        .getByRole("navigation", { name: "Розділи кабінету" })
        .getByRole("link", { name: /^Тварини \d+$/ }),
    ).toBeVisible();
    await shot(page, "tvaryny");
    await page.close();

    const phone = await open(admin, "/kabinet/tvaryny", PHONE);
    await phone.getByRole("banner").getByRole("link").last().click();
    const sheet = phone.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: /^На сайт/ })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Акаунт і пароль" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Вийти" })).toBeVisible();
    await shot(phone, "menu-open");
    await phone.close();
  });

  test("the account menu: keyboard opens it, Escape closes it and returns focus to the button", async () => {
    const page = await open(admin, "/kabinet/tvaryny");
    const button = page.getByRole("banner").getByRole("button");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "Акаунт і пароль" })).toBeVisible();
    await shot(page, "menu-open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Акаунт і пароль" })).toHaveCount(0);
    await expect(button).toBeFocused();
    await page.close();
  });

  test("«Акаунт і пароль» opens from the menu; the old ?tab=akaunt lands there too", async () => {
    const page = await open(admin, "/kabinet/tvaryny");
    await page.getByRole("banner").getByRole("button").click();
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/akaunt"),
      page.getByRole("link", { name: "Акаунт і пароль" }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: "Акаунт і пароль" })).toBeVisible();
    await shot(page, "akaunt");
    await page.goto("/kabinet/prytulok?tab=akaunt");
    expect(new URL(page.url()).pathname).toBe("/kabinet/akaunt");
    await page.close();
  });

  for (const size of [PHONE, DESKTOP]) {
    test(`the operator at ${size.width}: the shelters list with its own nav`, async () => {
      const page = await open(operator, "/kabinet/prytulky", size);
      if (size.width >= 600) {
        await expect(
          page.getByRole("banner").getByRole("button", { name: "Оператор" }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole("navigation", { name: "Розділи кабінету" }).getByRole("link"),
      ).toHaveCount(2);
      await shot(page, "operator-prytulky");
      await page.close();
    });
  }

  test("a support session keeps its banner and frame, and the menu has no sign-out", async () => {
    if (shelterId === undefined) throw new Error("not set up");
    const page = await open(operator, `/kabinet/prytulky/${shelterId}`);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/tvaryny"),
      page.getByRole("button", { name: "Переглянути як притулок · лише читання" }).click(),
    ]);
    await expect(
      page.getByRole("region", { name: /^Ви переглядаєте кабінет притулку «/ }),
    ).toBeVisible();
    await page.getByRole("banner").getByRole("button").click();
    await expect(page.getByText("Вихід вимкнено").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Вийти" })).toHaveCount(0);
    await shot(page, "support");
    await page.getByRole("button", { name: "Вийти з режиму перегляду" }).click();
    await page.waitForURL((url) => url.pathname === "/kabinet/prytulky");
    await page.close();
  });
});
