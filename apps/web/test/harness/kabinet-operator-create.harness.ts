/**
 * R-UI 2, S2 (`/kabinet/prytulky/novyi`), in a real browser: the operator
 * creates an unregistered initiative with a site visit and two references
 * and sees the outcome. By role, label and text only (Oleksii, 2026-10-17:
 * "a few Playwright flow tests that query by role/label/text only").
 *
 * The second server is `sign-in-server.ts`'s (the main server is production
 * mode, where sign-in stays off), started with a test `LOCATION_HMAC_SECRET`
 * so the registry is available on it (RG-Q10). Its invitation sender is the
 * development console one: nothing leaves the machine, the "email" is a line
 * in that server's stdout, which this spec reads, and the outcome it reports
 * is a send whose block list wasn't checked.
 *
 * R-UI 1 rebase: the flow then presses «Відкрити притулок» and expects S4 to
 * show «Очікує». Until R-UI 1 serves S4 it ends at the success state, with
 * the stored status read from the database instead.
 *
 * Own `x-forwarded-for` (TEST-NET-2 .40, clear of the .21-.35 already
 * claimed and of the next few). Tracing off: the magic link is a credential,
 * even a test one.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { authUser, cities, shelters, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type BrowserContext, expect, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.40";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
/** A recognisable test value, at least the 32 characters `productionLocationPolicy` requires. */
const HARNESS_LOCATION_HMAC_SECRET = "test-location-hmac-secret-for-harness-only-0123456789";

/** Kyiv's calendar date `days` before now: the visit's date, clear of any midnight. */
const kyivDateDaysAgo = (days: number): string =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(Date.now() - days * 86_400_000));

test("the operator's create page is a 404 on the production-mode server", async ({ page }) => {
  expect((await page.goto("/kabinet/prytulky/novyi"))?.status()).toBe(404);
});

test.describe("/kabinet/prytulky/novyi, the operator", () => {
  let server: SignInServer | undefined;
  let context: BrowserContext | undefined;
  const db = createDatabase(HARNESS_DATABASE_URL);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    server = await startSignInServer(HARNESS_DATABASE_URL, {
      LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET,
    });
    const { origin } = server;

    const email = `harness-operator-${randomUUID()}@example.test`;
    const now = new Date();
    const userId = randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Harness operator",
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(superAdmins).values({ id: randomUUID(), userId, grantedAt: now });

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
    // Signing in lands on /kabinet; what it shows an operator is R-UI 1's.
    const landed = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" && new URL(response.url()).pathname === "/kabinet",
    );
    await page.getByRole("button").click();
    await landed;
    await page.close();
  });

  test.afterAll(async () => {
    await context?.close();
    await server?.stop();
  });

  test("creates an unregistered initiative with a site visit and two references, and sees the outcome", async () => {
    if (context === undefined || server === undefined) throw new Error("not signed in");
    const [city] = await db.select({ name: cities.nameUk }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");
    const displayName = `Лапа ${randomUUID().slice(0, 8)}`;
    const adminEmail = `harness-admin-${randomUUID()}@example.test`;

    const page = await context.newPage();
    expect((await page.goto("/kabinet/prytulky/novyi"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Новий притулок", level: 1 })).toBeVisible();

    await page.getByLabel("Назва притулку").fill(displayName);
    await page.getByLabel("Опис притулку").fill("Волонтери, 18 собак і 6 котів.");
    await page.getByLabel("Місто").selectOption({ label: city.name });
    await page.getByLabel("Вулиця, будинок").fill("вул. Мечникова, 4");
    await page.getByLabel("Координати").fill("50.5843, 30.4890");
    await page.getByRole("radio", { name: "Ініціатива без реєстрації" }).check();
    await page.getByLabel("Контактна особа").fill("Ірина Коваль");
    await page
      .getByRole("region", { name: "Контакти" })
      .getByLabel(/^Телефон/)
      .fill("+380 50 111-22-33");

    await page.getByLabel("Тип доказу").selectOption({ label: "Візит на місце" });
    await page.getByRole("button", { name: "+ Додати доказ" }).click();
    const visit = page.getByRole("group", { name: "Візит на місце" });
    await visit.getByLabel("Дата візиту").fill(kyivDateDaysAgo(1));
    await visit.getByLabel("Нотатка").fill("Оглянув вольєри, журнал прийому ведеться.");

    for (const [n, phone] of [
      [0, "+380 50 555 21 08"],
      [1, "+380 67 000 11 22"],
    ] as const) {
      await page.getByLabel("Тип доказу").selectOption({ label: "Рекомендація" });
      await page.getByRole("button", { name: "+ Додати доказ" }).click();
      // The n-th «Рекомендація» card, in the order they were added.
      const reference = page.getByRole("group", { name: "Рекомендація", exact: true }).nth(n);
      await reference.getByLabel("Хто").fill(`Рекомендація ${n + 1}`);
      await reference.getByLabel("Телефон").fill(phone);
      await reference.getByLabel("Ким доводиться притулку").selectOption({ label: "Ветклініка" });
    }

    await page.getByLabel("Імʼя").fill("Ірина");
    await page.getByLabel("Електронна пошта").fill(adminEmail);
    await page.getByRole("button", { name: "Створити й надіслати запрошення" }).click();

    await expect(page.getByRole("heading", { name: "Притулок створено." })).toBeVisible();
    await expect(page.getByText("Очікує", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
    );
    await expect(page.getByText(/^Посилання діє до .+, \d\d:\d\d\.$/)).toBeVisible();
    await expect(page.getByText(/^Повідомте притулок особисто: /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Надіслати ще раз" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Відкрити притулок" })).toBeVisible();

    // The console sender's line: the invitation went to the address typed.
    expect(server.stdout()).toContain(`[kabinet] invitation for ${adminEmail}: `);
    // R-UI 1 rebase: replace with «Відкрити притулок» → S4 showing «Очікує».
    // (This package doesn't depend on drizzle-orm, so the rows are filtered here.)
    const stored = (
      await db
        .select({ name: shelters.displayName, status: shelters.verificationStatus })
        .from(shelters)
    ).filter((row) => row.name === displayName);
    expect(stored).toEqual([{ name: displayName, status: "pending" }]);
    await page.close();
  });
});
