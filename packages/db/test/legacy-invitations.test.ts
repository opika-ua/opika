import { randomUUID } from "node:crypto";
import type { ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  deleteLegacyShelters,
  formatLegacyList,
  legacyInvitedShelters,
  maskEmail,
  parseLegacyArgs,
} from "../src/legacy-invitations";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
  invitationCreatedUsers,
  supportSessions,
} from "../src/schema/auth";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import {
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  steppedDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * §14 Q1's one-off: which operator-created shelters it finds, that a dry run writes nothing, and
 * that `--commit` deletes exactly the counted set or nothing at all.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-20T10:00:00.000Z");
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const EVIDENCE = { items: [], submittedAt: NOW };
let cityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
  await db.insert(authUser).values({
    id: OPERATOR,
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

type Invite = "pending" | "accepted" | "canceled" | "none";

/** An operator-created shelter, its organization and one invitation in `invite`'s state. */
async function invited(
  invite: Invite,
  options: { name?: string; animals?: number; status?: "pending" | "under_review" } = {},
) {
  const organizationId = randomUUID();
  await db.insert(authOrganization).values({
    id: organizationId,
    name: "Org",
    slug: organizationId,
    createdAt: NOW,
  });
  const shelter = makeShelter({
    displayName: options.name ?? "Притулок",
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    verification: { status: "pending", submittedAt: NOW, evidence: EVIDENCE },
  });
  await shelterRepo(db).insert(shelter);
  await db.update(shelters).set({ organizationId }).where(eq(shelters.id, shelter.id));
  await db.insert(shelterHistory).values({
    id: randomUUID(),
    shelterId: shelter.id,
    kind: "shelter_created",
    at: NOW,
    entry: { kind: "shelter_created", at: NOW, moderatorId: OPERATOR, via: "script" } as never,
  });
  if (options.status === "under_review") {
    await db
      .update(shelters)
      .set({ verificationStatus: "under_review", earlyListingSince: NOW })
      .where(eq(shelters.id, shelter.id));
  }
  let invitationId: string | null = null;
  if (invite !== "none") {
    invitationId = randomUUID();
    await db.insert(authInvitation).values({
      id: invitationId,
      organizationId,
      email: `${invitationId.slice(0, 6)}@example.org`,
      role: "owner",
      status: invite,
      expiresAt: NOW,
      createdAt: NOW,
      inviterId: OPERATOR,
    });
    await db.insert(authVerification).values({
      id: randomUUID(),
      identifier: "C".repeat(43),
      value: `invitation:${invitationId}`,
      expiresAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  if (invite === "accepted") {
    const userId = randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Адмін",
      email: `${userId.slice(0, 6)}@example.org`,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db
      .insert(authMember)
      .values({ id: randomUUID(), organizationId, userId, role: "owner", createdAt: NOW });
  }
  for (let i = 0; i < (options.animals ?? 0); i += 1) {
    await animalRepo(db).insert(makeDraftAnimal({ shelterId: shelter.id }), cityId as never);
  }
  return { id: shelter.id, organizationId, invitationId };
}

/** Every row the script could touch, for "nothing was written". */
const snapshot = async () => ({
  shelters: (await db.select().from(shelters)).length,
  organizations: (await db.select().from(authOrganization)).length,
  invitations: (await db.select().from(authInvitation)).length,
  links: (await db.select().from(authVerification)).length,
  history: (await db.select().from(shelterHistory)).length,
  animals: (await db.select().from(animals)).length,
});

async function scene() {
  const a = await invited("pending", { name: "Альфа" });
  // Early-listed and under review: still found, the status never decides.
  const b = await invited("pending", { name: "Бета", status: "under_review" });
  await invited("accepted");
  await invited("pending", { animals: 1 });
  await invited("canceled");
  await invited("none");
  const application = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    verification: { status: "application", appliedAt: NOW, evidence: EVIDENCE },
  });
  await shelterRepo(db).insert(application);
  return { a, b };
}

describe("legacyInvitedShelters", () => {
  it("finds exactly the operator-created shelters with an unaccepted invitation and no animals", async () => {
    const { a, b } = await scene();
    const found = await legacyInvitedShelters(db);
    expect(found.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(found[0]?.invitedEmails).toHaveLength(1);
  });

  it("the dry run's list names each shelter with its id and a masked address, then the count", async () => {
    const { a } = await scene();
    const lines = formatLegacyList(await legacyInvitedShelters(db));
    expect(lines[0]).toBe(
      `  Альфа | ${a.id} | ${maskEmail(`${a.invitationId?.slice(0, 6)}@example.org`)}`,
    );
    expect(lines.at(-1)).toBe(
      "Operator-created shelters with an unaccepted invitation and no animals: 2",
    );
    expect(lines.join("\n")).not.toContain(`${a.invitationId?.slice(0, 6)}@`);
    expect(maskEmail("olena@example.org")).toBe("o***@example.org");
  });

  it("reading writes nothing", async () => {
    await scene();
    const before = await snapshot();
    await legacyInvitedShelters(db);
    expect(await snapshot()).toEqual(before);
  });
});

describe("deleteLegacyShelters", () => {
  it("a different count aborts and writes nothing", async () => {
    await scene();
    const before = await snapshot();
    expect(await deleteLegacyShelters(db, 3, NOW)).toEqual({
      kind: "count_differs",
      found: 2,
      expected: 3,
    });
    expect(await deleteLegacyShelters(db, 1, NOW)).toEqual({
      kind: "count_differs",
      found: 2,
      expected: 1,
    });
    expect(await snapshot()).toEqual(before);
  });

  it("the right count deletes them, their organizations, invitations and links, and nothing else", async () => {
    const { a, b } = await scene();
    const before = await snapshot();
    expect(await deleteLegacyShelters(db, 2, NOW)).toEqual({
      kind: "deleted",
      count: 2,
      inviteesErased: 0,
    });
    const ids = (await db.select({ id: shelters.id }).from(shelters)).map((row) => row.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(await snapshot()).toEqual({
      ...before,
      shelters: before.shelters - 2,
      organizations: before.organizations - 2,
      invitations: before.invitations - 2,
      links: before.links - 2,
      history: before.history - 2,
    });
    const links = await db.select({ value: authVerification.value }).from(authVerification);
    expect(links.map((row) => row.value)).not.toContain(`invitation:${a.invitationId}`);
    expect(await legacyInvitedShelters(db)).toEqual([]);
  });

  /** Decision Q4 (B), 0029: the audit row of a support session outlives the shelter it viewed. */
  it("a shelter with a support session is deleted all the same; the session stays, its shelter nulled", async () => {
    const { a } = await scene();
    const sessionId = randomUUID();
    await db.insert(supportSessions).values({
      id: sessionId,
      operatorUserId: OPERATOR,
      shelterId: a.id,
      tokenHash: randomUUID(),
      startedAt: NOW,
      lastSeenAt: NOW,
    });
    const found = await legacyInvitedShelters(db);
    expect(found.find((s) => s.id === a.id)?.hasSupportSession).toBe(true);
    // The dry run says what --commit will do with it.
    expect(formatLegacyList(found)).toContain(
      `  Альфа | ${a.id} | ${maskEmail(`${a.invitationId?.slice(0, 6)}@example.org`)} | support session: kept, its shelter link nulled`,
    );
    expect(await deleteLegacyShelters(db, 2, NOW)).toEqual({
      kind: "deleted",
      count: 2,
      inviteesErased: 0,
    });
    const [session] = await db
      .select()
      .from(supportSessions)
      .where(eq(supportSessions.id, sessionId));
    expect(session?.shelterId).toBeNull();
    expect(session?.operatorUserId).toBe(OPERATOR);
    expect((await db.select({ id: shelters.id }).from(shelters)).map((r) => r.id)).not.toContain(
      a.id,
    );
  });

  it("aborts whole, writing nothing, when one stops being legacy after the count", async () => {
    const { a } = await scene();
    const before = await snapshot();
    const stepped = steppedDatabase(db, {
      holdWhen: (statement) =>
        statement.kind === "select" && statement.tables.includes("support_sessions"),
    });
    const running = deleteLegacyShelters(stepped.db, 2, NOW);
    await stepped.hold.reached;
    await animalRepo(db).insert(makeDraftAnimal({ shelterId: a.id as ShelterId }), cityId as never);
    stepped.hold.release();
    expect(await running).toEqual({ kind: "changed_meanwhile" });
    expect(await snapshot()).toEqual({ ...before, animals: before.animals + 1 });
  });
});

describe("the invitees' accounts (the real invite path)", () => {
  /** A legacy shelter invited as the operator invites: the invitation creates its user. */
  async function invitedForReal(email: string) {
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId } as never,
      verification: { status: "pending", submittedAt: NOW, evidence: EVIDENCE },
    });
    await shelterRepo(db).insert(shelter);
    const result = await kabinetInvitationRepo(db).invite({
      shelterId: shelter.id,
      email,
      name: "Олена",
      inviterUserId: OPERATOR,
      ids: { invitationId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() },
      now: NOW,
      history: {
        id: randomUUID(),
        entry: { kind: "admin_invited", at: NOW, moderatorId: OPERATOR as never, email },
      },
    });
    if (result.kind !== "invited" || !result.createdUser) throw new Error("expected a new invitee");
    return { shelterId: shelter.id, userId: result.userId };
  }

  /** What Better Auth keeps for a user: a credential, then a session, a reset and a magic link. */
  async function signedIn(userId: string, email: string) {
    await db.insert(authAccount).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: "salt:key",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(authSession).values({
      id: randomUUID(),
      token: randomUUID(),
      userId,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(authVerification).values([
      {
        id: randomUUID(),
        identifier: "D".repeat(43),
        value: userId,
        expiresAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: randomUUID(),
        identifier: `magic-link:${"E".repeat(43)}`,
        value: JSON.stringify({ type: "magic-link", email, name: "" }),
        expiresAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  }

  const rowsOf = async (userId: string, email: string) => ({
    users: (await db.select().from(authUser).where(eq(authUser.id, userId))).length,
    accounts: (await db.select().from(authAccount).where(eq(authAccount.userId, userId))).length,
    sessions: (await db.select().from(authSession).where(eq(authSession.userId, userId))).length,
    links: (await db.select().from(authVerification)).filter(
      (row) => row.value === userId || row.value.includes(email),
    ).length,
    created: (
      await db
        .select()
        .from(invitationCreatedUsers)
        .where(eq(invitationCreatedUsers.userId, userId))
    ).length,
  });

  it("erases each invitee's account, links and sessions in the same deletion", async () => {
    const email = "invitee@example.org";
    const invitee = await invitedForReal(email);
    await signedIn(invitee.userId, email);
    expect(await rowsOf(invitee.userId, email)).toEqual({
      users: 1,
      accounts: 1,
      sessions: 1,
      links: 2,
      created: 1,
    });
    expect(await deleteLegacyShelters(db, 1, NOW)).toEqual({
      kind: "deleted",
      count: 1,
      inviteesErased: 1,
    });
    expect(await rowsOf(invitee.userId, email)).toEqual({
      users: 0,
      accounts: 0,
      sessions: 0,
      links: 0,
      created: 0,
    });
  });

  it("keeps an invitee who has since become a member elsewhere, and the operator", async () => {
    const email = "member@example.org";
    const invitee = await invitedForReal(email);
    const elsewhere = randomUUID();
    await db
      .insert(authOrganization)
      .values({ id: elsewhere, name: "Інша", slug: elsewhere, createdAt: NOW });
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId: elsewhere,
      userId: invitee.userId,
      role: "owner",
      createdAt: NOW,
    });
    // Still legacy: its own organization has no member.
    expect(await deleteLegacyShelters(db, 1, NOW)).toEqual({
      kind: "deleted",
      count: 1,
      inviteesErased: 0,
    });
    expect((await rowsOf(invitee.userId, email)).users).toBe(1);
    expect((await db.select().from(authUser).where(eq(authUser.id, OPERATOR))).length).toBe(1);
  });
});

describe("parseLegacyArgs", () => {
  const argv = (...rest: string[]) => ["node", "legacy-invitations.ts", ...rest];

  it("is a dry run by default", () => {
    expect(parseLegacyArgs(argv())).toEqual({
      kind: "ok",
      commit: false,
      endpoint: undefined,
      count: undefined,
    });
  });

  it("--commit needs --expect <count>; an endpoint alone is not one", () => {
    expect(parseLegacyArgs(argv("--commit")).kind).toBe("refused");
    expect(parseLegacyArgs(argv("--commit", "--expect", "ep-abc")).kind).toBe("refused");
    expect(
      parseLegacyArgs(argv("--prod", "--expect", "ep-abc", "--commit", "--expect", "12")),
    ).toEqual({
      kind: "ok",
      commit: true,
      endpoint: "ep-abc",
      count: 12,
    });
  });

  it("refuses a count that isn't plain digits, a repeat, or an unknown argument", () => {
    for (const bad of ["1e1", "0x0c", "-1", "12.0", ""]) {
      expect(parseLegacyArgs(argv("--commit", "--expect", bad)).kind).toBe("refused");
    }
    expect(parseLegacyArgs(argv("--expect", "1", "--expect", "2")).kind).toBe("refused");
    expect(parseLegacyArgs(argv("--force")).kind).toBe("refused");
  });
});
