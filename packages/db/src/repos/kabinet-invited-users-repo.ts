import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authInvitation, authMember, authUser, invitationCreatedUsers } from "../schema/auth";
import {
  eraseUsersAndScrubHistory,
  NOT_ELSEWHERE_IN_USE,
  noLiveInvitationElsewhere,
} from "./admin-erasure-repo";

/** A user an invitation created that the clean-up would remove (RG-Q3, RS-Q1). */
export type CleanupCandidate = { userId: string; email: string; invitationId: string };

/**
 * The users an invitation created (RG-Q3): marking their first sign-in, and
 * cleaning up the ones who no longer hold any shelter role. Separate from
 * `kabinetInvitationRepo` on purpose: this module creates no invitation, no
 * user and no membership, so Better Auth's session hook can use it without
 * becoming a path to a membership (HS-Q3's guard in no-self-serve-yet.test.ts).
 */
export function kabinetInvitedUsersRepo(db: Database) {
  return {
    /**
     * Set once, by Better Auth's session-create hook. Kept for its own sake
     * (an audit fact — has this invitee ever signed in) but no longer read
     * by the clean-up below: Oleksii's generalised erasure invariant,
     * 2026-10-24 ("whether or not it ever signed in"), replaced the earlier
     * "no session ever" condition entirely (RG-Q3's own rule, amended the
     * same day — see `cleanupCandidates`/`deleteCandidates`).
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
     * Users the clean-up may delete: every account an invitation created
     * that today holds no shelter role at all — no membership, not an
     * operator, no support session, and no live invitation anywhere
     * (`NOT_ELSEWHERE_IN_USE` and `noLiveInvitationElsewhere`, the same two
     * checks `deleteCandidates` below and `erasableIf` both use — one
     * invariant, not a copy of it. `NOT_ELSEWHERE_IN_USE`'s own membership
     * check is redundant with the `leftJoin`/`isNull` below; kept anyway,
     * since reusing the shared constant as-is is what keeps this in sync
     * with every other caller rather than drifting from it). Scoped to one
     * organization (the lazy clean-up on `registry.admins.*`, RS-Q1) or to
     * all (the auth-cleanup cron, `admin:sweep-invites`).
     *
     * **Amended, 2026-10-24** (Oleksii, the STOP decision on the `/pro`
     * sentence, "A, generalised"): "a non-operator account with no shelter
     * membership and no live invitation is erased … whether or not it ever
     * signed in." RG-Q3's original "no session ever" condition is gone —
     * `firstSessionAt` no longer gates this at all, only
     * `erasableIf`/`noLiveInvitationElsewhere`'s own invariant does, which
     * already excludes a user whose *own* creating invitation is still live
     * (it would itself be "a live invitation … for the address"), so the
     * separate revoked-or-expired check on that one invitation is gone too
     * — redundant with the "no live invitation anywhere" check once
     * `firstSessionAt` no longer needs its own `dead`-invitation join.
     */
    async cleanupCandidates(input: {
      organizationId: string | null;
      now: Date;
    }): Promise<CleanupCandidate[]> {
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
            isNull(authMember.id),
            NOT_ELSEWHERE_IN_USE,
            noLiveInvitationElsewhere(input.now),
            input.organizationId === null
              ? undefined
              : eq(authInvitation.organizationId, input.organizationId),
          ),
        );
    },

    /**
     * Deletes the candidates, re-checking the full invariant in the same
     * statement (no membership, not an operator, no live invitation
     * anywhere for the address), so a sign-in, an acceptance or a re-invite
     * between listing and deleting keeps the user. Users with a
     * non-cascading row (a super_admin grant, a support session) are
     * skipped, never an error. Better Auth's FKs cascade the rest.
     *
     * Routes through `eraseUsersAndScrubHistory` (GDPR erasure, option A,
     * `docs/gdpr-analysis.md` §5 item 4): a departed invitee's
     * `admin_invited`/`admin_invitation_resent`/`admin_removed` history
     * entries, and every `auth_invitation` row their address was ever sent,
     * lose the real email in the same statement as the account's deletion,
     * exactly as an accepted admin's removal (`erasableIf`) already did —
     * one shared mechanism, not a second copy of the scrub for this path.
     */
    async deleteCandidates(userIds: readonly string[], now: Date): Promise<number> {
      if (userIds.length === 0) return 0;
      const condition = and(
        inArray(authUser.id, [...userIds]),
        sql`EXISTS (SELECT 1 FROM ${invitationCreatedUsers} WHERE ${invitationCreatedUsers.userId} = ${authUser.id})`,
        NOT_ELSEWHERE_IN_USE,
        noLiveInvitationElsewhere(now),
      ) as SQL;
      const { erasedCount } = await eraseUsersAndScrubHistory(db, condition);
      return erasedCount;
    },
  };
}
