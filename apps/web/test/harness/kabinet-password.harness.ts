/**
 * PW-1's flows in a real browser (`docs/shelter-passwords.md` §8; Oleksii's scope item 11:
 * "flows by role/label (… sign in, wrong password, forgot → reset → old sessions gone, change
 * password)"): an existing shelter admin with no password asks for a reset link, sets a password
 * on the reset page, signs in with it, and changes it in the cabinet. Every element is found by
 * role, label or text; nothing is measured. The headers and the address bar are checked as
 * behaviour (Oleksii, 2026-10-20: no-store and no-referrer on a token page; the token out of the
 * address bar).
 *
 * On the sign-in server (`sign-in-server.ts`), whose console password mail prints the reset
 * link to its stdout, the channel local development uses. The link is a credential, even a test
 * one: it is never printed or put in a failure message, and tracing is off.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.42";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

/** Fictional, used once each. */
const FIRST = "ялинка-під-вікном-1987";
const SECOND = "сонячний-ранок-над-Дніпром";

test.describe("shelter passwords, end to end (PW-1)", () => {
  let server: SignInServer | undefined;
  let email = "";

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    server = await startSignInServer(HARNESS_DATABASE_URL);
    // A shelter admin of one seeded (fictional) shelter, with no password yet: an existing
    // admin, who gets one through «Забули пароль?» (scope item 9).
    email = `harness-password-${randomUUID()}@example.test`;
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
    // The suspended one: the password flows need no verified status, and every verified seeded
    // shelter is already some other spec's (K4 profile editing takes the last one left).
    const shelter = (
      await db
        .select({
          id: shelters.id,
          organizationId: shelters.organizationId,
          status: shelters.verificationStatus,
        })
        .from(shelters)
    ).find((row) => row.organizationId === null && row.status === "suspended");
    if (shelter === undefined)
      throw new Error("no suspended seeded shelter without an organization");
    const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
      shelter.id,
      { organizationId: randomUUID() },
      now,
    );
    await db
      .insert(authMember)
      .values({ id: randomUUID(), organizationId, userId, role: "admin", createdAt: now });
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test("forgot → reset → sign in with the password → change it in the cabinet", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    if (server === undefined) throw new Error("no sign-in server");
    const origin = server.origin;
    const context = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
    });
    const page = await context.newPage();

    // «Забули пароль?», from the sign-in page's own link.
    await page.goto("/kabinet/vkhid");
    await page.getByRole("link", { name: "Забули пароль?" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Забули пароль?" })).toBeVisible();
    await page.getByLabel("Електронна пошта").fill(email);
    await page.getByRole("button", { name: "Надіслати посилання" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Якщо це адреса адміністратора кабінету притулку, на неї надіслано посилання для нового пароля. Воно діє 60 хв.",
    );
    const link = await server.resetLinkFor(email);

    // The reset page: never cached, no referrer, and the token out of the address bar.
    const shown = await page.goto(link);
    expect(shown?.status()).toBe(200);
    expect(shown?.headers()["cache-control"] ?? "").toContain("no-store");
    expect(shown?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("heading", { level: 1, name: "Новий пароль" })).toBeVisible();
    await expect.poll(() => page.url().includes("token=")).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/kabinet/vkhid/novyi-parol");

    // A refusal first: too common (his sentence), and the link stays usable.
    await page.getByLabel("Пароль", { exact: true }).fill("qwertyuiop");
    await page.getByLabel("Повторіть пароль").fill("qwertyuiop");
    await page.getByRole("button", { name: "Зберегти пароль" }).click();
    await expect(page.getByText("Цей пароль надто легко вгадати. Оберіть інший.")).toBeVisible();

    await page.getByLabel("Пароль", { exact: true }).fill(FIRST);
    await page.getByLabel("Повторіть пароль").fill(FIRST);
    await page.getByRole("button", { name: "Зберегти пароль" }).click();
    await expect(
      page.getByText("Пароль змінено, на всіх пристроях виконано вихід. Увійдіть з новим паролем."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Перейти до входу" }).click();

    // A wrong password: the one sentence for every refusal.
    await expect(page.getByRole("heading", { level: 1, name: "Вхід до кабінету" })).toBeVisible();
    await page.getByLabel("Електронна пошта").fill(email);
    await page.getByLabel("Пароль", { exact: true }).fill("зовсім-не-той-пароль");
    await page.getByRole("button", { name: "Увійти", exact: true }).click();
    // Inside the page's own content: Next's route announcer is an alert too.
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Не вдалося увійти. Перевірте адресу й пароль або надішліть собі посилання для входу.",
    );

    // The right one: the cabinet.
    await page.getByLabel("Пароль", { exact: true }).fill(FIRST);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet"),
      page.getByRole("button", { name: "Увійти", exact: true }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: "Профіль притулку" })).toBeVisible();

    // «Змінити пароль»: the current one, then the new one twice.
    await expect(page.getByRole("heading", { level: 2, name: "Змінити пароль" })).toBeVisible();
    await page.getByLabel("Поточний пароль").fill(FIRST);
    await page.getByLabel("Новий пароль").fill(SECOND);
    await page.getByLabel("Повторіть пароль").fill(SECOND);
    await page.getByRole("button", { name: "Змінити пароль" }).click();
    // The profile's own sections have status lines too: this one is the section's.
    const changeSection = page.getByRole("region", { name: "Змінити пароль" });
    await expect(changeSection.getByRole("status")).toHaveText(
      "Пароль змінено. На інших пристроях виконано вихід, тут ви залишаєтеся в кабінеті.",
    );
    // This browser stays in: the server renewed its session.
    const me = await page.request.get(`${origin}/api/auth/get-session`);
    expect(((await me.json()) as { user?: { email?: string } } | null)?.user?.email).toBe(email);
    await context.close();
  });
});
