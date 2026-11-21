import { randomUUID } from "node:crypto";
import type { CityId, ShelterId } from "@opika/domain";
import { eq, or, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { applicationDeletionRepo } from "../src/repos/application-deletion-repo";
import { cityRepo } from "../src/repos/city-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animalPhotoSources } from "../src/schema/animal-photo-sources";
import { animals } from "../src/schema/animals";
import { applicationDeletions } from "../src/schema/application-deletions";
import {
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
  superAdmins,
  supportSessions,
} from "../src/schema/auth";
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
} from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

const NOW = new Date();
const HOUR = 3_600_000;

/**
 * The operator's «Видалити притулок» on Neon's driver: migration 0032 (the audit line's operator
 * column and checks), `deletionCounts`' count subqueries, and `deleteShelterByOperator`'s batch
 * (three FOR UPDATE locks, the marker under its guard, the erasure statement as a raw batch item
 * read through `rowsOfRawResult`), over a reveal, an invitation, sign-in links, a support session
 * and admins, so no delete runs over an empty set. Rows stay on the child branch, which is thrown
 * away.
 */
export async function runOperatorDeleteSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const rows = async (query: Promise<unknown[]>) => (await query).length;

  const constraints = await executeRows<{ name: string }>(
    db,
    sql`SELECT conname AS name FROM pg_constraint
        WHERE conrelid = 'application_deletions'::regclass AND contype = 'c' ORDER BY conname`,
  );
  const [column] = await executeRows<{ nullable: string }>(
    db,
    sql`SELECT is_nullable AS nullable FROM information_schema.columns
        WHERE table_name = 'application_deletions' AND column_name = 'operator_user_id'`,
  );
  const names = constraints.map((c) => c.name).join(", ");
  check(
    "0032: application_deletions.operator_user_id (nullable) and its two checks",
    column?.nullable === "YES" &&
      names.includes("application_deletions_operator_check") &&
      names.includes("application_deletions_reason_check"),
    `${column?.nullable ?? "no column"}; ${names}`,
  );

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const user = async (): Promise<{ id: string; email: string }> => {
    const id = randomUUID();
    const email = `smoke-${id}@example.org`;
    await db.insert(authUser).values({
      id,
      name: "Смоук",
      email,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return { id, email };
  };
  const operator = (await user()).id;
  await db.insert(superAdmins).values({ id: randomUUID(), userId: operator, grantedAt: NOW });
  const withOrganization = async (label: string) => {
    const shelter = makeShelter({
      displayName: `Смоук ${label} ${randomUUID().slice(0, 6)}`,
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
    });
    await shelterRepo(db).insert(shelter);
    const organizationId = randomUUID();
    await db
      .insert(authOrganization)
      .values({ id: organizationId, name: "Смоук", slug: organizationId, createdAt: NOW });
    await db.update(shelters).set({ organizationId }).where(eq(shelters.id, shelter.id));
    return { shelterId: shelter.id, name: shelter.displayName, organizationId };
  };
  const member = (organizationId: string, userId: string) =>
    db
      .insert(authMember)
      .values({ id: randomUUID(), organizationId, userId, role: "admin", createdAt: NOW });
  const invite = (organizationId: string, email: string) =>
    db.insert(authInvitation).values({
      id: randomUUID(),
      organizationId,
      email,
      role: "admin",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 24 * HOUR),
      createdAt: NOW,
      inviterId: operator,
    });
  const history = (shelterId: ShelterId) =>
    db.insert(shelterHistory).values({
      id: randomUUID(),
      shelterId,
      kind: "admin_removed",
      at: NOW,
      entry: {
        kind: "admin_removed",
        at: NOW,
        moderatorId: operator,
        email: "smoke@example.org",
        wasPending: false,
      } as never,
    });

  const target = await withOrganization("видалення");
  const other = await withOrganization("інший");
  // The target's admins: one erasable, one kept by a live invitation to the other shelter.
  const admin = await user();
  const kept = await user();
  await member(target.organizationId, admin.id);
  await member(target.organizationId, kept.id);
  await invite(other.organizationId, kept.email);
  // An invitee of the target only: erased with it.
  const invitee = await user();
  await invite(target.organizationId, invitee.email);
  // The erasable admin's session and two sign-in links (a reset link and a magic link).
  await db.insert(authSession).values({
    id: randomUUID(),
    token: randomUUID(),
    userId: admin.id,
    expiresAt: new Date(NOW.getTime() + HOUR),
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authVerification).values([
    {
      id: randomUUID(),
      identifier: randomUUID(),
      value: admin.id,
      expiresAt: new Date(NOW.getTime() + HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: randomUUID(),
      identifier: randomUUID(),
      value: JSON.stringify({ type: "magic-link", email: admin.email }),
      expiresAt: new Date(NOW.getTime() + HOUR),
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  const photographed = makeAnimal({
    shelterId: target.shelterId,
    photos: [{ storageKey: `animals/${randomUUID()}/p`, width: 1024, height: 768, alt: null }],
  });
  await animalRepo(db).insert(photographed, city.id);
  const storageKey = photographed.photos[0]?.storageKey ?? "";
  await db.insert(animalPhotoSources).values({
    storageKey,
    animalId: photographed.id,
    sourceObjectKey: `${storageKey}/source-${randomUUID()}.webp`,
    sourceOrigin: "upload",
    sourceWidth: 2048,
    sourceHeight: 1536,
    createdAt: NOW,
  });
  await animalRepo(db).insert(makeDraftAnimal({ shelterId: target.shelterId }), city.id);
  await history(target.shelterId);
  const sessionId = randomUUID();
  await db.insert(supportSessions).values({
    id: sessionId,
    operatorUserId: operator,
    shelterId: target.shelterId,
    tokenHash: randomUUID(),
    startedAt: NOW,
    lastSeenAt: NOW,
  });

  // The other shelter: an admin, an animal, a reveal and a history line, all to stay.
  const otherAdmin = await user();
  await member(other.organizationId, otherAdmin.id);
  const otherAnimal = makeAnimal({ shelterId: other.shelterId });
  await animalRepo(db).insert(otherAnimal, city.id);
  await history(other.shelterId);
  const visitor = makeAdopter();
  await adopterRepo(db).insert(visitor);
  await revealRepo(db).insert(
    makeReveal({ adopterId: visitor.id, animalId: photographed.id, shelterId: target.shelterId }),
  );
  await revealRepo(db).insert(
    makeReveal({ adopterId: visitor.id, animalId: otherAnimal.id, shelterId: other.shelterId }),
  );

  const repo = applicationDeletionRepo(db);
  const counts = await repo.deletionCounts(target.shelterId);
  check(
    "deletionCounts: every card, the published ones, the admins (count subqueries)",
    counts?.animals === 2 && counts.published === 1 && counts.admins === 2,
    JSON.stringify(counts),
  );
  const shown = counts ?? { animals: 0, published: 0, admins: 0 };

  // An animal added after the dialog counted: refused under the lock, nothing written.
  await animalRepo(db).insert(makeDraftAnimal({ shelterId: target.shelterId }), city.id);
  const refused = await repo.deleteShelterByOperator(
    {
      shelterId: target.shelterId,
      typedName: target.name,
      counts: shown,
      operatorUserId: operator,
    },
    NOW,
  );
  const still = await rows(db.select().from(shelters).where(eq(shelters.id, target.shelterId)));
  const noLine = await rows(
    db
      .select()
      .from(applicationDeletions)
      .where(eq(applicationDeletions.shelterId, target.shelterId)),
  );
  check(
    "deleteShelterByOperator: counts changed since the dialog, refused, nothing written",
    refused.kind === "counts_changed" &&
      refused.counts.animals === 3 &&
      still === 1 &&
      noLine === 0,
    `${refused.kind}, shelter ${still === 1 ? "kept" : "gone"}, ${noLine} line(s)`,
  );

  const fresh = refused.kind === "counts_changed" ? refused.counts : shown;
  const deleted = await repo.deleteShelterByOperator(
    {
      shelterId: target.shelterId,
      typedName: target.name,
      counts: fresh,
      operatorUserId: operator,
    },
    NOW,
  );
  const left = {
    shelter: await rows(db.select().from(shelters).where(eq(shelters.id, target.shelterId))),
    animals: await rows(db.select().from(animals).where(eq(animals.shelterId, target.shelterId))),
    sources: await rows(
      db.select().from(animalPhotoSources).where(eq(animalPhotoSources.storageKey, storageKey)),
    ),
    history: await rows(
      db.select().from(shelterHistory).where(eq(shelterHistory.shelterId, target.shelterId)),
    ),
    members: await rows(
      db.select().from(authMember).where(eq(authMember.organizationId, target.organizationId)),
    ),
    organization: await rows(
      db.select().from(authOrganization).where(eq(authOrganization.id, target.organizationId)),
    ),
    admin: await rows(db.select().from(authUser).where(eq(authUser.id, admin.id))),
    sessions: await rows(db.select().from(authSession).where(eq(authSession.userId, admin.id))),
  };
  check(
    "deleteShelterByOperator (batch, locks, marker): the shelter and everything of it go",
    deleted.kind === "deleted" &&
      deleted.photoKeys === 1 &&
      Object.values(left).every((n) => n === 0),
    `${deleted.kind}, ${JSON.stringify(left)}`,
  );
  check(
    "deleteShelterByOperator: the erasure statement's counts read from the batch (two erased, one kept)",
    deleted.kind === "deleted" && deleted.erasedAccounts === 2 && deleted.keptAccounts === 1,
    deleted.kind === "deleted"
      ? `${deleted.erasedAccounts} erased, ${deleted.keptAccounts} kept`
      : deleted.kind,
  );
  const goneToo = {
    reveals: await rows(db.select().from(reveals).where(eq(reveals.shelterId, target.shelterId))),
    invitations: await rows(
      db
        .select()
        .from(authInvitation)
        .where(eq(authInvitation.organizationId, target.organizationId)),
    ),
    invitee: await rows(db.select().from(authUser).where(eq(authUser.id, invitee.id))),
    links: await rows(
      db
        .select()
        .from(authVerification)
        .where(
          or(
            eq(authVerification.value, admin.id),
            sql`strpos(${authVerification.value}, ${admin.email}) > 0`,
          ),
        ),
    ),
  };
  check(
    "deleteShelterByOperator: the reveal, the invitation, the invitee's account and the admin's sign-in links go",
    Object.values(goneToo).every((n) => n === 0),
    JSON.stringify(goneToo),
  );
  const keptLeft = await rows(db.select().from(authUser).where(eq(authUser.id, kept.id)));
  const [session] = await db
    .select()
    .from(supportSessions)
    .where(eq(supportSessions.id, sessionId));
  const lines = await db
    .select()
    .from(applicationDeletions)
    .where(eq(applicationDeletions.shelterId, target.shelterId));
  check(
    "deleteShelterByOperator: the protected admin and the support session stay; one operator_removed line",
    keptLeft === 1 &&
      session !== undefined &&
      session.shelterId === null &&
      lines.length === 1 &&
      lines[0]?.reason === "operator_removed" &&
      lines[0]?.operatorUserId === operator,
    `kept ${keptLeft}, session ${session === undefined ? "gone" : `shelter ${session.shelterId}`}, ${lines.length} line(s) ${lines[0]?.reason ?? ""}`,
  );
  const otherLeft = {
    counts: await repo.deletionCounts(other.shelterId),
    history: await rows(
      db.select().from(shelterHistory).where(eq(shelterHistory.shelterId, other.shelterId)),
    ),
    reveals: await rows(db.select().from(reveals).where(eq(reveals.shelterId, other.shelterId))),
    invitations: await rows(
      db
        .select()
        .from(authInvitation)
        .where(eq(authInvitation.organizationId, other.organizationId)),
    ),
    admin: await rows(db.select().from(authUser).where(eq(authUser.id, otherAdmin.id))),
  };
  check(
    "deleteShelterByOperator: the other shelter's animal, membership, history, reveal and invitation are untouched",
    otherLeft.counts?.animals === 1 &&
      otherLeft.counts.published === 1 &&
      otherLeft.counts.admins === 1 &&
      otherLeft.history === 1 &&
      otherLeft.reveals === 1 &&
      otherLeft.invitations === 1 &&
      otherLeft.admin === 1,
    JSON.stringify(otherLeft),
  );
  return out;
}
