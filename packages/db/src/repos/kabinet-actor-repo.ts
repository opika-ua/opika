import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { authMember, authUser, superAdmins } from "../schema/auth";
import { shelters } from "../schema/shelters";

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
  return {
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
}
