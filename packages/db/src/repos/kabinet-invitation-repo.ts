import type { ShelterId } from "@opika/domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  authInvitation,
  authMember,
  authOrganization,
  authUser,
  invitationCreatedUsers,
} from "../schema/auth";
import { shelters } from "../schema/shelters";

/** Proposal §4 / KABINET: an invite is good for 72 hours, then needs a resend. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

/** An invitation the registry made, or why it didn't (RG-Q3). */
export type InviteResult =
  | { kind: "invited"; invitationId: string; userId: string; expiresAt: Date; createdUser: boolean }
  | { kind: "already_a_member" };

/**
 * **The only module that writes `auth_invitation`** (HS-Q7, Oleksii), and the
 * only one that creates a shelter's organization or an invitee's user. A test
 * scans the source tree and fails if anything else writes `auth_invitation`.
 *
 * Why server-side, not the organization plugin's endpoints: the database
 * allows one membership per user (`auth_member_user_id_unique`), so the
 * operator is never a member of a shelter's organization, while the plugin's
 * invite endpoint requires the inviter to be one, and its create-organization
 * endpoint makes the caller the owner. So the operator's side is written here,
 * with the operator's own user as `inviter_id`, and only the *acceptance*
 * goes through Better Auth's real `accept-invitation` endpoint, which checks
 * the recipient, status and expiry itself.
 */
export function kabinetInvitationRepo(db: Database) {
  const repo = {
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
      // can't link two organizations. In practice the loser fails earlier: the
      // organization's slug is the shelter id and unique, so its insert
      // throws, and the operator retries into the organization that won.
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

    /**
     * Invites `email` to administer the shelter (RG-Q3, Oleksii): creates the
     * invitee's user (no role) when none exists, so they can sign in to
     * accept, and records that it did. An address that already administers a
     * shelter is refused as a value, never as the database's unique-index
     * error (one person, one shelter, HS-Q7).
     *
     * The user and its `invitation_created_users` row are one statement, so a
     * created user is always one the clean-up knows about (no transactions on
     * neon-http).
     */
    async invite(input: {
      shelterId: ShelterId;
      email: string;
      name: string;
      inviterUserId: string;
      ids: { invitationId: string; userId: string; organizationId: string };
      now: Date;
    }): Promise<InviteResult> {
      const email = input.email.trim().toLowerCase();
      const [existing] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email))
        .limit(1);
      if (existing !== undefined) {
        const [membership] = await db
          .select({ id: authMember.id })
          .from(authMember)
          .where(eq(authMember.userId, existing.id))
          .limit(1);
        if (membership !== undefined) return { kind: "already_a_member" };
      }
      const organizationId = await repo.ensureOrganization(
        input.shelterId,
        { organizationId: input.ids.organizationId },
        input.now,
      );
      const { expiresAt } = await repo.createInvitation({
        id: input.ids.invitationId,
        organizationId,
        email,
        inviterUserId: input.inviterUserId,
        now: input.now,
      });
      if (existing !== undefined) {
        return {
          kind: "invited",
          invitationId: input.ids.invitationId,
          userId: existing.id,
          expiresAt,
          createdUser: false,
        };
      }
      const created = db.$with("created").as(
        db
          .insert(authUser)
          .values({
            id: input.ids.userId,
            name: input.name,
            email,
            emailVerified: false,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning({ id: authUser.id }),
      );
      await db
        .with(created)
        .insert(invitationCreatedUsers)
        .select(
          sql`SELECT "created"."id", ${input.ids.invitationId}, ${input.now.toISOString()}::timestamptz, NULL::timestamptz FROM "created"`,
        );
      return {
        kind: "invited",
        invitationId: input.ids.invitationId,
        userId: input.ids.userId,
        expiresAt,
        createdUser: true,
      };
    },

    /** A pending invitation's link, valid again for the full window (`registry.admins.resendInvite`). */
    async resend(invitationId: string, now: Date): Promise<{ expiresAt: Date } | null> {
      const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
      const updated = await db
        .update(authInvitation)
        .set({ expiresAt })
        .where(and(eq(authInvitation.id, invitationId), eq(authInvitation.status, "pending")))
        .returning({ id: authInvitation.id });
      return updated.length === 1 ? { expiresAt } : null;
    },

    /** Withdraws a pending invitation (removing a pending admin, RG-Q3's "revoke"). */
    async revoke(invitationId: string): Promise<boolean> {
      const updated = await db
        .update(authInvitation)
        .set({ status: "canceled" })
        .where(and(eq(authInvitation.id, invitationId), eq(authInvitation.status, "pending")))
        .returning({ id: authInvitation.id });
      return updated.length === 1;
    },
  };
  return repo;
}
