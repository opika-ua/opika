import type { ShelterId } from "@opika/domain";
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
    expect(await invite("OLENA@example.org")).toEqual({
      kind: "address_has_a_role",
      reason: "shelter_admin",
    });
    expect(await db.select().from(authInvitation)).toHaveLength(invitationsBefore);
  });
});

/**
 * RG-T10 / IN-Q7 / IN-Q8 (Oleksii: "Q7: accepted." "Q8: accepted"): one
 * person holds one role, so an operator's address and an address invited to
 * another shelter are refused with the reason, writing nothing.
 */
describe("kabinetInvitationRepo.invite refuses an address with a role (RG-T10)", () => {
  async function secondShelter(): Promise<string> {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const other = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(other);
    return other.id;
  }
  const grant = (userId: string, revokedAt: Date | null = null) =>
    db.insert(superAdmins).values({ id: crypto.randomUUID(), userId, grantedAt: NOW, revokedAt });

  it("refuses an active operator's address, and invites once the grant is revoked", async () => {
    await grant(OPERATOR);
    const invitationsBefore = (await db.select().from(authInvitation)).length;
    expect(await invite("op@example.org")).toEqual({
      kind: "address_has_a_role",
      reason: "operator",
    });
    expect(await db.select().from(authInvitation)).toHaveLength(invitationsBefore);
    await db.delete(superAdmins);
    await grant(OPERATOR, NOW);
    expect((await invite("op@example.org")).kind).toBe("invited");
  });

  it("refuses an address with a live invitation to another shelter, and allows it once that expires", async () => {
    const other = await secondShelter();
    expect((await invite("olena@example.org", NOW, other)).kind).toBe("invited");
    expect(await invite("olena@example.org")).toEqual({
      kind: "address_has_a_role",
      reason: "invited_elsewhere",
    });
    const afterExpiry = new Date(NOW.getTime() + INVITATION_TTL_MS + 1);
    expect((await invite("olena@example.org", afterExpiry)).kind).toBe("invited");
  });

  it("never treats a re-invite to the same shelter as elsewhere", async () => {
    expect((await invite("olena@example.org")).kind).toBe("invited");
    expect((await invite("olena@example.org", new Date(NOW.getTime() + 1000))).kind).toBe(
      "invited",
    );
  });

  it("counts any live invitation as elsewhere when there is no shelter yet (create's pre-check)", async () => {
    await invite("olena@example.org");
    expect(
      await kabinetInvitationRepo(db).roleOfAddress({
        email: " Olena@Example.org ",
        shelterId: null,
        now: NOW,
      }),
    ).toBe("invited_elsewhere");
    expect(
      await kabinetInvitationRepo(db).roleOfAddress({
        email: "nobody@example.org",
        shelterId: null,
        now: NOW,
      }),
    ).toBeNull();
  });
});

/**
 * Oleksii, 2026-10-13: the refusal "must cover every path that makes an
 * invitation live again (create, resend, and anything that resets expiry),
 * with one test per path". The writes are `createInvitation` (reached by
 * `invite` and `shelters.create`, whose own tests are above and in
 * apps/web) and `resend`, the only expiry reset; the other two updates only
 * cancel. Each is checked at the write, here.
 */
describe("every write that makes an invitation live checks the address's role", () => {
  const afterExpiry = new Date(NOW.getTime() + INVITATION_TTL_MS + 1);
  async function otherShelter(): Promise<ShelterId> {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const other = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(other);
    return other.id;
  }

  it("createInvitation refuses an address invited elsewhere, writing nothing", async () => {
    const other = await otherShelter();
    expect((await invite("olena@example.org", NOW, other)).kind).toBe("invited");
    const repo = kabinetInvitationRepo(db);
    const organizationId = await repo.ensureOrganization(
      shelterId as ShelterId,
      { organizationId: "org-direct" },
      NOW,
    );
    const before = (await db.select().from(authInvitation)).length;
    expect(
      await repo.createInvitation({
        id: "inv-direct",
        organizationId,
        email: "olena@example.org",
        inviterUserId: OPERATOR,
        now: NOW,
        history: {
          id: crypto.randomUUID(),
          shelterId: shelterId as ShelterId,
          entry: {
            kind: "admin_invited",
            at: NOW,
            moderatorId: OPERATOR as never,
            email: "olena@example.org",
          },
        },
      }),
    ).toEqual({ kind: "address_has_a_role", reason: "invited_elsewhere" });
    expect(await db.select().from(authInvitation)).toHaveLength(before);
  });

  it("resend refuses to revive an invitation whose address was invited elsewhere since, leaving it expired", async () => {
    const first = await invite("olena@example.org");
    if (first.kind !== "invited") throw new Error("unreachable");
    const other = await otherShelter();
    expect((await invite("olena@example.org", afterExpiry, other)).kind).toBe("invited");
    expect(
      await kabinetInvitationRepo(db).resend(first.invitationId, afterExpiry, {
        id: crypto.randomUUID(),
        shelterId: shelterId as ShelterId,
        entry: {
          kind: "admin_invitation_resent",
          at: afterExpiry,
          moderatorId: OPERATOR as never,
          email: "olena@example.org",
        },
      }),
    ).toEqual({ kind: "address_has_a_role", reason: "invited_elsewhere" });
    const live = (await db.select().from(authInvitation)).filter(
      (row) => row.status === "pending" && row.expiresAt > afterExpiry,
    );
    expect(live).toHaveLength(1);
  });

  it("resend refuses an address made an operator since", async () => {
    const first = await invite("olena@example.org");
    if (first.kind !== "invited") throw new Error("unreachable");
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: first.userId, grantedAt: NOW });
    expect(
      await kabinetInvitationRepo(db).resend(first.invitationId, NOW, {
        id: crypto.randomUUID(),
        shelterId: shelterId as ShelterId,
        entry: {
          kind: "admin_invitation_resent",
          at: NOW,
          moderatorId: OPERATOR as never,
          email: "olena@example.org",
        },
      }),
    ).toEqual({ kind: "address_has_a_role", reason: "operator" });
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
      kind: "resent",
      expiresAt: new Date(later.getTime() + INVITATION_TTL_MS),
    });
    expect(await users().cleanupCandidates({ organizationId: null, now: later })).toEqual([]);
    await repo().revoke(r.invitationId);
    expect(await repo().resend(r.invitationId, later, resent("olena@example.org"))).toEqual({
      kind: "not_pending",
    });
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
