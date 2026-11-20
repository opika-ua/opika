import { randomUUID } from "node:crypto";
import {
  type ApplicationDeletionReason,
  abandonedApplicationCutoff,
  DISCOVERABLE_LISTING_KINDS,
  rejectedApplicationCutoff,
  type ShelterId,
} from "@opika/domain";
import { and, asc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { type Database, inOneTransaction } from "../client";
import { rawBatchItem, rowsOfRawResult } from "../raw-rows";
import { animals } from "../schema/animals";
import { applicationDeletions } from "../schema/application-deletions";
import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
  superAdmins,
} from "../schema/auth";
import { registrationEmailTokens } from "../schema/registration-email-tokens";
import { reveals } from "../schema/reveals";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { erasableAmong, erasureCountsOf, erasureStatement } from "./admin-erasure-repo";

/**
 * Deletes one application completely (D8, plan Agent 4): its user, organization, membership,
 * shelter, history, drafts and their photo rows, plus one `application_deletions` line, in one
 * transaction that re-checks the row is still due (`cleanupVerdictOf`'s SQL twin) or, for «Це не
 * я», still an application. Photos leave R2 through the existing clean-up job only (hard rule:
 * nothing else deletes R2 objects), once their rows are gone. Typed in Phase 0, so «Це не я»
 * (Agent 1) and the daily job (Agent 4) share one path.
 */
export type ApplicationDeletionOutcome =
  | { kind: "deleted"; shelterId: ShelterId; photoKeys: number }
  /** Not due any more (confirmed, decided, already gone): nothing was written. */
  | { kind: "not_due" };

/** The columns `cleanupVerdictOf` reads, as SQL; the parity test feeds it a VALUES list. */
export type CleanupCandidateColumns = {
  status: SQL | AnyPgColumn;
  source: SQL | AnyPgColumn;
  appliedAt: SQL | AnyPgColumn;
  /** The registrant's `email_verified`; null (an erased registrant) reads as unconfirmed. */
  emailVerified: SQL | AnyPgColumn;
  applicationRejectedAt: SQL | AnyPgColumn;
};

const at = (instant: Date): SQL => sql`${instant.toISOString()}::timestamptz`;

/**
 * `cleanupVerdictOf` as one SQL expression: the reason a row is due, or NULL to keep it. Same
 * checks in the same order, the boundary instant included (`<=`).
 */
export function cleanupReasonSql(c: CleanupCandidateColumns, now: Date): SQL<string | null> {
  return sql<string | null>`CASE
    WHEN ${c.source} <> 'self_registration' THEN NULL
    WHEN ${c.status} = 'application' AND COALESCE(${c.emailVerified}, false) = false
      AND ${c.appliedAt} IS NOT NULL AND ${c.appliedAt} <= ${at(abandonedApplicationCutoff(now))}
      THEN 'abandoned'
    WHEN ${c.status} = 'rejected' AND ${c.applicationRejectedAt} IS NOT NULL
      AND ${c.applicationRejectedAt} <= ${at(rejectedApplicationCutoff(now))}
      THEN 'rejected_expired'
    ELSE NULL
  END`;
}

const SHELTER_CANDIDATE: CleanupCandidateColumns = {
  status: shelters.verificationStatus,
  source: shelters.registrationSource,
  appliedAt: shelters.appliedAt,
  emailVerified: authUser.emailVerified,
  applicationRejectedAt: shelters.applicationRejectedAt,
};

/** Whether the row (shelters LEFT JOIN its registrant) may be deleted for `reason` right now. */
function stillDue(reason: ApplicationDeletionReason, now: Date): SQL {
  if (reason === "not_me") {
    return sql`${shelters.registrationSource} = 'self_registration' AND ${shelters.verificationStatus} = 'application'`;
  }
  return sql`${cleanupReasonSql(SHELTER_CANDIDATE, now)} = ${reason}`;
}

/** Better Auth's magic-link rows carry the address in a JSON value, never a user id. */
const MAGIC_LINK_VALUE_PREFIX = '{"type":"magic-link",';

export type DueApplication = {
  shelterId: ShelterId;
  reason: Exclude<ApplicationDeletionReason, "not_me">;
};

/** Listing kinds a rehearsal shelter's animal may not be in: public now, or adopted from it. */
export const REHEARSAL_LISTED_KINDS = ["published", "reserved", "adopted"] as const;

/** The statuses a rehearsal shelter may be in: never verified, paused or suspended. */
export const REHEARSAL_STATUSES = ["application", "pending", "rejected"] as const;

export type RehearsalCandidate = {
  id: ShelterId;
  displayName: string;
  status: string;
  source: string;
  /** The registrant's email domain only, never the address. */
  registrantEmailDomain: string | null;
  /** Where the registrant is a member: this shelter's organization, somewhere else, or nowhere. */
  registrantMembership: "this_shelter" | "elsewhere_or_none" | "no_registrant";
  animals: number;
  drafts: number;
  everServed: number;
  listedNow: number;
};

/**
 * `shelters:delete-test`'s guards as SQL, re-checked in the batch: the exact name, self-registered,
 * never verified/paused/suspended, the registrant a member of this shelter's organization only
 * (`auth_member_user_id_unique`), and no animal ever served or public/adopted now. The shelter and
 * registrant rows are locked; the animals aren't, so a draft published at that instant could still
 * go (it was never served, so nothing public is lost).
 */
function rehearsalGuard(expectedName: string): SQL {
  return sql`${shelters.displayName} = ${expectedName}
    AND ${shelters.registrationSource} = 'self_registration'
    AND ${inArray(shelters.verificationStatus, [...REHEARSAL_STATUSES])}
    AND (${shelters.registrantUserId} IS NULL OR EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.userId} = ${shelters.registrantUserId} AND ${authMember.organizationId} = ${shelters.organizationId}))
    AND NOT EXISTS (SELECT 1 FROM ${animals} WHERE ${animals.shelterId} = ${shelters.id}
      AND (${animals.everServedAt} IS NOT NULL OR ${inArray(animals.listingKind, [...REHEARSAL_LISTED_KINDS])}))`;
}

/** The three numbers the operator's dialog shows and the deletion re-checks (owner, 2026-11-20). */
export type ShelterDeletionCounts = { animals: number; published: number; admins: number };

export type OperatorShelterDeletion = {
  shelterId: ShelterId;
  /** As typed: trimmed here, then compared exactly with the stored name (stored names are trimmed). */
  typedName: string;
  /** What the dialog showed: any difference under the lock refuses. */
  counts: ShelterDeletionCounts;
  /** The operator's account: the audit line's, and re-checked as an active grant under the lock. */
  operatorUserId: string;
};

export type OperatorShelterDeletionOutcome =
  | {
      kind: "deleted";
      deletionId: string;
      photoKeys: number;
      /** Admin and invitee accounts erased, and those the erasure invariant kept. */
      erasedAccounts: number;
      keptAccounts: number;
    }
  | { kind: "not_found" }
  | { kind: "name_mismatch" }
  /** Something changed since the dialog read its counts: these are the fresh ones. */
  | { kind: "counts_changed"; counts: ShelterDeletionCounts }
  | { kind: "not_operator" };

/**
 * The counts as SQL over the `shelters` row in scope: one definition for the read and the guard.
 * Spelled out, not `${column}`: in a select list Drizzle drops the table, and an unqualified
 * `"id"` inside the subquery would name the animal's own id.
 */
const COUNTS_SQL = {
  animals: sql<number>`(SELECT count(*)::int FROM "animals" a WHERE a."shelter_id" = "shelters"."id")`,
  published: sql<number>`(SELECT count(*)::int FROM "animals" a WHERE a."shelter_id" = "shelters"."id" AND a."listing_kind" IN (${sql.join(
    // «з них опубліковано»: the cards the gallery shows now (published or reserved).
    DISCOVERABLE_LISTING_KINDS.map((kind) => sql`${kind}`),
    sql`, `,
  )}))`,
  admins: sql<number>`(SELECT count(*)::int FROM "auth_member" m WHERE m."organization_id" = "shelters"."organization_id")`,
} as const;

/** A magic-link row's address, lower-cased; NULL for any other kind of verification row. */
const magicLinkEmail = sql`CASE WHEN starts_with(${authVerification.value}, ${MAGIC_LINK_VALUE_PREFIX}) THEN lower(${authVerification.value}::jsonb ->> 'email') END`;

/**
 * Whose accounts an operator removal considers: the organization's members, the registrant, and
 * every address an invitation of this organization went to (an invitee's account would otherwise
 * outlive the invitation that names it). `erasableAmong` then keeps any the invariant protects.
 */
function candidateAccounts(organizationId: string | null, registrantUserId: string | null): SQL {
  const parts: SQL[] = [];
  if (organizationId !== null) {
    parts.push(
      sql`${authUser.id} IN (SELECT ${authMember.userId} FROM ${authMember} WHERE ${authMember.organizationId} = ${organizationId})`,
      sql`lower(${authUser.email}) IN (SELECT lower(${authInvitation.email}) FROM ${authInvitation} WHERE ${authInvitation.organizationId} = ${organizationId})`,
    );
  }
  if (registrantUserId !== null) parts.push(sql`${authUser.id} = ${registrantUserId}`);
  return parts.length === 0 ? sql`false` : (or(...parts) ?? sql`false`);
}

const textArray = (values: readonly string[]): SQL =>
  values.length === 0
    ? sql`ARRAY[]::text[]`
    : sql`ARRAY[${sql.join(
        values.map((value) => sql`${value}`),
        sql`, `,
      )}]::text[]`;

const photoKeysOf = (
  deletedAnimals: readonly { photos: readonly unknown[] }[],
  deletedShelters: readonly { logo: unknown }[],
): number =>
  deletedAnimals.reduce((sum, row) => sum + row.photos.length, 0) +
  deletedShelters.filter((row) => row.logo !== null).length;

export function applicationDeletionRepo(db: Database) {
  const repo = {
    /** The daily job's selection, by id so a run is reproducible. */
    async dueApplications(now: Date): Promise<DueApplication[]> {
      const reason = cleanupReasonSql(SHELTER_CANDIDATE, now);
      const rows = await db
        .select({ shelterId: shelters.id, reason })
        .from(shelters)
        .leftJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .where(
          and(eq(shelters.registrationSource, "self_registration"), sql`${reason} IS NOT NULL`),
        )
        .orderBy(asc(shelters.id));
      return rows.map((row) => ({
        shelterId: row.shelterId as ShelterId,
        reason: row.reason as DueApplication["reason"],
      }));
    },

    async deleteApplication(
      shelterId: ShelterId,
      reason: ApplicationDeletionReason,
      now: Date,
    ): Promise<ApplicationDeletionOutcome> {
      const done = await deleteWhere(shelterId, reason, stillDue(reason, now), now);
      return done === null ? { kind: "not_due" } : done.outcome;
    },

    /**
     * A pre-launch rehearsal shelter, removed by `shelters:delete-test` (owner, 2026-11-18) through
     * this same batch, guarded by `rehearsalGuard`. Recorded as `not_me` (no migration for a
     * reason of its own); the command prints it as a rehearsal.
     */
    async deleteRehearsal(
      shelterId: ShelterId,
      expectedName: string,
      now: Date,
    ): Promise<{ kind: "deleted"; deletionId: string } | { kind: "refused" }> {
      const done = await deleteWhere(shelterId, "not_me", rehearsalGuard(expectedName), now);
      return done === null ? { kind: "refused" } : { kind: "deleted", deletionId: done.deletionId };
    },

    /** What `shelters:delete-test` prints and checks before it asks for the deletion. */
    async rehearsalCandidate(shelterId: ShelterId): Promise<RehearsalCandidate | null> {
      const [row] = await db
        .select({
          id: shelters.id,
          displayName: shelters.displayName,
          status: shelters.verificationStatus,
          source: shelters.registrationSource,
          email: authUser.email,
          registrantUserId: shelters.registrantUserId,
          organizationId: shelters.organizationId,
          memberOf: authMember.organizationId,
        })
        .from(shelters)
        .leftJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .leftJoin(authMember, eq(authMember.userId, shelters.registrantUserId))
        .where(eq(shelters.id, shelterId))
        .limit(1);
      if (row === undefined) return null;
      const own = await db
        .select({ listingKind: animals.listingKind, everServedAt: animals.everServedAt })
        .from(animals)
        .where(eq(animals.shelterId, shelterId));
      return {
        id: row.id as ShelterId,
        displayName: row.displayName,
        status: row.status,
        source: row.source,
        registrantEmailDomain: row.email === null ? null : (row.email.split("@").at(-1) ?? null),
        registrantMembership:
          row.registrantUserId === null
            ? "no_registrant"
            : row.memberOf !== null && row.memberOf === row.organizationId
              ? "this_shelter"
              : "elsewhere_or_none",
        animals: own.length,
        drafts: own.filter((a) => a.listingKind === "draft").length,
        everServed: own.filter((a) => a.everServedAt !== null).length,
        listedNow: own.filter((a) =>
          (REHEARSAL_LISTED_KINDS as readonly string[]).includes(a.listingKind),
        ).length,
      };
    },

    /** What the operator's «Видалити притулок» dialog shows when it opens; null for no such shelter. */
    async deletionCounts(shelterId: ShelterId): Promise<ShelterDeletionCounts | null> {
      const [row] = await db
        .select({
          animals: COUNTS_SQL.animals.mapWith(Number),
          published: COUNTS_SQL.published.mapWith(Number),
          admins: COUNTS_SQL.admins.mapWith(Number),
        })
        .from(shelters)
        .where(eq(shelters.id, shelterId))
        .limit(1);
      return row ?? null;
    },

    /**
     * The operator's «Видалити притулок» (owner, 2026-11-20): any shelter, one batch. The shelter,
     * its organization and its animals are locked first, so no animal, admin or invitation can be
     * added and no card published until it commits; the marker line is then written only if the
     * name, the dialog's counts, the candidate accounts and the operator's grant all still hold,
     * and every later statement acts only if that line exists. Accounts go through the erasure
     * mechanism and its invariant (`erasableAmong`), so one with a role elsewhere stays. Photos
     * leave R2 through the clean-up job only.
     */
    async deleteShelterByOperator(
      request: OperatorShelterDeletion,
      now: Date,
    ): Promise<OperatorShelterDeletionOutcome> {
      const { shelterId, counts, operatorUserId } = request;
      const name = request.typedName.trim();
      const [found] = await db
        .select({
          organizationId: shelters.organizationId,
          registrantUserId: shelters.registrantUserId,
          displayName: shelters.displayName,
        })
        .from(shelters)
        .where(eq(shelters.id, shelterId))
        .limit(1);
      if (found === undefined) return { kind: "not_found" };
      if (found.displayName !== name) return { kind: "name_mismatch" };
      const { organizationId, registrantUserId } = found;
      const candidates = candidateAccounts(organizationId, registrantUserId);
      const accounts = await db
        .select({ id: authUser.id, email: authUser.email })
        .from(authUser)
        .where(candidates)
        .orderBy(asc(authUser.id));
      const userIds = accounts.map((account) => account.id);
      const emails = accounts.map((account) => account.email.toLowerCase());

      const markerId = randomUUID();
      const marked = sql`EXISTS (SELECT 1 FROM ${applicationDeletions} WHERE ${applicationDeletions.id} = ${markerId})`;
      const ofOrganization = (column: AnyPgColumn): SQL =>
        organizationId === null
          ? sql`false`
          : (and(eq(column, organizationId), marked) ?? sql`false`);
      const guard = sql`${shelters.displayName} = ${name}
        AND ${COUNTS_SQL.animals} = ${counts.animals}
        AND ${COUNTS_SQL.published} = ${counts.published}
        AND ${COUNTS_SQL.admins} = ${counts.admins}
        AND (SELECT coalesce(array_agg(${authUser.id} ORDER BY ${authUser.id}), ARRAY[]::text[]) FROM ${authUser} WHERE ${candidates}) = ${textArray(userIds)}
        AND EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${operatorUserId} AND ${superAdmins.revokedAt} IS NULL)`;
      // Sign-in links of the accounts the erasure removed only: a kept account's stay its own.
      const goneLinks =
        userIds.length === 0
          ? sql`false`
          : (and(
              marked,
              or(
                and(
                  inArray(authVerification.value, userIds),
                  sql`NOT EXISTS (SELECT 1 FROM ${authUser} WHERE ${authUser.id} = ${authVerification.value})`,
                ),
                and(
                  sql`${magicLinkEmail} IN (${sql.join(
                    emails.map((email) => sql`${email}`),
                    sql`, `,
                  )})`,
                  sql`NOT EXISTS (SELECT 1 FROM ${authUser} WHERE lower(${authUser.email}) = ${magicLinkEmail})`,
                ),
              ),
            ) ?? sql`false`);
      const ownAnimalIds = db
        .select({ id: animals.id })
        .from(animals)
        .where(eq(animals.shelterId, shelterId));

      const results = await inOneTransaction(
        db,
        (tx) =>
          [
            tx
              .select({ id: shelters.id })
              .from(shelters)
              .where(eq(shelters.id, shelterId))
              .for("update"),
            tx
              .select({ id: authOrganization.id })
              .from(authOrganization)
              .where(organizationId === null ? sql`false` : eq(authOrganization.id, organizationId))
              .for("update"),
            tx
              .select({ id: animals.id })
              .from(animals)
              .where(eq(animals.shelterId, shelterId))
              .for("update"),
            // Each statement reads afresh (READ COMMITTED): this one sees what the locks waited for.
            tx
              .insert(applicationDeletions)
              .select(
                sql`SELECT ${markerId}, ${shelters.id}, 'operator_removed', ${at(now)}, ${operatorUserId} FROM ${shelters} WHERE ${shelters.id} = ${shelterId} AND ${shelters.organizationId} IS NOT DISTINCT FROM ${organizationId} AND ${shelters.registrantUserId} IS NOT DISTINCT FROM ${registrantUserId} AND ${guard} FOR UPDATE OF ${shelters}`,
              )
              .returning({ id: applicationDeletions.id }),
            tx
              .delete(reveals)
              .where(
                and(
                  or(inArray(reveals.animalId, ownAnimalIds), eq(reveals.shelterId, shelterId)),
                  marked,
                ),
              ),
            // Their `invitation_created_users` rows cascade.
            tx.delete(authInvitation).where(ofOrganization(authInvitation.organizationId)),
            tx.delete(authMember).where(ofOrganization(authMember.organizationId)),
            rawBatchItem(tx, erasureStatement(and(erasableAmong(userIds, now), marked) as SQL)),
            tx.delete(authVerification).where(goneLinks),
            // Photo source rows cascade with their animal.
            tx
              .delete(animals)
              .where(and(eq(animals.shelterId, shelterId), marked))
              .returning({ photos: animals.photos }),
            tx.delete(shelterHistory).where(and(eq(shelterHistory.shelterId, shelterId), marked)),
            // Support sessions, funnel events and notification sends keep their rows, shelter nulled.
            tx
              .delete(shelters)
              .where(and(eq(shelters.id, shelterId), marked))
              .returning({ logo: shelters.logo }),
            tx.delete(authOrganization).where(ofOrganization(authOrganization.id)),
          ] as const,
      );
      const [, , , mark, , , , erased, , deletedAnimals, , deletedShelters] = results;
      if (mark.length > 0) {
        const { erasedCount } = erasureCountsOf(rowsOfRawResult(erased));
        return {
          kind: "deleted",
          deletionId: markerId,
          photoKeys: photoKeysOf(deletedAnimals, deletedShelters),
          erasedAccounts: erasedCount,
          keptAccounts: userIds.length - erasedCount,
        };
      }
      // Refused under the lock: say why, from a fresh read.
      const [again] = await db
        .select({ displayName: shelters.displayName })
        .from(shelters)
        .where(eq(shelters.id, shelterId));
      if (again === undefined) return { kind: "not_found" };
      if (again.displayName !== name) return { kind: "name_mismatch" };
      const [grant] = await db
        .select({ id: superAdmins.id })
        .from(superAdmins)
        .where(and(eq(superAdmins.userId, operatorUserId), sql`${superAdmins.revokedAt} IS NULL`));
      if (grant === undefined) return { kind: "not_operator" };
      // The counts changed, or (with the same counts) whose accounts they are.
      const fresh = await repo.deletionCounts(shelterId);
      return fresh === null ? { kind: "not_found" } : { kind: "counts_changed", counts: fresh };
    },
  };
  return repo;

  async function deleteWhere(
    shelterId: ShelterId,
    reason: ApplicationDeletionReason,
    guard: SQL,
    now: Date,
  ): Promise<{
    outcome: Extract<ApplicationDeletionOutcome, { kind: "deleted" }>;
    deletionId: string;
  } | null> {
    const [found] = await db
      .select({
        organizationId: shelters.organizationId,
        userId: shelters.registrantUserId,
        email: authUser.email,
      })
      .from(shelters)
      .leftJoin(authUser, eq(authUser.id, shelters.registrantUserId))
      .where(and(eq(shelters.id, shelterId), guard))
      .limit(1);
    if (found === undefined) return null;
    // A support session stays (RS-Q0): 0029's ON DELETE SET NULL keeps the row, shelter link
    // nulled, when the shelter goes (owner, 2026-11-18, Q4 (B)).

    const { organizationId, userId, email } = found;
    const markerId = randomUUID();
    const marked = sql`EXISTS (SELECT 1 FROM ${applicationDeletions} WHERE ${applicationDeletions.id} = ${markerId})`;
    // An erased registrant leaves no user rows to find: match nothing rather than every NULL.
    const ofUser = (condition: SQL | undefined): SQL =>
      userId === null ? sql`false` : (and(condition, marked) ?? sql`false`);
    const magicLink =
      email === null
        ? sql`false`
        : sql`CASE WHEN starts_with(${authVerification.value}, ${MAGIC_LINK_VALUE_PREFIX}) THEN lower(${authVerification.value}::jsonb ->> 'email') END = lower(${email})`;
    const uid = userId ?? "";
    // FOR UPDATE can't reach the nullable side of an outer join: with a registrant, an inner one.
    const registrantJoin =
      userId === null
        ? sql`LEFT JOIN ${authUser} ON ${authUser.id} = ${shelters.registrantUserId}`
        : sql`JOIN ${authUser} ON ${authUser.id} = ${shelters.registrantUserId}`;
    const lockedRows =
      userId === null
        ? sql`FOR UPDATE OF ${shelters}`
        : sql`FOR UPDATE OF ${shelters}, ${authUser}`;
    const ofOrganization = (column: AnyPgColumn): SQL =>
      organizationId === null
        ? sql`false`
        : (and(eq(column, organizationId), marked) ?? sql`false`);

    const [mark, , , , , , deletedAnimals, , deletedShelters] = await inOneTransaction(
      db,
      (tx) =>
        [
          // Re-checked under the rows' locks; every later statement acts only if this line exists.
          // The registrant's row is locked too: a confirmation writes only `email_verified`, so
          // one committed while this waits is re-read here and the deletion is not due.
          tx
            .insert(applicationDeletions)
            .select(
              sql`SELECT ${markerId}, ${shelters.id}, ${reason}, ${at(now)}, NULL FROM ${shelters} ${registrantJoin} WHERE ${shelters.id} = ${shelterId} AND ${shelters.organizationId} IS NOT DISTINCT FROM ${organizationId} AND ${shelters.registrantUserId} IS NOT DISTINCT FROM ${userId} AND ${guard} ${lockedRows}`,
            )
            .returning({ id: applicationDeletions.id }),
          tx.delete(registrationEmailTokens).where(ofUser(eq(registrationEmailTokens.userId, uid))),
          tx.delete(authVerification).where(ofUser(or(eq(authVerification.value, uid), magicLink))),
          tx.delete(authSession).where(ofUser(eq(authSession.userId, uid))),
          tx.delete(authAccount).where(ofUser(eq(authAccount.userId, uid))),
          tx.delete(authMember).where(ofOrganization(authMember.organizationId)),
          // Photo source rows cascade with their animal.
          tx
            .delete(animals)
            .where(and(eq(animals.shelterId, shelterId), marked))
            .returning({ photos: animals.photos }),
          tx.delete(shelterHistory).where(and(eq(shelterHistory.shelterId, shelterId), marked)),
          tx
            .delete(shelters)
            .where(and(eq(shelters.id, shelterId), marked))
            .returning({ logo: shelters.logo }),
          tx.delete(authOrganization).where(ofOrganization(authOrganization.id)),
          tx.delete(authUser).where(ofUser(eq(authUser.id, uid))),
        ] as const,
    );
    if (mark.length === 0) return null;
    const photoKeys = photoKeysOf(deletedAnimals, deletedShelters);
    return { outcome: { kind: "deleted", shelterId, photoKeys }, deletionId: markerId };
  }
}
