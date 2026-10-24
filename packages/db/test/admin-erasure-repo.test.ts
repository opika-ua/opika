import { randomUUID } from "node:crypto";
import { ERASED_ADMIN_EMAIL } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { erasableIf, eraseUsersAndScrubHistory } from "../src/repos/admin-erasure-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  authInvitation,
  authMember,
  authOrganization,
  authUser,
  invitationCreatedUsers,
  superAdmins,
  supportSessions,
} from "../src/schema/auth";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

/**
 * GDPR erasure, option A (`docs/gdpr-analysis.md` §5 item 4). Direct test of
 * `eraseUsersAndScrubHistory`'s SQL, independent of `registry.admins.remove`'s
 * own handler test — proves the compound condition (delete + both scrubs,
 * both or neither) and the scoping (the right shelter, the four history
 * kinds, every invitation row, the exact email) without going through the
 * full HTTP handler.
 *
 * Every admin — accepted or still pending — was created through an
 * invitation (`auth_invitation` → `shelters.organization_id`, joined by the
 * deleted user's own email), which is how `eraseUsersAndScrubHistory` finds
 * which shelter's history to scrub, rather than being told. These fixtures
 * build that real chain, not a bare `auth_user` row.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const EMAIL = "departed@example.org";
const NOW = new Date("2026-10-24T10:00:00.000Z");

/** The operator every invitation needs as its `inviterId` — not under test here. */
async function insertInviter() {
  const id = randomUUID();
  await db.insert(authUser).values({
    id,
    name: "Operator",
    email: `operator-${id}@example.org`,
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

async function insertOrganization() {
  const [org] = await db
    .insert(authOrganization)
    .values({
      id: randomUUID(),
      name: "Тестовий притулок",
      slug: `test-${randomUUID()}`,
      logo: null,
      createdAt: NOW,
      metadata: null,
    })
    .returning();
  if (!org) throw new Error("organization insert failed");
  return org.id;
}

/** A shelter linked to a real organization, the way `kabinetInvitationRepo.ensureOrganization` links one in production. */
async function insertShelterWithOrganization() {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  const organizationId = await insertOrganization();
  await db
    .update(shelters)
    .set({ organizationId })
    .where(eq(shelters.id, shelter.id as never));
  return { shelter, organizationId };
}

/**
 * An admin — real invitation, real `invitation_created_users` row, with its
 * own invitation status (`pending`/`accepted`/`canceled`) rather than an
 * implicit live-or-not flag: the generalised invariant (Oleksii, 2026-10-24,
 * the STOP decision, "A, generalised") no longer reads `firstSessionAt` at
 * all, only whether a *live* (pending, unexpired) invitation exists anywhere
 * for the address — this fixture has to be able to express every one of
 * those states directly, not infer them from "accepted". `invitationEmail`
 * defaults to `email`; passing a different casing simulates the one case
 * normalisation at write time is meant to prevent — `eraseUsersAndScrubHistory`'s
 * `lower()` joins are the defence in depth, not the only one, so the fixture
 * has to be able to force the mismatch directly rather than relying on
 * `invite()`'s own normalisation to never run.
 */
async function insertInvitedAdmin(input: {
  organizationId: string;
  email: string;
  status?: "pending" | "accepted" | "canceled";
  expiresAt?: Date;
  invitationEmail?: string;
}): Promise<{ userId: string; invitationId: string }> {
  const inviterId = await insertInviter();
  const userId = randomUUID();
  await db.insert(authUser).values({
    id: userId,
    name: "Departed Admin",
    email: input.email,
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const invitationId = randomUUID();
  const status = input.status ?? "accepted";
  await db.insert(authInvitation).values({
    id: invitationId,
    organizationId: input.organizationId,
    email: input.invitationEmail ?? input.email,
    role: "admin",
    status,
    expiresAt: input.expiresAt ?? new Date(NOW.getTime() + 72 * 60 * 60 * 1000),
    createdAt: NOW,
    inviterId,
  });
  await db.insert(invitationCreatedUsers).values({
    userId,
    invitationId,
    createdAt: NOW,
    firstSessionAt: null,
  });
  return { userId, invitationId };
}

async function insertHistory(
  shelterId: string,
  kind: "admin_joined" | "admin_removed",
  email: string,
) {
  const id = randomUUID();
  await db.insert(shelterHistory).values({
    id,
    shelterId: shelterId as never,
    kind,
    at: NOW,
    entry:
      kind === "admin_joined"
        ? ({
            kind: "admin_joined",
            at: NOW,
            shelterAdminId: id as never,
            invitationId: randomUUID() as never,
            email,
          } as never)
        : ({
            kind: "admin_removed",
            at: NOW,
            moderatorId: randomUUID() as never,
            email,
            wasPending: false,
          } as never),
  });
  return id;
}

const historyEmail = async (id: string): Promise<string> => {
  const [row] = await db.select().from(shelterHistory).where(eq(shelterHistory.id, id));
  const entry = row?.entry as { email?: string } | undefined;
  if (!entry?.email) throw new Error(`history row ${id} has no email`);
  return entry.email;
};

const invitationEmail = async (id: string): Promise<string | undefined> => {
  const [row] = await db.select().from(authInvitation).where(eq(authInvitation.id, id));
  return row?.email;
};

describe("eraseUsersAndScrubHistory, via erasableIf (registry.admins.remove's own case)", () => {
  it("deletes the account and scrubs this shelter's admin history and its own invitation, when the admin holds nothing else", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { userId, invitationId } = await insertInvitedAdmin({ organizationId, email: EMAIL });
    const joinedId = await insertHistory(shelter.id, "admin_joined", EMAIL);
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 2, invitationsScrubbed: 1 });
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toEqual([]);
    expect(await historyEmail(joinedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await historyEmail(removedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await invitationEmail(invitationId)).toBe(ERASED_ADMIN_EMAIL);
  });

  it("erases nothing when the user still holds another membership", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { userId, invitationId } = await insertInvitedAdmin({ organizationId, email: EMAIL });
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId,
      role: "member",
      createdAt: NOW,
    });
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result).toEqual({ erasedCount: 0, historyEntriesScrubbed: 0, invitationsScrubbed: 0 });
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
    expect(await historyEmail(removedId)).toBe(EMAIL);
    expect(await invitationEmail(invitationId)).toBe(EMAIL);
  });

  it("erases nothing when the user is a super_admin, active or revoked", async () => {
    for (const revokedAt of [null, NOW]) {
      await truncateAll(db);
      const { shelter, organizationId } = await insertShelterWithOrganization();
      const { userId } = await insertInvitedAdmin({ organizationId, email: EMAIL });
      await db.insert(superAdmins).values({ id: randomUUID(), userId, grantedAt: NOW, revokedAt });
      const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

      const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

      expect(result.erasedCount, `revokedAt=${revokedAt}`).toBe(0);
      expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
      expect(await historyEmail(removedId)).toBe(EMAIL);
    }
  });

  it("erases nothing when the user has a support session as operator", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { userId } = await insertInvitedAdmin({ organizationId, email: EMAIL });
    await db.insert(supportSessions).values({
      id: randomUUID(),
      operatorUserId: userId,
      shelterId: shelter.id as never,
      tokenHash: randomUUID(),
      startedAt: NOW,
      lastSeenAt: NOW,
      endedAt: null,
      endReason: null,
    });
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result.erasedCount).toBe(0);
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
    expect(await historyEmail(removedId)).toBe(EMAIL);
  });

  it("erases nothing when a live invitation to another shelter still exists", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { organizationId: otherOrg } = await insertShelterWithOrganization();
    const { userId } = await insertInvitedAdmin({ organizationId, email: EMAIL });
    const inviterId = await insertInviter();
    await db.insert(authInvitation).values({
      id: randomUUID(),
      organizationId: otherOrg,
      email: EMAIL,
      role: "admin",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      createdAt: NOW,
      inviterId,
    });
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result.erasedCount).toBe(0);
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
    expect(await historyEmail(removedId)).toBe(EMAIL);
  });

  /**
   * PR #198's Tier 1 delta review, finding 5 (Oleksii's fix, verbatim: "one
   * shared comparison for erasure and accept, a test at the exact expiry
   * instant"). `invitationNotExpiredAt` (`../src/repos/invitation-liveness.ts`)
   * uses `>=`, matching the accept flow's own "accepts an invitation at its
   * exact expiry instant" behaviour — so a live-invitation-elsewhere check
   * must still find it live at that exact instant, not already dead.
   */
  it("still treats an invitation elsewhere as live at its exact expiry instant", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { organizationId: otherOrg } = await insertShelterWithOrganization();
    const { userId } = await insertInvitedAdmin({ organizationId, email: EMAIL });
    const inviterId = await insertInviter();
    await db.insert(authInvitation).values({
      id: randomUUID(),
      organizationId: otherOrg,
      email: EMAIL,
      role: "admin",
      status: "pending",
      expiresAt: NOW, // expires at exactly the instant erasableIf is asked about
      createdAt: NOW,
      inviterId,
    });
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result.erasedCount).toBe(0);
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
    expect(await historyEmail(removedId)).toBe(EMAIL);
  });

  it("never scrubs a different shelter's history, even with the same email", async () => {
    const { shelter: thisShelter, organizationId: thisOrg } = await insertShelterWithOrganization();
    const { shelter: otherShelter } = await insertShelterWithOrganization();
    const { userId } = await insertInvitedAdmin({ organizationId: thisOrg, email: EMAIL });
    const thisRemovedId = await insertHistory(thisShelter.id, "admin_removed", EMAIL);
    const otherRemovedId = await insertHistory(otherShelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 1, invitationsScrubbed: 1 });
    expect(await historyEmail(thisRemovedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await historyEmail(otherRemovedId)).toBe(EMAIL);
  });

  it("is idempotent: a second call finds nothing left to erase", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { userId } = await insertInvitedAdmin({ organizationId, email: EMAIL });
    await insertHistory(shelter.id, "admin_removed", EMAIL);

    await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));
    const second = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(second).toEqual({ erasedCount: 0, historyEntriesScrubbed: 0, invitationsScrubbed: 0 });
  });

  it("joins and scrubs on a differently-cased address, not a bare equality", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { userId, invitationId } = await insertInvitedAdmin({
      organizationId,
      email: "Departed.Admin@EXAMPLE.ORG",
      invitationEmail: "departed.admin@example.org",
    });
    const removedId = await insertHistory(
      shelter.id,
      "admin_removed",
      "DEPARTED.ADMIN@example.org",
    );

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 1, invitationsScrubbed: 1 });
    expect(await historyEmail(removedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await invitationEmail(invitationId)).toBe(ERASED_ADMIN_EMAIL);
  });

  it("scrubs only the deleted account's own entries and invitation, leaving another admin's untouched", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const { userId: departedId, invitationId: departedInvitationId } = await insertInvitedAdmin({
      organizationId,
      email: EMAIL,
    });
    const OTHER_EMAIL = "still.here@example.org";
    const { userId: stayingId, invitationId: stayingInvitationId } = await insertInvitedAdmin({
      organizationId,
      email: OTHER_EMAIL,
    });
    const departedRemovedId = await insertHistory(shelter.id, "admin_removed", EMAIL);
    const stayingJoinedId = await insertHistory(shelter.id, "admin_joined", OTHER_EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(departedId, NOW));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 1, invitationsScrubbed: 1 });
    expect(await historyEmail(departedRemovedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await invitationEmail(departedInvitationId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await historyEmail(stayingJoinedId)).toBe(OTHER_EMAIL);
    expect(await invitationEmail(stayingInvitationId)).toBe(OTHER_EMAIL);
    expect(await db.select().from(authUser).where(eq(authUser.id, stayingId))).toHaveLength(1);
  });

  /**
   * Oleksii's own test instruction for the STOP's fix (2026-10-24): "Test
   * that no row anywhere still holds the address after the erasure
   * (invitations, history, users)." Two dead invitations at two different
   * shelters (a canceled one and an expired-pending one), neither live —
   * both must be scrubbed, not only the one whose shelter also has a
   * history row.
   */
  it("leaves no row anywhere holding the real address: no user, every invitation and every history entry scrubbed", async () => {
    const { shelter: shelterA, organizationId: orgA } = await insertShelterWithOrganization();
    const { organizationId: orgB } = await insertShelterWithOrganization();
    const { userId, invitationId: invitationA } = await insertInvitedAdmin({
      organizationId: orgA,
      email: EMAIL,
      status: "canceled",
    });
    const inviterId = await insertInviter();
    const invitationB = randomUUID();
    await db.insert(authInvitation).values({
      id: invitationB,
      organizationId: orgB,
      email: EMAIL,
      role: "admin",
      status: "pending",
      expiresAt: new Date(NOW.getTime() - 1000), // dead: expired, not live
      createdAt: NOW,
      inviterId,
    });
    const removedId = await insertHistory(shelterA.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, erasableIf(userId, NOW));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 1, invitationsScrubbed: 2 });
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toEqual([]);
    expect(await invitationEmail(invitationA)).toBe(ERASED_ADMIN_EMAIL);
    expect(await invitationEmail(invitationB)).toBe(ERASED_ADMIN_EMAIL);
    expect(await historyEmail(removedId)).toBe(ERASED_ADMIN_EMAIL);

    const everywhere = [
      ...(await db.select({ email: authUser.email }).from(authUser)).map((r) => r.email),
      ...(await db.select({ email: authInvitation.email }).from(authInvitation)).map(
        (r) => r.email,
      ),
    ];
    expect(everywhere.some((email) => email.toLowerCase() === EMAIL)).toBe(false);
  });
});
