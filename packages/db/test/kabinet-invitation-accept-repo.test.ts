import type { ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationAcceptRepo } from "../src/repos/kabinet-invitation-accept-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authInvitation, authMember, authUser, superAdmins } from "../src/schema/auth";
import { shelterHistory } from "../src/schema/shelter-history";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

/**
 * The automatic accept's statement (IN-Q12/IN-Q13), against real Postgres.
 * The end-to-end flow through sign-in is `apps/web/src/kabinet/invitation-accept.test.ts`.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-14T10:00:00.000Z");
const OPERATOR = crypto.randomUUID();
const EMAIL = "olena@example.org";
let user: string;
let shelterA: ShelterId;
let shelterB: ShelterId;

const ids = () => ({ memberId: crypto.randomUUID(), historyId: crypto.randomUUID() });
const accepts = () => kabinetInvitationAcceptRepo(db);

async function newShelter(): Promise<ShelterId> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  return shelter.id;
}

beforeEach(async () => {
  await truncateAll(db);
  shelterA = await newShelter();
  shelterB = await newShelter();
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  user = crypto.randomUUID();
  await db.insert(authUser).values({
    id: user,
    name: "Олена",
    email: EMAIL,
    // Magic-link verify sets it; Better Auth's accept requires it.
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

/**
 * An invitation written directly, so a test can hold two at once (the
 * registry refuses that, IN-Q8, but IN-T1's race can still produce it).
 */
async function invitation(
  shelterId: ShelterId,
  overrides: { email?: string; createdAt?: Date; expiresAt?: Date } = {},
): Promise<string> {
  const organizationId = await kabinetInvitationRepo(db).ensureOrganization(
    shelterId,
    { organizationId: crypto.randomUUID() },
    NOW,
  );
  const id = crypto.randomUUID();
  await db.insert(authInvitation).values({
    id,
    organizationId,
    email: overrides.email ?? EMAIL,
    role: "admin",
    status: "pending",
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 3_600_000),
    createdAt: overrides.createdAt ?? NOW,
    inviterId: OPERATOR,
  });
  return id;
}

const statusOf = async (id: string) =>
  (await db.select().from(authInvitation).where(eq(authInvitation.id, id)))[0]?.status;
const joinedIn = async (shelterId: ShelterId) =>
  (await kabinetShelterRepo(db).historyOf(shelterId)).filter((e) => e.kind === "admin_joined");

describe("kabinetInvitationAcceptRepo.accept", () => {
  it("accepts, adds the membership and records admin_joined with the invitation's email", async () => {
    const id = await invitation(shelterA, { email: "olena@example.org" });
    await db.update(authUser).set({ email: "Olena@Example.org" }).where(eq(authUser.id, user));
    expect(await accepts().accept({ userId: user, now: NOW, ids: ids() })).toEqual({
      kind: "accepted",
      invitationId: id,
      shelterId: shelterA,
    });
    expect(await statusOf(id)).toBe("accepted");
    expect((await db.select().from(authMember)).map((m) => m.userId)).toEqual([user]);
    expect(await joinedIn(shelterA)).toEqual([
      { kind: "admin_joined", at: NOW, shelterAdminId: user, invitationId: id, email: EMAIL },
    ]);
  });

  it("accepts an invitation at its exact expiry instant (Better Auth refuses only expiresAt < now), never after", async () => {
    const id = await invitation(shelterA, { expiresAt: NOW });
    expect(
      (await accepts().accept({ userId: user, now: new Date(NOW.getTime() + 1), ids: ids() })).kind,
    ).toBe("nothing_to_accept");
    expect(await statusOf(id)).toBe("pending");
    expect((await accepts().accept({ userId: user, now: NOW, ids: ids() })).kind).toBe("accepted");
  });

  it("refuses an unverified address (Better Auth's rule when ids come from generateId)", async () => {
    const id = await invitation(shelterA);
    await db.update(authUser).set({ emailVerified: false }).where(eq(authUser.id, user));
    expect(await accepts().accept({ userId: user, now: NOW, ids: ids() })).toEqual({
      kind: "nothing_to_accept",
    });
    expect(await statusOf(id)).toBe("pending");
  });

  it("refuses an operator: one person, one role", async () => {
    const id = await invitation(shelterA);
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: user, grantedAt: NOW, revokedAt: null });
    expect(await accepts().accept({ userId: user, now: NOW, ids: ids() })).toEqual({
      kind: "address_has_a_role",
      reason: "operator",
    });
    expect(await statusOf(id)).toBe("pending");
    expect(await db.select().from(authMember)).toEqual([]);
  });

  it("picks the newest of two pending invitations to the same shelter, then has nothing left to do", async () => {
    const older = await invitation(shelterA, { createdAt: new Date(NOW.getTime() - 1000) });
    const newer = await invitation(shelterA);
    expect(await accepts().accept({ userId: user, now: NOW, ids: ids() })).toMatchObject({
      kind: "accepted",
      invitationId: newer,
    });
    // The older one stays pending; the membership already exists, so: nothing.
    expect(await accepts().accept({ userId: user, now: NOW, ids: ids() })).toEqual({
      kind: "nothing_to_accept",
    });
    expect(await statusOf(older)).toBe("pending");
    expect(await db.select().from(authMember)).toHaveLength(1);
    expect(await joinedIn(shelterA)).toHaveLength(1);
  });

  /**
   * IN-T1 (bound to this PR): "accepts two invitations for one address and
   * asserts the typed refusal". The second, to another shelter, is refused
   * as ADDRESS_HAS_A_ROLE's `shelter_admin`, never a 500, and stays pending.
   */
  it("two invitations to two shelters: the second is a typed refusal, nothing written", async () => {
    const first = await invitation(shelterA, { createdAt: new Date(NOW.getTime() - 1000) });
    const second = await invitation(shelterB);
    // The newest is accepted…
    expect(await accepts().accept({ userId: user, now: NOW, ids: ids() })).toMatchObject({
      kind: "accepted",
      invitationId: second,
    });
    // …and the other one, to another shelter, is the typed refusal.
    expect(await accepts().accept({ userId: user, now: NOW, ids: ids() })).toEqual({
      kind: "address_has_a_role",
      reason: "shelter_admin",
    });
    expect(await statusOf(first)).toBe("pending");
    expect(await joinedIn(shelterA)).toEqual([]);
  });
});

describe("kabinetInvitationAcceptRepo.write: the one statement", () => {
  /**
   * The race IN-T1 describes: both accepts pass the read, and only the
   * database's one-membership index stops the second. Driven directly so
   * the index, not the read, is what refuses.
   */
  it("maps the one-membership index to membership_conflict and writes nothing", async () => {
    const toA = await invitation(shelterA);
    const toB = await invitation(shelterB);
    const plan = await accepts().plan(user, NOW);
    if (plan.kind !== "accept") throw new Error(`plan: ${plan.kind}`);
    const other = plan.invitation.id === toA ? toB : toA;
    const otherPlan = { ...plan.invitation, id: other as typeof plan.invitation.id };
    const otherShelter = plan.invitation.shelterId === shelterA ? shelterB : shelterA;
    const [otherOrg] = await db
      .select({ organizationId: authInvitation.organizationId })
      .from(authInvitation)
      .where(eq(authInvitation.id, other));
    expect(
      await accepts().write({ userId: user, invitation: plan.invitation, now: NOW, ids: ids() }),
    ).toEqual({ kind: "written" });
    expect(
      await accepts().write({
        userId: user,
        invitation: {
          ...otherPlan,
          shelterId: otherShelter,
          organizationId: otherOrg?.organizationId ?? "",
        },
        now: NOW,
        ids: ids(),
      }),
    ).toEqual({ kind: "membership_conflict" });
    expect(await statusOf(other)).toBe("pending");
    expect(await joinedIn(otherShelter)).toEqual([]);
    expect(await db.select().from(authMember)).toHaveLength(1);
  });

  it("an id collision on the last write undoes the first two: invitation pending, no member", async () => {
    const id = await invitation(shelterA);
    const plan = await accepts().plan(user, NOW);
    if (plan.kind !== "accept") throw new Error(`plan: ${plan.kind}`);
    // A history row whose id the statement's last write will collide with.
    const taken = crypto.randomUUID();
    await db.insert(shelterHistory).values({
      id: taken,
      shelterId: shelterA,
      kind: "admin_invited",
      at: NOW,
      entry: { kind: "admin_invited", at: NOW, moderatorId: OPERATOR as never, email: EMAIL },
    });
    await expect(
      accepts().write({
        userId: user,
        invitation: plan.invitation,
        now: NOW,
        ids: { memberId: crypto.randomUUID(), historyId: taken },
      }),
    ).rejects.toThrow();
    expect(await statusOf(id)).toBe("pending");
    expect(await db.select().from(authMember)).toEqual([]);
    expect(await joinedIn(shelterA)).toEqual([]);
  });

  it("writes nothing when the invitation stopped being pending between the read and the write", async () => {
    const id = await invitation(shelterA);
    const plan = await accepts().plan(user, NOW);
    if (plan.kind !== "accept") throw new Error(`plan: ${plan.kind}`);
    await db.update(authInvitation).set({ status: "canceled" }).where(eq(authInvitation.id, id));
    expect(
      await accepts().write({ userId: user, invitation: plan.invitation, now: NOW, ids: ids() }),
    ).toEqual({ kind: "not_written" });
    expect(await db.select().from(authMember)).toEqual([]);
    expect(await joinedIn(shelterA)).toEqual([]);
  });
});
