import { randomUUID } from "node:crypto";
import {
  type ApplicationDeletionReason,
  abandonedApplicationCutoff,
  rejectedApplicationCutoff,
  type ShelterId,
} from "@opika/domain";
import { and, asc, eq, or, type SQL, sql } from "drizzle-orm";
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
  supportSessions,
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

export function applicationDeletionRepo(db: Database) {
  return {
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
      const [found] = await db
        .select({
          organizationId: shelters.organizationId,
          userId: shelters.registrantUserId,
          email: authUser.email,
        })
        .from(shelters)
        .leftJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .where(and(eq(shelters.id, shelterId), stillDue(reason, now)))
        .limit(1);
      if (found === undefined) return { kind: "not_due" };
      const [support] = await db
        .select({ id: supportSessions.id })
        .from(supportSessions)
        .where(eq(supportSessions.shelterId, shelterId))
        .limit(1);
      // RS-Q0: support sessions are never deleted, and their key doesn't cascade.
      if (support !== undefined) {
        throw new Error(`Application ${shelterId} has a support session; it is never deleted`);
      }

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
      const ofOrganization = (column: AnyPgColumn): SQL =>
        organizationId === null
          ? sql`false`
          : (and(eq(column, organizationId), marked) ?? sql`false`);

      const [mark, , , , , , deletedAnimals, , deletedShelters] = await inOneTransaction(
        db,
        (tx) =>
          [
            // Re-checked under the row's lock; every later statement acts only if this line exists.
            tx
              .insert(applicationDeletions)
              .select(
                sql`SELECT ${markerId}, ${shelters.id}, ${reason}, ${at(now)} FROM ${shelters} LEFT JOIN ${authUser} ON ${authUser.id} = ${shelters.registrantUserId} WHERE ${shelters.id} = ${shelterId} AND ${shelters.organizationId} IS NOT DISTINCT FROM ${organizationId} AND ${shelters.registrantUserId} IS NOT DISTINCT FROM ${userId} AND ${stillDue(reason, now)} FOR UPDATE OF ${shelters}`,
              )
              .returning({ id: applicationDeletions.id }),
            tx
              .delete(registrationEmailTokens)
              .where(ofUser(eq(registrationEmailTokens.userId, uid))),
            tx
              .delete(authVerification)
              .where(ofUser(or(eq(authVerification.value, uid), magicLink))),
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
      if (mark.length === 0) return { kind: "not_due" };
      const photoKeys =
        deletedAnimals.reduce((sum, row) => sum + row.photos.length, 0) +
        deletedShelters.filter((row) => row.logo !== null).length;
      return { kind: "deleted", shelterId, photoKeys };
    },
  };
}
