import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  authInvitation,
  authMember,
  authUser,
  invitationCreatedUsers,
  superAdmins,
  supportSessions,
} from "../schema/auth";

/** A user an invitation created that the clean-up would remove (RG-Q3, RS-Q1). */
export type CleanupCandidate = { userId: string; email: string; invitationId: string };

/**
 * The users an invitation created (RG-Q3): marking their first sign-in, and
 * cleaning up the ones whose invitation died unused. Separate from
 * `kabinetInvitationRepo` on purpose: this module creates no invitation, no
 * user and no membership, so Better Auth's session hook can use it without
 * becoming a path to a membership (HS-Q3's guard in no-self-serve-yet.test.ts).
 */
export function kabinetInvitedUsersRepo(db: Database) {
  return {
    /**
     * Set once, by Better Auth's session-create hook: from then on this user
     * has signed in, and the clean-up never touches them (RG-Q3, RS-Q0).
     */
    async markFirstSession(userId: string, at: Date): Promise<void> {
      await db
        .update(invitationCreatedUsers)
        .set({ firstSessionAt: at })
        .where(
          and(
            eq(invitationCreatedUsers.userId, userId),
            isNull(invitationCreatedUsers.firstSessionAt),
          ),
        );
    },

    /**
     * Users the clean-up may delete (RG-Q3, Oleksii): created by an invitation
     * that was revoked or has expired, with **no membership** and **no session
     * ever**. Scoped to one organization (the lazy clean-up on
     * `registry.admins.*`, RS-Q1) or to all (`admin:sweep-invites`).
     */
    async cleanupCandidates(input: {
      organizationId: string | null;
      now: Date;
    }): Promise<CleanupCandidate[]> {
      const dead = or(
        eq(authInvitation.status, "canceled"),
        and(eq(authInvitation.status, "pending"), lt(authInvitation.expiresAt, input.now)),
      );
      return db
        .select({
          userId: invitationCreatedUsers.userId,
          email: authUser.email,
          invitationId: invitationCreatedUsers.invitationId,
        })
        .from(invitationCreatedUsers)
        .innerJoin(authInvitation, eq(authInvitation.id, invitationCreatedUsers.invitationId))
        .innerJoin(authUser, eq(authUser.id, invitationCreatedUsers.userId))
        .leftJoin(authMember, eq(authMember.userId, invitationCreatedUsers.userId))
        .where(
          and(
            dead,
            isNull(invitationCreatedUsers.firstSessionAt),
            isNull(authMember.id),
            // Re-invited since (review of the invited-users row, finding 1):
            // a live invitation for the same address keeps the user, or the
            // clean-up would delete someone who can then never sign in to
            // accept it (sign-up is off).
            sql`NOT EXISTS (SELECT 1 FROM ${authInvitation} live WHERE live.email = ${authUser.email} AND live.status = 'pending' AND live.expires_at > ${input.now.toISOString()}::timestamptz)`,
            // The same exclusions the delete applies, so a dry run never
            // lists someone `--apply` would then skip (review of the scripts
            // row, finding 7).
            sql`NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${authUser.id})`,
            sql`NOT EXISTS (SELECT 1 FROM ${supportSessions} WHERE ${supportSessions.operatorUserId} = ${authUser.id})`,
            input.organizationId === null
              ? undefined
              : eq(authInvitation.organizationId, input.organizationId),
          ),
        );
    },

    /**
     * Deletes the candidates, re-checking every condition in the same
     * statement (never signed in, no membership, no live invitation for the
     * address), so a sign-in, an acceptance or a re-invite between listing and
     * deleting keeps the user. Users with a non-cascading row (a super_admin
     * grant, a support session) are skipped, never an error. Better Auth's FKs
     * cascade the rest.
     */
    async deleteCandidates(userIds: readonly string[], now: Date): Promise<number> {
      if (userIds.length === 0) return 0;
      const deleted = await db
        .delete(authUser)
        .where(
          and(
            inArray(authUser.id, [...userIds]),
            sql`EXISTS (SELECT 1 FROM ${invitationCreatedUsers} WHERE ${invitationCreatedUsers.userId} = ${authUser.id} AND ${invitationCreatedUsers.firstSessionAt} IS NULL)`,
            sql`NOT EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.userId} = ${authUser.id})`,
            sql`NOT EXISTS (SELECT 1 FROM ${authInvitation} live WHERE live.email = ${authUser.email} AND live.status = 'pending' AND live.expires_at > ${now.toISOString()}::timestamptz)`,
            // Rows whose FKs don't cascade (a grant, a support session): such
            // a user is never the clean-up's to delete, and one of them must
            // not abort the whole batch with a raw FK error (finding 2).
            sql`NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${authUser.id})`,
            sql`NOT EXISTS (SELECT 1 FROM ${supportSessions} WHERE ${supportSessions.operatorUserId} = ${authUser.id})`,
          ),
        )
        .returning({ id: authUser.id });
      return deleted.length;
    },
  };
}
