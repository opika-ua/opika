import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { INVITATION_TTL_MS, kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetInvitedUsersRepo } from "../src/repos/kabinet-invited-users-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  authInvitation,
  authMember,
  authUser,
  invitationCreatedUsers,
  superAdmins,
  supportSessions,
} from "../src/schema/auth";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-13T10:00:00.000Z");
const OPERATOR = "op-user";
let shelterId: string;
let n = 0;
const id = (prefix: string) => `${prefix}-${++n}`;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  shelterId = shelter.id;
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

const invite = (email: string, at = NOW, shelter = shelterId) =>
  kabinetInvitationRepo(db).invite({
    shelterId: shelter as never,
    email,
    name: "Олена",
    inviterUserId: OPERATOR,
    ids: { invitationId: id("inv"), userId: id("user"), organizationId: id("org") },
    now: at,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "admin_invited", at: at, moderatorId: OPERATOR as never, email: email },
    },
  });

const userByEmail = async (email: string) =>
  (await db.select().from(authUser).where(eq(authUser.email, email)).limit(1))[0];

describe("kabinetInvitationRepo.invite (RG-Q3)", () => {
  it("creates the invitee's user, roleless and unverified, and records that it did", async () => {
    const result = await invite(" Olena@Example.org ");
    expect(result.kind).toBe("invited");
    if (result.kind !== "invited") throw new Error("unreachable");
    expect(result.createdUser).toBe(true);
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + INVITATION_TTL_MS));
    const user = await userByEmail("olena@example.org");
    expect(user).toMatchObject({ id: result.userId, emailVerified: false });
    expect(await db.select().from(authMember)).toEqual([]);
    const tracked = await db.select().from(invitationCreatedUsers);
    expect(tracked).toEqual([
      {
        userId: result.userId,
        invitationId: result.invitationId,
        createdAt: NOW,
        firstSessionAt: null,
      },
    ]);
  });

  it("reuses an existing roleless user and records nothing as created", async () => {
    await db.insert(authUser).values({
      id: "u-existing",
      name: "Олена",
      email: "olena@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const result = await invite("olena@example.org");
    expect(result).toMatchObject({ kind: "invited", userId: "u-existing", createdUser: false });
    expect(await db.select().from(invitationCreatedUsers)).toEqual([]);
  });

  it("refuses an address that already administers a shelter, writing nothing", async () => {
    const first = await invite("olena@example.org");
    if (first.kind !== "invited") throw new Error("unreachable");
    const [invitation] = await db.select().from(authInvitation);
    await db.insert(authMember).values({
      id: "m1",
      organizationId: invitation?.organizationId ?? "",
      userId: first.userId,
      role: "admin",
      createdAt: NOW,
    });
    const invitationsBefore = (await db.select().from(authInvitation)).length;
    expect(await invite("OLENA@example.org")).toEqual({ kind: "already_a_member" });
    expect(await db.select().from(authInvitation)).toHaveLength(invitationsBefore);
  });
});

describe("kabinetInvitationRepo clean-up (RG-Q3, RS-Q1)", () => {
  const later = new Date(NOW.getTime() + INVITATION_TTL_MS + 1);
  const repo = () => kabinetInvitationRepo(db);
  const users = () => kabinetInvitedUsersRepo(db);

  it("takes a created user whose invitation expired, unaccepted and never signed in, and deletes it", async () => {
    const r = await invite("olena@example.org");
    if (r.kind !== "invited") throw new Error("unreachable");
    expect(await users().cleanupCandidates({ organizationId: null, now: NOW })).toEqual([]);
    const candidates = await users().cleanupCandidates({ organizationId: null, now: later });
    expect(candidates).toEqual([
      { userId: r.userId, email: "olena@example.org", invitationId: r.invitationId },
    ]);
    expect(
      await users().deleteCandidates(
        candidates.map((c) => c.userId),
        later,
      ),
    ).toBe(1);
    expect(await userByEmail("olena@example.org")).toBeUndefined();
    expect(await db.select().from(invitationCreatedUsers)).toEqual([]);
  });

  it("takes a created user whose invitation was revoked, before it expires", async () => {
    const r = await invite("olena@example.org");
    if (r.kind !== "invited") throw new Error("unreachable");
    expect(await repo().revoke(r.invitationId)).toBe(true);
    expect(
      (await users().cleanupCandidates({ organizationId: null, now: NOW })).map((c) => c.userId),
    ).toEqual([r.userId]);
  });

  it("never takes a user who has signed in", async () => {
    const r = await invite("olena@example.org");
    if (r.kind !== "invited") throw new Error("unreachable");
    await users().markFirstSession(r.userId, NOW);
    expect(await users().cleanupCandidates({ organizationId: null, now: later })).toEqual([]);
    // And the delete re-checks, even if handed the id anyway.
    expect(await users().deleteCandidates([r.userId], later)).toBe(0);
  });

  it("never takes a user who accepted (has a membership)", async () => {
    const r = await invite("olena@example.org");
    if (r.kind !== "invited") throw new Error("unreachable");
    const [invitation] = await db.select().from(authInvitation);
    await db.insert(authMember).values({
      id: "m1",
      organizationId: invitation?.organizationId ?? "",
      userId: r.userId,
      role: "admin",
      createdAt: NOW,
    });
    expect(await users().cleanupCandidates({ organizationId: null, now: later })).toEqual([]);
    expect(await users().deleteCandidates([r.userId], later)).toBe(0);
  });

  it("never takes a user the invitation didn't create", async () => {
    await db.insert(authUser).values({
      id: "u-existing",
      name: "Олена",
      email: "olena@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await invite("olena@example.org");
    expect(await users().cleanupCandidates({ organizationId: null, now: later })).toEqual([]);
    expect(await users().deleteCandidates(["u-existing"], later)).toBe(0);
  });

  it("scopes to one organization when asked", async () => {
    const r = await invite("olena@example.org");
    if (r.kind !== "invited") throw new Error("unreachable");
    expect(
      await users().cleanupCandidates({ organizationId: "some-other-org", now: later }),
    ).toEqual([]);
    const [invitation] = await db.select().from(authInvitation);
    expect(
      await users().cleanupCandidates({
        organizationId: invitation?.organizationId ?? "",
        now: later,
      }),
    ).toHaveLength(1);
  });

  it("resend extends a pending invitation, and revives nothing revoked", async () => {
    const r = await invite("olena@example.org");
    if (r.kind !== "invited") throw new Error("unreachable");
    const resent = (email: string) => ({
      id: crypto.randomUUID(),
      shelterId: shelterId as never,
      entry: {
        kind: "admin_invitation_resent" as const,
        at: later,
        moderatorId: OPERATOR as never,
        email,
      },
    });
    expect(await repo().resend(r.invitationId, later, resent("olena@example.org"))).toEqual({
      expiresAt: new Date(later.getTime() + INVITATION_TTL_MS),
    });
    expect(await users().cleanupCandidates({ organizationId: null, now: later })).toEqual([]);
    await repo().revoke(r.invitationId);
    expect(await repo().resend(r.invitationId, later, resent("olena@example.org"))).toBeNull();
  });

  /** Finding 1: expired, then re-invited. The live invitation keeps the user. */
  it("never takes a user re-invited since, while the new invitation is live", async () => {
    const first = await invite("olena@example.org");
    if (first.kind !== "invited") throw new Error("unreachable");
    const second = await invite("olena@example.org", later);
    expect(second).toMatchObject({ kind: "invited", userId: first.userId, createdUser: false });
    expect(await users().cleanupCandidates({ organizationId: null, now: later })).toEqual([]);
    expect(await users().deleteCandidates([first.userId], later)).toBe(0);
    expect(await userByEmail("olena@example.org")).toBeDefined();
  });

  /** Finding 2: a user with a non-cascading row is skipped, and the rest of the batch still goes. */
  it("skips a user with a super_admin grant without failing the batch", async () => {
    const granted = await invite("granted@example.org");
    const plain = await invite("plain@example.org");
    if (granted.kind !== "invited" || plain.kind !== "invited") throw new Error("unreachable");
    await db.insert(superAdmins).values({ id: "g1", userId: granted.userId, grantedAt: NOW });
    expect(await users().deleteCandidates([granted.userId, plain.userId], later)).toBe(1);
    expect(await userByEmail("granted@example.org")).toBeDefined();
    expect(await userByEmail("plain@example.org")).toBeUndefined();
  });

  /** The other non-cascading row: an operator's support session keeps the user, and the batch goes on. */
  it("skips a user with a support session without failing the batch", async () => {
    const operatorToBe = await invite("support@example.org");
    const plain = await invite("plain@example.org");
    if (operatorToBe.kind !== "invited" || plain.kind !== "invited") throw new Error("unreachable");
    await db.insert(supportSessions).values({
      id: "s1",
      operatorUserId: operatorToBe.userId,
      shelterId,
      tokenHash: "hash-1",
      startedAt: NOW,
      lastSeenAt: NOW,
    });
    expect(await users().deleteCandidates([operatorToBe.userId, plain.userId], later)).toBe(1);
    expect(await userByEmail("support@example.org")).toBeDefined();
    expect(await userByEmail("plain@example.org")).toBeUndefined();
  });
});
