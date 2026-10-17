/**
 * R-UI 3 in a real browser, along Oleksii's rehearsal step 5 (RU-B5): the
 * operator takes a pending shelter under review, approves it, suspends it with
 * a reason, the shelter's admin reads that reason on `/kabinet` while it is
 * suspended, the operator reinstates it, and S4's history shows each move.
 * Flows only, by role, label and text (Oleksii, 2026-10-17: "Test logic, not
 * looks").
 *
 * `test.describe.fixme` until the rebase: S4 (`/kabinet/prytulky/[id]`) and
 * its history are R-UI 1's, and the actions mount on it then (`rebase: mount
 * on S4` in `features/kabinet/operator/actions/`). Remove the marker when the
 * page exists; Playwright reports an unexpected pass otherwise.
 *
 * Both people sign in the real way on `sign-in-server.ts`'s second server
 * (the magic link off its stdout), the operator by a `super_admins` grant in
 * this run's own database, the shelter's admin by a membership. The shelter
 * is created here, fictional, with the evidence an unregistered initiative
 * needs (a site visit and two references), so approve is open. The registry
 * needs `LOCATION_HMAC_SECRET` (RG-Q10), given to that server only.
 *
 * Own `x-forwarded-for` (TEST-NET-2 .36). Tracing off: the links are
 * credentials, even test ones.
 */

import { randomUUID } from "node:crypto";
import { createDatabase, productionLocationPolicy } from "@opika/db";
import { kabinetInvitationRepo, kabinetShelterRepo } from "@opika/db/repos";
import { authMember, authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import { type ModeratorId, publicLocationOf, type Shelter, type ShelterId } from "@opika/domain";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.36";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));
/** rebase: use R-UI 1's harness constant for this key if it adds one. At least 32 characters. */
const HARNESS_LOCATION_HMAC_SECRET = "test-location-hmac-secret-for-harness-only-0123";

const NOTE = "Скарга від ветклініки на умови утримання. Напишу після повторного візиту.";

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
  // «Увійти» on the confirm page; signed in once it lands past sign-in (the
  // admin on /kabinet, the operator redirected on to the list).
  await Promise.all([
    page.waitForURL(
      (url) => url.pathname.startsWith("/kabinet") && !url.pathname.startsWith("/kabinet/vkhid"),
    ),
    page.getByRole("button").click(),
  ]);
  await page.close();
  return context;
}

test.describe
  .fixme("S4 actions, rehearsal step 5 (R-UI 3)", () => {
    let server: SignInServer | undefined;
    let operator: BrowserContext | undefined;
    let shelterAdmin: BrowserContext | undefined;
    let shelterId: ShelterId | undefined;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      const db = createDatabase(HARNESS_DATABASE_URL);
      const now = new Date();
      server = await startSignInServer(HARNESS_DATABASE_URL, {
        LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET,
      });

      // The operator: a user and an active grant, nothing else.
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

      // A fictional pending initiative with the evidence its policy needs.
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
        pendingDonation: null,
        version: 0,
        freshnessSentence: null,
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
              {
                kind: "reference_contact",
                name: "Ветклініка «Тест»",
                channel: { kind: "phone", e164: "+380505552108" },
                relationship: "veterinary_clinic",
              },
              {
                kind: "reference_contact",
                name: "Громада «Тест»",
                channel: { kind: "phone", e164: "+380505552109" },
                relationship: "local_authority",
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

      // The shelter's admin: a user and a membership.
      const adminEmail = `harness-rui3-admin-${randomUUID()}@example.test`;
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

    const shelterPage = async (): Promise<Page> => {
      if (operator === undefined || shelterId === undefined) throw new Error("not set up");
      const page = await operator.newPage();
      expect((await page.goto(`/kabinet/prytulky/${shelterId}`))?.status()).toBe(200);
      return page;
    };

    test("start review → approve → suspend with a reason → the shelter reads it → reinstate → history", async () => {
      const page = await shelterPage();
      const decision = page.getByRole("region", { name: "Рішення" });

      await decision.getByRole("button", { name: "Взяти на розгляд" }).click();
      await decision.getByRole("button", { name: "Схвалити → «Перевірено»" }).click();
      await decision.getByRole("button", { name: "Призупинити…" }).click();

      const dialog = page.getByRole("dialog", { name: /^Призупинити «/ });
      await expect(dialog.getByRole("button", { name: "Призупинити" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await dialog.getByLabel("Причина").selectOption({ label: "Скарга підтвердилася" });
      await dialog.getByLabel("Пояснення").fill(NOTE);
      await dialog.getByRole("button", { name: "Призупинити" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        decision.getByRole("button", { name: "Відновити → «Перевірено»" }),
      ).toBeVisible();

      // While suspended, the shelter's admin reads the code and the note on /kabinet (answer 7).
      if (shelterAdmin === undefined) throw new Error("not set up");
      const kabinet = await shelterAdmin.newPage();
      expect((await kabinet.goto("/kabinet"))?.status()).toBe(200);
      const notice = kabinet.getByRole("region", { name: "Притулок тимчасово призупинено" });
      await expect(notice.getByText("Причина: Скарга підтвердилася.")).toBeVisible();
      await expect(notice.getByText(NOTE, { exact: true })).toBeVisible();
      await kabinet.close();

      await decision.getByRole("button", { name: "Відновити → «Перевірено»" }).click();
      await expect(decision.getByRole("button", { name: "Призупинити…" })).toBeVisible();

      // S4's history (R-UI 1) shows each move, impersonal, the actor appended.
      await page.reload();
      const history = page.getByRole("region", { name: "Історія" });
      await expect(history.getByText(/^Взято на розгляд/)).toBeVisible();
      await expect(history.getByText(/^Схвалено → «Перевірено»/)).toBeVisible();
      await expect(
        history.getByText(`Призупинено: Скарга підтвердилася. ${NOTE}`, { exact: false }),
      ).toBeVisible();
      await expect(history.getByText(/^Відновлено → «Перевірено»/)).toBeVisible();
      await page.close();
    });
  });
