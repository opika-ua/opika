import { type SQL, sql } from "drizzle-orm";

/**
 * The one comparison for "this pending invitation hasn't expired at `now`" —
 * a partial SQL fragment (just the operator and the value), spliced after
 * whichever `expires_at` column reference the caller already has, so a
 * Drizzle column object (`authInvitation.expiresAt`) and a raw-SQL
 * table-alias reference (`live."expires_at"`) can both use it unchanged:
 * `sql\`${authInvitation.expiresAt} ${invitationNotExpiredAt(now)}\`` or
 * `sql\`live."expires_at" ${invitationNotExpiredAt(now)}\``.
 *
 * Every real place that asks "does this address have a live invitation"
 * shares this: the accept flow itself (`kabinet-invitation-accept-repo.ts`,
 * both `plan` and `write`), the GDPR erasure's "live invitation elsewhere"
 * check (`admin-erasure-repo.ts`'s `noLiveInvitationElsewhere`),
 * `kabinetInvitationRepo.roleOfAddress`'s "invited_elsewhere" refusal, and
 * `superAdminRepo.grant`'s "invited_admin" refusal — so none of them can
 * ever again disagree about which side of the exact expiry instant counts.
 *
 * Oleksii, 2026-10-24 (PR #198's Tier 1 delta review, finding 5, his own
 * fix): "one shared comparison for erasure and accept, a test at the exact
 * expiry instant." Before this, the accept flow used `>=` (an invitation is
 * still acceptable the instant it expires — `kabinet-invitation-accept-
 * repo.test.ts`'s own "accepts an invitation at its exact expiry instant"
 * test) while the erasure used a bare `>`, so at that exact instant a user
 * could be a clean-up candidate while the accept would still succeed. This
 * uses `>=`, matching the accept flow's own behaviour. The other two sites
 * (`roleOfAddress`, `grant`) had the identical bare-`>` gap, found while
 * extracting this — a builder decision to close all four rather than leave
 * the "shared comparison" only partly shared.
 */
export function invitationNotExpiredAt(now: Date): SQL {
  return sql`>= ${now.toISOString()}::timestamptz`;
}
