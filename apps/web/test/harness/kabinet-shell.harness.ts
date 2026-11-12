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
import { createDatabase, productionLocationPolicy } from "@opika/db";
import { kabinetInvitationRepo, kabinetShelterRepo } from "@opika/db/repos";
import { authMember, authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type ModeratorId, publicLocationOf, type Shelter, type ShelterId } from "@opika/domain";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { openAccountMenu } from "./harness";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.37";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const SHOTS_DIR = process.env.KABINET_SHELL_SHOTS_DIR;
// A real-style long name (82 characters), fictional.
const LONG_NAME = "Притулок для безпритульних тварин «Добра домівка» ГО «Лапа допомоги» (Бровари)";
const HUNDRED = `${LONG_NAME} і ще трохи слів`.slice(0, 100);
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
    // Its own fictional verified shelter: the seeded ones are claimed one per spec, and a spec that
    // takes the last would leave the next without.
    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");
    const operatorId = randomUUID();
    const id = randomUUID() as ShelterId;
    const exactAddress = {
      line1: "вул. Тестова, 1",
      line2: null,
      postalCode: null,
      cityId: city.id as never,
      district: null,
      coordinates: { lat: 50.45, lng: 30.52 },
    };
    const shelter: Shelter = {
      id,
      displayName: LONG_NAME,
      description: { uk: "Вигаданий притулок для перевірки екранів.", en: null },
      legalEntity: { kind: "unregistered_initiative", contactPersonName: "Олена Тестова" },
      publicLocation: publicLocationOf(
        id,
        exactAddress,
        productionLocationPolicy(HARNESS_LOCATION_HMAC_SECRET),
      ),
      exactAddress,
      contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
      donation: null,
      logo: null,
      pendingDonation: null,
      version: 0,
      earlyListingSince: null,
      freshnessReminderOffAt: null,
      verification: {
        status: "verified",
        verifiedAt: now,
        verifiedBy: operatorId as ModeratorId,
        evidence: {
          submittedAt: now,
          items: [
            {
              kind: "site_visit",
              visitedAt: new Date("2026-10-01T00:00:00Z"),
              visitedBy: operatorId as ModeratorId,
              notes: "Чисто, вольєри з навісом.",
            },
          ],
        },
      },
      createdAt: now,
      lastUpdatedAt: now,
    };
    await kabinetShelterRepo(db).createWithHistory(shelter, {
      id: randomUUID(),
      entry: {
        kind: "shelter_created",
        at: now,
        moderatorId: operatorId as ModeratorId,
        via: "registry",
      },
    });
    shelterId = id;

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

  for (const width of [1024, 1440, 1920, 2560]) {
    test(`the logo and the sidebar share a left edge at ${width}`, async () => {
      const page = await open(admin, "/kabinet/tvaryny", { width, height: 900 });
      const logo = await page.getByRole("banner").locator("img").first().boundingBox();
      const nav = await page.getByRole("navigation", { name: "Розділи кабінету" }).boundingBox();
      if (logo === null || nav === null) throw new Error("no layout");
      expect(Math.abs(logo.x - nav.x)).toBeLessThanOrEqual(1);
      await page.close();
    });
  }

  for (const size of [PHONE, DESKTOP]) {
    test(`a 100-character shelter name at ${size.width}: the title is at most two lines, nothing overflows`, async () => {
      const page = await open(admin, "/kabinet/prytulok?tab=perevirka", size);
      const title = page.getByRole("heading", { level: 1 });
      // The layout is what is under test: put the 100-character name into the real heading.
      await title.evaluate((node, text) => {
        node.textContent = text;
      }, HUNDRED);
      const lines = await title.evaluate((node) => {
        const style = getComputedStyle(node);
        return Math.round(
          node.getBoundingClientRect().height / Number.parseFloat(style.lineHeight),
        );
      });
      expect(lines).toBeLessThanOrEqual(2);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.close();
    });
  }

  test("Профіль holds the pause control with its explanation; the account page has none", async () => {
    const page = await open(admin, "/kabinet/prytulok");
    const pause = page.getByRole("button", { name: "Призупинити прийом звернень" });
    await expect(pause).toBeVisible();
    await pause.scrollIntoViewIfNeeded();
    await shot(page, "prytulok-profil-pause");
    await page.close();
    const account = await open(admin, "/kabinet/akaunt");
    await expect(account.getByRole("button", { name: "Призупинити прийом звернень" })).toHaveCount(
      0,
    );
    await account.close();
  });

  test("desktop: the content column is at most 820px and left-aligned next to the sidebar", async () => {
    const page = await open(admin, "/kabinet/prytulok");
    const nav = await page.getByRole("navigation", { name: "Розділи кабінету" }).boundingBox();
    const main = await page.getByRole("main").boundingBox();
    if (nav === null || main === null) throw new Error("no layout");
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
    await shot(page, "prytulok-profil");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barBox = await bar.boundingBox();
    const lastPanel = await page.getByRole("main").boundingBox();
    if (barBox === null || lastPanel === null) throw new Error("no layout");
    // The page scrolled to its end: the content column's bottom edge clears the fixed bar.
    expect(lastPanel.y + lastPanel.height).toBeLessThanOrEqual(barBox.y + 1);
    await page.close();
  });

  test("the list page has no count in the sidebar, the phone menu is a sheet with «На сайт»", async () => {
    const page = await open(admin, "/kabinet/tvaryny");
    await expect(
      page.getByRole("navigation", { name: "Розділи кабінету" }).getByRole("link", {
        name: "Тварини",
        exact: true,
      }),
    ).toBeVisible();
    await shot(page, "tvaryny");
    await page.close();

    const phone = await open(admin, "/kabinet/tvaryny", PHONE);
    await phone.getByRole("banner").getByRole("link").last().click();
    const sheet = phone.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: /^На сайт/ })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Акаунт і пароль" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Вийти" })).toBeVisible();
    await expect(sheet.getByText("Harness admin")).toBeVisible();
    await shot(phone, "menu-open");
    await phone.close();
  });

  test("the account menu: keyboard opens it, Escape closes it and returns focus to the button", async () => {
    const page = await open(admin, "/kabinet/tvaryny");
    const button = page.getByRole("banner").getByRole("button");
    await button.focus();
    await expect(async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByRole("link", { name: "Акаунт і пароль" })).toBeVisible({
        timeout: 1500,
      });
    }).toPass({ timeout: 15_000 });
    // The person is already in the markup (server-passed), the shelter's name is not repeated.
    await expect(page.getByText("Harness admin").last()).toBeVisible();
    await shot(page, "menu-open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Акаунт і пароль" })).toHaveCount(0);
    await expect(button).toBeFocused();
    await page.close();
  });

  for (const size of [PHONE, DESKTOP]) {
    test(`the person is in the server's markup and on the first frame of the menu at ${size.width}, with no session fetch`, async () => {
      if (admin === undefined) throw new Error("not signed in");
      // The HTML as the server sent it: no script ran, so nothing was fetched into it.
      for (const path of ["/kabinet/tvaryny", "/kabinet/akaunt"]) {
        const html = await (await admin.request.get(path)).text();
        expect(html).toContain("Harness admin");
      }
      const page = await admin.newPage();
      const sessionCalls: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/auth/get-session")) sessionCalls.push(request.url());
      });
      await page.setViewportSize(size);
      await page.goto("/kabinet/tvaryny");
      const button =
        size === PHONE
          ? page.getByRole("banner").getByRole("link").last()
          : page.getByRole("banner").getByRole("button");
      await button.click();
      // Visible the moment the menu is: no waiting for an answer to arrive.
      await expect(page.getByText("Harness admin").last()).toBeVisible({ timeout: 1500 });
      await shot(page, "person-menu-open");
      await page.waitForLoadState("networkidle");
      expect(sessionCalls).toEqual([]);
      await page.close();
    });
  }

  test("«Акаунт і пароль» opens from the menu; the old ?tab=akaunt lands there too", async () => {
    const page = await open(admin, "/kabinet/tvaryny");
    await openAccountMenu(page, page.getByRole("link", { name: "Акаунт і пароль" }));
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/akaunt"),
      page.getByRole("link", { name: "Акаунт і пароль" }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: "Акаунт і пароль" })).toBeVisible();
    await expect(page.getByText("harness-shell-admin-").first()).toBeVisible();
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
    await openAccountMenu(page, page.getByText("Вихід вимкнено").last());
    await expect(page.getByRole("button", { name: "Вийти", exact: true })).toHaveCount(0);
    await shot(page, "support");
    await page.getByRole("button", { name: "Вийти з режиму перегляду" }).click();
    await page.waitForURL((url) => url.pathname === "/kabinet/prytulky");
    await page.close();
  });
});
