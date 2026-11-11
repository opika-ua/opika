/**
 * Listing before verification, PR B, in a real browser: the operator allows showing a pending
 * shelter's cards from S4 (confirm text, days left), the shelter's admin reads the banner and the
 * listed note on its landing page, and the operator withdraws it. Flows only, by role, label and
 * text. With `EARLY_LISTING_SHOTS_DIR` set it also saves screenshots of the operator panel and the
 * banner (desktop and phone); CI does not set it.
 *
 * Fictional shelter, own database, sign-in on the second server like `kabinet-operator-actions`.
 * Own `x-forwarded-for` (TEST-NET-2 .37).
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createDatabase, productionLocationPolicy } from "@opika/db";
import { animalRepo, kabinetInvitationRepo, kabinetShelterRepo } from "@opika/db/repos";
import { authMember, authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, makeAnimal, testDatabaseUrl } from "@opika/db/test";
import { type ModeratorId, publicLocationOf, type Shelter, type ShelterId } from "@opika/domain";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.37";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const SHOTS = process.env.EARLY_LISTING_SHOTS_DIR;

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

async function shoot(page: Page, name: string) {
  if (SHOTS === undefined) return;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: join(SHOTS, `${name}-desktop-v2.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(SHOTS, `${name}-mobile-v2.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

/**
 * The phone's bottom bar must never sit on content: scrolled to the end at 390 wide, the bottom of
 * `main` is above the top of every fixed or sticky element pinned to the bottom edge. Returns the
 * numbers so a failure says by how much. A full-page screenshot cannot show this (a fixed bar is
 * drawn at one scroll position), so the shot saved here is the viewport at the end of the page.
 */
async function bottomClearance(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForLoadState("load");
  const result = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const vh = window.innerHeight;
    const barTops = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const position = getComputedStyle(el).position;
        if (position !== "fixed" && position !== "sticky") return false;
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.bottom >= vh - 1 && rect.top > vh / 2;
      })
      .map((el) => el.getBoundingClientRect().top);
    const main = document.querySelector("main");
    return {
      barTop: barTops.length === 0 ? vh : Math.min(...barTops),
      mainBottom: main === null ? 0 : main.getBoundingClientRect().bottom,
      bars: barTops.length,
    };
  });
  // Without these a page with no main would pass the clearance check vacuously.
  expect(result.mainBottom, `${name}: no main element`).toBeGreaterThan(0);
  if (SHOTS !== undefined) {
    await page.screenshot({ path: join(SHOTS, `${name}-bottom-mobile-v2.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return result;
}

test.describe("listing before verification, operator and shelter sides", () => {
  let server: SignInServer | undefined;
  let operator: BrowserContext | undefined;
  let shelterAdmin: BrowserContext | undefined;
  let shelterId: ShelterId | undefined;
  let animalId: string | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const db = createDatabase(HARNESS_DATABASE_URL);
    const now = new Date();
    server = await startSignInServer(HARNESS_DATABASE_URL, {
      LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET,
      KABINET_OPERATOR_DISPLAY_NAME: "Ярина Перевіркова",
    });

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

    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");
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
      displayName: `Притулок «Репетиція ${id.slice(0, 4)}»`,
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
      verification: {
        status: "pending",
        submittedAt: now,
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
    const animal = makeAnimal({ shelterId: id, name: "Барсик", listing: { kind: "draft" } });
    await animalRepo(db).insert(animal, city.id as never);
    animalId = animal.id;

    const adminEmail = `harness-early-admin-${randomUUID()}@example.test`;
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
      id,
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

    operator = await signedInContext(browser, server, operatorEmail);
    shelterAdmin = await signedInContext(browser, server, adminEmail);
  });

  test.afterAll(async () => {
    await operator?.close();
    await shelterAdmin?.close();
    await server?.stop();
  });

  test("allow with the confirm text, the shelter reads the banner, then withdraw", async () => {
    if (operator === undefined || shelterAdmin === undefined || shelterId === undefined) {
      throw new Error("not set up");
    }
    const ALLOW = "Дозволити показ до завершення перевірки";
    const page = await operator.newPage();
    expect((await page.goto(`/kabinet/prytulky/${shelterId}`))?.status()).toBe(200);
    await shoot(page, "operator-panel-before");

    await page.getByRole("button", { name: ALLOW }).click();
    const dialog = page.getByRole("dialog", { name: ALLOW });
    await expect(
      dialog.getByText(
        "Картки притулку побачать усі, з позначкою «на перевірці». Дозвіл діє до 60 днів, зняти його можна будь-коли.",
      ),
    ).toBeVisible();
    await dialog.getByRole("button", { name: ALLOW }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("До кінця показу: 60 днів")).toBeVisible();
    await expect(page.getByRole("button", { name: "Зняти дозвіл" })).toBeVisible();
    await shoot(page, "operator-panel-running");

    const kabinet = await shelterAdmin.newPage();
    expect((await kabinet.goto("/kabinet/tvaryny"))?.status()).toBe(200);
    await expect(
      kabinet.getByText(/^Ваші картки показуються з позначкою «на перевірці» до \d+ \S+\.$/),
    ).toBeVisible();
    // The label is said once on the landing page: the banner, not the note or the list line.
    await expect(
      kabinet.getByText("Перевірку проводжу я: напишу або зателефоную, щоб домовитися.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(kabinet.getByText(/на перевірці/)).toHaveCount(1);
    await bottomClearance(kabinet, "kabinet-tvaryny");
    await shoot(kabinet, "kabinet-banner");
    await kabinet.close();

    await page.getByRole("button", { name: "Зняти дозвіл" }).click();
    await expect(page.getByRole("button", { name: ALLOW })).toBeVisible();
    await expect(page.getByText(/^До кінця показу:/)).toBeHidden();
    await page.close();
  });

  test("on a phone the bottom bar never covers the last line, on every kabinet page", async () => {
    if (operator === undefined || shelterAdmin === undefined) throw new Error("not set up");
    const operatorPages = [
      "/kabinet/prytulky",
      "/kabinet/prytulky/novyi",
      `/kabinet/prytulky/${shelterId}`,
    ];
    const shelterPages = [
      "/kabinet/tvaryny",
      "/kabinet/tvaryny/nova",
      `/kabinet/tvaryny/${animalId}`,
      "/kabinet/prytulok",
      "/kabinet/akaunt",
    ];
    const covered: string[] = [];
    let barsSeen = 0;
    for (const [context, paths] of [
      [operator, operatorPages],
      [shelterAdmin, shelterPages],
    ] as const) {
      for (const path of paths) {
        const page = await context.newPage();
        expect((await page.goto(path))?.status(), path).toBe(200);
        const { barTop, mainBottom, bars } = await bottomClearance(
          page,
          `page${path.replaceAll(/[^a-z]+/g, "-")}`,
        );
        barsSeen += bars;
        if (mainBottom > barTop + 0.5)
          covered.push(`${path}: content ends ${mainBottom}, bar at ${barTop}`);
        await page.close();
      }
    }
    // Some pages (a new-animal form) have no bar; if none has one the check proved nothing.
    expect(barsSeen, "no page showed a fixed or sticky bottom bar").toBeGreaterThan(0);
    expect(covered).toEqual([]);
  });
});
