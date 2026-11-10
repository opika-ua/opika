/**
 * The minimal shelter create, in a real browser: the operator creates a shelter with only its
 * name, description, city, one contact and the first admin, then sees on S4 that the legal data
 * and the address are «Ще не заповнено», each with «Додати». By role, label and text only.
 *
 * The same second server as `kabinet-operator-create.harness.ts` (production mode keeps sign-in
 * off), started with a test `LOCATION_HMAC_SECRET` so the registry is available on it.
 *
 * Own `x-forwarded-for` (TEST-NET-2 .113, unclaimed by the other specs).
 * Tracing off: the magic link is a credential, even a test one.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type BrowserContext, expect, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.113";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

test.describe("/kabinet/prytulky/novyi, the minimal shelter", () => {
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

  test("creates a shelter without legal data or address, and S4 offers «Додати» for both", async () => {
    if (context === undefined) throw new Error("not signed in");
    const [city] = await db.select({ name: cities.nameUk }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");
    const displayName = `Лапа ${randomUUID().slice(0, 8)}`;

    const page = await context.newPage();
    expect((await page.goto("/kabinet/prytulky/novyi"))?.status()).toBe(200);
    await page.getByLabel("Назва притулку").fill(displayName);
    await page.getByLabel("Опис притулку").fill("Волонтери, 18 собак і 6 котів.");
    await page.getByRole("combobox", { name: /Населений пункт/ }).fill(city.name);
    await page
      .getByRole("option", { name: new RegExp(city.name) })
      .first()
      .click();
    await page
      .getByRole("region", { name: "Контакти" })
      .getByLabel(/^Телефон/)
      .fill("+380 50 111-22-33");
    await page.getByLabel("Імʼя").fill("Ірина");
    await page.getByLabel("Електронна пошта").fill(`harness-admin-${randomUUID()}@example.test`);
    await page.getByRole("button", { name: "Створити й надіслати запрошення" }).click();

    await expect(page.getByRole("heading", { name: "Притулок створено." })).toBeVisible();
    await Promise.all([
      page.waitForURL((url) => /^\/kabinet\/prytulky\/[0-9a-f-]{36}$/.test(url.pathname)),
      page.getByRole("link", { name: "Відкрити притулок" }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: displayName })).toBeVisible();
    for (const name of ["Юридичні дані", "Адреса приміщення"]) {
      const block = page.getByRole("region", { name });
      await expect(block.getByText("Ще не заповнено")).toBeVisible();
      await expect(block.getByRole("button", { name: "Додати" })).toBeVisible();
    }
    await page.close();
  });
});
