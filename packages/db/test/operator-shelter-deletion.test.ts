import { randomUUID } from "node:crypto";
import type { CityId, ShelterId } from "@opika/domain";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import {
  applicationDeletionRepo,
  type ShelterDeletionCounts,
} from "../src/repos/application-deletion-repo";
import { cityRepo } from "../src/repos/city-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animalPhotoSources } from "../src/schema/animal-photo-sources";
import { animals } from "../src/schema/animals";
import { applicationDeletions } from "../src/schema/application-deletions";
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
import { funnelEvents } from "../src/schema/funnel-events";
import { notificationSends } from "../src/schema/notification-sends";
import { registrationEmailTokens } from "../src/schema/registration-email-tokens";
import { reveals } from "../src/schema/reveals";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeReveal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * The operator's «Видалити притулок» (owner, 2026-11-20): what goes, what stays, the recount
 * under the lock, the name and the operator's grant, and the erasure invariant for its accounts.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-12-20T10:00:00.000Z");
const HOUR = 3_600_000;
let cityId: CityId;
let operator: string;

const repo = () => applicationDeletionRepo(db);
const rows = async (query: Promise<unknown[]>) => (await query).length;

async function user(email = `${randomUUID().slice(0, 8)}@example.org`): Promise<string> {
  const id = randomUUID();
  await db.insert(authUser).values({
    id,
    name: "Олена",
    email,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

async function emailOf(userId: string): Promise<string> {
  const [row] = await db
    .select({ email: authUser.email })
    .from(authUser)
    .where(eq(authUser.id, userId));
  if (row === undefined) throw new Error(`no user ${userId}`);
  return row.email;
}

async function shelterWithOrganization(displayName: string) {
  const shelter = makeShelter({
    displayName,
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
  });
  await shelterRepo(db).insert(shelter);
  const organizationId = randomUUID();
  await db
    .insert(authOrganization)
    .values({ id: organizationId, name: displayName, slug: organizationId, createdAt: NOW });
  await db.update(shelters).set({ organizationId }).where(eq(shelters.id, shelter.id));
  return { shelterId: shelter.id, organizationId };
}

const member = (organizationId: string, userId: string) =>
  db
    .insert(authMember)
    .values({ id: randomUUID(), organizationId, userId, role: "admin", createdAt: NOW });

async function invitation(organizationId: string, email: string, status = "pending") {
  const id = randomUUID();
  await db.insert(authInvitation).values({
    id,
    organizationId,
    email,
    role: "admin",
    status,
    expiresAt: new Date(NOW.getTime() + 24 * HOUR),
    createdAt: NOW,
    inviterId: operator,
  });
  return id;
}

async function history(shelterId: ShelterId) {
  await db.insert(shelterHistory).values({
    id: randomUUID(),
    shelterId,
    kind: "admin_removed",
    at: NOW,
    entry: {
      kind: "admin_removed",
      at: NOW,
      moderatorId: operator,
      email: "someone@example.org",
      wasPending: false,
    } as never,
  });
}

/**
 * The shelter to remove, with one of everything: two admins (Олена, erasable and the registrant;
 * Петро, kept by a live invitation to the other shelter), an invitee with an invitation-created
 * account, two published animals (one with a photo and its kept source, one revealed) and a
 * draft, history, a support session, a funnel event and a notification send. The other shelter
 * has its own animal, admin and history, and must come through untouched.
 */
async function world() {
  const target = await shelterWithOrganization("Лапа допомоги");
  const other = await shelterWithOrganization("Інший притулок");

  const olena = await user();
  const petro = await user();
  const invitee = await user();
  const otherAdmin = await user();
  await member(target.organizationId, olena);
  await member(target.organizationId, petro);
  await member(other.organizationId, otherAdmin);
  await db
    .update(shelters)
    .set({ registrantUserId: olena, registrationSource: "self_registration", appliedAt: NOW })
    .where(eq(shelters.id, target.shelterId));
  await invitation(other.organizationId, await emailOf(petro));
  const invited = await invitation(target.organizationId, await emailOf(invitee));
  await db
    .insert(invitationCreatedUsers)
    .values({ userId: invitee, invitationId: invited, createdAt: NOW });

  // Олена's sign-in rows: a credential, a session, a reset link, a magic link, a registration token.
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: olena,
    providerId: "credential",
    userId: olena,
    password: "salt:key",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authSession).values({
    id: randomUUID(),
    token: randomUUID(),
    userId: olena,
    expiresAt: new Date(NOW.getTime() + HOUR),
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authVerification).values([
    {
      id: randomUUID(),
      identifier: randomUUID(),
      value: olena,
      expiresAt: new Date(NOW.getTime() + HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: randomUUID(),
      identifier: randomUUID(),
      value: JSON.stringify({ type: "magic-link", email: (await emailOf(olena)).toUpperCase() }),
      expiresAt: new Date(NOW.getTime() + HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  await db.insert(registrationEmailTokens).values({
    tokenHash: randomUUID(),
    userId: olena,
    purpose: "confirm_email",
    expiresAt: new Date(NOW.getTime() + HOUR),
  });

  const photographed = makeAnimal({
    shelterId: target.shelterId,
    photos: [{ storageKey: "animals/a1/p1", width: 1024, height: 768, alt: null }],
  });
  const revealed = makeAnimal({ shelterId: target.shelterId });
  const draft = makeDraftAnimal({ shelterId: target.shelterId });
  const otherAnimal = makeAnimal({ shelterId: other.shelterId });
  for (const animal of [photographed, revealed, draft, otherAnimal]) {
    await animalRepo(db).insert(animal, cityId);
  }
  await db.insert(animalPhotoSources).values({
    storageKey: "animals/a1/p1",
    animalId: photographed.id,
    sourceObjectKey: `animals/a1/p1/source-${randomUUID()}.webp`,
    sourceOrigin: "upload",
    sourceWidth: 2048,
    sourceHeight: 1536,
    createdAt: NOW,
  });
  const visitor = makeAdopter();
  await adopterRepo(db).insert(visitor);
  await revealRepo(db).insert(
    makeReveal({ adopterId: visitor.id, animalId: revealed.id, shelterId: target.shelterId }),
  );
  await revealRepo(db).insert(
    makeReveal({ adopterId: visitor.id, animalId: otherAnimal.id, shelterId: other.shelterId }),
  );
  await history(target.shelterId);
  await history(other.shelterId);

  const sessionId = randomUUID();
  await db.insert(supportSessions).values({
    id: sessionId,
    operatorUserId: operator,
    shelterId: target.shelterId,
    tokenHash: randomUUID(),
    startedAt: NOW,
    lastSeenAt: NOW,
  });
  const funnelId = randomUUID();
  await db
    .insert(funnelEvents)
    .values({ id: funnelId, shelterId: target.shelterId, kind: "registered", at: NOW });
  const sendKey = randomUUID();
  await db.insert(notificationSends).values({
    dedupKey: sendKey,
    kind: "weekly_reminder",
    shelterId: target.shelterId,
    recipientUserId: olena,
    status: "sent",
    createdAt: NOW,
    updatedAt: NOW,
  });

  return {
    target,
    other,
    olena,
    petro,
    invitee,
    otherAdmin,
    animalIds: [photographed.id, revealed.id, draft.id],
    otherAnimal,
    sessionId,
    funnelId,
    sendKey,
  };
}

const remove = (
  shelterId: ShelterId,
  typedName: string,
  counts: ShelterDeletionCounts,
  by = operator,
) => repo().deleteShelterByOperator({ shelterId, typedName, counts, operatorUserId: by }, NOW);

const shelterCount = (id: ShelterId) => rows(db.select().from(shelters).where(eq(shelters.id, id)));
const auditLines = (id: ShelterId) =>
  db.select().from(applicationDeletions).where(eq(applicationDeletions.shelterId, id));

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  operator = await user("operator@example.org");
  await db.insert(superAdmins).values({ id: randomUUID(), userId: operator, grantedAt: NOW });
});

describe("deletionCounts", () => {
  it("counts every card (drafts included), the published ones, and the admins", async () => {
    const w = await world();
    expect(await repo().deletionCounts(w.target.shelterId)).toEqual({
      animals: 3,
      published: 2,
      admins: 2,
    });
    expect(await repo().deletionCounts(randomUUID() as ShelterId)).toBeNull();
  });
});

describe("deleteShelterByOperator", () => {
  it("removes the shelter and everything of it, keeps what is kept, and leaves one audit line", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");

    const outcome = await remove(w.target.shelterId, "  Лапа допомоги ", counts);

    expect(outcome).toMatchObject({
      kind: "deleted",
      photoKeys: 1,
      erasedAccounts: 2,
      keptAccounts: 1,
    });
    // Removed: the shelter, its animals with their photo sources, the reveals, its history.
    expect(await shelterCount(w.target.shelterId)).toBe(0);
    expect(await rows(db.select().from(animals).where(inArray(animals.id, w.animalIds)))).toBe(0);
    expect(await rows(db.select().from(animalPhotoSources))).toBe(0);
    expect(
      await rows(db.select().from(reveals).where(eq(reveals.shelterId, w.target.shelterId))),
    ).toBe(0);
    expect(
      await rows(
        db.select().from(shelterHistory).where(eq(shelterHistory.shelterId, w.target.shelterId)),
      ),
    ).toBe(0);
    // The organization, its invitations and memberships.
    const org = w.target.organizationId;
    expect(await rows(db.select().from(authOrganization).where(eq(authOrganization.id, org)))).toBe(
      0,
    );
    expect(
      await rows(db.select().from(authInvitation).where(eq(authInvitation.organizationId, org))),
    ).toBe(0);
    expect(await rows(db.select().from(authMember).where(eq(authMember.organizationId, org)))).toBe(
      0,
    );
    // Олена and the invitee are erased with every sign-in row; Петро keeps his account.
    for (const gone of [w.olena, w.invitee]) {
      expect(await rows(db.select().from(authUser).where(eq(authUser.id, gone)))).toBe(0);
      expect(await rows(db.select().from(authSession).where(eq(authSession.userId, gone)))).toBe(0);
      expect(await rows(db.select().from(authAccount).where(eq(authAccount.userId, gone)))).toBe(0);
      expect(
        await rows(
          db.select().from(registrationEmailTokens).where(eq(registrationEmailTokens.userId, gone)),
        ),
      ).toBe(0);
      expect(
        await rows(
          db.select().from(invitationCreatedUsers).where(eq(invitationCreatedUsers.userId, gone)),
        ),
      ).toBe(0);
    }
    expect(await rows(db.select().from(authVerification))).toBe(0);
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, w.petro)))).toBe(1);

    // Kept, shelter nulled: the support session, the funnel event, the notification send.
    const [session] = await db
      .select()
      .from(supportSessions)
      .where(eq(supportSessions.id, w.sessionId));
    expect(session?.shelterId).toBeNull();
    const [funnel] = await db.select().from(funnelEvents).where(eq(funnelEvents.id, w.funnelId));
    expect(funnel?.shelterId).toBeNull();
    const [send] = await db
      .select()
      .from(notificationSends)
      .where(eq(notificationSends.dedupKey, w.sendKey));
    expect(send).toMatchObject({ shelterId: null, recipientUserId: null });

    // The other shelter is untouched.
    expect(await repo().deletionCounts(w.other.shelterId)).toEqual({
      animals: 1,
      published: 1,
      admins: 1,
    });
    expect(
      await rows(db.select().from(reveals).where(eq(reveals.shelterId, w.other.shelterId))),
    ).toBe(1);
    expect(
      await rows(
        db.select().from(shelterHistory).where(eq(shelterHistory.shelterId, w.other.shelterId)),
      ),
    ).toBe(1);

    // One audit line: id, reason, operator, time. Nothing personal.
    const lines = await auditLines(w.target.shelterId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      reason: "operator_removed",
      operatorUserId: operator,
      at: NOW,
    });

    // No orphans: every row naming a shelter, an animal or an organization finds it.
    const [orphans] = await db.execute<{ n: number }>(sql`
      SELECT (
        (SELECT count(*) FROM animals a WHERE NOT EXISTS (SELECT 1 FROM shelters s WHERE s.id = a.shelter_id))
        + (SELECT count(*) FROM reveals r WHERE NOT EXISTS (SELECT 1 FROM animals a WHERE a.id = r.animal_id))
        + (SELECT count(*) FROM shelter_history h WHERE NOT EXISTS (SELECT 1 FROM shelters s WHERE s.id = h.shelter_id))
        + (SELECT count(*) FROM auth_member m WHERE NOT EXISTS (SELECT 1 FROM auth_organization o WHERE o.id = m.organization_id))
        + (SELECT count(*) FROM auth_invitation i WHERE NOT EXISTS (SELECT 1 FROM auth_organization o WHERE o.id = i.organization_id))
        + (SELECT count(*) FROM auth_organization o WHERE NOT EXISTS (SELECT 1 FROM shelters s WHERE s.organization_id = o.id))
        + (SELECT count(*) FROM invitation_created_users c WHERE NOT EXISTS (SELECT 1 FROM auth_invitation i WHERE i.id = c.invitation_id))
      )::int AS n`);
    expect(orphans?.n).toBe(0);
  });

  it("keeps an admin the erasure invariant protects: a live invitation to another shelter", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");
    await remove(w.target.shelterId, "Лапа допомоги", counts);
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, w.petro)))).toBe(1);
    // His invitation to the other shelter is still his to accept.
    const [elsewhere] = await db
      .select({ email: authInvitation.email })
      .from(authInvitation)
      .where(eq(authInvitation.organizationId, w.other.organizationId));
    expect(elsewhere?.email).toBe(await emailOf(w.petro));
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, w.otherAdmin)))).toBe(1);
  });

  it("keeps an operator's account even when it was a member", async () => {
    const target = await shelterWithOrganization("Тест");
    await member(target.organizationId, operator);
    const outcome = await remove(target.shelterId, "Тест", { animals: 0, published: 0, admins: 1 });
    expect(outcome).toMatchObject({ kind: "deleted", erasedAccounts: 0, keptAccounts: 1 });
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, operator)))).toBe(1);
  });

  it("refuses when an animal was added after the dialog counted, and deletes nothing", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");
    await animalRepo(db).insert(makeDraftAnimal({ shelterId: w.target.shelterId }), cityId);

    const outcome = await remove(w.target.shelterId, "Лапа допомоги", counts);

    expect(outcome).toEqual({
      kind: "counts_changed",
      counts: { animals: 4, published: 2, admins: 2 },
    });
    expect(await shelterCount(w.target.shelterId)).toBe(1);
    expect(
      await rows(db.select().from(animals).where(eq(animals.shelterId, w.target.shelterId))),
    ).toBe(4);
    expect(
      await rows(
        db.select().from(authMember).where(eq(authMember.organizationId, w.target.organizationId)),
      ),
    ).toBe(2);
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, w.olena)))).toBe(1);
    expect(await rows(db.select().from(reveals))).toBe(2);
    expect(await auditLines(w.target.shelterId)).toHaveLength(0);
  });

  it("refuses a change in the published count or the admins too", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");
    expect(
      await remove(w.target.shelterId, "Лапа допомоги", { ...counts, published: 1 }),
    ).toMatchObject({
      kind: "counts_changed",
    });
    expect(
      await remove(w.target.shelterId, "Лапа допомоги", { ...counts, admins: 3 }),
    ).toMatchObject({
      kind: "counts_changed",
    });
    expect(await shelterCount(w.target.shelterId)).toBe(1);
  });

  it("refuses a name that doesn't match exactly, and deletes nothing", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");
    for (const typed of ["лапа допомоги", "Лапа  допомоги", "Лапа допомог", ""]) {
      expect(await remove(w.target.shelterId, typed, counts), typed).toEqual({
        kind: "name_mismatch",
      });
    }
    expect(await shelterCount(w.target.shelterId)).toBe(1);
    expect(await auditLines(w.target.shelterId)).toHaveLength(0);
  });

  it("refuses an account without an active operator grant, and deletes nothing", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");
    expect(await remove(w.target.shelterId, "Лапа допомоги", counts, w.otherAdmin)).toEqual({
      kind: "not_operator",
    });
    const former = await user();
    await db
      .insert(superAdmins)
      .values({ id: randomUUID(), userId: former, grantedAt: NOW, revokedAt: NOW });
    expect(await remove(w.target.shelterId, "Лапа допомоги", counts, former)).toEqual({
      kind: "not_operator",
    });
    expect(await shelterCount(w.target.shelterId)).toBe(1);
    expect(await auditLines(w.target.shelterId)).toHaveLength(0);
  });

  /**
   * A handle whose transaction first runs `between`: a change committed after the repository's
   * read and before its batch, which only the batch's own guard can see.
   */
  const changingBeforeTheBatch = (between: () => Promise<void>): Database =>
    new Proxy(db, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return async (...args: Parameters<Database["transaction"]>) => {
            await between();
            return target.transaction(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as Database;

  it("refuses under the lock when the shelter is renamed after the read, and deletes nothing", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");
    const renaming = changingBeforeTheBatch(async () => {
      await db
        .update(shelters)
        .set({ displayName: "Лапа допомоги 2" })
        .where(eq(shelters.id, w.target.shelterId));
    });

    const outcome = await applicationDeletionRepo(renaming).deleteShelterByOperator(
      {
        shelterId: w.target.shelterId,
        typedName: "Лапа допомоги",
        counts,
        operatorUserId: operator,
      },
      NOW,
    );

    expect(outcome).toEqual({ kind: "name_mismatch" });
    expect(await shelterCount(w.target.shelterId)).toBe(1);
    expect(
      await rows(db.select().from(animals).where(eq(animals.shelterId, w.target.shelterId))),
    ).toBe(3);
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, w.olena)))).toBe(1);
    expect(await auditLines(w.target.shelterId)).toHaveLength(0);
  });

  it("refuses under the lock when the accounts to erase change after the read, with the same counts", async () => {
    const w = await world();
    const counts = await repo().deletionCounts(w.target.shelterId);
    if (counts === null) throw new Error("no counts");
    let lateInvitee = "";
    const inviting = changingBeforeTheBatch(async () => {
      // An invitation changes none of the three counts, only whose accounts would go.
      lateInvitee = await user();
      await invitation(w.target.organizationId, await emailOf(lateInvitee));
    });

    const outcome = await applicationDeletionRepo(inviting).deleteShelterByOperator(
      {
        shelterId: w.target.shelterId,
        typedName: "Лапа допомоги",
        counts,
        operatorUserId: operator,
      },
      NOW,
    );

    expect(outcome).toEqual({ kind: "counts_changed", counts });
    expect(await shelterCount(w.target.shelterId)).toBe(1);
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, lateInvitee)))).toBe(1);
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, w.invitee)))).toBe(1);
    expect(
      await rows(
        db
          .select()
          .from(authInvitation)
          .where(eq(authInvitation.organizationId, w.target.organizationId)),
      ),
    ).toBe(2);
    expect(await auditLines(w.target.shelterId)).toHaveLength(0);
  });

  it("answers not_found for a shelter that isn't there", async () => {
    expect(
      await remove(randomUUID() as ShelterId, "Будь-що", { animals: 0, published: 0, admins: 0 }),
    ).toEqual({ kind: "not_found" });
  });

  it("removes a shelter with no organization and nothing in it", async () => {
    const bare = makeShelter({
      displayName: "Порожній",
      publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    });
    await shelterRepo(db).insert(bare);
    expect(
      await remove(bare.id, "Порожній", { animals: 0, published: 0, admins: 0 }),
    ).toMatchObject({
      kind: "deleted",
      photoKeys: 0,
      erasedAccounts: 0,
    });
    expect(await shelterCount(bare.id)).toBe(0);
  });
});
