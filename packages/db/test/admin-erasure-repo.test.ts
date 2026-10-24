import { randomUUID } from "node:crypto";
import { ERASED_ADMIN_EMAIL } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eraseOneUserIf, eraseUsersAndScrubHistory } from "../src/repos/admin-erasure-repo";
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
 * own handler test — proves the compound condition (delete + scrub, both or
 * neither) and the scoping (the right shelter, the four history kinds, the
 * exact email) without going through the full HTTP handler.
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
 * An admin — real invitation, real `invitation_created_users` row — accepted
 * unless `firstSessionAt` is null. `invitationEmail` defaults to `email`;
 * passing a different casing simulates the one case normalisation at write
 * time is meant to prevent (`admin-erasure-repo.ts`'s own doc comment) —
 * `eraseUsersAndScrubHistory`'s `lower()` join is the defence in depth, not
 * the only one, so the fixture has to be able to force the mismatch directly
 * rather than relying on `invite()`'s own normalisation to never run.
 */
async function insertInvitedAdmin(input: {
  organizationId: string;
  email: string;
  accepted: boolean;
  invitationEmail?: string;
}) {
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
  await db.insert(authInvitation).values({
    id: invitationId,
    organizationId: input.organizationId,
    email: input.invitationEmail ?? input.email,
    role: "admin",
    status: input.accepted ? "accepted" : "pending",
    expiresAt: new Date(NOW.getTime() + 72 * 60 * 60 * 1000),
    createdAt: NOW,
    inviterId,
  });
  await db.insert(invitationCreatedUsers).values({
    userId,
    invitationId,
    createdAt: NOW,
    firstSessionAt: input.accepted ? NOW : null,
  });
  return userId;
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

describe("eraseUsersAndScrubHistory, via eraseOneUserIf (registry.admins.remove's own case)", () => {
  it("deletes the account and scrubs this shelter's admin history, when the admin holds nothing else", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const userId = await insertInvitedAdmin({ organizationId, email: EMAIL, accepted: true });
    const joinedId = await insertHistory(shelter.id, "admin_joined", EMAIL);
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 2 });
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toEqual([]);
    expect(await historyEmail(joinedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await historyEmail(removedId)).toBe(ERASED_ADMIN_EMAIL);
  });

  it("erases nothing when the user still holds another membership", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const userId = await insertInvitedAdmin({ organizationId, email: EMAIL, accepted: true });
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId,
      role: "member",
      createdAt: NOW,
    });
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));

    expect(result).toEqual({ erasedCount: 0, historyEntriesScrubbed: 0 });
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
    expect(await historyEmail(removedId)).toBe(EMAIL);
  });

  it("erases nothing when the user is a super_admin", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const userId = await insertInvitedAdmin({ organizationId, email: EMAIL, accepted: true });
    await db.insert(superAdmins).values({
      id: randomUUID(),
      userId,
      grantedAt: NOW,
      revokedAt: null,
    });
    const removedId = await insertHistory(shelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));

    expect(result.erasedCount).toBe(0);
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
    expect(await historyEmail(removedId)).toBe(EMAIL);
  });

  it("erases nothing when the user has a support session as operator", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const userId = await insertInvitedAdmin({ organizationId, email: EMAIL, accepted: true });
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

    const result = await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));

    expect(result.erasedCount).toBe(0);
    expect(await db.select().from(authUser).where(eq(authUser.id, userId))).toHaveLength(1);
    expect(await historyEmail(removedId)).toBe(EMAIL);
  });

  it("never scrubs a different shelter's history, even with the same email", async () => {
    const { shelter: thisShelter, organizationId: thisOrg } = await insertShelterWithOrganization();
    const { shelter: otherShelter } = await insertShelterWithOrganization();
    const userId = await insertInvitedAdmin({
      organizationId: thisOrg,
      email: EMAIL,
      accepted: true,
    });
    const thisRemovedId = await insertHistory(thisShelter.id, "admin_removed", EMAIL);
    const otherRemovedId = await insertHistory(otherShelter.id, "admin_removed", EMAIL);

    const result = await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 1 });
    expect(await historyEmail(thisRemovedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await historyEmail(otherRemovedId)).toBe(EMAIL);
  });

  it("is idempotent: a second call finds nothing left to erase", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const userId = await insertInvitedAdmin({ organizationId, email: EMAIL, accepted: true });
    await insertHistory(shelter.id, "admin_removed", EMAIL);

    await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));
    const second = await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));

    expect(second).toEqual({ erasedCount: 0, historyEntriesScrubbed: 0 });
  });

  it("joins and scrubs on a differently-cased address, not a bare equality", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const userId = await insertInvitedAdmin({
      organizationId,
      email: "Departed.Admin@EXAMPLE.ORG",
      invitationEmail: "departed.admin@example.org",
      accepted: true,
    });
    const removedId = await insertHistory(
      shelter.id,
      "admin_removed",
      "DEPARTED.ADMIN@example.org",
    );

    const result = await eraseUsersAndScrubHistory(db, eraseOneUserIf(userId));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 1 });
    expect(await historyEmail(removedId)).toBe(ERASED_ADMIN_EMAIL);
  });

  it("scrubs only the deleted account's own entries, leaving another admin's email untouched", async () => {
    const { shelter, organizationId } = await insertShelterWithOrganization();
    const departedId = await insertInvitedAdmin({ organizationId, email: EMAIL, accepted: true });
    const OTHER_EMAIL = "still.here@example.org";
    const stayingId = await insertInvitedAdmin({
      organizationId,
      email: OTHER_EMAIL,
      accepted: true,
    });
    const departedRemovedId = await insertHistory(shelter.id, "admin_removed", EMAIL);
    const stayingJoinedId = await insertHistory(shelter.id, "admin_joined", OTHER_EMAIL);

    const result = await eraseUsersAndScrubHistory(db, eraseOneUserIf(departedId));

    expect(result).toEqual({ erasedCount: 1, historyEntriesScrubbed: 1 });
    expect(await historyEmail(departedRemovedId)).toBe(ERASED_ADMIN_EMAIL);
    expect(await historyEmail(stayingJoinedId)).toBe(OTHER_EMAIL);
    expect(await db.select().from(authUser).where(eq(authUser.id, stayingId))).toHaveLength(1);
  });
});
