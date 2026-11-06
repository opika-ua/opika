import { randomUUID } from "node:crypto";
import { createDatabase, productionLocationPolicy } from "@opika/db";
import { animalRepo, kabinetInvitationRepo, kabinetShelterRepo } from "@opika/db/repos";
import { authMember, authUser, cities, superAdmins } from "@opika/db/schema";
import { assertDisposableTestDatabase, makeAnimal, testDatabaseUrl } from "@opika/db/test";
import {
  type ModeratorId,
  publicLocationOf,
  type Shelter,
  type ShelterId,
  type ShelterVerification,
} from "@opika/domain";
import { type Browser, type BrowserContext, expect } from "@playwright/test";
import { HARNESS_LOCATION_HMAC_SECRET, PRELAUNCH_GATE_STORAGE_STATE_PATH } from "../harness-env";
import type { SignInServer } from "./sign-in-server";

/*
 * The specs using this file are named `zz-*` on purpose: Playwright runs files alphabetically, and
 * several older specs pick seeded shelters by an unordered `find` over `shelters`. Rows added
 * before them can change that scan order (CI run 42232240979 broke kabinet and shelter-filters),
 * so these specs run last.
 */
export const HARNESS_DATABASE_URL = assertDisposableTestDatabase(testDatabaseUrl("harness"));

/** `LOCATION_HMAC_SECRET` for the sign-in server: the shelter's public location is derived with it. */
export const LOCATION_ENV = { LOCATION_HMAC_SECRET: HARNESS_LOCATION_HMAC_SECRET };

export type Fixture = {
  shelterId: ShelterId;
  animalId: string;
  animalName: string;
  operatorEmail: string;
  adminEmail: string;
};

/**
 * A fictional shelter with one published animal, its admin and an operator, created straight in
 * the harness database (the operator and the admin sign in through the real magic link). The
 * `verification` is the only thing the specs differ in.
 */
export async function createFixture(
  label: string,
  verification: (operatorId: ModeratorId, now: Date) => ShelterVerification,
): Promise<Fixture> {
  const db = createDatabase(HARNESS_DATABASE_URL);
  const now = new Date();
  const user = async (name: string) => {
    const email = `harness-${label}-${name}-${randomUUID()}@example.test`;
    const id = randomUUID();
    await db.insert(authUser).values({
      id,
      name: `Harness ${name}`,
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    return { id, email };
  };
  const operator = await user("operator");
  await db.insert(superAdmins).values({ id: randomUUID(), userId: operator.id, grantedAt: now });
  const [city] = await db.select({ id: cities.id }).from(cities).limit(1);
  if (city === undefined) throw new Error("no seeded city");

  const shelterId = randomUUID() as ShelterId;
  const exactAddress = {
    line1: "вул. Тестова, 1",
    line2: null,
    postalCode: null,
    cityId: city.id as never,
    district: null,
    coordinates: { lat: 50.45, lng: 30.52 },
  };
  const shelter: Shelter = {
    id: shelterId,
    displayName: `Притулок «Репетиція ${shelterId.slice(0, 4)}»`,
    description: { uk: "Вигаданий притулок для перевірки екранів.", en: null },
    legalEntity: { kind: "unregistered_initiative", contactPersonName: "Олена Тестова" },
    publicLocation: publicLocationOf(
      shelterId,
      exactAddress,
      productionLocationPolicy(HARNESS_LOCATION_HMAC_SECRET),
    ),
    exactAddress,
    contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
    donation: null,
    logo: null,
    pendingDonation: null,
    version: 0,
    earlyListingSince: null,
    freshnessSentence: null,
    verification: verification(operator.id as ModeratorId, now),
    createdAt: now,
    lastUpdatedAt: now,
  };
  await kabinetShelterRepo(db).createWithHistory(shelter, {
    id: randomUUID(),
    entry: {
      kind: "shelter_created",
      at: now,
      moderatorId: operator.id as ModeratorId,
      via: "registry",
    },
  });
  const animalName = `Тестовик${shelterId.slice(0, 4)}`;
  const animal = makeAnimal({ shelterId, name: animalName });
  await animalRepo(db).insert(animal, city.id as never);

  const admin = await user("admin");
  const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
    shelterId,
    { organizationId: randomUUID() },
    now,
  );
  await db.insert(authMember).values({
    id: randomUUID(),
    organizationId,
    userId: admin.id,
    role: "admin",
    createdAt: now,
  });
  return {
    shelterId,
    animalId: animal.id,
    animalName,
    operatorEmail: operator.email,
    adminEmail: admin.email,
  };
}

/** A context signed in through the real magic link (the server's console sender prints it). */
export async function signedIn(
  browser: Browser,
  server: SignInServer,
  email: string,
  forwardedFor: string,
): Promise<BrowserContext> {
  const { origin } = server;
  const requested = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": forwardedFor },
    body: JSON.stringify({ email }),
  });
  expect(requested.status).toBe(200);
  const link = await server.linkFor(email);
  const context = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { "x-forwarded-for": forwardedFor },
  });
  const page = await context.newPage();
  expect((await page.goto(link))?.status()).toBe(200);
  await Promise.all([
    page.waitForURL(
      (url) => url.pathname.startsWith("/kabinet") && !url.pathname.startsWith("/kabinet/vkhid"),
    ),
    page.getByRole("button").click(),
  ]);
  await page.close();
  return context;
}

/** An adopter's context on the sign-in server: no session, only the pre-launch gate cookie. */
export const adopterContext = (browser: Browser, server: SignInServer, forwardedFor: string) =>
  browser.newContext({
    baseURL: server.origin,
    storageState: PRELAUNCH_GATE_STORAGE_STATE_PATH,
    extraHTTPHeaders: { "x-forwarded-for": forwardedFor },
  });
