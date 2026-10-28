/**
 * K2, the shelter's animal list, in a real browser: flows found by role,
 * label and text only (Oleksii, 2026-10-17: "Test logic, not looks ... a few
 * Playwright flow tests that query by role/label/text only"). Nothing is
 * measured.
 *
 * Writes go through the served route and its own write policy, as in the K3
 * and K4 specs, which opens every shelter's writes to its own admins (PR 6).
 * Nothing in the app is patched, and no environment variable opens anything. The second server is `sign-in-server.ts`'s.
 *
 * **The shelter** is the second-to-last verified seeded one nobody has signed
 * in to: never K3's (the last one, which its spec, running first, claims) nor
 * K4's and the other specs' (the first ones). **Its animals** for these flows
 * are written here, the way the operator's onboarding script stores them, in
 * this checkout's disposable harness database, each with a name of this run,
 * so no seeded card any later spec reads is moved.
 *
 * Own `x-forwarded-for` (TEST-NET-2 .37). Tracing off: the magic link is a
 * credential, even a test one.
 */

import { randomInt, randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { animalRepo, kabinetInvitationRepo, shelterRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, makeAnimal, testDatabaseUrl } from "@opika/db/test";
import type { ShelterId } from "@opika/domain";
import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.37";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
const DAY = 86_400_000;

test.describe("/kabinet/tvaryny K2 animal list (a shelter's own admin)", () => {
  test.describe.configure({ mode: "serial" });

  let server: SignInServer | undefined;
  let context: BrowserContext | undefined;
  const db = createDatabase(HARNESS_DATABASE_URL);
  // Names of this run, so a kept database from an earlier run can't answer for them.
  const run = randomInt(1000, 9999);
  const STALE = `Шукач ${run}`;
  const ARRANGING = `Домовленка ${run}`;
  const LEAVING = `Знятий ${run}`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const shelter = (
      await db
        .select({
          id: shelters.id,
          organizationId: shelters.organizationId,
          status: shelters.verificationStatus,
        })
        .from(shelters)
    )
      .filter((row) => row.organizationId === null && row.status === "verified")
      .at(-2);
    if (shelter === undefined) throw new Error("fewer than two verified unclaimed seeded shelters");
    const stored = await shelterRepo(db).findById(shelter.id as ShelterId);
    if (stored === null) throw new Error("the shelter isn't stored");
    const cityId = stored.publicLocation.cityId;

    const now = new Date();
    const photos = [{ storageKey: "seed-photos/dog-1.jpg", width: 1200, height: 1500, alt: null }];
    const longAgo = new Date(now.getTime() - 40 * DAY);
    const lately = new Date(now.getTime() - 2 * DAY);
    for (const animal of [
      makeAnimal({
        shelterId: shelter.id as ShelterId,
        name: STALE,
        photos,
        listing: {
          kind: "published",
          publishedAt: longAgo,
          confirmedAt: longAgo,
          undoable: null,
        },
      }),
      makeAnimal({
        shelterId: shelter.id as ShelterId,
        name: ARRANGING,
        photos,
        listing: {
          kind: "reserved",
          since: lately,
          publishedAt: longAgo,
          confirmedAt: lately,
          undoable: null,
        },
      }),
      makeAnimal({
        shelterId: shelter.id as ShelterId,
        name: LEAVING,
        photos,
        listing: { kind: "published", publishedAt: lately, confirmedAt: lately, undoable: null },
      }),
    ]) {
      await animalRepo(db).insert(animal, cityId);
    }

    server = await startSignInServer(HARNESS_DATABASE_URL);
    const { origin } = server;

    const email = `harness-k2-${randomUUID()}@example.test`;
    const userId = randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Harness",
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
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
    // «Увійти», then signed in once the page is the cabinet: waited on by the URL and the
    // heading, never by the GET's response event (AW-H2, the K3 and K4 specs' fix).
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet"),
      page.getByRole("button").click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: "Головна" })).toBeVisible();
    await page.close();
  });

  test.afterAll(async () => {
    await context?.close();
    await server?.stop();
  });

  const open = async (path: string): Promise<Page> => {
    if (context === undefined) throw new Error("not signed in");
    const page = await context.newPage();
    expect((await page.goto(path))?.status(), path).toBe(200);
    return page;
  };

  const rowOf = (page: Page, name: string): Locator => page.getByRole("listitem", { name });

  test("from Головна's nav, «Тварини»: the list, its rows, and «Показати ці N» opening the stale cards", async () => {
    const page = await open("/kabinet");
    await page
      .getByRole("navigation", { name: "Розділи кабінету" })
      .getByRole("link", { name: "Тварини" })
      .click();
    await expect(page).toHaveURL(/\/kabinet\/tvaryny$/);
    await expect(page.getByRole("heading", { level: 1, name: "Тварини" })).toBeVisible();

    await expect(rowOf(page, STALE).getByText("Оновлено 40 днів тому")).toBeVisible();
    await expect(rowOf(page, ARRANGING).getByText("Домовляються", { exact: true })).toBeVisible();
    await expect(page.getByText(/ви не підтверджували понад 30 днів\.$/)).toBeVisible();

    await page.getByRole("button", { name: /^Показати ці \d+$/ }).click();
    await expect(rowOf(page, STALE)).toBeVisible();
    // A card confirmed two days ago isn't stale: the server's filter leaves it out.
    await expect(rowOf(page, ARRANGING)).toHaveCount(0);
    await page.getByRole("button", { name: "Показати всі" }).click();
    await expect(rowOf(page, ARRANGING)).toBeVisible();
    await page.close();
  });

  test("«Ще шукає», then «Скасувати»: the date goes to today and back, and the server kept what the screen says", async () => {
    const page = await open("/kabinet/tvaryny");
    const row = rowOf(page, STALE);
    await row.getByRole("button", { name: "Ще шукає" }).click();
    await expect(row.getByText("Підтверджено сьогодні")).toBeVisible();
    await expect(row.getByText("Оновлено сьогодні")).toBeVisible();

    await row.getByRole("button", { name: /^Скасувати · \d с$/ }).click();
    await expect(page.getByText("Скасовано: на картці знову попередня дата.")).toBeVisible();
    await expect(row.getByText("Оновлено 40 днів тому")).toBeVisible();

    // Stored: a reload reads the restored date from the server.
    await page.reload();
    await expect(rowOf(page, STALE).getByText("Оновлено 40 днів тому")).toBeVisible();

    // Confirmed for real this time, and left to stand.
    await rowOf(page, STALE).getByRole("button", { name: "Ще шукає" }).click();
    await expect(rowOf(page, STALE).getByText("Підтверджено сьогодні")).toBeVisible();
    await page.reload();
    await expect(rowOf(page, STALE).getByText("Оновлено сьогодні")).toBeVisible();
    await page.close();
  });

  test("«Уже вдома»: the dialog says it can't be undone, and the card is home", async () => {
    const page = await open("/kabinet/tvaryny");
    await rowOf(page, ARRANGING).getByRole("button", { name: "Уже вдома" }).click();
    const dialog = page.getByRole("dialog", { name: `${ARRANGING} уже вдома?` });
    await expect(dialog.getByText(/Скасувати це не можна/)).toBeVisible();
    await dialog.getByRole("button", { name: "Так, уже вдома" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(`${ARRANGING}: уже вдома.`)).toBeVisible();

    await page.reload();
    const row = rowOf(page, ARRANGING);
    await expect(row.getByText("Удома", { exact: true })).toBeVisible();
    await expect(row.getByText(/^Удома з /)).toBeVisible();
    await page.close();
  });

  test("«Зняти з показу» with a reason and a note: the card is withdrawn, and its row says why", async () => {
    const page = await open("/kabinet/tvaryny");
    const row = rowOf(page, LEAVING);
    await row.getByRole("button", { name: "Ще", exact: true }).click();
    await row.getByRole("button", { name: "Зняти з показу" }).click();
    const dialog = page.getByRole("dialog", { name: `Зняти з показу: ${LEAVING}?` });
    await dialog.getByLabel("Причина").selectOption({ label: "додано помилково" });
    await dialog.getByLabel(/Коментар/).fill("дубль картки");
    await dialog.getByRole("button", { name: "Зняти з показу" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(`${LEAVING}: знято з показу.`)).toBeVisible();

    await page.reload();
    await expect(
      rowOf(page, LEAVING).getByText(/^Знято з показу .+ · додано помилково · «дубль картки»$/),
    ).toBeVisible();
    await expect(
      rowOf(page, LEAVING).getByRole("button", { name: "Повернути в чернетки" }),
    ).toBeVisible();
    await page.close();
  });
});
