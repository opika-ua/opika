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
 * The flow starts on S1 («Новий притулок»), and ends on S4 (R-UI 1's page),
 * reached through «Відкрити притулок», showing the new shelter as «Очікує».
 *
 * Own `x-forwarded-for` (TEST-NET-2 .41; .40 is R-UI 1's operator spec).
 * Tracing off: the magic link is a credential, even a test one.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type BrowserContext, expect, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.41";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

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
    // Signing in lands on /kabinet, which sends the operator on to S1 (RU-T1).
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/prytulky"),
      page.getByRole("button").click(),
    ]);
    await page.close();
  });

  test.afterAll(async () => {
    await context?.close();
    await server?.stop();
  });

  test("from the list, creates an unregistered initiative (a site visit, two references), sees the outcome, and opens it as «Очікує»", async () => {
    if (context === undefined || server === undefined) throw new Error("not signed in");
    const [city] = await db.select({ name: cities.nameUk }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");
    const displayName = `Лапа ${randomUUID().slice(0, 8)}`;
    const adminEmail = `harness-admin-${randomUUID()}@example.test`;

    const page = await context.newPage();
    expect((await page.goto("/kabinet/prytulky"))?.status()).toBe(200);
    // S1's own button (the nav carries a link of the same name to the same page).
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet/prytulky/novyi"),
      page.getByRole("main").getByRole("link", { name: "Новий притулок" }).click(),
    ]);
    await expect(page.getByRole("heading", { name: "Новий притулок", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Новий притулок" }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByLabel("Назва притулку").fill(displayName);
    await page.getByLabel("Опис притулку").fill("Волонтери, 18 собак і 6 котів.");
    // Select-only search: type, then take the offered place (typed text alone never commits).
    await page.getByRole("combobox", { name: /Населений пункт/ }).fill(city.name);
    await page
      .getByRole("option", { name: new RegExp(city.name) })
      .first()
      .click();
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
    await expect(page.getByText("Очікує перевірки", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
    );
    await expect(page.getByText(/^Посилання діє до .+, \d\d:\d\d\.$/)).toBeVisible();
    await expect(page.getByText(/^Повідомте притулок особисто: /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Надіслати ще раз" })).toBeVisible();
    // The console sender's line: the invitation went to the address typed.
    expect(server.stdout()).toContain(`[kabinet] invitation for ${adminEmail}: `);

    await Promise.all([
      page.waitForURL((url) => /^\/kabinet\/prytulky\/[0-9a-f-]{36}$/.test(url.pathname)),
      page.getByRole("link", { name: "Відкрити притулок" }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: displayName })).toBeVisible();
    await expect(page.getByText("Очікує перевірки", { exact: true })).toBeVisible();
    await page.close();
  });
});
