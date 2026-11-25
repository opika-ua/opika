import { randomUUID } from "node:crypto";
import {
  type CityId,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  shelterFacingHistoryOf,
} from "@opika/domain";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../src/client";
import { applicationDeletionRepo } from "../src/repos/application-deletion-repo";
import { cityRepo } from "../src/repos/city-repo";
import { notificationSendsRepo } from "../src/repos/notification-sends-repo";
import {
  type LoginEmailChangeWrite,
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
import { makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const LATER = new Date(NOW.getTime() + 60_000);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Self-registration's SQL on Neon's driver (Agent 1): the registration write as one batch and its
 * rollback, a taken address, the confirmation links (single use, bound to purpose and user),
 * «Це не я» before and after approval, the alarm's once-a-day claim, and an unconfirmed
 * registrant's login-email change (owner, 2026-11-25). The daily cap is a
 * shared-store (Upstash) counter, not the database, so it has no check here. Fresh fixtures
 * only; rows stay on the child branch.
 */
export async function runRegistrationSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const repo = selfRegistrationRepo(db);

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);

  const registration = (email: string): SelfRegistrationWrite => {
    const userId = randomUUID();
    const seed = randomUUID();
    const shelter = makeShelter({
      displayName: `Смоук реєстрація ${seed.slice(0, 6)}`,
      publicLocation: { precision: "city", cityId: city.id, district: null },
      verification: {
        status: "application",
        appliedAt: NOW,
        evidence: {
          items: [{ kind: "public_link", url: "https://www.instagram.com/smoke_registration/" }],
          submittedAt: NOW,
        },
      },
    });
    return {
      userId,
      email,
      accountId: randomUUID(),
      passwordHash: "smoke-hash",
      organizationId: randomUUID(),
      memberId: randomUUID(),
      shelter: { ...shelter, legalEntity: null, premises: { kind: "not_recorded" } },
      history: {
        id: randomUUID(),
        entry: { kind: "shelter_registered", at: NOW, shelterAdminId: userId as ShelterAdminId },
      },
      tokens: [
        {
          tokenHash: `smoke-confirm-${seed}`,
          purpose: "confirm_email",
          expiresAt: new Date(NOW.getTime() + 14 * DAY_MS),
        },
        {
          tokenHash: `smoke-notme-${seed}`,
          purpose: "not_me",
          expiresAt: new Date(NOW.getTime() + 14 * DAY_MS),
        },
      ],
      now: NOW,
    };
  };
  const address = () => `smoke-${randomUUID()}@example.org`;

  /** Every row the write makes for `input`, counted. */
  const written = async (input: SelfRegistrationWrite) => ({
    users: (await db.select().from(authUser).where(eq(authUser.id, input.userId))).length,
    accounts: (await db.select().from(authAccount).where(eq(authAccount.userId, input.userId)))
      .length,
    organizations: (
      await db.select().from(authOrganization).where(eq(authOrganization.id, input.organizationId))
    ).length,
    members: (await db.select().from(authMember).where(eq(authMember.userId, input.userId))).length,
    shelters: (await db.select().from(shelters).where(eq(shelters.id, input.shelter.id))).length,
    history: (
      await db.select().from(shelterHistory).where(eq(shelterHistory.shelterId, input.shelter.id))
    ).length,
    tokens: (
      await db
        .select()
        .from(registrationEmailTokens)
        .where(eq(registrationEmailTokens.userId, input.userId))
    ).length,
  });
  const none = {
    users: 0,
    accounts: 0,
    organizations: 0,
    members: 0,
    shelters: 0,
    history: 0,
    tokens: 0,
  };
  const all = {
    users: 1,
    accounts: 1,
    organizations: 1,
    members: 1,
    shelters: 1,
    history: 1,
    tokens: 2,
  };
  const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

  const first = registration(address());
  const outcome = await repo.register(first);
  const counts = await written(first);
  const [row] = await db.select().from(shelters).where(eq(shelters.id, first.shelter.id));
  check(
    "register: one batch writes the account, credential, organization, membership, application, its line and both token hashes",
    outcome.kind === "registered" &&
      same(counts, all) &&
      row?.verificationStatus === "application" &&
      row.registrantUserId === first.userId &&
      row.organizationId === first.organizationId &&
      JSON.stringify(row.verification).includes("smoke_registration"),
    `${outcome.kind}, ${JSON.stringify(counts)}`,
  );

  // The last statement (the links) collides with the first registration's token: all rolls back.
  const failing = registration(address());
  const clash: SelfRegistrationWrite = { ...failing, tokens: [first.tokens[0], failing.tokens[1]] };
  const threw = await repo.register(clash).then(
    () => false,
    () => true,
  );
  check(
    "register: a failed last statement leaves nothing of the batch",
    threw && same(await written(failing), none),
    `threw ${threw}, ${JSON.stringify(await written(failing))}`,
  );

  const again = registration(first.email);
  const taken = await repo.register(again);
  check(
    "register: the same address again is email_taken and writes nothing",
    taken.kind === "email_taken" && same(await written(again), none),
    taken.kind,
  );

  const [confirmHash, notMeHash] = [first.tokens[0].tokenHash, first.tokens[1].tokenHash];
  check(
    "links: a «Це не я» token never confirms",
    (await repo.confirmEmail(notMeHash, LATER)).kind === "unusable" &&
      (await repo.tokenUser("confirm_email", notMeHash, LATER)) === null,
    "purpose-bound",
  );
  const other = registration(address());
  await repo.register(other);
  check(
    "links: each token names its own registrant",
    (await repo.tokenUser("confirm_email", confirmHash, LATER)) === first.userId &&
      (await repo.tokenUser("confirm_email", other.tokens[0].tokenHash, LATER)) === other.userId,
    "user-bound",
  );
  const confirmed = await repo.confirmEmail(confirmHash, LATER);
  const [user] = await db.select().from(authUser).where(eq(authUser.id, first.userId));
  check(
    "confirm: the link is used and the address verified in one statement",
    confirmed.kind === "confirmed" &&
      confirmed.userId === first.userId &&
      confirmed.application?.shelterId === first.shelter.id &&
      user?.emailVerified === true,
    confirmed.kind,
  );
  check(
    "confirm: a second use is refused",
    (await repo.confirmEmail(confirmHash, LATER)).kind === "unusable",
    "single use",
  );

  // «Це не я» while an application goes through the deletion service.
  const withdrawing = registration(address());
  await repo.register(withdrawing);
  const deletion = await applicationDeletionRepo(db).deleteApplication(
    withdrawing.shelter.id,
    "not_me",
    LATER,
  );
  const left = await written(withdrawing);
  check(
    "«Це не я» while an application: the deletion service removes it and every row it wrote",
    deletion.kind === "deleted" && same({ ...left, history: 0 }, { ...none, history: 0 }),
    `${deletion.kind}, ${JSON.stringify(left)}`,
  );

  // After approval: only the operator's line, written with the link's use.
  const approved = registration(address());
  await repo.register(approved);
  await db
    .update(shelters)
    .set({ verificationStatus: "pending" })
    .where(eq(shelters.id, approved.shelter.id));
  const before = await written(approved);
  const recorded = await repo.recordNotMeAfterApproval(
    approved.tokens[1].tokenHash,
    randomUUID(),
    LATER,
  );
  const repeated = await repo.recordNotMeAfterApproval(
    approved.tokens[1].tokenHash,
    randomUUID(),
    LATER,
  );
  const lines = await db
    .select()
    .from(shelterHistory)
    .where(eq(shelterHistory.shelterId, approved.shelter.id));
  const notMe = lines.filter((line) => line.kind === "not_me_after_approval");
  check(
    "«Це не я» after approval: one operator line, once, nothing else changed",
    recorded &&
      !repeated &&
      notMe.length === 1 &&
      same(await written(approved), { ...before, history: before.history + 1 }),
    `${recorded}/${repeated}, ${notMe.length} lines`,
  );
  const entry = notMe[0]?.entry as ShelterHistoryEntry | undefined;
  check(
    "the not_me line reads back and is absent from the shelter-facing projection",
    entry?.kind === "not_me_after_approval" &&
      entry.at.getTime() === LATER.getTime() &&
      shelterFacingHistoryOf(entry, "Оператор") === null,
    entry?.kind ?? "none",
  );

  const alarmKey = `registration_cap_hit:smoke-${randomUUID()}`;
  const claims = await Promise.all(
    [0, 1].map(() =>
      notificationSendsRepo(db).claim(NOW, {
        dedupKey: alarmKey,
        kind: "registration_cap_hit",
        shelterId: null,
        recipientUserId: null,
      }),
    ),
  );
  check(
    "the cap alarm is claimed once for its day",
    claims.filter(Boolean).length === 1,
    JSON.stringify(claims),
  );
  await loginEmailChangeSteps(db, check, registration, address);
  return out;
}

/** The login-email change's batch on neon-http (proposal §4): its five statements and its guards. */
async function loginEmailChangeSteps(
  db: Database,
  check: (name: string, ok: boolean, detail: string) => void,
  registration: (email: string) => SelfRegistrationWrite,
  address: () => string,
): Promise<void> {
  const repo = selfRegistrationRepo(db);
  // Better Auth's stored shape: 43 characters of base64url.
  const hashed = () => randomUUID().replace(/-/g, "").padEnd(43, "x");
  const magicLink = (email: string) => JSON.stringify({ type: "magic-link", email, attempt: 0 });
  const verification = (identifier: string, value: string) => ({
    id: randomUUID(),
    identifier,
    value,
    expiresAt: new Date(LATER.getTime() + DAY_MS),
    createdAt: NOW,
    updatedAt: NOW,
  });
  /** A registrant with two sessions, a reset link and a magic link for the old address. */
  const registrant = async () => {
    const input = registration(address());
    await repo.register(input);
    const session = () => {
      const id = randomUUID();
      return {
        id,
        token: `smoke-${id}`,
        userId: input.userId,
        expiresAt: new Date(LATER.getTime() + DAY_MS),
        createdAt: NOW,
        updatedAt: NOW,
      };
    };
    const [here, elsewhere] = [session(), session()];
    await db.insert(authSession).values([here, elsewhere]);
    const reset = verification(hashed(), input.userId);
    const oldLink = verification(`magic-link:${hashed()}`, magicLink(input.email));
    await db.insert(authVerification).values([reset, oldLink]);
    return { input, here: here.id, elsewhere: elsewhere.id, reset: reset.id, oldLink: oldLink.id };
  };
  const change = (
    of: Awaited<ReturnType<typeof registrant>>,
    to: string,
    passwordHash = "smoke-hash",
  ): LoginEmailChangeWrite => {
    const seed = randomUUID();
    return {
      userId: of.input.userId,
      from: of.input.email,
      to,
      passwordHash,
      keepSessionId: of.here,
      history: {
        id: randomUUID(),
        entry: {
          kind: "login_email_changed",
          at: LATER,
          by: { kind: "self", shelterAdminId: of.input.userId as ShelterAdminId },
        },
      },
      tokens: [
        {
          tokenHash: `smoke-confirm-${seed}`,
          purpose: "confirm_email",
          expiresAt: new Date(LATER.getTime() + 14 * DAY_MS),
        },
        {
          tokenHash: `smoke-notme-${seed}`,
          purpose: "not_me",
          expiresAt: new Date(LATER.getTime() + 14 * DAY_MS),
        },
      ],
      now: LATER,
    };
  };
  /** What the change touches, for one registrant. */
  const state = async (of: Awaited<ReturnType<typeof registrant>>) => {
    const [user] = await db.select().from(authUser).where(eq(authUser.id, of.input.userId));
    const lines = await db
      .select()
      .from(shelterHistory)
      .where(eq(shelterHistory.shelterId, of.input.shelter.id));
    const tokens = await db
      .select()
      .from(registrationEmailTokens)
      .where(eq(registrationEmailTokens.userId, of.input.userId));
    const sessions = await db
      .select()
      .from(authSession)
      .where(eq(authSession.userId, of.input.userId));
    // Only this run's two rows: a child branch holds production's magic links, addresses included.
    const verifications = await db
      .select({ id: authVerification.id })
      .from(authVerification)
      .where(inArray(authVerification.id, [of.reset, of.oldLink]));
    return {
      email: user?.email ?? null,
      lines: lines.map((line) => line.kind).sort(),
      tokens: tokens.map((token) => token.tokenHash).sort(),
      sessions: sessions.map((session) => session.id).sort(),
      verifications: verifications.length,
    };
  };
  const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

  const moving = await registrant();
  const to = address();
  const write = change(moving, to);
  const changed = await repo.changeLoginEmail(write);
  const after = await state(moving);
  const [line] = await db
    .select()
    .from(shelterHistory)
    .where(eq(shelterHistory.id, write.history.id));
  check(
    "login email: one batch changes the address and writes its line, with no address in it",
    changed.kind === "changed" &&
      after.email === to &&
      same(after.lines, ["login_email_changed", "shelter_registered"]) &&
      line !== undefined &&
      !JSON.stringify(line.entry).includes("@"),
    `${changed.kind}, ${after.email === to}, ${JSON.stringify(after.lines)}`,
  );
  check(
    "login email: the old pair is deleted (both purposes) and the new pair written",
    same(after.tokens, [write.tokens[0].tokenHash, write.tokens[1].tokenHash].sort()),
    JSON.stringify(after.tokens),
  );
  check(
    "login email: the current session stays, the other goes",
    same(after.sessions, [moving.here]),
    `${after.sessions.length} left, ${after.sessions.includes(moving.here) ? "current kept" : "current gone"}`,
  );
  check(
    "login email: the reset link and the old address's magic link are gone",
    after.verifications === 0,
    `${after.verifications} left`,
  );
  check(
    "login email: the old link is unusable and the new one confirms",
    (await repo.confirmEmail(moving.input.tokens[0].tokenHash, LATER)).kind === "unusable" &&
      (await repo.confirmEmail(write.tokens[0].tokenHash, LATER)).kind === "confirmed",
    "old refused, new confirmed",
  );

  const verified = await registrant();
  await db
    .update(authUser)
    .set({ emailVerified: true })
    .where(eq(authUser.id, verified.input.userId));
  const verifiedBefore = await state(verified);
  const refused = await repo.changeLoginEmail(change(verified, address()));
  check(
    "login email: a verified address changes nothing and writes no line",
    refused.kind === "not_needed" && same(await state(verified), verifiedBefore),
    refused.kind,
  );

  const moved = await registrant();
  await db
    .update(authAccount)
    .set({ password: "smoke-newer-hash" })
    .where(eq(authAccount.userId, moved.input.userId));
  const movedBefore = await state(moved);
  const stale = await repo.changeLoginEmail(change(moved, address()));
  check(
    "login email: a password hash moved since the verify changes nothing",
    stale.kind === "wrong_password" && same(await state(moved), movedBefore),
    stale.kind,
  );

  const holder = registration(address());
  await repo.register(holder);
  const taking = await registrant();
  const takingBefore = await state(taking);
  const taken = await repo.changeLoginEmail(change(taking, holder.email));
  check(
    "login email: a taken address is email_taken from the unique index, and nothing is written",
    taken.kind === "email_taken" && same(await state(taking), takingBefore),
    taken.kind,
  );
}
