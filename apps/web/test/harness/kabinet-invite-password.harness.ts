/**
 * PW-2's invitation link in a real browser (`docs/shelter-passwords.md` §6.1; his scope item 2:
 * "the invite link opens «Створіть пароль» (password + repeat, show/hide). Single-use, 72h, bound
 * to the invited address. Accepting sets the password and signs in."), and the first steps of his
 * dress rehearsal: invite → set the password → sign out → sign in with the password.
 *
 * The operator invites through the registry's own writer and the link is issued the way the
 * registry issues it (`kabinetInviteTokenRepo.issue`), with a token made here, so the spec needs
 * no mail. Every element is found by role, label or text; nothing is measured. The headers, the
 * address bar and the POST's Origin are checked as behaviour (his PW-2 Q1 and Q3).
 *
 * Why a browser: the form's POST must carry the site's real Origin (the kabinet route refuses
 * anything else, K-Q8) under the page's `no-referrer`, which only a real browser decides.
 *
 * The link is a credential, even a test one: never printed or put in a failure message, and
 * tracing is off.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo, kabinetInviteTokenRepo } from "@opika/db/repos";
import { authMember, authUser, authVerification, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { expect, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.43";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

/** Fictional, used once. */
const PASSWORD = "журавлі-над-ставком-восени";

test.describe("the invitation link sets a password (PW-2)", () => {
  let server: SignInServer | undefined;
  let email = "";
  let token = "";
  let userId = "";
  const db = createDatabase(HARNESS_DATABASE_URL);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    server = await startSignInServer(HARNESS_DATABASE_URL);
    email = `harness-invite-${randomUUID()}@example.test`;
    const now = new Date();
    const operatorId = randomUUID();
    await db.insert(authUser).values({
      id: operatorId,
      name: "Harness operator",
      email: `harness-operator-${randomUUID()}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    // The pending seeded shelter: an invitation needs no verified status, and the verified and
    // suspended ones without an organization are other specs'.
    const shelter = (
      await db
        .select({
          id: shelters.id,
          organizationId: shelters.organizationId,
          status: shelters.verificationStatus,
        })
        .from(shelters)
    ).find((row) => row.organizationId === null && row.status === "pending");
    if (shelter === undefined) throw new Error("no pending seeded shelter without an organization");
    const invitationId = randomUUID();
    const invited = await kabinetInvitationRepo(db).invite({
      shelterId: shelter.id as never,
      email,
      name: "Harness invitee",
      inviterUserId: operatorId,
      ids: { invitationId, userId: randomUUID(), organizationId: randomUUID() },
      now,
      history: {
        id: randomUUID(),
        entry: { kind: "admin_invited", at: now, moderatorId: operatorId as never, email },
      },
    });
    if (invited.kind !== "invited") throw new Error("the invitation was refused");
    userId = invited.userId;
    // As `newInviteToken` makes one: 32 random bytes, base64url.
    token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    await kabinetInviteTokenRepo(db).issue({
      id: randomUUID(),
      invitationId,
      token,
      expiresAt: invited.expiresAt,
      now,
    });
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test("invite → «Створіть пароль» → the cabinet → sign out → the link is dead → sign in with the password", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    if (server === undefined) throw new Error("no sign-in server");
    const origin = server.origin;
    const linkPath = `/kabinet/vkhid?zaproshennia=${token}`;
    const linkRows = async () =>
      (await db.select().from(authVerification)).filter((row) =>
        row.value.startsWith("invitation:"),
      ).length;

    // A mail scanner opens it, twice, and a HEAD: nothing changes.
    const before = await linkRows();
    for (let i = 0; i < 2; i++) {
      expect((await fetch(`${origin}${linkPath}`)).status, `GET ${i + 1}`).toBe(200);
    }
    expect((await fetch(`${origin}${linkPath}`, { method: "HEAD" })).status).toBe(200);
    expect(await linkRows()).toBe(before);

    const context = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
    });
    const page = await context.newPage();

    // The page: never cached, no referrer, the token out of the address bar.
    const shown = await page.goto(linkPath);
    expect(shown?.status()).toBe(200);
    expect(shown?.headers()["cache-control"] ?? "").toContain("no-store");
    expect(shown?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("heading", { level: 1, name: "Створіть пароль" })).toBeVisible();
    // The address, masked (`maskAddress`: first letter, •••, the domain), never in full.
    await expect(page.getByText(/Адреса для входу: h•••@example\.test\./)).toBeVisible();
    await expect(page.getByText(email)).toHaveCount(0);
    await expect.poll(() => page.url().includes("zaproshennia=")).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/kabinet/vkhid");

    // Show/hide works on the field.
    const field = page.getByLabel("Пароль", { exact: true });
    await field.fill(PASSWORD);
    await page.getByRole("button", { name: "Показати пароль" }).first().click();
    await expect(field).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Сховати пароль" }).first().click();
    await expect(field).toHaveAttribute("type", "password");

    // A refusal first (too common, his sentence): the link stays usable.
    await field.fill("qwertyuiop");
    await page.getByLabel("Повторіть пароль").fill("qwertyuiop");
    await page.getByRole("button", { name: "Зберегти й увійти" }).click();
    await expect(page.getByText("Цей пароль надто легко вгадати. Оберіть інший.")).toBeVisible();

    // The password: the POST carries the real Origin and no Referer, and lands in the cabinet.
    await field.fill(PASSWORD);
    await page.getByLabel("Повторіть пароль").fill(PASSWORD);
    const posted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/kabinet/invitation/acceptWithPassword",
    );
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet"),
      page.getByRole("button", { name: "Зберегти й увійти" }).click(),
    ]);
    const headers = await (await posted).allHeaders();
    expect({ origin: headers.origin, referer: headers.referer ?? null }).toEqual({
      origin,
      referer: null,
    });
    await expect(page.getByRole("heading", { level: 1, name: "Профіль притулку" })).toBeVisible();
    expect(
      (await db.select().from(authMember)).filter((member) => member.userId === userId),
    ).toHaveLength(1);

    // Sign out.
    await page.getByRole("button", { name: "Вийти" }).click();
    await page.waitForURL((url) => url.pathname === "/kabinet/vkhid");

    // The link again: the one page for a link that can't be used.
    await page.goto(linkPath);
    await expect(
      page.getByRole("heading", { level: 1, name: "Цим запрошенням не можна скористатися" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Посилання вже не діє. Якщо пароль уже створено - увійдіть. Якщо ні - напишіть мені, і я надішлю нове запрошення.",
      ),
    ).toBeVisible();

    // Sign in with the password, from that page's own link.
    await page.getByRole("link", { name: "Перейти до входу" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Вхід до кабінету" })).toBeVisible();
    await page.getByLabel("Електронна пошта").fill(email);
    await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet"),
      page.getByRole("button", { name: "Увійти", exact: true }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: "Профіль притулку" })).toBeVisible();
    await context.close();
  });
});
