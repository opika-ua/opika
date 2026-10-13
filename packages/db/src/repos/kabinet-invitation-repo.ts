import type { ShelterId } from "@opika/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { authInvitation, authOrganization } from "../schema/auth";
import { shelters } from "../schema/shelters";

/** Proposal §4 / KABINET: an invite is good for 72 hours, then needs a resend. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * **The only module that writes `auth_invitation`** (HS-Q7, Oleksii), and the
 * only one that creates a shelter's organization. A test scans the source tree
 * and fails if anything else does.
 *
 * Why server-side, not the organization plugin's endpoints: the database
 * allows one membership per user (`auth_member_user_id_unique`), so the
 * operator is never a member of a shelter's organization, while the plugin's
 * invite endpoint requires the inviter to be one, and its create-organization
 * endpoint makes the caller the owner. So the operator's side is written here,
 * with the operator's own user as `inviter_id`, and only the *acceptance*
 * goes through Better Auth's real `accept-invitation` endpoint, which checks
 * the recipient, status and expiry itself.
 *
 * Nothing outside tests calls this in the slice that introduces it. The
 * registry PR's `registry.admins.invite` is its first caller, and that is the
 * PR where a real shelter can first sign in (HS-Q3's copy gate).
 */
export function kabinetInvitationRepo(db: Database) {
  return {
    /**
     * Gives a shelter its organization, once. Returns the existing one if the
     * shelter already has it, so a retried invite doesn't create a second.
     */
    async ensureOrganization(
      shelterId: ShelterId,
      ids: { organizationId: string },
      now: Date,
    ): Promise<string> {
      const [existing] = await db
        .select({ organizationId: shelters.organizationId })
        .from(shelters)
        .where(eq(shelters.id, shelterId))
        .limit(1);
      if (existing === undefined) throw new Error(`No shelter ${shelterId}`);
      if (existing.organizationId !== null) return existing.organizationId;

      await db.insert(authOrganization).values({
        id: ids.organizationId,
        // Better Auth requires a name and a unique slug. The shelter's id is
        // both: the display name lives on the shelter, and copying it here
        // would be a second copy to keep in sync.
        name: shelterId,
        slug: shelterId,
        createdAt: now,
      });
      // Conditional on the column still being null, so two racing invites
      // can't link two organizations; the loser's org is left unlinked and
      // resolves to no role.
      const linked = await db
        .update(shelters)
        .set({ organizationId: ids.organizationId })
        .where(and(eq(shelters.id, shelterId), isNull(shelters.organizationId)))
        .returning({ organizationId: shelters.organizationId });
      if (linked.length === 0) {
        const [current] = await db
          .select({ organizationId: shelters.organizationId })
          .from(shelters)
          .where(eq(shelters.id, shelterId))
          .limit(1);
        if (current?.organizationId == null)
          throw new Error(`Shelter ${shelterId} lost its organization`);
        return current.organizationId;
      }
      return ids.organizationId;
    },

    /**
     * A pending invitation for `email` to administer the shelter. The email is
     * trimmed and lowercased, matching how sign-in keys it (HS-Q5), because
     * Better Auth compares it with the signed-in user's address on accept.
     */
    async createInvitation(input: {
      id: string;
      organizationId: string;
      email: string;
      inviterUserId: string;
      now: Date;
    }): Promise<{ id: string; expiresAt: Date }> {
      const expiresAt = new Date(input.now.getTime() + INVITATION_TTL_MS);
      await db.insert(authInvitation).values({
        id: input.id,
        organizationId: input.organizationId,
        email: input.email.trim().toLowerCase(),
        role: "admin",
        status: "pending",
        expiresAt,
        createdAt: input.now,
        inviterId: input.inviterUserId,
      });
      return { id: input.id, expiresAt };
    },
  };
}
