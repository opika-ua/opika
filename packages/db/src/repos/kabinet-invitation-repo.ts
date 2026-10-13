import type { ShelterHistoryEntry, ShelterId } from "@opika/domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  invitationCreatedUsers,
  superAdmins,
} from "../schema/auth";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { historyRowSelect } from "./history-sql";

/** A history row written in the same statement as the change it records. */
type HistoryRow = { id: string; shelterId: ShelterId; entry: ShelterHistoryEntry };

const historyValues = (row: HistoryRow) => historyRowSelect(row, sql`${row.shelterId}`);

/** Proposal §4 / KABINET: an invite is good for 72 hours, then needs a resend. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Why an address can't be invited (RG-T10, IN-Q7, IN-Q8): one person holds
 * one role. It administers a shelter; it is an operator (an active grant;
 * never read from the user record, HS-T2); or it holds a live invitation to
 * another shelter, whose acceptance would collide with this one on the
 * one-membership index.
 */
export type AddressRole = "shelter_admin" | "operator" | "invited_elsewhere";

/** An invitation the registry made, or why it didn't (RG-Q3, RG-T10). */
export type InviteResult =
  | { kind: "invited"; invitationId: string; userId: string; expiresAt: Date; createdUser: boolean }
  | { kind: "address_has_a_role"; reason: AddressRole };

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
      /**
       * The operator's `admin_invited` line, written in the same statement
       * (review, finding 3). Required, so no caller can write an invitation
       * without its history line.
       */
      history: HistoryRow;
    }): Promise<{ id: string; expiresAt: Date }> {
      const expiresAt = new Date(input.now.getTime() + INVITATION_TTL_MS);
      const insert = db
        .insert(authInvitation)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          email: input.email.trim().toLowerCase(),
          role: "admin",
          status: "pending",
          expiresAt,
          createdAt: input.now,
          inviterId: input.inviterUserId,
        })
        .returning({ id: authInvitation.id });
      const created = db.$with("created_invitation").as(insert);
      await db
        .with(created)
        .insert(shelterHistory)
        .select(sql`SELECT ${historyValues(input.history)} FROM "created_invitation"`);
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
      /** The operator's `admin_invited` line, written with the invitation. */
      history: { id: string; entry: ShelterHistoryEntry };
    }): Promise<InviteResult> {
      const email = input.email.trim().toLowerCase();
      const [existing] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email))
        .limit(1);
      const role = await repo.roleOfAddress({ email, shelterId: input.shelterId, now: input.now });
      if (role !== null) return { kind: "address_has_a_role", reason: role };
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
        history: { ...input.history, shelterId: input.shelterId },
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

    /**
     * The role an address already holds, as far as inviting it to
     * `shelterId` is concerned, or null when it can be invited. A live
     * invitation to this same shelter is not a conflict (a re-invite is how
     * an expired or lost one is replaced). Read by `invite` and by
     * `registry.shelters.create`'s check before it creates anything.
     */
    async roleOfAddress(input: {
      email: string;
      shelterId: ShelterId | null;
      now: Date;
    }): Promise<AddressRole | null> {
      const email = input.email.trim().toLowerCase();
      const [user] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email))
        .limit(1);
      if (user !== undefined) {
        const [membership] = await db
          .select({ id: authMember.id })
          .from(authMember)
          .where(eq(authMember.userId, user.id))
          .limit(1);
        if (membership !== undefined) return "shelter_admin";
        const [grant] = await db
          .select({ id: superAdmins.id })
          .from(superAdmins)
          .where(and(eq(superAdmins.userId, user.id), isNull(superAdmins.revokedAt)))
          .limit(1);
        if (grant !== undefined) return "operator";
      }
      const thisOrganization =
        input.shelterId === null
          ? null
          : ((
              await db
                .select({ organizationId: shelters.organizationId })
                .from(shelters)
                .where(eq(shelters.id, input.shelterId))
                .limit(1)
            )[0]?.organizationId ?? null);
      const [elsewhere] = await db
        .select({ id: authInvitation.id })
        .from(authInvitation)
        .where(
          and(
            eq(authInvitation.email, email),
            eq(authInvitation.status, "pending"),
            sql`${authInvitation.expiresAt} > ${input.now.toISOString()}::timestamptz`,
            thisOrganization === null
              ? undefined
              : sql`${authInvitation.organizationId} <> ${thisOrganization}`,
          ),
        )
        .limit(1);
      return elsewhere !== undefined ? "invited_elsewhere" : null;
    },

    /** A pending invitation's link, valid again for the full window (`registry.admins.resendInvite`). */
    async resend(
      invitationId: string,
      now: Date,
      history: HistoryRow,
    ): Promise<{ expiresAt: Date } | null> {
      const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
      const update = db
        .update(authInvitation)
        .set({ expiresAt })
        .where(and(eq(authInvitation.id, invitationId), eq(authInvitation.status, "pending")))
        .returning({ id: authInvitation.id });
      // The `admin_invitation_resent` line lands only if the invitation did.
      const extended = db.$with("extended").as(update);
      const recorded = await db
        .with(extended)
        .insert(shelterHistory)
        .select(sql`SELECT ${historyValues(history)} FROM "extended"`)
        .returning({ id: shelterHistory.id });
      return recorded.length === 1 ? { expiresAt } : null;
    },

    /**
     * Removes an admin (RG-Q6): the membership goes, every session of theirs
     * ends at once, and the removal is recorded, all in one statement, so a
     * recorded removal always ended the sessions and an unrecorded one never
     * happened. False when they weren't a member (nothing written).
     */
    async removeMember(input: {
      organizationId: string;
      userId: string;
      history: HistoryRow;
    }): Promise<boolean> {
      const removed = db.$with("removed").as(
        db
          .delete(authMember)
          .where(
            and(
              eq(authMember.organizationId, input.organizationId),
              eq(authMember.userId, input.userId),
            ),
          )
          .returning({ userId: authMember.userId }),
      );
      const ended = db
        .$with("ended")
        .as(
          db
            .delete(authSession)
            .where(sql`${authSession.userId} IN (SELECT "user_id" FROM "removed")`)
            .returning({ id: authSession.id }),
        );
      const inserted = await db
        .with(removed, ended)
        .insert(shelterHistory)
        .select(
          sql`SELECT ${historyValues(input.history)} FROM (SELECT 1 FROM "removed" LIMIT 1) AS one`,
        )
        .returning({ id: shelterHistory.id });
      return inserted.length === 1;
    },

    /**
     * Withdraws every pending invitation for the address in this
     * organization (a re-invited address can hold more than one), recorded
     * as one removal of a pending admin. False when none was pending.
     */
    async withdrawPending(input: {
      organizationId: string;
      email: string;
      history: HistoryRow;
    }): Promise<boolean> {
      const withdrawn = db.$with("withdrawn").as(
        db
          .update(authInvitation)
          .set({ status: "canceled" })
          .where(
            and(
              eq(authInvitation.organizationId, input.organizationId),
              eq(authInvitation.email, input.email.trim().toLowerCase()),
              eq(authInvitation.status, "pending"),
            ),
          )
          .returning({ id: authInvitation.id }),
      );
      const inserted = await db
        .with(withdrawn)
        .insert(shelterHistory)
        .select(
          sql`SELECT ${historyValues(input.history)} FROM (SELECT 1 FROM "withdrawn" LIMIT 1) AS one`,
        )
        .returning({ id: shelterHistory.id });
      return inserted.length === 1;
    },

    /** The newest pending invitation for an address in an organization, expired or not. */
    async latestPending(organizationId: string, email: string): Promise<{ id: string } | null> {
      const [row] = await db
        .select({ id: authInvitation.id })
        .from(authInvitation)
        .where(
          and(
            eq(authInvitation.organizationId, organizationId),
            eq(authInvitation.email, email.trim().toLowerCase()),
            eq(authInvitation.status, "pending"),
          ),
        )
        .orderBy(sql`${authInvitation.createdAt} DESC, ${authInvitation.id} DESC`)
        .limit(1);
      return row ?? null;
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
