import { randomUUID } from "node:crypto";
import type { AnimalId, CityId, DraftAnimal, Shelter, ShelterId } from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { applicationDeletionRepo } from "../src/repos/application-deletion-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetAnimalRepo } from "../src/repos/kabinet-animal-repo";
import { ownersPresent } from "../src/repos/r2-cleanup-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
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
import { registrationEmailTokens } from "../src/schema/registration-email-tokens";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeDraftAnimal, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Self-registration Agent 4's SQL on Neon's driver: migration 0029 (support sessions outlive their
 * shelter), `writeEditIf`'s effective `city_id` (a subquery for the shelter's city),
 * `dueApplications`' CASE over `timestamptz` parameters, `deleteApplication`'s batch (the marker
 * under `FOR UPDATE OF`, every statement gated on it) and `ownersPresent`. The legacy-invitations
 * lock check is postgres-js only (an interactive transaction), so it has no step here. Rows stay
 * on the child branch, which is thrown away.
 */
export async function runApplicationCleanupSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const [fk] = await executeRows<{ nullable: string; on_delete: string }>(
    db,
    sql`SELECT c.is_nullable AS nullable, k.confdeltype::text AS on_delete
        FROM information_schema.columns c, pg_constraint k
        WHERE c.table_name = 'support_sessions' AND c.column_name = 'shelter_id'
          AND k.conname = 'support_sessions_shelter_id_shelters_id_fk'`,
  );
  check(
    "0029: support_sessions.shelter_id is nullable, ON DELETE SET NULL",
    fk?.nullable === "YES" && fk.on_delete === "n",
    `${fk?.nullable}, ${fk?.on_delete}`,
  );

  const [home, away] = [0, 1].map(() =>
    makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never }),
  ) as [ReturnType<typeof makeCity>, ReturnType<typeof makeCity>];
  await cityRepo(db).insertMissing([home, away]);
  const located = { precision: "city" as const, cityId: home.id, district: null };

  // writeEditIf: the effective city follows public_location, the shelter's read in the statement.
  const operatorShelter = makeShelter({
    displayName: `Смоук локація ${randomUUID().slice(0, 6)}`,
    publicLocation: located,
  });
  await shelterRepo(db).insert(operatorShelter);
  const draft = makeDraftAnimal({ shelterId: operatorShelter.id });
  const repo = kabinetAnimalRepo(db);
  await repo.insert(draft, home.id, historyOf(draft, "animal_created"));
  const edited: DraftAnimal = {
    ...draft,
    publicLocation: { precision: "city", cityId: away.id, district: null },
  };
  const ownWrite = await repo.writeEditIf(edited, home.id, 0, historyOf(draft, "animal_edited"));
  const cityOf = async (id: AnimalId) =>
    (await db.select({ cityId: animals.cityId }).from(animals).where(eq(animals.id, id)))[0]
      ?.cityId;
  const ownCity = await cityOf(draft.id);
  const backWrite = await repo.writeEditIf(
    { ...edited, publicLocation: null },
    away.id,
    1,
    historyOf(draft, "animal_edited"),
  );
  const shelterCity = await cityOf(draft.id);
  check(
    "writeEditIf: own_city takes its city, shelter_city the shelter's (subquery)",
    ownWrite.kind === "ok" &&
      backWrite.kind === "ok" &&
      ownCity === away.id &&
      shelterCity === home.id,
    `${ownCity === away.id ? "own" : ownCity}, then ${shelterCity === home.id ? "shelter's" : shelterCity}`,
  );

  // ownersPresent: a live animal and shelter are found, an id that names nothing is not.
  const present = await ownersPresent(db, [
    { kind: "animal", id: draft.id },
    { kind: "animal", id: randomUUID() },
    { kind: "shelter", id: operatorShelter.id },
  ]);
  check(
    "ownersPresent: existing rows only",
    present.animal.size === 1 && present.animal.has(draft.id) && present.shelter.size === 1,
    `${present.animal.size} animal(s), ${present.shelter.size} shelter(s)`,
  );

  // Applications: one abandoned (15 days, unconfirmed), one confirmed long ago.
  const user = async (emailVerified: boolean) => {
    const id = randomUUID();
    await db.insert(authUser).values({
      id,
      name: "Смоук",
      email: `smoke-${id}@example.org`,
      emailVerified,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return id;
  };
  const application = async (
    emailVerified: boolean,
  ): Promise<{ shelterId: ShelterId; userId: string; organizationId: string }> => {
    const fixture = makeShelter({
      displayName: `Смоук заявка ${randomUUID().slice(0, 6)}`,
      publicLocation: located,
      verification: {
        status: "application",
        appliedAt: new Date(NOW.getTime() - 15 * DAY),
        evidence: { items: [], submittedAt: NOW },
      },
    });
    const shelter: Shelter = { ...fixture, legalEntity: null, exactAddress: null };
    await shelterRepo(db).insert(shelter);
    const organizationId = randomUUID();
    await db
      .insert(authOrganization)
      .values({ id: organizationId, name: "Смоук", slug: organizationId, createdAt: NOW });
    const userId = await user(emailVerified);
    await db
      .update(shelters)
      .set({ registrantUserId: userId, organizationId })
      .where(eq(shelters.id, shelter.id));
    return { shelterId: shelter.id, userId, organizationId };
  };
  const registrant = await application(false);
  const abandoned = registrant.shelterId;
  const confirmed = (await application(true)).shelterId;
  await authRowsFor(db, registrant.userId, registrant.organizationId);

  const due = await applicationDeletionRepo(db).dueApplications(NOW);
  check(
    "dueApplications: the abandoned one, never the confirmed one (timestamptz CASE)",
    due.some((row) => row.shelterId === abandoned && row.reason === "abandoned") &&
      !due.some((row) => row.shelterId === confirmed),
    `${due.length} due`,
  );

  const operator = await user(true);
  const sessionId = randomUUID();
  await db.insert(supportSessions).values({
    id: sessionId,
    operatorUserId: operator,
    shelterId: abandoned,
    tokenHash: randomUUID(),
    startedAt: NOW,
    lastSeenAt: NOW,
  });
  const deleted = await applicationDeletionRepo(db).deleteApplication(abandoned, "abandoned", NOW);
  const [gone] = await db.select().from(shelters).where(eq(shelters.id, abandoned));
  const marks = await db
    .select()
    .from(applicationDeletions)
    .where(eq(applicationDeletions.shelterId, abandoned));
  check(
    "deleteApplication (batch, FOR UPDATE OF, marker): deleted, one line",
    deleted.kind === "deleted" && gone === undefined && marks.length === 1,
    `${deleted.kind}, shelter ${gone === undefined ? "gone" : "left"}, ${marks.length} line(s)`,
  );
  const [session] = await db
    .select()
    .from(supportSessions)
    .where(eq(supportSessions.id, sessionId));
  check(
    "0029: the deleted application's support session stays, its shelter nulled",
    session !== undefined && session.shelterId === null,
    session === undefined ? "gone" : `shelter ${session.shelterId}`,
  );

  const left = await authRowsLeft(db, registrant.userId, registrant.organizationId);
  check(
    "deleteApplication: the registrant's user, session, credential, link, token, membership and organization go",
    Object.values(left).every((n) => n === 0),
    JSON.stringify(left),
  );

  const notDue = await applicationDeletionRepo(db).deleteApplication(confirmed, "abandoned", NOW);
  const [kept] = await db.select().from(shelters).where(eq(shelters.id, confirmed));
  const noMark = await db
    .select()
    .from(applicationDeletions)
    .where(eq(applicationDeletions.shelterId, confirmed));
  check(
    "deleteApplication: a confirmed application is not due, nothing written",
    notDue.kind === "not_due" && kept !== undefined && noMark.length === 0,
    `${notDue.kind}, ${noMark.length} line(s)`,
  );

  // shelters:delete-test (owner, 2026-11-18): a pending rehearsal goes with its registrant's rows.
  const rehearsal = await application(true);
  const [named] = await db
    .update(shelters)
    .set({
      verificationStatus: "pending",
      verification: {
        status: "pending",
        submittedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      } as never,
    })
    .where(eq(shelters.id, rehearsal.shelterId))
    .returning({ displayName: shelters.displayName });
  await authRowsFor(db, rehearsal.userId, rehearsal.organizationId);
  const rehearsed = await applicationDeletionRepo(db).deleteRehearsal(
    rehearsal.shelterId,
    named?.displayName ?? "",
    NOW,
  );
  const rehearsalLeft = await authRowsLeft(db, rehearsal.userId, rehearsal.organizationId);
  const [rehearsalGone] = await db
    .select()
    .from(shelters)
    .where(eq(shelters.id, rehearsal.shelterId));
  check(
    "deleteRehearsal: a pending self-registered shelter goes with its registrant's rows (not_me line)",
    rehearsed.kind === "deleted" &&
      rehearsalGone === undefined &&
      Object.values(rehearsalLeft).every((n) => n === 0),
    `${rehearsed.kind}, ${JSON.stringify(rehearsalLeft)}`,
  );

  // A verified self-registered shelter is refused under the lock, nothing written.
  const verified = makeShelter({
    displayName: `Смоук перевірений ${randomUUID().slice(0, 6)}`,
    publicLocation: located,
  });
  await shelterRepo(db).insert(verified);
  await db
    .update(shelters)
    .set({ registrationSource: "self_registration", appliedAt: NOW })
    .where(eq(shelters.id, verified.id));
  const refusedVerified = await applicationDeletionRepo(db).deleteRehearsal(
    verified.id,
    verified.displayName,
    NOW,
  );
  const [stillThere] = await db.select().from(shelters).where(eq(shelters.id, verified.id));
  const noLine = await db
    .select()
    .from(applicationDeletions)
    .where(eq(applicationDeletions.shelterId, verified.id));
  check(
    "deleteRehearsal: a verified shelter is refused, nothing written",
    refusedVerified.kind === "refused" && stillThere !== undefined && noLine.length === 0,
    `${refusedVerified.kind}, ${noLine.length} line(s)`,
  );

  return out;
}

function historyOf<K extends "animal_created" | "animal_edited">(animal: DraftAnimal, kind: K) {
  const entry =
    kind === "animal_created"
      ? {
          kind,
          at: NOW,
          actor: { kind: "shelter_admin" as const, shelterAdminId: randomUUID() as never },
          animalId: animal.id,
          animalName: animal.name,
        }
      : {
          kind,
          at: NOW,
          actor: { kind: "shelter_admin" as const, shelterAdminId: randomUUID() as never },
          animalId: animal.id,
          animalName: animal.name,
          fields: ["location" as const],
        };
  return { id: randomUUID(), entry } as never;
}

/** Everything the registration and Better Auth keep for a registrant: one row of each. */
async function authRowsFor(db: Database, userId: string, organizationId: string): Promise<void> {
  // The credential first: inserting a password revokes the user's sessions (0013).
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
    expiresAt: new Date(NOW.getTime() + DAY),
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authVerification).values({
    id: randomUUID(),
    identifier: randomUUID().replaceAll("-", "").padEnd(43, "A").slice(0, 43),
    value: userId,
    expiresAt: new Date(NOW.getTime() + DAY),
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(registrationEmailTokens).values({
    tokenHash: randomUUID(),
    userId,
    purpose: "confirm_email",
    expiresAt: new Date(NOW.getTime() + DAY),
  });
  await db
    .insert(authMember)
    .values({ id: randomUUID(), organizationId, userId, role: "owner", createdAt: NOW });
}

async function authRowsLeft(db: Database, userId: string, organizationId: string) {
  const n = async (rows: Promise<unknown[]>) => (await rows).length;
  return {
    user: await n(db.select().from(authUser).where(eq(authUser.id, userId))),
    sessions: await n(db.select().from(authSession).where(eq(authSession.userId, userId))),
    accounts: await n(db.select().from(authAccount).where(eq(authAccount.userId, userId))),
    links: await n(db.select().from(authVerification).where(eq(authVerification.value, userId))),
    tokens: await n(
      db.select().from(registrationEmailTokens).where(eq(registrationEmailTokens.userId, userId)),
    ),
    membership: await n(
      db.select().from(authMember).where(eq(authMember.organizationId, organizationId)),
    ),
    organization: await n(
      db.select().from(authOrganization).where(eq(authOrganization.id, organizationId)),
    ),
  };
}
