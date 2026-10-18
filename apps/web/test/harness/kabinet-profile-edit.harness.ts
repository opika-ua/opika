/**
 * K4, profile editing, in a real browser: a few flows by role, label and
 * text only (Oleksii, 2026-10-17: "Test logic, not looks ... a few Playwright
 * flow tests that query by role/label/text only; accessibility basics").
 *
 * Writes go through the served route and its own write policy, which opens
 * every shelter's writes to its own admins (PR 6).
 * Nothing in the app is patched, and no environment variable opens anything.
 * The second server is `sign-in-server.ts`'s, for the reason given there (the
 * main server is production mode, where sign-in stays off).
 *
 * The shelter is left as found: the pause flow resumes, and the contact edit
 * is put back, so the specs after this one see the seeded data.
 *
 * Own `x-forwarded-for` (TEST-NET-2 .35). Tracing off: the magic link is a
 * credential, even a test one.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.35";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

test.describe("/kabinet K4 profile editing (a shelter's own admin)", () => {
  let server: SignInServer | undefined;
  let context: BrowserContext | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const db = createDatabase(HARNESS_DATABASE_URL);
    // A verified seeded (fictional) shelter nobody has signed in to yet, so
    // the pause flow has a legal move.
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

    server = await startSignInServer(HARNESS_DATABASE_URL);
    const { origin } = server;

    const email = `harness-k4-${randomUUID()}@example.test`;
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
    // «Увійти», then signed in once the page is the cabinet. Waited on by the
    // URL and the heading, not by the GET's response event: CI once spent the
    // hook's whole 120 s here with /kabinet already rendered (run
    // 39065612577), the event never matched; a URL already reached still
    // satisfies `waitForURL`. Each test's own `goto("/kabinet")` asserts 200.
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kabinet"),
      page.getByRole("button").click(),
    ]);
    await expect(page.getByRole("heading", { level: 1, name: "Профіль притулку" })).toBeVisible();
    await page.close();
  });

  test.afterAll(async () => {
    await context?.close();
    await server?.stop();
  });

  const profilePage = async (): Promise<Page> => {
    if (context === undefined) throw new Error("not signed in");
    const page = await context.newPage();
    expect((await page.goto("/kabinet"))?.status()).toBe(200);
    return page;
  };

  test("edit the phone, save, see «Збережено.», and the new value after a reload", async () => {
    const page = await profilePage();
    const contacts = page.getByRole("region", { name: "Контакти" });
    const phone = contacts.getByLabel(/^Телефон/);
    const before = await phone.inputValue();

    await phone.fill("+380 50 111-22-33");
    await contacts.getByRole("button", { name: "Зберегти" }).click();
    await expect(contacts.getByRole("status")).toHaveText("Збережено.");

    await page.reload();
    await expect(page.getByRole("region", { name: "Контакти" }).getByLabel(/^Телефон/)).toHaveValue(
      "+380501112233",
    );

    // Put the seeded value back (or clear it, if there was none and another channel remains).
    const again = page.getByRole("region", { name: "Контакти" });
    await again.getByLabel(/^Телефон/).fill(before);
    if (before !== "+380501112233") {
      await again.getByRole("button", { name: "Зберегти" }).click();
      await expect(again.getByRole("status")).toHaveText("Збережено.");
    }
    await page.close();
  });

  test("pause with a reason, then resume", async () => {
    const page = await profilePage();
    await page.getByRole("button", { name: "Призупинити прийом тварин" }).click();
    const dialog = page.getByRole("dialog", { name: "Призупинити прийом тварин?" });
    await dialog.getByLabel("Причина").selectOption({ label: "Сезонна перерва" });
    await dialog.getByRole("button", { name: "Призупинити прийом" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Прийом на паузі.", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Прийом на паузі з .+ · Сезонна перерва$/)).toBeVisible();

    await page.getByRole("button", { name: "Відновити прийом тварин" }).click();
    await expect(page.getByText("Прийом відновлено. Ваших тварин знову видно.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Призупинити прийом тварин" })).toBeVisible();
    await page.close();
  });

  /**
   * The touch-target token (Oleksii, verbatim: "a shared min-height token on
   * the shared button/control primitives, plus ONE test on those primitives
   * that the computed min-height is ≥ 48px"). A real browser computes the
   * Tailwind class; happy-dom can't. One control of each primitive, on this
   * page and, for K3's `SegmentedControl` (PR 4), on the animal form, which
   * this shelter's allowlisted writes open too. A segment's radio is visually
   * hidden inside it, so the target measured is the segment (its label).
   * A failure names the control by its accessible name (its label, else its
   * aria-label or text), so it says which one fell short.
   */
  test("the shared controls compute a min-height of at least 48px", async () => {
    const page = await profilePage();
    if (context === undefined) throw new Error("not signed in");
    const form = await context.newPage();
    expect((await form.goto("/kabinet/tvaryny/nova"))?.status()).toBe(200);
    const controls = [
      ["TextField", page.getByRole("region", { name: "Контакти" }).getByLabel(/^Телефон/)],
      [
        "TextAreaField",
        page.getByRole("region", { name: "Голос притулку" }).getByLabel("Ваші слова на картках"),
      ],
      ["Button, secondary", page.getByRole("button", { name: "Вставити {імʼя}" })],
      ["Button, secondary", page.getByRole("button", { name: "Призупинити прийом тварин" })],
      ["SegmentedControl", form.getByRole("radio", { name: "Собака" })],
    ] as const;
    for (const [primitive, control] of controls) {
      const { name, minHeight } = await control.evaluate((el) => {
        const label = (el as HTMLInputElement).labels?.[0];
        const target = (el as HTMLInputElement).type === "radio" && label ? label : el;
        return {
          name: (label?.textContent ?? el.getAttribute("aria-label") ?? el.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim(),
          minHeight: Number.parseFloat(getComputedStyle(target).minHeight),
        };
      });
      expect(minHeight, `computed min-height of «${name}» (${primitive})`).toBeGreaterThanOrEqual(
        48,
      );
    }
    await form.close();
    await page.close();
  });

  /**
   * Focus presence only, never its look (Oleksii, verbatim: "Visible focus:
   * keep one presence test (focused element shows an indicator when
   * tabbing), never its appearance").
   */
  test("tabbing to a control shows a focus indicator", async () => {
    const page = await profilePage();
    const phone = page.getByRole("region", { name: "Контакти" }).getByLabel(/^Телефон/);
    let reached = false;
    for (let i = 0; i < 20 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await phone.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "the phone field is reachable by Tab").toBe(true);
    const indicator = await phone.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        focusVisible: el.matches(":focus-visible"),
        outline: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0,
        shadow: style.boxShadow !== "none",
      };
    });
    expect(indicator.focusVisible).toBe(true);
    expect(indicator.outline || indicator.shadow).toBe(true);
    await page.close();
  });
});
