import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countFullResetTables, FULL_RESET_TABLES, truncateFullReset } from "../src/full-reset";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { swipeRepo } from "../src/repos/swipe-repo";
import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
  invitationCreatedUsers,
  superAdmins,
  supportSessions,
} from "../src/schema/auth";
import { cities } from "../src/schema/cities";
import { r2UnreferencedObjects } from "../src/schema/r2-cleanup";
import { sessions } from "../src/schema/sessions";
import { shelters } from "../src/schema/shelters";
import { recordAnimalsImported } from "../src/script-history";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  makeSwipe,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * `db:full-reset`'s own regression test, independent of the table-coverage
 * scan (`full-reset-table-coverage.test.ts`, which proves the *list* is
 * exhaustive). This proves the *mechanism*: populated tables go to 0,
 * `cities` — the one deliberate exclusion — is untouched, row and all.
 *
 * Every table in `FULL_RESET_TABLES` gets at least one real row (Tier 1
 * review finding 5, PR #199): with only 4 of 17 populated, a `TRUNCATE` that
 * silently skipped the other 13 — `auth_user`, `super_admins` and
 * `auth_verification` included — still passed, since "0 before, 0 after" is
 * indistinguishable from "never touched because already empty." Grown to 18
 * with `r2_unreferenced_objects` (GDPR photo retention).
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-25T10:00:00.000Z");

/** One real row in every reset table, nothing shared with `cities`. */
async function populateEveryResetTable() {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id });
  await animalRepo(db).insert(animal, city.id as never);
  const adopter = makeAdopter();
  await adopterRepo(db).insert(adopter);
  await swipeRepo(db).record(makeSwipe({ adopterId: adopter.id, animalId: animal.id }));
  await revealRepo(db).insert(
    makeReveal({ adopterId: adopter.id, animalId: animal.id, shelterId: shelter.id }),
  );
  await db.insert(sessions).values({
    tokenHash: randomUUID(),
    adopterId: adopter.id,
    createdAt: NOW,
    lastSeenAt: NOW,
  });

  const operatorId = randomUUID();
  await db.insert(authUser).values({
    id: operatorId,
    name: "Оператор",
    email: `operator-${randomUUID()}@example.org`,
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(superAdmins).values({ id: randomUUID(), userId: operatorId, grantedAt: NOW });
  await db.insert(authVerification).values({
    id: randomUUID(),
    identifier: "verify-me@example.org",
    value: JSON.stringify({ email: "verify-me@example.org" }),
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    createdAt: NOW,
    updatedAt: NOW,
  });

  const organizationId = randomUUID();
  await db.insert(authOrganization).values({
    id: organizationId,
    name: "Тестовий притулок",
    slug: `test-${randomUUID()}`,
    logo: null,
    createdAt: NOW,
    metadata: null,
  });
  await db
    .update(shelters)
    .set({ organizationId })
    .where(eq(shelters.id, shelter.id as never));
  await recordAnimalsImported(db, shelter.id, 1, { moderatorId: operatorId as never, now: NOW });

  const adminId = randomUUID();
  await db.insert(authUser).values({
    id: adminId,
    name: "Адмін",
    email: `admin-${randomUUID()}@example.org`,
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authMember).values({
    id: randomUUID(),
    organizationId,
    userId: adminId,
    role: "admin",
    createdAt: NOW,
  });
  await db.insert(authSession).values({
    id: randomUUID(),
    token: randomUUID(),
    userId: adminId,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: adminId,
    providerId: "email",
    userId: adminId,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const invitationId = randomUUID();
  await db.insert(authInvitation).values({
    id: invitationId,
    organizationId,
    email: "invited@example.org",
    role: "admin",
    status: "pending",
    expiresAt: new Date(NOW.getTime() + 72 * 3_600_000),
    createdAt: NOW,
    inviterId: operatorId,
  });
  const invitedUserId = randomUUID();
  await db.insert(authUser).values({
    id: invitedUserId,
    name: "Запрошена",
    email: "invited@example.org",
    emailVerified: false,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(invitationCreatedUsers).values({
    userId: invitedUserId,
    invitationId,
    createdAt: NOW,
    firstSessionAt: null,
  });
  await db.insert(supportSessions).values({
    id: randomUUID(),
    operatorUserId: operatorId,
    shelterId: shelter.id as never,
    tokenHash: randomUUID(),
    startedAt: NOW,
    lastSeenAt: NOW,
  });
  await db.insert(r2UnreferencedObjects).values({
    objectKey: `animals/orphan-${randomUUID()}/card.webp`,
    firstSeenUnreferencedAt: NOW,
  });

  return { city };
}

describe("countFullResetTables / truncateFullReset", () => {
  it("counts what's there, truncates every listed table to 0, and leaves cities alone", async () => {
    const { city } = await populateEveryResetTable();

    const before = await countFullResetTables(db);
    for (const table of FULL_RESET_TABLES) {
      expect(before[table], `${table} should start with at least one row`).toBeGreaterThan(0);
    }

    await truncateFullReset(db);

    const after = await countFullResetTables(db);
    for (const table of FULL_RESET_TABLES) {
      expect(after[table], `${table} should be 0 after a full reset`).toBe(0);
    }

    // The one deliberate exclusion: still there, same row.
    const survivingCities = await db.select().from(cities);
    expect(survivingCities.map((c) => c.id)).toEqual([city.id]);
  });

  it("is a no-op on an already-empty database — every count is 0 before and after", async () => {
    const before = await countFullResetTables(db);
    for (const table of FULL_RESET_TABLES) expect(before[table]).toBe(0);
    await truncateFullReset(db);
    const after = await countFullResetTables(db);
    for (const table of FULL_RESET_TABLES) expect(after[table]).toBe(0);
  });
});
