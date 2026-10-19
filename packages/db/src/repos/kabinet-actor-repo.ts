import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { authAccount, authMember, authUser, superAdmins } from "../schema/auth";
import { shelters } from "../schema/shelters";

/**
 * Who a password belongs to, for the policy (`passwordVerdictOf`): the
 * address and the shelter's name it may not contain (§9 answer 2).
 */
export type PasswordSubject = { email: string; shelterName: string };

/** Better Auth's provider id for an email-and-password account (`auth_account.provider_id`). */
export const CREDENTIAL_PROVIDER_ID = "credential";

/**
 * What a Better Auth user is to the kabinet. Mirrors the app's
 * `KabinetPrincipal` minus `anonymous` (no user) and `support_view` (a support
 * session, not a user fact).
 */
export type UserRole =
  | { kind: "super_admin"; moderatorId: ModeratorId }
  | { kind: "shelter_admin"; shelterAdminId: ShelterAdminId; shelterId: ShelterId }
  | { kind: "no_role" }
  | { kind: "conflicting_roles" };

/**
 * Reads `super_admins` and `auth_member` only, never an `auth_user` field
 * (HS-T2). Two lookups, both by unique key, and both run every time, so a
 * user who is somehow a super_admin *and* a shelter member is refused rather
 * than resolved to whichever query ran first. A membership in an organization
 * no shelter points at (an invite half-done) is no role at all.
 *
 * `.select().limit()` rather than raw `execute()`: the result shape is the same
 * on postgres-js and neon-http (standing constraints, R1).
 */
export function kabinetActorRepo(db: Database) {
  const repo = {
    /**
     * Whether anyone has this address. Magic-link sign-in asks it after the
     * response has gone out, to decide whether to send at all (sign-up is
     * off, so an unknown address must get nothing).
     */
    async hasUserWithEmail(email: string): Promise<boolean> {
      const rows = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email.trim().toLowerCase()))
        .limit(1);
      return rows.length > 0;
    },

    /**
     * Whether this user holds an active super_admin grant: the operator's
     * session limits apply (§9 answer 3, `KABINET_SESSION_LIMITS`). A
     * conflicting user (also a member) holds one too, and gets the shorter
     * limits, as the more privileged account should.
     */
    async hasActiveOperatorGrant(userId: string): Promise<boolean> {
      const rows = await db
        .select({ userId: superAdmins.userId })
        .from(superAdmins)
        .where(and(eq(superAdmins.userId, userId), isNull(superAdmins.revokedAt)))
        .limit(1);
      return rows.length > 0;
    },

    /**
     * Whether the person with this address holds an active super_admin grant.
     * One statement whatever the address (unknown, a shelter admin, the
     * operator), so asking it on every password sign-in costs every address
     * the same (§5): the sign-in guard refuses the operator a password even if
     * a credential ever appeared (§4.6).
     */
    async operatorGrantForEmail(email: string): Promise<boolean> {
      const rows = await db
        .select({ userId: superAdmins.userId })
        .from(authUser)
        .innerJoin(
          superAdmins,
          and(eq(superAdmins.userId, authUser.id), isNull(superAdmins.revokedAt)),
        )
        .where(eq(authUser.email, email.trim().toLowerCase()))
        .limit(1);
      return rows.length > 0;
    },

    /**
     * The shelter admin with this address, or null: nobody has it, or its
     * holder is the operator, roleless or conflicting. «Забули пароль?» creates
     * a reset token only for an id this returns (§4.6: never the operator).
     */
    async shelterAdminIdByEmail(email: string): Promise<string | null> {
      const [found] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email.trim().toLowerCase()))
        .limit(1);
      if (found === undefined) return null;
      const role = await repo.roleOf(found.id);
      return role.kind === "shelter_admin" ? found.id : null;
    },

    /**
     * A shelter admin's address and shelter name, for the password policy; null
     * for anyone who isn't exactly a shelter admin (the operator, a roleless or
     * conflicting user), who may not set a password at all (§4.6).
     */
    async passwordSubjectOf(userId: string): Promise<PasswordSubject | null> {
      const role = await repo.roleOf(userId);
      if (role.kind !== "shelter_admin") return null;
      const [row] = await db
        .select({ email: authUser.email, shelterName: shelters.displayName })
        .from(authUser)
        .innerJoin(shelters, eq(shelters.id, role.shelterId))
        .where(eq(authUser.id, userId))
        .limit(1);
      return row ?? null;
    },

    /** Whether this user has a password: a credential account holding a hash. */
    async hasPassword(userId: string): Promise<boolean> {
      const rows = await db
        .select({ id: authAccount.id })
        .from(authAccount)
        .where(
          and(
            eq(authAccount.userId, userId),
            eq(authAccount.providerId, CREDENTIAL_PROVIDER_ID),
            isNotNull(authAccount.password),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async roleOf(userId: string): Promise<UserRole> {
      const [admin, membership] = await Promise.all([
        db
          .select({ userId: superAdmins.userId })
          .from(superAdmins)
          // Active grants only (HS-T2): a revoked grant is history, not a role.
          .where(and(eq(superAdmins.userId, userId), isNull(superAdmins.revokedAt)))
          .limit(1),
        db
          .select({ shelterId: shelters.id })
          .from(authMember)
          .innerJoin(shelters, eq(shelters.organizationId, authMember.organizationId))
          .where(eq(authMember.userId, userId))
          .limit(1),
      ]);
      const isSuperAdmin = admin.length > 0;
      const shelterId = membership[0]?.shelterId;
      if (isSuperAdmin && shelterId !== undefined) return { kind: "conflicting_roles" };
      if (isSuperAdmin) return { kind: "super_admin", moderatorId: userId as ModeratorId };
      if (shelterId !== undefined) {
        return {
          kind: "shelter_admin",
          shelterAdminId: userId as ShelterAdminId,
          shelterId,
        };
      }
      return { kind: "no_role" };
    },
  };
  return repo;
}
