import { ADMIN_EMAIL_HISTORY_KINDS, ERASED_ADMIN_EMAIL } from "@opika/domain";
import { and, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { executeRows } from "../raw-rows";
import { authInvitation, authMember, authUser, superAdmins, supportSessions } from "../schema/auth";
import { invitationNotExpiredAt } from "./invitation-liveness";

/**
 * Never a member of any organization, never an operator (a `super_admins`
 * row, active or revoked — Oleksii, 2026-10-24, the STOP decision on the
 * former-operator case: "no code change. Document in docs/gdpr-analysis.md
 * that an account with any operator grant, active or revoked, is outside
 * this mechanism (operator audit trail), and that today that's only me."),
 * never a support-session operator. Shared rather than copied, so a future
 * change to any one of the three (a new role table, say) can't update one
 * caller and miss the other.
 */
export const NOT_ELSEWHERE_IN_USE: SQL = sql`
  NOT EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.userId} = ${authUser.id})
  AND NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${authUser.id})
  AND NOT EXISTS (SELECT 1 FROM ${supportSessions} WHERE ${supportSessions.operatorUserId} = ${authUser.id})
`;

/**
 * No pending, unexpired invitation anywhere for this user's own address —
 * `now` is a parameter, never read from the clock, because eligibility must
 * be evaluated against the same instant the caller's other conditions are.
 * Part of the one invariant `erasableIf` and `kabinetInvitedUsersRepo`'s own
 * clean-up both check (Oleksii, 2026-10-24, the STOP decision, "A,
 * generalised"): "a non-operator account with no shelter membership and no
 * live invitation is erased … whether or not it ever signed in."
 *
 * `invitationNotExpiredAt` (`./invitation-liveness.ts`) is the exact same
 * comparison the accept flow uses for "is this invitation still live" — a
 * bare `>` here, independent of the accept flow's own `>=`, let a user be a
 * clean-up candidate at the exact instant their invitation expired while the
 * accept would still have succeeded (PR #198's Tier 1 delta review, finding
 * 5; Oleksii's fix: "one shared comparison for erasure and accept, a test at
 * the exact expiry instant" — `admin-erasure-repo.test.ts`'s own boundary
 * test).
 */
export function noLiveInvitationElsewhere(now: Date): SQL {
  return sql`
    NOT EXISTS (
      SELECT 1 FROM ${authInvitation} live
      WHERE lower(live."email") = lower(${authUser.email})
        AND live."status" = 'pending'
        AND live."expires_at" ${invitationNotExpiredAt(now)}
    )
  `;
}

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
 * **Widened again** after a Tier 1 STOP (same day) found the mechanism's own
 * `auth_invitation` rows were never touched, so the deleted address survived
 * in plain sight on every invitation it was ever sent — a real gap in "the
 * email is deleted," not a documentation question. Oleksii's fix, verbatim:
 * "A: scrub auth_invitation.email in the same statement as the rest. Test
 * that no row anywhere still holds the address after the erasure
 * (invitations, history, users)." `invitationsScrubbed` below is that CTE.
 *
 * This is that one mechanism. Every real path that deletes an `auth_user`
 * row tied to a shelter's own admin history calls this rather than writing
 * its own direct delete on that table — `registry.admins.remove` (an accepted member,
 * `registry-invitations.ts`) and `kabinetInvitedUsersRepo.deleteCandidates`
 * (a withdrawn-pending or expired-never-accepted invite, called from
 * `registry.admins.remove`'s own clean-up, the recurring auth-cleanup cron,
 * and the standalone `admin:sweep-invites`). `auth-user-deletion-scan.test.ts`
 * asserts these are the only two call sites outside this file and
 * `demo-remove.ts` (which deletes the whole `shelter_history` row alongside
 * the shelter — nothing to scrub, the row itself is gone) — a new one fails
 * that test by name.
 *
 * `condition` is the caller's own eligibility WHERE clause — in practice
 * always `erasableIf(userId, now)` below, or the same invariant applied to a
 * batch of candidate ids (`kabinetInvitedUsersRepo.deleteCandidates`) — this
 * function owns only what every caller needs identically: finding which
 * shelter(s) each deleted user's own admin history belongs to, and every
 * `auth_invitation` row their address was ever sent, and scrubbing both in
 * the same statement as the delete.
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
 * ever received finds all of them, not just the first — `invitationsScrubbed`
 * reuses the same join, independently of `targets`, so it scrubs every
 * matching row regardless of shelter or status, not only the live one (if
 * any) that let `erasableIf` conclude there wasn't one).
 *
 * All three email comparisons (`targets`'s join, `invitationsScrubbed`'s
 * join, and `scrubbed`'s match against the history entry's own stored
 * `email`) go through `lower()` on both sides, never a bare `=`. Every
 * write path normalises (`.trim().toLowerCase()` — `kabinetInvitationRepo.
 * invite`, `admin.ts`'s own `emailArg`), so in practice every stored value
 * already matches case for case; `lower()` is the comparison's own
 * guarantee of that, not a trust in every future write path remembering to
 * normalise first (Oleksii, 2026-10-24 review brief: "compare normalised
 * addresses, exactly as invitations and users store them"). A
 * differently-cased address is tested (`admin-erasure-repo.test.ts`).
 *
 * One statement, four CTEs: the delete, the two scrubs, both-or-neither
 * with the delete (not with each other — `invitationsScrubbed` can touch
 * rows at shelters `targets`/`scrubbed` never reaches, because a dead
 * invitation can outlive every trace of that address ever having a shelter
 * admin history entry there at all). If a user `condition` names turns out
 * ineligible, none of the three scrubs touches anything either, because all
 * of them only ever see rows `erased` actually deleted. `erasedCount` is
 * read from the delete's own `RETURNING`, never from how many rows happened
 * to match elsewhere — those can differ (a departed admin whose shelter has
 * no matching history row is still a real erasure) without ever meaning the
 * delete didn't run.
 *
 * Why `shelter_history` can be written to here at all, despite being
 * explicitly append-only (`shelter-history.ts`'s own doc comment): this is
 * the one case Oleksii's decision creates, an in-place edit of the `email`
 * field alone — `kind`, `at`, and every other field stay untouched, so the
 * history still reads correctly; only the one field GDPR Art. 17 is
 * actually about is replaced.
 *
 * Raw SQL for the joins and the final counts, read through `executeRows`
 * (not a typed `.select()` chain): the shape here — four CTEs feeding a
 * final scalar count, with an arbitrary caller-supplied condition spliced
 * into the first — has no natural Drizzle builder expression, and the two
 * drivers this repo runs return a raw result in different shapes (standing
 * constraints, R1), which `executeRows` is the one place that reads.
 */
export async function eraseUsersAndScrubHistory(
  db: Database,
  condition: SQL,
): Promise<{ erasedCount: number; historyEntriesScrubbed: number; invitationsScrubbed: number }> {
  const kinds = ADMIN_EMAIL_HISTORY_KINDS;
  const kindList = sql.raw(`(${kinds.map((kind) => `'${kind}'`).join(", ")})`);
  const rows = await executeRows<{
    erased_count: number;
    scrubbed_count: number;
    invitations_scrubbed_count: number;
  }>(
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
      ),
      invitations_scrubbed AS (
        UPDATE "auth_invitation"
        SET "email" = ${ERASED_ADMIN_EMAIL}
        WHERE EXISTS (SELECT 1 FROM erased e WHERE lower(e."email") = lower("auth_invitation"."email"))
        RETURNING "id"
      )
      SELECT
        (SELECT count(*)::int FROM erased) AS erased_count,
        (SELECT count(*)::int FROM scrubbed) AS scrubbed_count,
        (SELECT count(*)::int FROM invitations_scrubbed) AS invitations_scrubbed_count
    `,
  );
  const row = rows[0];
  return {
    erasedCount: Number(row?.erased_count ?? 0),
    historyEntriesScrubbed: Number(row?.scrubbed_count ?? 0),
    invitationsScrubbed: Number(row?.invitations_scrubbed_count ?? 0),
  };
}

/**
 * The one eligibility invariant (Oleksii, 2026-10-24, the STOP decision, "A,
 * generalised"): "a non-operator account with no shelter membership and no
 * live invitation is erased (account deleted, email scrubbed from every
 * shelter's history and from invitations), whether or not it ever signed
 * in." Used both for a single, named user (`registry.admins.remove`'s own
 * case, an accepted admin) and, with `userId` swapped for a batch condition,
 * by `kabinetInvitedUsersRepo`'s own clean-up — same three checks either
 * way, so a membership, an operator grant, a support session or a live
 * invitation elsewhere protects a departed admin's account identically
 * regardless of which path is deleting it.
 */
export function erasableIf(userId: string, now: Date): SQL {
  return and(
    sql`${authUser.id} = ${userId}`,
    NOT_ELSEWHERE_IN_USE,
    noLiveInvitationElsewhere(now),
  ) as SQL;
}
