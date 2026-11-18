import { randomUUID } from "node:crypto";
import {
  type ApplicationDeletionReason,
  abandonedApplicationCutoff,
  rejectedApplicationCutoff,
  type ShelterId,
} from "@opika/domain";
import { and, asc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { type Database, inOneTransaction } from "../client";
import { animals } from "../schema/animals";
import { applicationDeletions } from "../schema/application-deletions";
import {
  authAccount,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
} from "../schema/auth";
import { registrationEmailTokens } from "../schema/registration-email-tokens";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";

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
              sql`SELECT ${markerId}, ${shelters.id}, ${reason}, ${at(now)} FROM ${shelters} ${registrantJoin} WHERE ${shelters.id} = ${shelterId} AND ${shelters.organizationId} IS NOT DISTINCT FROM ${organizationId} AND ${shelters.registrantUserId} IS NOT DISTINCT FROM ${userId} AND ${guard} ${lockedRows}`,
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
    const photoKeys =
      deletedAnimals.reduce((sum, row) => sum + row.photos.length, 0) +
      deletedShelters.filter((row) => row.logo !== null).length;
    return { outcome: { kind: "deleted", shelterId, photoKeys }, deletionId: markerId };
  }
}
