/**
 * K3, the animal form, in a real browser: flows found by role, label and text
 * only (Oleksii, 2026-10-17: "Test logic, not looks ... a few Playwright flow
 * tests that query by role/label/text only"). Nothing is measured but one
 * data limit: the photo the device sends is at most 2000 px (K-Q2, P-T14).
 *
 * Writes open through the production-legal path, as in the K4 spec: this
 * server is started with `KABINET_WRITE_ALLOWLIST` naming the shelter signed
 * in here (K-Q17), read by the served route's own `shelterWritePolicyOf`.
 * Nothing in the app is patched. The second server is `sign-in-server.ts`'s,
 * for the reason given there.
 *
 * **Photos.** The harness never reaches R2 (no upload variables, so uploads
 * are off on this server, P-Q10). So the upload flow runs for real up to the
 * server's answer: the browser decodes and shrinks the file, sends it over
 * `XMLHttpRequest` (through the kabinet route's Origin check and multipart
 * parsing), and shows the server's «На цій версії сайту фото завантажити не
 * можна.». The stored photo the gap list then counts is put on the draft the
 * way the operator's onboarding script stores one, a row write in this
 * checkout's disposable harness database.
 *
 * The shelter is the last verified seeded one nobody has signed in to, so
 * the K4 spec (which takes the first) keeps its own. Its drafts stay drafts:
 * nothing here publishes, so no public surface changes for the specs after
 * this one.
 *
 * Own `x-forwarded-for` (TEST-NET-2 .36). Tracing off: the magic link is a
 * credential, even a test one.
 */

import { randomUUID } from "node:crypto";
import { createDatabase } from "@opika/db";
import { animalRepo, kabinetInvitationRepo } from "@opika/db/repos";
import { animals, authMember, authUser, shelters } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import type { AnimalId, CityId } from "@opika/domain";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.36";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

/** K-Q2: the longest side the device sends. Transcribed, not imported, so a change there fails here. */
const MAX_EDGE_PX = 2000;

/**
 * The width and height in a JPEG's frame header (SOFn), walking its markers
 * from the start; null if the bytes hold no JPEG frame.
 */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  const start = bytes.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (start < 0) return null;
  let at = start + 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    const length = bytes.readUInt16BE(at + 2);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    at += 2 + length;
  }
  return null;
}

test.describe("/kabinet/tvaryny K3 animal form (allowlisted shelter)", () => {
  test.describe.configure({ mode: "serial" });

  let server: SignInServer | undefined;
  let context: BrowserContext | undefined;
  let draftId: AnimalId | undefined;
  const db = createDatabase(HARNESS_DATABASE_URL);

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
      .at(-1);
    if (shelter === undefined)
      throw new Error("no verified seeded shelter without an organization");

    server = await startSignInServer(HARNESS_DATABASE_URL, {
      KABINET_WRITE_ALLOWLIST: shelter.id,
    });
    const { origin } = server;

    const email = `harness-k3-${randomUUID()}@example.test`;
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
    // «Увійти», then signed in once the page is the cabinet: waited on by the URL and the
    // heading, not by the GET's response event, which CI has missed with /kabinet already
    // rendered (the same fix as b598d93 for K4 and #120's for KS-T3; AW-H2). Each test's own
    // `goto("/kabinet")` asserts 200.
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

  const open = async (path: string): Promise<Page> => {
    if (context === undefined) throw new Error("not signed in");
    const page = await context.newPage();
    expect((await page.goto(path))?.status(), path).toBe(200);
    return page;
  };

  const publishButton = (page: Page) => page.getByRole("button", { name: "Опублікувати" });

  test("from the profile, «Нова тварина»: a name and a species save a draft; publish stays disabled with every gap written", async () => {
    const page = await open("/kabinet");
    await page.getByRole("link", { name: "Нова тварина" }).first().click();
    await expect(page).toHaveURL(/\/kabinet\/tvaryny\/nova$/);
    await expect(page.getByRole("heading", { level: 1, name: "Нова тварина" })).toBeVisible();

    await page.getByLabel("Імʼя").fill("Харнес");
    await page.getByRole("group", { name: "Вид" }).getByText("Собака").click();
    await page.getByRole("button", { name: "Зберегти чернетку" }).click();

    await expect(page).toHaveURL(/\/kabinet\/tvaryny\/[0-9a-f-]{36}$/);
    draftId = page.url().split("/").at(-1) as AnimalId;
    await expect(page.getByRole("heading", { level: 1, name: "Харнес" })).toBeVisible();
    await expect(
      page.getByText(
        /^Чернетку збережено о \d\d:\d\d · Ті, хто шукає тварину, цю чернетку не бачать\.$/,
      ),
    ).toBeVisible();
    await expect(publishButton(page)).toHaveAttribute("aria-disabled", "true");
    const missing = page.getByText("Щоб опублікувати, ще потрібно: розмір, вік, опис і фото.");
    await expect(missing).toBeVisible();
    await expect(publishButton(page)).toHaveAccessibleDescription(
      "Щоб опублікувати, ще потрібно: розмір, вік, опис і фото.",
    );

    // Stored: the draft's own address shows it after a reload, still a draft.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Харнес" })).toBeVisible();
    await expect(page.getByText("Чернетка", { exact: true })).toBeVisible();
    await page.close();
  });

  test("the facts filled in, the gap list shrinks to «фото»", async () => {
    const page = await open(`/kabinet/tvaryny/${draftId}`);
    await page.getByRole("group", { name: "Розмір" }).getByText("Середній").click();
    await page
      .getByRole("group", { name: "Вік на ту дату" })
      .getByText(/^Молодий/)
      .click();
    await expect(page.getByText("Ті, хто шукає тварину, побачать: «молодий».")).toBeVisible();
    await page.getByLabel("Про тварину").fill("Спокійний, любить гуляти в парку.");
    await page.getByRole("button", { name: "Зберегти чернетку" }).click();
    await expect(page.getByText("Щоб опублікувати, ще потрібно: фото.")).toBeVisible();
    await expect(publishButton(page)).toHaveAttribute("aria-disabled", "true");

    await page.reload();
    await expect(page.getByText("Щоб опублікувати, ще потрібно: фото.")).toBeVisible();
    await page.close();
  });

  test("a 4000 px photo is shrunk on the device to 2000 px, sent, and this server's refusal is his message", async () => {
    const page = await open(`/kabinet/tvaryny/${draftId}`);

    // A phone-sized photo, drawn in this browser: 4000 × 3000.
    const png = Buffer.from(
      await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 4000;
        canvas.height = 3000;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("no canvas");
        context.fillStyle = "#8a6";
        context.fillRect(0, 0, 4000, 3000);
        context.fillStyle = "#246";
        context.fillRect(1000, 750, 2000, 1500);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (blob === null) throw new Error("no PNG");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
      }),
      "base64",
    );

    let sent: Buffer | null = null;
    await page.route("**/api/kabinet/shelter/photos/add", async (route) => {
      sent = route.request().postDataBuffer();
      await route.continue();
    });

    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "+ Фото" }).click();
    await (await chooser).setFiles({ name: "IMG_4000.png", mimeType: "image/png", buffer: png });

    await expect(page.getByText("На цій версії сайту фото завантажити не можна.")).toBeVisible({
      timeout: 15_000,
    });
    expect(sent, "the upload reached the route").not.toBeNull();
    const size = jpegSize(sent as unknown as Buffer);
    expect(size, "the request carries a JPEG").not.toBeNull();
    expect(
      Math.max(size?.width ?? Number.POSITIVE_INFINITY, size?.height ?? Number.POSITIVE_INFINITY),
      `longest side of the JPEG sent (${size?.width}×${size?.height})`,
    ).toBeLessThanOrEqual(MAX_EDGE_PX);
    // Shrunk, not cropped: the 4:3 shape is kept.
    expect(size).toEqual({ width: 2000, height: 1500 });

    await page.getByRole("button", { name: "Прибрати фото, яке не завантажилось" }).click();
    await expect(page.getByText("На цій версії сайту фото завантажити не можна.")).toBeHidden();
    await page.close();
  });

  test("with a photo stored, nothing is missing and «Опублікувати» is enabled", async () => {
    if (draftId === undefined) throw new Error("no draft from the first test");
    const id = draftId;
    const draft = await animalRepo(db).findById(id);
    const row = (await db.select({ id: animals.id, cityId: animals.cityId }).from(animals)).find(
      (candidate) => candidate.id === id,
    );
    if (draft === null || row === undefined) throw new Error("the draft isn't stored");
    await animalRepo(db).update(
      {
        ...draft,
        photos: [{ storageKey: "seed-photos/dog-1.jpg", width: 1200, height: 1500, alt: null }],
      },
      row.cityId as CityId,
    );

    const page = await open(`/kabinet/tvaryny/${draftId}`);
    await expect(page.getByRole("group", { name: "Фото 1 з 1" })).toBeVisible();
    await expect(page.getByText("Обкладинка", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Щоб опублікувати, ще потрібно/)).toHaveCount(0);
    await expect(publishButton(page)).not.toHaveAttribute("aria-disabled", "true");
    await page.close();
  });
});
