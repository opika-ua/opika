import { randomUUID } from "node:crypto";
import {
  type AnimalId,
  type ApplicationCleanupCandidate,
  cleanupVerdictOf,
  type DraftAnimal,
  type ModeratorId,
  type ShelterAdminId,
  type ShelterId,
  type VerificationStatus,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  APPLICATION_DELETIONS_PER_RUN,
  formatApplicationCleanupReport,
  runApplicationCleanup,
} from "../src/application-cleanup-run";
import { executeRows } from "../src/raw-rows";
import { applicationDeletionRepo, cleanupReasonSql } from "../src/repos/application-deletion-repo";
import { cityRepo } from "../src/repos/city-repo";
import { funnelRepo } from "../src/repos/funnel-repo";
import { kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animalPhotoSources } from "../src/schema/animal-photo-sources";
import { animals } from "../src/schema/animals";
import { applicationDeletions } from "../src/schema/application-deletions";
import {
  authAccount,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
  supportSessions,
} from "../src/schema/auth";
import { funnelEvents } from "../src/schema/funnel-events";
import { registrationEmailTokens } from "../src/schema/registration-email-tokens";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import {
  holdStatementUncommitted,
  makeCity,
  makeDraftAnimal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * The deletion service and the daily job's selection (D8, §14 Q4, P0-3, P0-4): what goes, what
 * stays, the re-check inside the transaction, and the selection as `cleanupVerdictOf`'s twin.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-12-20T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const MOD = "11111111-1111-4111-8111-111111111111" as ModeratorId;
const EVIDENCE = { items: [], submittedAt: NOW };

let cityId: string;
beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

type Kind =
  | { status: "application"; email: "confirmed" | "unconfirmed"; appliedDaysAgo: number }
  | { status: "rejected"; rejectedDaysAgo: number }
  | { status: "pending" | "verified" };

type Seeded = { shelterId: ShelterId; userId: string; organizationId: string; email: string };

/** A self-registered shelter as the registration write leaves it, then moved to `kind`. */
async function selfRegistered(kind: Kind, appliedDaysAgo = 40): Promise<Seeded> {
  const userId = randomUUID();
  const organizationId = randomUUID();
  const email = `${userId.slice(0, 8)}@example.org`;
  const confirmed = kind.status !== "application" || kind.email === "confirmed";
  await db.insert(authUser).values({
    id: userId,
    name: "Олена",
    email,
    emailVerified: confirmed,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authOrganization).values({
    id: organizationId,
    name: "Притулок",
    slug: organizationId,
    createdAt: NOW,
  });
  await db.insert(authMember).values({
    id: randomUUID(),
    organizationId,
    userId,
    role: "owner",
    createdAt: NOW,
  });
  const appliedAt = daysAgo(kind.status === "application" ? kind.appliedDaysAgo : appliedDaysAgo);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    verification: { status: "application", appliedAt, evidence: EVIDENCE },
  });
  await shelterRepo(db).insert(shelter);
  await db
    .update(shelters)
    .set({ organizationId, registrantUserId: userId })
    .where(eq(shelters.id, shelter.id));
  if (kind.status === "rejected") {
    const rejectedAt = daysAgo(kind.rejectedDaysAgo);
    await db
      .update(shelters)
      .set({
        verificationStatus: "rejected",
        verification: {
          status: "rejected",
          rejectedAt,
          rejectedBy: MOD,
          reason: { code: "insufficient_evidence", note: null },
          stage: "application",
          evidence: EVIDENCE,
        } as never,
        applicationRejectedAt: rejectedAt,
      })
      .where(eq(shelters.id, shelter.id));
  }
  if (kind.status === "pending" || kind.status === "verified") {
    await db
      .update(shelters)
      .set({
        verificationStatus: kind.status,
        verification: (kind.status === "pending"
          ? { status: "pending", submittedAt: NOW, evidence: EVIDENCE }
          : makeShelter().verification) as never,
      })
      .where(eq(shelters.id, shelter.id));
  }
  return { shelterId: shelter.id, userId, organizationId, email };
}

/** An operator-created shelter (pending since long ago), with an admin. */
async function operatorCreated(): Promise<ShelterId> {
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    verification: { status: "pending", submittedAt: daysAgo(100), evidence: EVIDENCE },
  });
  await shelterRepo(db).insert(shelter);
  return shelter.id;
}

const ADMIN = "33333333-3333-4333-8333-333333333333" as ShelterAdminId;

/** A draft with `photos` photos (one kept source), written as the kabinet writes it. */
async function draftWithPhotos(shelterId: ShelterId, photos: number): Promise<AnimalId> {
  const id = randomUUID() as AnimalId;
  const keys = Array.from({ length: photos }, () => `animals/${id}/${randomUUID()}`);
  const draft: DraftAnimal = {
    ...makeDraftAnimal({ shelterId }),
    id,
    photos: keys.map((storageKey) => ({ storageKey, width: 800, height: 1000, alt: null })),
  };
  await kabinetAnimalRepo(db).insert(draft, cityId as never, {
    id: randomUUID(),
    entry: {
      kind: "animal_created",
      at: NOW,
      actor: { kind: "shelter_admin", shelterAdminId: ADMIN },
      animalId: id,
      animalName: draft.name,
    },
  });
  const [first] = keys;
  if (first !== undefined) {
    await db.insert(animalPhotoSources).values({
      storageKey: first,
      animalId: id,
      sourceObjectKey: `${first}/source-${randomUUID()}.webp`,
      sourceOrigin: "upload",
      sourceWidth: 800,
      sourceHeight: 1000,
      createdAt: NOW,
    });
  }
  return id;
}

/** Everything Better Auth and the registration keep for a user, one row of each at least. */
async function authRowsFor(seeded: Seeded): Promise<void> {
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: seeded.userId,
    providerId: "credential",
    userId: seeded.userId,
    password: "salt:key",
    createdAt: NOW,
    updatedAt: NOW,
  });
  // After the credential: a password insert revokes the user's sessions (0013).
  await db.insert(authSession).values({
    id: randomUUID(),
    token: randomUUID(),
    userId: seeded.userId,
    expiresAt: daysAgo(-7),
    createdAt: NOW,
    updatedAt: NOW,
  });
  // A reset link (hashed identifier, the user id for a value) and a magic link (the address in JSON).
  await db.insert(authVerification).values([
    {
      id: randomUUID(),
      identifier: "A".repeat(43),
      value: seeded.userId,
      expiresAt: daysAgo(-1),
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: randomUUID(),
      identifier: `magic-link:${"B".repeat(43)}`,
      value: JSON.stringify({ type: "magic-link", email: seeded.email.toUpperCase(), name: "" }),
      expiresAt: daysAgo(-1),
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  await db.insert(registrationEmailTokens).values([
    { tokenHash: randomUUID(), userId: seeded.userId, purpose: "confirm_email", expiresAt: NOW },
    { tokenHash: randomUUID(), userId: seeded.userId, purpose: "not_me", expiresAt: NOW },
  ]);
}

/** How many rows of each kind still name the seeded application. */
async function leftOf(seeded: Seeded): Promise<Record<string, number>> {
  const n = async (rows: Promise<unknown[]>) => (await rows).length;
  return {
    shelter: await n(db.select().from(shelters).where(eq(shelters.id, seeded.shelterId))),
    history: await n(
      db.select().from(shelterHistory).where(eq(shelterHistory.shelterId, seeded.shelterId)),
    ),
    animals: await n(db.select().from(animals).where(eq(animals.shelterId, seeded.shelterId))),
    photoSources: await n(db.select().from(animalPhotoSources)),
    organization: await n(
      db.select().from(authOrganization).where(eq(authOrganization.id, seeded.organizationId)),
    ),
    membership: await n(
      db.select().from(authMember).where(eq(authMember.organizationId, seeded.organizationId)),
    ),
    user: await n(db.select().from(authUser).where(eq(authUser.id, seeded.userId))),
    sessions: await n(db.select().from(authSession).where(eq(authSession.userId, seeded.userId))),
    accounts: await n(db.select().from(authAccount).where(eq(authAccount.userId, seeded.userId))),
    verifications: await n(db.select().from(authVerification)),
    emailTokens: await n(
      db
        .select()
        .from(registrationEmailTokens)
        .where(eq(registrationEmailTokens.userId, seeded.userId)),
    ),
  };
}

const NONE_LEFT = {
  shelter: 0,
  history: 0,
  animals: 0,
  photoSources: 0,
  organization: 0,
  membership: 0,
  user: 0,
  sessions: 0,
  accounts: 0,
  verifications: 0,
  emailTokens: 0,
};

describe("deleteApplication", () => {
  it("leaves no row of the application behind, only its deletion line and its funnel rows", async () => {
    const seeded = await selfRegistered({
      status: "application",
      email: "unconfirmed",
      appliedDaysAgo: 15,
    });
    await authRowsFor(seeded);
    await draftWithPhotos(seeded.shelterId, 2);
    await draftWithPhotos(seeded.shelterId, 1);
    await funnelRepo(db).record("registered", seeded.shelterId, daysAgo(15));
    await funnelRepo(db).record("first_draft", seeded.shelterId, daysAgo(14));
    // Every kind is there to begin with, so a zero below is the deletion's.
    expect(Object.entries(await leftOf(seeded)).filter(([, n]) => n === 0)).toEqual([]);

    const outcome = await applicationDeletionRepo(db).deleteApplication(
      seeded.shelterId,
      "abandoned",
      NOW,
    );

    expect(outcome).toEqual({ kind: "deleted", shelterId: seeded.shelterId, photoKeys: 3 });
    expect(await leftOf(seeded)).toEqual(NONE_LEFT);
    expect(await db.select().from(applicationDeletions)).toEqual([
      { id: expect.any(String), shelterId: seeded.shelterId, reason: "abandoned", at: NOW },
    ]);
    const funnel = await db.select().from(funnelEvents);
    expect(funnel.map((row) => [row.kind, row.shelterId])).toEqual(
      expect.arrayContaining([
        ["registered", null],
        ["first_draft", null],
      ]),
    );
  });

  it("touches nothing of another shelter or another user", async () => {
    const due = await selfRegistered({
      status: "application",
      email: "unconfirmed",
      appliedDaysAgo: 20,
    });
    const other = await selfRegistered({
      status: "application",
      email: "unconfirmed",
      appliedDaysAgo: 1,
    });
    await authRowsFor(due);
    await authRowsFor(other);
    await draftWithPhotos(other.shelterId, 1);
    const before = await leftOf(other);

    await applicationDeletionRepo(db).deleteApplication(due.shelterId, "abandoned", NOW);

    const after = await leftOf(other);
    // The two shared counts (every verification, every photo source) were the other's alone.
    expect(after).toEqual({ ...before, verifications: 2, photoSources: 1 });
    expect(after.user).toBe(1);
  });

  it("«Це не я» deletes an application whatever its email or age", async () => {
    const seeded = await selfRegistered({
      status: "application",
      email: "confirmed",
      appliedDaysAgo: 0,
    });
    await authRowsFor(seeded);
    const outcome = await applicationDeletionRepo(db).deleteApplication(
      seeded.shelterId,
      "not_me",
      NOW,
    );
    expect(outcome.kind).toBe("deleted");
    expect(await leftOf(seeded)).toEqual(NONE_LEFT);
  });

  it("«Це не я» on an accepted shelter is not due and writes nothing", async () => {
    const seeded = await selfRegistered({ status: "pending" });
    const outcome = await applicationDeletionRepo(db).deleteApplication(
      seeded.shelterId,
      "not_me",
      NOW,
    );
    expect(outcome).toEqual({ kind: "not_due" });
    expect((await leftOf(seeded)).shelter).toBe(1);
    expect(await db.select().from(applicationDeletions)).toEqual([]);
  });

  it("a refused application goes 30 days after the refusal, not a day earlier", async () => {
    const early = await selfRegistered({ status: "rejected", rejectedDaysAgo: 29 });
    const due = await selfRegistered({ status: "rejected", rejectedDaysAgo: 30 });
    const repo = applicationDeletionRepo(db);
    expect(await repo.deleteApplication(early.shelterId, "rejected_expired", NOW)).toEqual({
      kind: "not_due",
    });
    expect((await repo.deleteApplication(due.shelterId, "rejected_expired", NOW)).kind).toBe(
      "deleted",
    );
    expect((await leftOf(early)).shelter).toBe(1);
  });

  it("a confirmation still committing when the deletion locks wins: the application stays", async () => {
    const seeded = await selfRegistered({
      status: "application",
      email: "unconfirmed",
      appliedDaysAgo: 20,
    });
    await authRowsFor(seeded);
    const held = holdStatementUncommitted((query) => /^update "auth_user"/i.test(query));
    try {
      const confirming = held.db
        .update(authUser)
        .set({ emailVerified: true })
        .where(eq(authUser.id, seeded.userId));
      const confirmed = confirming.then(() => undefined);
      await held.ran;
      const running = applicationDeletionRepo(db).deleteApplication(
        seeded.shelterId,
        "abandoned",
        NOW,
      );
      expect(await held.waitsOnIt(running), "the deletion waited on the confirmation").toBe(true);
      held.release();
      await confirmed;
      expect(await running).toEqual({ kind: "not_due" });
    } finally {
      await held.end();
    }
    expect(await leftOf(seeded)).toMatchObject({ shelter: 1, user: 1, sessions: 1 });
    expect(await db.select().from(applicationDeletions)).toEqual([]);
  });

  it("deletes an application an operator opened a support session on, keeping the session (Q4 (B))", async () => {
    const seeded = await selfRegistered({
      status: "application",
      email: "unconfirmed",
      appliedDaysAgo: 20,
    });
    const operator = randomUUID();
    await db.insert(authUser).values({
      id: operator,
      name: "Оператор",
      email: "op@example.org",
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(supportSessions).values({
      id: randomUUID(),
      operatorUserId: operator,
      shelterId: seeded.shelterId,
      tokenHash: randomUUID(),
      startedAt: NOW,
      lastSeenAt: NOW,
    });
    const sessionId = (await db.select({ id: supportSessions.id }).from(supportSessions))[0]?.id;
    expect(
      (await applicationDeletionRepo(db).deleteApplication(seeded.shelterId, "abandoned", NOW))
        .kind,
    ).toBe("deleted");
    expect((await leftOf(seeded)).shelter).toBe(0);
    expect(await db.select().from(supportSessions)).toEqual([
      expect.objectContaining({ id: sessionId, operatorUserId: operator, shelterId: null }),
    ]);
  });
});

describe("dueApplications: the daily job's selection", () => {
  it("selects only unconfirmed applications past 14 days and refusals past 30", async () => {
    const abandoned = await selfRegistered({
      status: "application",
      email: "unconfirmed",
      appliedDaysAgo: 14,
    });
    await selfRegistered({ status: "application", email: "unconfirmed", appliedDaysAgo: 13 });
    await selfRegistered({ status: "application", email: "confirmed", appliedDaysAgo: 90 });
    await selfRegistered({ status: "pending" }, 90);
    await selfRegistered({ status: "verified" }, 90);
    const refused = await selfRegistered({ status: "rejected", rejectedDaysAgo: 31 });
    await selfRegistered({ status: "rejected", rejectedDaysAgo: 2 });
    await operatorCreated();

    const due = await applicationDeletionRepo(db).dueApplications(NOW);
    expect(new Set(due.map((row) => `${row.shelterId}:${row.reason}`))).toEqual(
      new Set([`${abandoned.shelterId}:abandoned`, `${refused.shelterId}:rejected_expired`]),
    );
  });

  it("an erased registrant reads as unconfirmed", async () => {
    const seeded = await selfRegistered({
      status: "application",
      email: "confirmed",
      appliedDaysAgo: 30,
    });
    await db
      .update(shelters)
      .set({ registrantUserId: null })
      .where(eq(shelters.id, seeded.shelterId));
    expect(await applicationDeletionRepo(db).dueApplications(NOW)).toEqual([
      { shelterId: seeded.shelterId, reason: "abandoned" },
    ]);
  });

  it("never selects a rejected operator-created shelter, however old", async () => {
    const id = await operatorCreated();
    await db.update(shelters).set({ verificationStatus: "rejected" }).where(eq(shelters.id, id));
    expect(await applicationDeletionRepo(db).dueApplications(NOW)).toEqual([]);
  });
});

describe("cleanupReasonSql is cleanupVerdictOf's twin", () => {
  const STATUSES: VerificationStatus[] = [
    "application",
    "pending",
    "under_review",
    "verified",
    "rejected",
    "paused",
    "suspended",
  ];
  const INSTANTS: (number | null)[] = [null, 0, 13, 14, 15, 29, 30, 31];
  const candidates: ApplicationCleanupCandidate[] = [];
  for (const status of STATUSES) {
    for (const source of ["operator", "self_registration"] as const) {
      for (const email of ["confirmed", "unconfirmed"] as const) {
        for (const applied of INSTANTS) {
          for (const rejected of INSTANTS) {
            candidates.push({
              status,
              source,
              email,
              appliedAt: applied === null ? null : daysAgo(applied),
              applicationRejectedAt: rejected === null ? null : daysAgo(rejected),
            });
          }
        }
      }
    }
  }
  // One millisecond either side of each cutoff, too.
  for (const offset of [-1, 1]) {
    candidates.push({
      status: "application",
      source: "self_registration",
      email: "unconfirmed",
      appliedAt: new Date(daysAgo(14).getTime() + offset),
      applicationRejectedAt: null,
    });
    candidates.push({
      status: "rejected",
      source: "self_registration",
      email: "confirmed",
      appliedAt: daysAgo(60),
      applicationRejectedAt: new Date(daysAgo(30).getTime() + offset),
    });
  }

  it(`agrees on all ${candidates.length} candidates`, async () => {
    const ts = (d: Date | null) =>
      d === null ? sql`NULL::timestamptz` : sql`${d.toISOString()}::timestamptz`;
    const rows = sql.join(
      candidates.map(
        (c, i) =>
          sql`(${i}::int, ${c.status}::text, ${c.source}::text, ${ts(c.appliedAt)}, ${c.email === "confirmed"}::boolean, ${ts(c.applicationRejectedAt)})`,
      ),
      sql`, `,
    );
    const reason = cleanupReasonSql(
      {
        status: sql.raw("c.status"),
        source: sql.raw("c.source"),
        appliedAt: sql.raw("c.applied_at"),
        emailVerified: sql.raw("c.email_verified"),
        applicationRejectedAt: sql.raw("c.rejected_at"),
      },
      NOW,
    );
    const answered = await executeRows<{ i: number; reason: string | null }>(
      db,
      sql`SELECT c.i, ${reason} AS reason FROM (VALUES ${rows}) AS c(i, status, source, applied_at, email_verified, rejected_at) ORDER BY c.i`,
    );
    const expected = candidates.map((candidate) => {
      const verdict = cleanupVerdictOf(candidate, NOW);
      return verdict.kind === "delete" ? verdict.reason : null;
    });
    expect(answered.map((row) => row.reason)).toEqual(expected);
    expect(expected.filter((r) => r !== null).length).toBeGreaterThan(0);
  });
});

describe("runApplicationCleanup: the daily job", () => {
  async function everyKind() {
    return {
      abandoned: await selfRegistered({
        status: "application",
        email: "unconfirmed",
        appliedDaysAgo: 15,
      }),
      refused: await selfRegistered({ status: "rejected", rejectedDaysAgo: 45 }),
      kept: [
        // Confirmed and waiting for the operator, accepted, verified: never touched.
        (await selfRegistered({ status: "application", email: "confirmed", appliedDaysAgo: 200 }))
          .shelterId,
        (await selfRegistered({ status: "pending" }, 200)).shelterId,
        (await selfRegistered({ status: "verified" }, 200)).shelterId,
        await operatorCreated(),
      ],
    };
  }

  it("a dry run selects and writes nothing", async () => {
    const seeded = await everyKind();
    const before = await db.select().from(shelters);
    const report = await runApplicationCleanup(db, NOW, { commit: false });
    expect(report.due.map((row) => row.shelterId).sort()).toEqual(
      [seeded.abandoned.shelterId, seeded.refused.shelterId].sort(),
    );
    expect(report.deleted).toEqual([]);
    expect(await db.select().from(shelters)).toEqual(before);
    expect(await db.select().from(applicationDeletions)).toEqual([]);
  });

  it("a commit deletes the due ones and never touches the others", async () => {
    const seeded = await everyKind();
    const report = await runApplicationCleanup(db, NOW, { commit: true });
    expect(report.deleted.map((row) => row.reason).sort()).toEqual([
      "abandoned",
      "rejected_expired",
    ]);
    expect(report.failed).toEqual([]);
    const left = (await db.select({ id: shelters.id }).from(shelters)).map((row) => row.id);
    expect(left.sort()).toEqual([...seeded.kept].sort());
    // Idempotent: a second run finds nothing.
    expect((await runApplicationCleanup(db, NOW, { commit: true })).due).toEqual([]);
  });

  it("deletes at most the per-run cap; the rest stay for the next run", async () => {
    const first = await selfRegistered({ status: "rejected", rejectedDaysAgo: 40 });
    const second = await selfRegistered({ status: "rejected", rejectedDaysAgo: 40 });
    const third = await selfRegistered({ status: "rejected", rejectedDaysAgo: 40 });
    expect(APPLICATION_DELETIONS_PER_RUN).toBe(50);
    const run = await runApplicationCleanup(db, NOW, { commit: true, maxDeletions: 2 });
    expect(run.deleted).toHaveLength(2);
    expect(run.deferred).toHaveLength(1);
    expect(formatApplicationCleanupReport(run, true).join("\n")).toContain(
      "Over this run's cap, left for the next run: 1",
    );
    const left = (await db.select({ id: shelters.id }).from(shelters)).map((row) => row.id);
    expect(left).toHaveLength(1);
    expect([first.shelterId, second.shelterId, third.shelterId]).toContain(left[0]);
    const next = await runApplicationCleanup(db, NOW, { commit: true, maxDeletions: 2 });
    expect(next.deleted).toHaveLength(1);
    expect(next.deferred).toEqual([]);
  });

  it("prints ids and reasons only", async () => {
    const seeded = await everyKind();
    const report = await runApplicationCleanup(db, NOW, { commit: false });
    const printed = formatApplicationCleanupReport(report, false).join("\n");
    expect(printed).toContain(`${seeded.abandoned.shelterId} abandoned`);
    expect(printed).not.toContain(seeded.abandoned.email);
    expect(printed).not.toContain("Тестовий притулок");
  });
});
