/**
 * K4, profile editing, in a real browser: a few flows by role, label and
 * text only (Oleksii, 2026-10-17: "Test logic, not looks ... a few Playwright
 * flow tests that query by role/label/text only; accessibility basics").
 *
 * Kabinet redesign Phase 2 PR 1: this screen («Притулок») moved off
 * `/kabinet`, which now serves Головна instead - see `profilePage()` below.
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
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@opika/db";
import { kabinetInvitationRepo } from "@opika/db/repos";
import { authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectTabRowSound } from "./harness";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.35";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const SEED_PHOTO = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "seed-photos",
  "cat-1.jpg",
);

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

test.describe("/kabinet/prytulok K4 profile editing (a shelter's own admin)", () => {
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
      page.waitForURL((url) => url.pathname === "/kabinet/tvaryny"),
      page.getByRole("button").click(),
    ]);
    // Kabinet redesign Phase 2 PR 1: sign-in lands on Тварини.
    await expect(page.getByRole("heading", { level: 1, name: "Тварини" })).toBeVisible();
    await page.close();
  });

  test.afterAll(async () => {
    await context?.close();
    await server?.stop();
  });

  // Притулок (renamed from «Профіль притулку», kabinet redesign Phase 2 PR 1):
  // the editor moved off `/kabinet` (now Головна) to its own path.
  // Kabinet UX round 2: the editor is sub-tabs, addressable as `?tab=`.
  const profilePage = async (tab?: string): Promise<Page> => {
    if (context === undefined) throw new Error("not signed in");
    const page = await context.newPage();
    const path = tab === undefined ? "/kabinet/prytulok" : `/kabinet/prytulok?tab=${tab}`;
    expect((await page.goto(path))?.status()).toBe(200);
    return page;
  };

  for (const size of [
    { width: 360, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`the Притулок sub-tabs at ${size.width}px: at most 48px tall, no vertical scroll, a pointer on every tab, the focus ring inside the row`, async () => {
      const page = await profilePage();
      await page.setViewportSize(size);
      await expectTabRowSound(page, page.getByRole("tablist"));
      await page.close();
    });
  }

  test("edit the phone, save, see «Збережено.», and the new value after a reload", async () => {
    const page = await profilePage("kontakty");
    const contacts = page.getByRole("region", { name: "Контакти" });
    const phone = contacts.getByLabel(/^Телефон/);
    const before = await phone.inputValue();

    await phone.fill("+380 50 111-22-33");
    // The one page save bar appears only now that something is unsaved.
    await page.getByRole("button", { name: "Зберегти" }).click();
    // The confirmation: the pill's «Збережено о …», repeated in the line under the tabs.
    await expect(page.getByText(/^Збережено о \d\d:\d\d$/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Зберегти" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("region", { name: "Контакти" }).getByLabel(/^Телефон/)).toHaveValue(
      "+380501112233",
    );

    // Put the seeded value back (or clear it, if there was none and another channel remains).
    const again = page.getByRole("region", { name: "Контакти" });
    await again.getByLabel(/^Телефон/).fill(before);
    if (before !== "+380501112233") {
      await page.getByRole("button", { name: "Зберегти" }).click();
      await expect(page.getByText(/^Збережено о \d\d:\d\d$/).first()).toBeVisible();
    }
    await page.close();
  });

  /**
   * Save bar A. From 600px a floating pill whose right edge is the form column's; on a phone a
   * full-width bar with two equal 48px buttons that never covers the last field and never makes
   * the page scroll sideways. Opened with an edit, left unsaved (the page is closed).
   */
  test("the save pill sits on the form column's right edge at 1440", async () => {
    const page = await profilePage("kontakty");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page
      .getByRole("region", { name: "Контакти" })
      .getByLabel(/^Телефон/)
      .fill("+380 50 111-22-33");
    const pill = page.locator("[data-save-pill]");
    await expect(pill).toBeVisible();
    const column = await page.getByRole("tablist").locator("xpath=..").boundingBox();
    const box = await pill.boundingBox();
    if (column === null || box === null) throw new Error("no layout");
    expect(Math.abs(box.x + box.width - (column.x + column.width))).toBeLessThanOrEqual(2);
    expect(box.height).toBeGreaterThanOrEqual(56 - 1);
    await page.close();
  });

  test("the save bar at 393: equal 48px buttons, no sideways scroll, the last field stays clear", async () => {
    const page = await profilePage("kontakty");
    await page.setViewportSize({ width: 393, height: 800 });
    const contacts = page.getByRole("region", { name: "Контакти" });
    await contacts.getByLabel(/^Телефон/).fill("+380 50 111-22-33");
    const bar = page.locator("[data-save-pill]");
    await expect(bar).toBeVisible();
    const buttons = bar.getByRole("button");
    await expect(buttons).toHaveCount(2);
    const [first, second] = [
      await buttons.nth(0).boundingBox(),
      await buttons.nth(1).boundingBox(),
    ];
    if (first === null || second === null) throw new Error("no layout");
    expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
    expect(first.height).toBeGreaterThanOrEqual(48);
    expect(second.height).toBeGreaterThanOrEqual(48);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const fields = contacts.locator("input:visible");
    const last = await fields.last().boundingBox();
    const barBox = await bar.boundingBox();
    if (last === null || barBox === null) throw new Error("no layout");
    expect(last.y + last.height).toBeLessThanOrEqual(barBox.y);
    await page.close();
  });

  test("pause with a reason, then resume", async () => {
    const page = await profilePage("akaunt");
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
   * Pet card PR 3b. A real file, through a real browser's device-side
   * compression (`compressPhoto`'s canvas path - happy-dom has none, so this
   * is the one place that step runs for real) and a real round trip to the
   * server. This harness environment has no R2 credentials configured
   * (`photo-upload-env.ts`), so the real, honest answer here is
   * `PHOTO_UPLOADS_UNAVAILABLE` - which is exactly the failure mode the
   * section's own error mapping must render correctly, not a mocked stand-in
   * for a success this environment can't produce.
   */
  test("choosing a logo file runs real client-side compression and reports the server's real answer", async () => {
    const page = await profilePage();
    const section = page.getByRole("region", { name: "Логотип притулку" });
    // setInputFiles acts on the hidden <input> directly - no native file
    // picker dialog involved, so nothing here waits on one.
    await page.getByTestId("logo-file-input").setInputFiles(SEED_PHOTO);
    await expect(
      section.getByText("На цій версії сайту логотип завантажити не можна."),
    ).toBeVisible();
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
      [
        "TextField",
        "Контакти",
        page.getByRole("region", { name: "Контакти" }).getByLabel(/^Телефон/),
      ],
      [
        "TextAreaField",
        "Профіль",
        page
          .getByRole("region", { name: "Голос притулку" })
          .getByLabel("Ваші слова на сторінці притулку"),
      ],
      [
        "Button, secondary",
        "Акаунт",
        page.getByRole("button", { name: "Призупинити прийом тварин" }),
      ],
      ["SegmentedControl", null, form.getByRole("radio", { name: "Собака" })],
    ] as const;
    for (const [primitive, tab, control] of controls) {
      // Each control sits in its sub-tab; only the active panel is visible.
      if (tab !== null) await page.getByRole("tab", { name: tab }).click();
      const { name, minHeight } = await control.evaluate((el) => {
        const label = (el as HTMLInputElement).labels?.[0];
        const target = (el as HTMLInputElement).type === "radio" && label ? label : el;
        return {
          name: (label?.textContent ?? el.getAttribute("aria-label") ?? el.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim(),
          // A segment is 44px inside its 52px track: its hit area is the 48px+ ::before.
          minHeight: Math.max(
            Number.parseFloat(getComputedStyle(target).minHeight),
            Number.parseFloat(getComputedStyle(target, "::before").height) || 0,
          ),
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
    const page = await profilePage("kontakty");
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
