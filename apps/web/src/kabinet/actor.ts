import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";

/**
 * Who is calling a kabinet procedure (proposal §2).
 *
 * `support_view` is its own variant, not a super_admin with a flag: "read
 * only" is then a property of the type that every write rejects, not a check
 * a handler can forget (KABINET S5). Nothing in this slice produces it; the
 * registry PR's `registry.support.enter` will. The access decision handles it
 * already so the matrix test covers it from day one.
 */
export type KabinetActor =
  | { kind: "super_admin"; moderatorId: ModeratorId }
  | { kind: "shelter_admin"; shelterAdminId: ShelterAdminId; shelterId: ShelterId }
  | { kind: "support_view"; moderatorId: ModeratorId; shelterId: ShelterId };

/**
 * Everything the request can be, before access is decided. `no_role` is a
 * real Better Auth session whose user is neither a super_admin nor a member of
 * a shelter: authenticated, but nobody the kabinet serves. `conflicting_roles`
 * is a user who is somehow both; refused rather than guessed between.
 */
export type KabinetPrincipal =
  | { kind: "anonymous" }
  | { kind: "no_role" }
  | { kind: "conflicting_roles" }
  | KabinetActor;
