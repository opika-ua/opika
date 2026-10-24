import {
  type InvitationId,
  type ShelterAdminId,
  type ShelterHistoryEntry,
  ShelterHistoryEntrySchema,
  type ShelterId,
} from "@opika/domain";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  authInvitation,
  authMember,
  authOrganization,
  authUser,
  superAdmins,
} from "../schema/auth";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { historyRowSelect } from "./history-sql";
import { invitationNotExpiredAt } from "./invitation-liveness";

/** A pending invitation this user may accept now, as read before the write. */
export type AcceptableInvitation = {
  id: InvitationId;
  organizationId: string;
  shelterId: ShelterId;
  /** As stored (trimmed, lowercased by the invitation writer); the history line keeps it. */
  email: string;
};

/**
 * What the automatic accept did (IN-Q12/IN-Q13). Never a thrown database
 * error for the one-membership rule: that is `address_has_a_role`, the same
 * refusal the registry gives on invite (IN-Q7, IN-T1).
 */
export type InvitationAcceptResult =
  | { kind: "accepted"; invitationId: InvitationId; shelterId: ShelterId }
  /**
   * Nothing to do: no pending, unexpired invitation for this user's verified
   * address, or they already belong to that invitation's shelter. Running the
   * accept again after it succeeded lands here (idempotent, IN-Q12).
   */
  | { kind: "nothing_to_accept" }
  /**
   * The address holds a role that accepting would collide with: it already
   * administers another shelter (`auth_member_user_id_unique`, HS-Q7), or it
   * is an operator (one person, one role, RG-T10). Nothing is written and the
   * invitation stays pending; sign-in itself is unaffected (IN-Q13).
   */
  | { kind: "address_has_a_role"; reason: "shelter_admin" | "operator" };

/** What the read decided, before anything is written. */
export type AcceptPlan =
  | Exclude<InvitationAcceptResult, { kind: "accepted" }>
  | { kind: "accept"; invitation: AcceptableInvitation };

const MEMBERSHIP_INDEX = "auth_member_user_id_unique";

/**
 * The one-membership index refused the insert. The error arrives wrapped
 * (Drizzle's query error, whose `cause` is the driver's), and the two drivers
 * name the constraint differently: postgres-js `constraint_name`, neon-http
 * `constraint`. Any other unique violation (an id collision) is a real
 * failure and is not mapped.
 */
const membershipConflict = (error: unknown): boolean => {
  type PgError = { code?: string; constraint?: string; constraint_name?: string };
  const outer = error as PgError & { cause?: PgError };
  const pg = outer.cause?.code !== undefined ? outer.cause : outer;
  return pg.code === "23505" && (pg.constraint_name ?? pg.constraint) === MEMBERSHIP_INDEX;
};

/**
 * **The only module that writes `auth_member`** (IN-Q12, IN-Q13;
 * `no-self-serve-yet.test.ts` names this file by its full path). It turns a
 * pending invitation into a membership for the signed-in user, automatically
 * on sign-in, in place of Better Auth's `accept-invitation` (HS-Q7 is
 * superseded for this step only).
 *
 * Why not Better Auth's endpoint: on neon-http it is not atomic. It marks the
 * invitation accepted, then inserts the member as a separate write, and on
 * failure writes `pending` back; a crash between the two strands "accepted,
 * no member", which no retry can recover, since only `pending` is accepted.
 *
 * Here the facts (invitation accepted, the address's other pending
 * invitations to the same shelter canceled, membership, `admin_joined`
 * history) are **one statement**: a data-modifying CTE, so either all land or
 * none does, with no transaction (neon-http has none). The session is
 * not part of it: Better Auth creates that on sign-in, unchanged, and this
 * code never writes Better Auth's session row (Oleksii, IN-Q12). That is also
 * why the session's `active_organization_id`, which Better Auth's accept sets,
 * stays unset here: actor resolution never reads it.
 *
 * The rules are Better Auth's own, re-checked inside the statement so a race
 * between the read and the write can't skip them: the invitation is pending
 * and not expired (`expires_at >= now`, as Better Auth refuses only
 * `expiresAt < now`); its address equals the user's, case-insensitively; the
 * user's address is verified (Better Auth requires it when ids come from
 * `generateId`, which this app's do); the organization exists. Two more are
 * ours: the organization is a shelter's (the history line needs the shelter),
 * and the user is not an operator. The one-membership rule is left to the
 * database's unique index, the only check two concurrent accepts can't both
 * pass, and its violation is mapped to `address_has_a_role`.
 *
 * The cancel is ours, not Better Auth's (IN-T12, Oleksii 2026-10-14,
 * verbatim: "Duplicate pending invitations to the same shelter: accept the
 * newest and mark the older ones status=canceled in the same statement."):
 * a re-invite leaves the earlier invitation pending, and once the address
 * has joined, a pending one left behind would only ever read as an
 * outstanding invite. It writes `canceled`, Better Auth's own literal for a
 * withdrawn invitation (`InvitationStatus`, and what `kabinetInvitationRepo`
 * writes on withdraw), and touches only `status`, as Better Auth's own
 * cancel does. No history line: superseding a duplicate is not removing a
 * pending admin.
 *
 * Columns written are exactly the ones Better Auth's accept writes to the
 * invitation (`status`) and the member (`id`, `organization_id`, `user_id`,
 * `role` from the invitation, `created_at`), so its own reads (the members
 * list, the full organization) see the membership. A contract test runs both
 * on the same fixture and compares the rows, so a Better Auth upgrade that
 * changes them fails.
 */
export function kabinetInvitationAcceptRepo(db: Database) {
  const repo = {
    /** Read only: what accepting for this user would do right now. */
    async plan(userId: string, now: Date): Promise<AcceptPlan> {
      const [candidate] = await db
        .select({
          id: authInvitation.id,
          organizationId: authInvitation.organizationId,
          email: authInvitation.email,
          shelterId: shelters.id,
        })
        .from(authUser)
        .innerJoin(
          authInvitation,
          and(
            sql`lower(${authInvitation.email}) = lower(${authUser.email})`,
            eq(authInvitation.status, "pending"),
            sql`${authInvitation.expiresAt} ${invitationNotExpiredAt(now)}`,
          ),
        )
        .innerJoin(authOrganization, eq(authOrganization.id, authInvitation.organizationId))
        .innerJoin(shelters, eq(shelters.organizationId, authInvitation.organizationId))
        .where(and(eq(authUser.id, userId), eq(authUser.emailVerified, true)))
        // Newest first: a re-invited address can hold more than one pending
        // invitation to the same shelter (a re-invite replaces a lost link).
        .orderBy(desc(authInvitation.createdAt), desc(authInvitation.id))
        .limit(1);
      if (candidate === undefined) return { kind: "nothing_to_accept" };

      const [membership] = await db
        .select({ organizationId: authMember.organizationId })
        .from(authMember)
        .where(eq(authMember.userId, userId))
        .limit(1);
      if (membership !== undefined) {
        return membership.organizationId === candidate.organizationId
          ? { kind: "nothing_to_accept" }
          : { kind: "address_has_a_role", reason: "shelter_admin" };
      }
      const [grant] = await db
        .select({ id: superAdmins.id })
        .from(superAdmins)
        .where(and(eq(superAdmins.userId, userId), isNull(superAdmins.revokedAt)))
        .limit(1);
      if (grant !== undefined) return { kind: "address_has_a_role", reason: "operator" };

      return {
        kind: "accept",
        invitation: {
          id: candidate.id as InvitationId,
          organizationId: candidate.organizationId,
          shelterId: candidate.shelterId as ShelterId,
          email: candidate.email,
        },
      };
    },

    /**
     * The one statement: invitation pending → accepted, every other pending
     * invitation for the same address and shelter → canceled, the membership,
     * and the `admin_joined` line, all or nothing. `not_written` means a rule
     * no longer held when the statement ran (another tab accepted first, the
     * invitation expired or was withdrawn): nothing was written, the others
     * included.
     */
    async write(input: {
      userId: string;
      invitation: AcceptableInvitation;
      now: Date;
      ids: { memberId: string; historyId: string };
    }): Promise<{ kind: "written" } | { kind: "not_written" } | { kind: "membership_conflict" }> {
      const { userId, invitation, now } = input;
      // Parsed, so a malformed line fails here, before anything is written.
      const entry: ShelterHistoryEntry = ShelterHistoryEntrySchema.parse({
        kind: "admin_joined",
        at: now,
        shelterAdminId: userId as ShelterAdminId,
        invitationId: invitation.id,
        email: invitation.email,
      });
      const accepted = db.$with("accepted").as(
        db
          .update(authInvitation)
          .set({ status: "accepted" })
          .where(
            and(
              eq(authInvitation.id, invitation.id),
              eq(authInvitation.status, "pending"),
              sql`${authInvitation.expiresAt} ${invitationNotExpiredAt(now)}`,
              sql`lower(${authInvitation.email}) = (SELECT lower(${authUser.email}) FROM ${authUser} WHERE ${authUser.id} = ${userId} AND ${authUser.emailVerified})`,
              sql`EXISTS (SELECT 1 FROM ${authOrganization} JOIN ${shelters} ON ${shelters.organizationId} = ${authOrganization.id} WHERE ${authOrganization.id} = ${authInvitation.organizationId})`,
              sql`NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${userId} AND ${superAdmins.revokedAt} IS NULL)`,
            ),
          )
          .returning({
            organizationId: authInvitation.organizationId,
            role: authInvitation.role,
            email: authInvitation.email,
          }),
      );
      // Runs only when "accepted" returned a row, so a refused accept cancels
      // nothing. Every other pending one, not only older ones: the plan picked
      // the newest, so they are older, unless a re-invite landed between the
      // read and this statement; that one is canceled too, since the address
      // has now joined and none may stay pending (IN-T12). Expired-but-pending
      // rows included, for the same reason. Postgres runs a data-modifying
      // CTE whether or not the outer statement reads it.
      const superseded = db.$with("superseded").as(
        db
          .update(authInvitation)
          .set({ status: "canceled" })
          .where(
            and(
              eq(authInvitation.status, "pending"),
              sql`${authInvitation.id} <> ${invitation.id}`,
              // Tied to the row "accepted" actually wrote, not to the input.
              sql`EXISTS (SELECT 1 FROM "accepted" WHERE "accepted"."organization_id" = ${authInvitation.organizationId} AND lower("accepted"."email") = lower(${authInvitation.email}))`,
            ),
          )
          .returning({ id: authInvitation.id }),
      );
      const joined = db
        .$with("joined")
        .as(
          db
            .insert(authMember)
            .select(
              sql`SELECT ${input.ids.memberId}, "accepted"."organization_id", ${userId}, "accepted"."role", ${now.toISOString()}::timestamptz FROM "accepted"`,
            )
            .returning({ organizationId: authMember.organizationId }),
        );
      try {
        const recorded = await db
          .with(accepted, superseded, joined)
          .insert(shelterHistory)
          .select(
            sql`SELECT ${historyRowSelect({ id: input.ids.historyId, entry }, sql`"s"."id"`)} FROM "joined" JOIN ${shelters} AS "s" ON "s"."organization_id" = "joined"."organization_id"`,
          )
          .returning({ id: shelterHistory.id });
        return recorded.length === 1 ? { kind: "written" } : { kind: "not_written" };
      } catch (error) {
        if (membershipConflict(error)) return { kind: "membership_conflict" };
        throw error;
      }
    },

    /**
     * Accepts this user's pending invitation, if any (IN-Q12). Idempotent and
     * safe to run on every sign-in and every `/kabinet` load of a roleless
     * user. Throws only for a real failure (connection, an id collision),
     * after which nothing is written and the invitation is still pending.
     */
    async accept(input: {
      userId: string;
      now: Date;
      ids: { memberId: string; historyId: string };
    }): Promise<InvitationAcceptResult> {
      const plan = await repo.plan(input.userId, input.now);
      if (plan.kind !== "accept") return plan;
      const written = await repo.write({ ...input, invitation: plan.invitation });
      switch (written.kind) {
        case "written":
          return {
            kind: "accepted",
            invitationId: plan.invitation.id,
            shelterId: plan.invitation.shelterId,
          };
        // A concurrent accept won the index, or a rule stopped holding between
        // the read and the write. Read again: a membership in this same
        // shelter is nothing left to do, one elsewhere is the conflict.
        case "membership_conflict":
        case "not_written": {
          const again = await repo.plan(input.userId, input.now);
          return again.kind === "accept" ? { kind: "nothing_to_accept" } : again;
        }
        /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
        default: {
          const unreachable: never = written;
          return unreachable;
        }
      }
    },
  };
  return repo;
}
