import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authInvitation, authMember, authUser, superAdmins } from "../schema/auth";
import { invitationNotExpiredAt } from "./invitation-liveness";

export type BootstrapResult =
  // already_bootstrapped: the fixed grant id is taken (bootstrap ran once, or a concurrent run won).
  | { kind: "bootstrapped"; userId: string }
  | { kind: "refused"; reason: "operator_exists" | "address_taken" | "already_bootstrapped" };
export type GrantResult =
  | { kind: "granted" }
  | {
      kind: "refused";
      reason: "no_such_user" | "already_operator" | "shelter_admin" | "invited_admin";
    };
export type RevokeResult = { kind: "revoked" } | { kind: "refused"; reason: "not_an_operator" };

/**
 * Who the operators are (HS-Q4, RG-Q2). Written only by the `admin:*`
 * scripts, run by Oleksii from his own machine behind the production guard;
 * nothing in the app grants or revokes. A grant is never deleted: revoking
 * stamps `revoked_at`, so who was an operator, and when, stays on record
 * (HS-T2).
 */
/**
 * The first operator's grant id, fixed: RG-Q2's bootstrap is one-time only,
 * and a primary key is the one guarantee two concurrent runs can't both pass.
 * It also means bootstrap never runs twice, even after that grant is revoked
 * (later operators come from `admin:grant`).
 */
export const BOOTSTRAP_GRANT_ID = "bootstrap";

const uniqueViolation = (error: unknown): boolean => {
  const withCause = error as { code?: string; cause?: { code?: string } };
  return (withCause.cause?.code ?? withCause.code) === "23505";
};

export function superAdminRepo(db: Database) {
  return {
    async activeCount(): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(superAdmins)
        .where(isNull(superAdmins.revokedAt));
      return Number(row?.count ?? 0);
    },

    /**
     * The first operator (RG-Q2): creates the user and the grant in one
     * statement, and only while no active grant exists, so a second run
     * changes nothing. An address that already has a user is refused rather
     * than adopted: bootstrap creates, `admin:grant` promotes.
     */
    async bootstrap(input: {
      userId: string;
      email: string;
      name: string;
      now: Date;
    }): Promise<BootstrapResult> {
      const email = input.email.trim().toLowerCase();
      const [existing] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email))
        .limit(1);
      if (existing !== undefined) return { kind: "refused", reason: "address_taken" };
      const created = db
        .$with("created")
        .as(
          db
            .insert(authUser)
            .select(
              sql`SELECT ${input.userId}, ${input.name}, ${email}, false, NULL, ${input.now.toISOString()}::timestamptz, ${input.now.toISOString()}::timestamptz WHERE NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.revokedAt} IS NULL)`,
            )
            .returning({ id: authUser.id }),
        );
      let granted: { userId: string }[];
      try {
        granted = await db
          .with(created)
          .insert(superAdmins)
          .select(
            sql`SELECT ${BOOTSTRAP_GRANT_ID}, "created"."id", ${input.now.toISOString()}::timestamptz, NULL::timestamptz FROM "created"`,
          )
          .returning({ userId: superAdmins.userId });
      } catch (error) {
        // Two runs at once both pass NOT EXISTS (each statement sees its own
        // snapshot); the fixed grant id makes the second one a primary-key
        // conflict, which rolls back its whole statement, user included
        // (review of the scripts row, finding 2). A duplicate address on the
        // same race is the same outcome: one operator.
        if (uniqueViolation(error)) return { kind: "refused", reason: "already_bootstrapped" };
        throw error;
      }
      const [row] = granted;
      return row === undefined
        ? { kind: "refused", reason: "operator_exists" }
        : { kind: "bootstrapped", userId: row.userId };
    },

    /**
     * Promotes an existing user. Refuses an address with no user (create it
     * through an invitation or bootstrap, never here), one already granted,
     * and a shelter's admin: one person is never both (`conflicting_roles`).
     */
    async grant(input: { email: string; grantId: string; now: Date }): Promise<GrantResult> {
      const [user] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, input.email.trim().toLowerCase()))
        .limit(1);
      if (user === undefined) return { kind: "refused", reason: "no_such_user" };
      const [membership] = await db
        .select({ id: authMember.id })
        .from(authMember)
        .where(eq(authMember.userId, user.id))
        .limit(1);
      if (membership !== undefined) return { kind: "refused", reason: "shelter_admin" };
      // Not a member yet, but invited to be one: accepting after the grant
      // would make them both, `conflicting_roles`, locked out of everything
      // (review of the scripts row, finding 3).
      const [invited] = await db
        .select({ id: authInvitation.id })
        .from(authInvitation)
        .where(
          and(
            eq(authInvitation.email, input.email.trim().toLowerCase()),
            eq(authInvitation.status, "pending"),
            sql`${authInvitation.expiresAt} ${invitationNotExpiredAt(input.now)}`,
          ),
        )
        .limit(1);
      if (invited !== undefined) return { kind: "refused", reason: "invited_admin" };
      const inserted = await db
        .insert(superAdmins)
        .values({ id: input.grantId, userId: user.id, grantedAt: input.now })
        // The partial unique index on active grants is the arbiter.
        .onConflictDoNothing()
        .returning({ id: superAdmins.id });
      return inserted.length === 1
        ? { kind: "granted" }
        : { kind: "refused", reason: "already_operator" };
    },

    /** Ends an active grant by stamping it. The row stays. */
    async revoke(input: { email: string; now: Date }): Promise<RevokeResult> {
      const revoked = await db
        .update(superAdmins)
        .set({ revokedAt: input.now })
        .where(
          and(
            isNull(superAdmins.revokedAt),
            sql`${superAdmins.userId} = (SELECT ${authUser.id} FROM ${authUser} WHERE ${authUser.email} = ${input.email.trim().toLowerCase()})`,
          ),
        )
        .returning({ id: superAdmins.id });
      return revoked.length === 1
        ? { kind: "revoked" }
        : { kind: "refused", reason: "not_an_operator" };
    },
  };
}
