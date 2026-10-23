import type { ModeratorId, ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { authOrganization, authUser } from "../src/schema/auth";
import { buildCities, buildShelters, insertSeedData, truncateForReseed } from "../src/seed";
import { resetTestDatabaseRows } from "../src/test-utils/reset-test-database";
import { setupTestDatabase, TEST_DATABASE_URL, truncateAll } from "../src/test-utils/setup";

/**
 * Harness isolation (#180's review, finding 2). A harness run stopped after a
 * kabinet spec invited a seeded shelter leaves its database behind, and
 * `db:seed` truncates the shelters but not `auth_*`. Seeded shelter ids are
 * deterministic and the organization's slug is the shelter id, so the next
 * run's invite of the same shelter used to fail on the slug's unique index.
 *
 * The killed run is reproduced by its leftover rows, not by killing anything:
 * a real invite of a seeded shelter, then the next run's setup as the harness
 * runs it (`test-db:reset`, then the seed's own truncate and insert).
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

const NOW = new Date("2026-10-21T10:00:00.000Z");
const OPERATOR = "harness-operator";
const actor = { moderatorId: "seed-moderator" as ModeratorId, now: NOW };
const cities = buildCities();
const shelters = buildShelters(cities);
const firstShelter = shelters[0];
if (firstShelter === undefined) throw new Error("The seed builds no shelters");
const SEEDED_SHELTER = firstShelter.id as ShelterId;

/** One run's database setup after migrate: the harness's reset, then `db:seed`'s truncate and insert. */
async function harnessRunSetup() {
  await resetTestDatabaseRows(TEST_DATABASE_URL);
  await truncateForReseed(db);
  await insertSeedData(db, { cities, shelters, animals: [] }, actor);
  await db
    .insert(authUser)
    .values({
      id: OPERATOR,
      name: "Оператор",
      email: "operator@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .onConflictDoNothing();
}

/** What a kabinet spec does to a seeded shelter: invites its first admin. */
const inviteSeededShelter = (run: number) =>
  kabinetInvitationRepo(db).invite({
    shelterId: SEEDED_SHELTER,
    email: `admin-${run}@example.org`,
    name: "Олена",
    inviterUserId: OPERATOR,
    ids: { invitationId: `inv-${run}`, userId: `user-${run}`, organizationId: `org-${run}` },
    now: NOW,
    history: {
      id: crypto.randomUUID(),
      entry: {
        kind: "admin_invited",
        at: NOW,
        moderatorId: OPERATOR as ModeratorId,
        email: `admin-${run}@example.org`,
      },
    },
  });

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
  await truncateAll(db);
  // insertSeedData narrates each step; nothing here needs it.
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
});

describe("the harness's setup after a run that never finished", () => {
  it("re-invites a seeded shelter that the previous run had already invited", async () => {
    await harnessRunSetup();
    expect((await inviteSeededShelter(1)).kind).toBe("invited");
    // The previous run stops here: its organization row, slug = the seeded id, stays behind.
    const leftover = await db
      .select({ id: authOrganization.id })
      .from(authOrganization)
      .where(eq(authOrganization.slug, SEEDED_SHELTER));
    expect(leftover).toEqual([{ id: "org-1" }]);

    await harnessRunSetup();

    expect((await inviteSeededShelter(2)).kind).toBe("invited");
    const organizations = await db
      .select({ id: authOrganization.id, slug: authOrganization.slug })
      .from(authOrganization);
    expect(organizations).toEqual([{ id: "org-2", slug: SEEDED_SHELTER }]);
  });

  it("refuses to reset anything but a local, disposable test database", async () => {
    await expect(
      resetTestDatabaseRows("postgres://opika:opika@localhost:5433/opika"),
    ).rejects.toThrow(/derived opika_test_\/opika_harness_ name/);
  });
});
