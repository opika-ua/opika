import { ADMIN_EMAIL_HISTORY_KINDS, ERASED_ADMIN_EMAIL } from "@opika/domain";
import { and, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { executeRows } from "../raw-rows";
import { authMember, authUser, superAdmins, supportSessions } from "../schema/auth";

/**
 * The three checks every real deletion of an `auth_user` row tied to a
 * shelter's admin history needs, regardless of which caller is doing the
 * deleting: never a member of any organization, never an operator, never a
 * support-session operator. Shared rather than copied, so a future change
 * to any one of the three (a new role table, say) can't update one caller
 * and miss the other.
 */
export const NOT_ELSEWHERE_IN_USE: SQL = sql`
  NOT EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.userId} = ${authUser.id})
  AND NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${authUser.id})
  AND NOT EXISTS (SELECT 1 FROM ${supportSessions} WHERE ${supportSessions.operatorUserId} = ${authUser.id})
`;

/**
 * GDPR erasure, option A (`docs/gdpr-analysis.md` §5 item 4). Oleksii,
 * 2026-10-24: "Delete the account (when it has no other membership) and
 * scrub the email in that shelter's admin history entries to the
 * placeholder, at the moment of removal." Widened the same day, finding 2
 * of the first build's own copy check: "whenever an admin's or invitee's
 * account is deleted, by any path … their email is scrubbed from that
 * shelter's history entries in the same transaction as the deletion. One
 * shared mechanism, not three copies."
 *
 * This is that one mechanism. Every real path that deletes an `auth_user`
 * row tied to a shelter's own admin history calls this rather than writing
 * its own direct delete on that table — `registry.admins.remove` (an accepted member,
 * `registry-invitations.ts`) and `kabinetInvitedUsersRepo.deleteCandidates`
 * (a withdrawn-pending or expired-never-accepted invite, called from both
 * `registry.admins.remove`'s own clean-up and the standalone
 * `admin:sweep-invites`). `auth-user-deletion-scan.test.ts` asserts these
 * are the only two call sites outside this file and `demo-remove.ts` (which
 * deletes the whole `shelter_history` row alongside the shelter — nothing
 * to scrub, the row itself is gone) — a new one fails that test by name.
 *
 * `condition` is the caller's own eligibility WHERE clause (which users,
 * and under what guard — typically `and(<which users>, NOT_ELSEWHERE_IN_USE,
 * …)`) — this function owns only what every caller needs identically:
 * finding which shelter(s) each deleted user's own admin history belongs to
 * and scrubbing exactly those rows' `email` field, in the same statement as
 * the delete.
 *
 * `targets` joins `auth_invitation` by **email**, not through
 * `invitation_created_users` — that table's `user_id` is a primary key, one
 * row per account, fixed to whichever invitation *first* created it
 * (`kabinetInvitationRepo.invite` reuses the existing user, never writes a
 * second row, once an address already has an account). An address invited,
 * dead, then invited again elsewhere shares one account across both
 * invitations — Oleksii's own check, 2026-10-24: "the shared mechanism must
 * scrub that email from every shelter's history entries for that user, A's
 * included, not only the shelter that triggered the deletion." Joining by
 * email against every `auth_invitation` row the deleted user's address
 * ever received finds all of them, not just the first.
 *
 * Both email comparisons (`targets`'s join and `scrubbed`'s match against
 * the history entry's own stored `email`) go through `lower()` on both
 * sides, never a bare `=`. Every write path normalises (`.trim().
 * toLowerCase()` — `kabinetInvitationRepo.invite`, `admin.ts`'s own
 * `emailArg`), so in practice every stored value already matches case for
 * case; `lower()` is the comparison's own guarantee of that, not a trust
 * in every future write path remembering to normalise first (Oleksii,
 * 2026-10-24 review brief: "compare normalised addresses, exactly as
 * invitations and users store them"). A differently-cased address is
 * tested (`admin-erasure-repo.test.ts`).
 *
 * One statement, three CTEs: the delete, the scrub, both or neither. If a
 * user `condition` names turns out ineligible, that user's history is never
 * touched either, because `targets`/`scrubbed` below only ever see rows
 * `erased` actually deleted. `erasedCount` is read from the delete's own
 * `RETURNING`, never from how many history rows happened to match — those
 * can differ (a departed admin whose shelter has no matching history row is
 * still a real erasure) without ever meaning only one half ran.
 *
 * Why `shelter_history` can be written to here at all, despite being
 * explicitly append-only (`shelter-history.ts`'s own doc comment): this is
 * the one case Oleksii's decision creates, an in-place edit of the `email`
 * field alone — `kind`, `at`, and every other field stay untouched, so the
 * history still reads correctly; only the one field GDPR Art. 17 is
 * actually about is replaced.
 *
 * Raw SQL for the join and the final count, read through `executeRows` (not
 * a typed `.select()` chain): the shape here — three CTEs feeding a final
 * scalar count, with an arbitrary caller-supplied condition spliced into the
 * first — has no natural Drizzle builder expression, and the two drivers
 * this repo runs return a raw result in different shapes (standing
 * constraints, R1), which `executeRows` is the one place that reads.
 */
export async function eraseUsersAndScrubHistory(
  db: Database,
  condition: SQL,
): Promise<{ erasedCount: number; historyEntriesScrubbed: number }> {
  const kinds = ADMIN_EMAIL_HISTORY_KINDS;
  const kindList = sql.raw(`(${kinds.map((kind) => `'${kind}'`).join(", ")})`);
  const rows = await executeRows<{ erased_count: number; scrubbed_count: number }>(
    db,
    sql`
      WITH erased AS (
        DELETE FROM "auth_user"
        WHERE ${condition}
        RETURNING "id", "email"
      ),
      targets AS (
        SELECT DISTINCT e."id" AS user_id, e."email" AS email, s."id" AS shelter_id
        FROM erased e
        JOIN "auth_invitation" ai ON lower(ai."email") = lower(e."email")
        JOIN "shelters" s ON s."organization_id" = ai."organization_id"
      ),
      scrubbed AS (
        UPDATE "shelter_history"
        SET "entry" = jsonb_set("entry", '{email}', to_jsonb(${ERASED_ADMIN_EMAIL}::text))
        WHERE "kind" IN ${kindList}
          AND EXISTS (
            SELECT 1 FROM targets t
            WHERE t.shelter_id = "shelter_history"."shelter_id"
              AND lower(t.email) = lower("shelter_history"."entry"->>'email')
          )
        RETURNING "id"
      )
      SELECT
        (SELECT count(*)::int FROM erased) AS erased_count,
        (SELECT count(*)::int FROM scrubbed) AS scrubbed_count
    `,
  );
  const row = rows[0];
  return {
    erasedCount: Number(row?.erased_count ?? 0),
    historyEntriesScrubbed: Number(row?.scrubbed_count ?? 0),
  };
}

/** The condition for erasing one specific, accepted admin — `registry.admins.remove`'s own case. */
export function eraseOneUserIf(userId: string): SQL {
  return and(sql`${authUser.id} = ${userId}`, NOT_ELSEWHERE_IN_USE) as SQL;
}
