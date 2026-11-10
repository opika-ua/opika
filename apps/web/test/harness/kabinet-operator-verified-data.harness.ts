/**
 * The operator corrects a shelter's placeholder ЄДРПОУ on S4 («Юридичні дані» → «Змінити») and
 * the history shows «Змінено юридичні дані» through the page's own re-read, with no reload.
 * Flows only, by role, label and text. Fictional shelter; the operator signs in the real way on
 * `sign-in-server.ts`'s server. Own `x-forwarded-for` (TEST-NET-2 .78). Tracing off: the sign-in
 * link is a credential, even a test one.
 */

import { randomUUID } from "node:crypto";
import { createDatabase, productionLocationPolicy } from "@opika/db";
import { kabinetShelterRepo } from "@opika/db/repos";
import { authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, testDatabaseUrl } from "@opika/db/test";
import {
  EdrpouSchema,
  type ModeratorId,
  publicLocationOf,
  type Shelter,
  type ShelterId,
} from "@opika/domain";
import { type BrowserContext, expect, test } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET } from "../harness-env";
import { type SignInServer, startSignInServer } from "./sign-in-server";

const FORWARDED_FOR = "198.51.100.78";
test.use({ extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR }, trace: "off" });

const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

test.describe("S4 locked blocks: the operator changes ЄДРПОУ", () => {
  let server: SignInServer | undefined;
  let operator: BrowserContext | undefined;
  let shelterId: ShelterId | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const db = createDatabase(HARNESS_DATABASE_URL);
    const now = new Date();
    server = await startSignInServer(HARNESS_DATABASE_URL, {
      LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET,
    });

    const operatorEmail = `harness-verified-data-${randomUUID()}@example.test`;
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

    const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (city === undefined) throw new Error("no seeded city");
    const id = randomUUID() as ShelterId;
    const exactAddress = {
      line1: "вул. Тестова, 2",
      line2: null,
      postalCode: null,
      cityId: city.id as never,
      district: null,
      coordinates: { lat: 50.45, lng: 30.52 },
    };
    const shelter: Shelter = {
      id,
      displayName: `Притулок «Заглушка ${id.slice(0, 4)}»`,
      description: { uk: "Вигаданий притулок для перевірки екранів.", en: null },
      legalEntity: {
        kind: "sole_proprietor",
        legalName: "ФОП Тестова",
        edrpou: EdrpouSchema.parse("00000000"),
      },
      publicLocation: publicLocationOf(
        id,
        exactAddress,
        productionLocationPolicy(HARNESS_LOCATION_HMAC_SECRET),
      ),
      exactAddress,
      contact: { primary: { kind: "phone", e164: "+380671234568" }, additional: [] },
      donation: null,
      logo: null,
      pendingDonation: null,
      version: 0,
      earlyListingSince: null,
      freshnessSentence: null,
      verification: {
        status: "pending",
        submittedAt: now,
        evidence: { submittedAt: now, items: [] },
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

    const { origin } = server;
    const requested = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-forwarded-for": FORWARDED_FOR },
      body: JSON.stringify({ email: operatorEmail }),
    });
    expect(requested.status).toBe(200);
    const link = await server.linkFor(operatorEmail);
    operator = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR },
    });
    const page = await operator.newPage();
    expect((await page.goto(link))?.status()).toBe(200);
    await Promise.all([
      page.waitForURL(
        (url) => url.pathname.startsWith("/kabinet") && !url.pathname.startsWith("/kabinet/vkhid"),
      ),
      page.getByRole("button").click(),
    ]);
    await page.close();
  });

  test.afterAll(async () => {
    await operator?.close();
    await server?.stop();
  });

  test("«Змінити» → new ЄДРПОУ → «Зберегти»: the block and the history follow, no reload", async () => {
    if (operator === undefined || shelterId === undefined) throw new Error("not set up");
    const page = await operator.newPage();
    expect((await page.goto(`/kabinet/prytulky/${shelterId}`))?.status()).toBe(200);
    const legal = page.getByRole("region", { name: "Юридичні дані" });
    await legal.getByRole("button", { name: "Змінити" }).click();
    const field = legal.getByRole("textbox", { name: "Код ЄДРПОУ" });
    await expect(field).toHaveValue("00000000");
    await field.fill("12345678");
    await legal.getByRole("button", { name: "Зберегти" }).click();
    await expect(legal.getByRole("status").filter({ hasText: "Збережено." })).toBeVisible();
    await expect(legal.getByText("12 345 678")).toBeVisible();
    const history = page.getByRole("region", { name: "Історія" });
    await expect(history.getByText("Змінено юридичні дані")).toBeVisible();
    await page.close();
  });
});
