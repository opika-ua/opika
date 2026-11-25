import type { ShelterAdminId, ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import {
  type LoginEmailChangeWrite,
  type RegistrationTokenPair,
  type SelfRegistrationWrite,
  selfRegistrationRepo,
} from "../src/repos/self-registration-repo";
import {
  authAccount,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
} from "../src/schema/auth";
import { registrationEmailTokens } from "../src/schema/registration-email-tokens";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import {
  holdStatementUncommitted,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-11-20T10:00:00.000Z");
const LATER = new Date(NOW.getTime() + 60_000);
const DAY = 24 * 60 * 60 * 1000;
let cityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

const tokens = (
  seed: string,
  expiresAt = new Date(NOW.getTime() + 14 * DAY),
): RegistrationTokenPair => [
  { tokenHash: `confirm-${seed}`, purpose: "confirm_email", expiresAt },
  { tokenHash: `notme-${seed}`, purpose: "not_me", expiresAt },
];

function registration(email = "olena@example.org", seed = "a"): SelfRegistrationWrite {
  const userId = crypto.randomUUID();
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    verification: {
      status: "application",
      appliedAt: NOW,
      evidence: {
        items: [{ kind: "public_link", url: "https://www.instagram.com/prytulok_test/" }],
        submittedAt: NOW,
      },
    },
  });
  return {
    userId,
    email,
    accountId: crypto.randomUUID(),
    passwordHash: "scrypt-hash-stand-in",
    organizationId: crypto.randomUUID(),
    memberId: crypto.randomUUID(),
    shelter,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "shelter_registered", at: NOW, shelterAdminId: userId as ShelterAdminId },
    },
    tokens: tokens(seed),
    now: NOW,
  };
}

async function rowCounts() {
  return {
    users: (await db.select().from(authUser)).length,
    accounts: (await db.select().from(authAccount)).length,
    organizations: (await db.select().from(authOrganization)).length,
    members: (await db.select().from(authMember)).length,
    shelters: (await db.select().from(shelters)).length,
    history: (await db.select().from(shelterHistory)).length,
    tokens: (await db.select().from(registrationEmailTokens)).length,
  };
}

describe("selfRegistrationRepo.register", () => {
  it("writes the account, password, organization, membership, application and its line together", async () => {
    const input = registration();
    expect(await selfRegistrationRepo(db).register(input)).toEqual({ kind: "registered" });

    const [user] = await db.select().from(authUser).where(eq(authUser.id, input.userId));
    expect(user).toMatchObject({ email: "olena@example.org", emailVerified: false });
    const [account] = await db
      .select()
      .from(authAccount)
      .where(eq(authAccount.userId, input.userId));
    expect(account).toMatchObject({
      providerId: "credential",
      accountId: input.userId,
      password: "scrypt-hash-stand-in",
    });
    const [member] = await db.select().from(authMember).where(eq(authMember.userId, input.userId));
    expect(member).toMatchObject({ organizationId: input.organizationId, role: "admin" });
    const [shelter] = await db.select().from(shelters).where(eq(shelters.id, input.shelter.id));
    expect(shelter).toMatchObject({
      verificationStatus: "application",
      registrationSource: "self_registration",
      registrantUserId: input.userId,
      appliedAt: NOW,
      organizationId: input.organizationId,
    });
    const lines = await db
      .select()
      .from(shelterHistory)
      .where(eq(shelterHistory.shelterId, input.shelter.id as ShelterId));
    expect(lines.map((line) => line.kind)).toEqual(["shelter_registered"]);
    expect(await rowCounts()).toMatchObject({ tokens: 2 });
  });

  it("answers email_taken for an address that has an account, and writes nothing", async () => {
    await selfRegistrationRepo(db).register(registration("olena@example.org", "a"));
    const before = await rowCounts();
    expect(await selfRegistrationRepo(db).register(registration("olena@example.org", "b"))).toEqual(
      { kind: "email_taken" },
    );
    expect(await rowCounts()).toEqual(before);
  });

  it("two registrations of one address at once: the loser is email_taken, never an error", async () => {
    // The first account's insert is held open, so the second's read finds no account and its
    // write meets the unique email in Postgres, forced rather than raced.
    const held = holdStatementUncommitted((query) => query.startsWith('insert into "auth_user"'));
    try {
      const first = held.db.insert(authUser).values({
        id: crypto.randomUUID(),
        name: "Перша",
        email: "olena@example.org",
        emailVerified: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const firstDone = first.then(() => undefined);
      await held.ran;
      const second = selfRegistrationRepo(db).register(registration("olena@example.org", "b"));
      expect(await held.waitsOnIt(second)).toBe(true);
      held.release();
      await firstDone;
      expect(await second).toEqual({ kind: "email_taken" });
    } finally {
      held.release();
      await held.end();
    }
    const counts = await rowCounts();
    expect(counts).toMatchObject({
      users: 1,
      accounts: 0,
      organizations: 0,
      members: 0,
      shelters: 0,
    });
  });

  it("hasAccount reads whether the address has an account", async () => {
    expect(await selfRegistrationRepo(db).hasAccount("olena@example.org")).toBe(false);
    await selfRegistrationRepo(db).register(registration());
    expect(await selfRegistrationRepo(db).hasAccount("olena@example.org")).toBe(true);
  });

  it("leaves nothing behind when a later statement of the write fails", async () => {
    const input = registration("olena@example.org", "a");
    // The last statement (the links) collides with a row already there; every earlier one rolls back.
    const other = registration("other@example.org", "b");
    await selfRegistrationRepo(db).register(other);
    const before = await rowCounts();
    const clash: SelfRegistrationWrite = {
      ...input,
      tokens: [other.tokens[0], input.tokens[1]],
    };
    await expect(selfRegistrationRepo(db).register(clash)).rejects.toThrow();
    expect(await rowCounts()).toEqual(before);
    expect(await db.select().from(authUser).where(eq(authUser.email, "olena@example.org"))).toEqual(
      [],
    );
  });

  it("refuses anything but an application", async () => {
    const input = registration();
    await expect(
      selfRegistrationRepo(db).register({
        ...input,
        shelter: {
          ...input.shelter,
          verification: {
            status: "pending",
            submittedAt: NOW,
            evidence: input.shelter.verification.evidence,
          },
        },
      }),
    ).rejects.toThrow(/application/);
    expect((await rowCounts()).users).toBe(0);
  });
});

describe("the confirmation links", () => {
  it("store the hash only, and a GET-style read uses nothing up", async () => {
    const input = registration();
    await selfRegistrationRepo(db).register(input);
    const stored = await db.select().from(registrationEmailTokens);
    expect(stored.map((row) => row.tokenHash).sort()).toEqual(["confirm-a", "notme-a"]);

    const repo = selfRegistrationRepo(db);
    expect(await repo.tokenUser("confirm_email", "confirm-a", LATER)).toBe(input.userId);
    expect(await repo.tokenUser("confirm_email", "confirm-a", LATER)).toBe(input.userId);
    // The purpose is part of the key: a «Це не я» token never confirms.
    expect(await repo.tokenUser("confirm_email", "notme-a", LATER)).toBeNull();
    const after = await db.select().from(registrationEmailTokens);
    expect(after.every((row) => row.usedAt === null)).toBe(true);
  });

  it("confirm once: marks the address verified and uses the link up", async () => {
    const input = registration();
    await selfRegistrationRepo(db).register(input);
    const repo = selfRegistrationRepo(db);

    const first = await repo.confirmEmail("confirm-a", LATER);
    expect(first).toMatchObject({
      kind: "confirmed",
      userId: input.userId,
      application: {
        shelterId: input.shelter.id,
        displayName: input.shelter.displayName,
        link: "https://www.instagram.com/prytulok_test/",
        email: "olena@example.org",
      },
    });
    const [user] = await db.select().from(authUser).where(eq(authUser.id, input.userId));
    expect(user?.emailVerified).toBe(true);
    expect(await repo.confirmEmail("confirm-a", LATER)).toEqual({ kind: "unusable" });
    expect(await repo.tokenUser("confirm_email", "confirm-a", LATER)).toBeNull();
  });

  it("an expired link confirms nothing", async () => {
    const input = registration();
    await selfRegistrationRepo(db).register(input);
    const expired = new Date(NOW.getTime() + 14 * DAY);
    expect(await selfRegistrationRepo(db).confirmEmail("confirm-a", expired)).toEqual({
      kind: "unusable",
    });
    const [user] = await db.select().from(authUser).where(eq(authUser.id, input.userId));
    expect(user?.emailVerified).toBe(false);
  });

  it("«Це не я» after approval: one operator-only line, written with the link's use, once", async () => {
    const input = registration();
    await selfRegistrationRepo(db).register(input);
    const repo = selfRegistrationRepo(db);
    expect(await repo.recordNotMeAfterApproval("notme-a", crypto.randomUUID(), LATER)).toBe(true);
    expect(await repo.recordNotMeAfterApproval("notme-a", crypto.randomUUID(), LATER)).toBe(false);
    // The confirmation link is not a «Це не я» link.
    expect(await repo.recordNotMeAfterApproval("confirm-a", crypto.randomUUID(), LATER)).toBe(
      false,
    );
    const lines = (await db.select().from(shelterHistory)).filter(
      (row) => row.kind === "not_me_after_approval",
    );
    expect(lines.map((row) => [row.shelterId, row.entry])).toEqual([
      [input.shelter.id, { kind: "not_me_after_approval", at: LATER }],
    ]);
    expect(await repo.tokenUser("not_me", "notme-a", LATER)).toBeNull();
  });

  it("useToken is single use", async () => {
    await selfRegistrationRepo(db).register(registration());
    const repo = selfRegistrationRepo(db);
    expect(await repo.useToken("not_me", "notme-a", LATER)).toBe(true);
    expect(await repo.useToken("not_me", "notme-a", LATER)).toBe(false);
  });

  it("applicationOf finds the registrant's shelter, and nothing for anyone else", async () => {
    const input = registration();
    await selfRegistrationRepo(db).register(input);
    expect(await selfRegistrationRepo(db).applicationOf(input.userId)).toEqual({
      userId: input.userId,
      email: "olena@example.org",
      emailVerified: false,
      shelterId: input.shelter.id,
      displayName: input.shelter.displayName,
      status: "application",
    });
    expect(await selfRegistrationRepo(db).applicationOf(crypto.randomUUID())).toBeNull();
  });
});

describe("selfRegistrationRepo.changeLoginEmail", () => {
  const HASHED = "A".repeat(43);
  const magicLinkValue = (email: string) =>
    JSON.stringify({ type: "magic-link", email, name: "", attempt: 0 });

  /** A registrant with two sessions, a used and an unused pair, a reset link and magic links. */
  async function registrant(email = "olena@example.org") {
    const input = registration(email, "old");
    const repo = selfRegistrationRepo(db);
    await repo.register(input);
    await repo.issueTokens(input.userId, tokens("old2"));
    await repo.useToken("not_me", "notme-old2", LATER);
    const session = (id: string) => ({
      id,
      token: `token-${id}`,
      userId: input.userId,
      expiresAt: new Date(NOW.getTime() + DAY),
      createdAt: NOW,
      updatedAt: NOW,
    });
    const here = crypto.randomUUID();
    const elsewhere = crypto.randomUUID();
    await db.insert(authSession).values([session(here), session(elsewhere)]);
    const verification = (identifier: string, value: string) => ({
      id: crypto.randomUUID(),
      identifier,
      value,
      expiresAt: new Date(NOW.getTime() + DAY),
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db
      .insert(authVerification)
      .values([
        verification(HASHED, input.userId),
        verification(`magic-link:${"B".repeat(43)}`, magicLinkValue(email)),
        verification("C".repeat(43), crypto.randomUUID()),
        verification(`magic-link:${"D".repeat(43)}`, magicLinkValue("someone@example.org")),
      ]);
    return { input, here, elsewhere };
  }

  const change = (
    of: Awaited<ReturnType<typeof registrant>>,
    overrides: Partial<LoginEmailChangeWrite> = {},
  ): LoginEmailChangeWrite => ({
    userId: of.input.userId,
    from: of.input.email,
    to: "new-address@example.org",
    passwordHash: "scrypt-hash-stand-in",
    keepSessionId: of.here,
    history: {
      id: crypto.randomUUID(),
      entry: {
        kind: "login_email_changed",
        at: LATER,
        by: { kind: "self", shelterAdminId: of.input.userId as ShelterAdminId },
      },
    },
    tokens: tokens("new", new Date(LATER.getTime() + 14 * DAY)),
    now: LATER,
    ...overrides,
  });

  async function snapshot(userId: string) {
    const [user] = await db.select().from(authUser).where(eq(authUser.id, userId));
    return {
      email: user?.email,
      lines: (await db.select().from(shelterHistory)).map((row) => row.kind).sort(),
      tokens: (await db.select().from(registrationEmailTokens))
        .map((row) => `${row.tokenHash}:${row.usedAt === null ? "unused" : "used"}`)
        .sort(),
      sessions: (await db.select().from(authSession)).map((row) => row.id).sort(),
      verifications: (await db.select().from(authVerification)).length,
    };
  }

  it("changes the address with every statement: line, links, sessions, reset and magic links", async () => {
    const of = await registrant();
    const write = change(of);
    expect(await selfRegistrationRepo(db).changeLoginEmail(write)).toEqual({ kind: "changed" });

    const after = await snapshot(of.input.userId);
    expect(after.email).toBe("new-address@example.org");
    expect(after.lines).toEqual(["login_email_changed", "shelter_registered"]);
    // Every unused link of both purposes is gone; the used one stays; the new pair is live.
    expect(after.tokens).toEqual(["confirm-new:unused", "notme-new:unused", "notme-old2:used"]);
    expect(after.sessions).toEqual([of.here]);
    // The reset link and the old address's magic link go; another user's rows stay.
    const left = await db.select().from(authVerification);
    expect(left.map((row) => row.identifier).sort()).toEqual([
      "C".repeat(43),
      `magic-link:${"D".repeat(43)}`,
    ]);

    const [line] = await db
      .select()
      .from(shelterHistory)
      .where(eq(shelterHistory.id, write.history.id));
    expect(line?.shelterId).toBe(of.input.shelter.id);
    expect(JSON.stringify(line?.entry)).not.toContain("@");
  });

  it("an old link is unusable after the change, and the new one confirms", async () => {
    const of = await registrant();
    const repo = selfRegistrationRepo(db);
    await repo.changeLoginEmail(change(of));
    expect(await repo.confirmEmail("confirm-old", LATER)).toEqual({ kind: "unusable" });
    expect(await repo.useToken("not_me", "notme-old", LATER)).toBe(false);
    expect(await repo.confirmEmail("confirm-new", LATER)).toMatchObject({
      kind: "confirmed",
      application: { email: "new-address@example.org" },
    });
  });

  it("the operator path keeps no session", async () => {
    const of = await registrant();
    await selfRegistrationRepo(db).changeLoginEmail(
      change(of, { keepSessionId: null, passwordHash: null }),
    );
    expect((await snapshot(of.input.userId)).sessions).toEqual([]);
  });

  it("a verified address changes nothing and writes no line", async () => {
    const of = await registrant();
    await db.update(authUser).set({ emailVerified: true }).where(eq(authUser.id, of.input.userId));
    const before = await snapshot(of.input.userId);
    expect(await selfRegistrationRepo(db).changeLoginEmail(change(of))).toEqual({
      kind: "not_needed",
    });
    expect(await snapshot(of.input.userId)).toEqual(before);
  });

  it("a decided application changes nothing", async () => {
    const of = await registrant();
    await db
      .update(shelters)
      .set({ verificationStatus: "pending" })
      .where(eq(shelters.id, of.input.shelter.id));
    const before = await snapshot(of.input.userId);
    expect(await selfRegistrationRepo(db).changeLoginEmail(change(of))).toEqual({
      kind: "not_needed",
    });
    expect(await snapshot(of.input.userId)).toEqual(before);
  });

  it("an address changed meanwhile changes nothing", async () => {
    const of = await registrant();
    const before = await snapshot(of.input.userId);
    expect(
      await selfRegistrationRepo(db).changeLoginEmail(change(of, { from: "stale@example.org" })),
    ).toEqual({ kind: "not_needed" });
    expect(await snapshot(of.input.userId)).toEqual(before);
  });

  it("a password changed since the verify (hash moved) changes nothing", async () => {
    const of = await registrant();
    await db
      .update(authAccount)
      .set({ password: "a-newer-hash" })
      .where(eq(authAccount.userId, of.input.userId));
    const before = await snapshot(of.input.userId);
    expect(await selfRegistrationRepo(db).changeLoginEmail(change(of))).toEqual({
      kind: "wrong_password",
    });
    expect(await snapshot(of.input.userId)).toEqual(before);
  });

  it("a taken address is email_taken from the unique index, and nothing is written", async () => {
    const of = await registrant();
    await selfRegistrationRepo(db).register(registration("new-address@example.org", "other"));
    const before = await snapshot(of.input.userId);
    expect(await selfRegistrationRepo(db).changeLoginEmail(change(of))).toEqual({
      kind: "email_taken",
    });
    expect(await snapshot(of.input.userId)).toEqual(before);
  });

  it("credentialHashOf reads the password hash, or null without one", async () => {
    const of = await registrant();
    const repo = selfRegistrationRepo(db);
    expect(await repo.credentialHashOf(of.input.userId)).toBe("scrypt-hash-stand-in");
    expect(await repo.credentialHashOf(crypto.randomUUID())).toBeNull();
  });
});
