# Decisions inbox: feat/gdpr-admin-erasure

Row for the shared table (`docs/decisions-inbox.md`), appended at merge.

Oleksii's words below were sent directly to this session (2026-10-24), not relayed through
another agent. The quotation is verbatim.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| GDPR-F1 | 2026-10-24 | `docs/gdpr-analysis.md` §5 item 4 — a shelter admin removed from a shelter that keeps operating has no erasure path (G4) | Which of the three options (full erasure on removal; erasure plus a time-boxed email retention; no deletion, a documented legitimate-interest position)? | A · B · C | A, recommended | Verbatim: "GDPR departed-admin erasure: A. Delete the account (when it has no other membership) and scrub the email in that shelter's admin history entries to the placeholder, at the moment of removal. Tier 1. Document it in the privacy text and docs/gdpr-analysis.md." Widened same day, verbatim: "whenever an admin's or invitee's account is deleted, by any path … their email is scrubbed from that shelter's history entries in the same transaction as the deletion. One shared mechanism, not three copies. … A structural check fails if a new user-deletion path appears without the scrub." A third brief, same day, verbatim: "The email join must compare normalised addresses, exactly as invitations and users store them (lowercase/trim). Test with a differently-cased address. It must only ever scrub entries belonging to the deleted account, and a test proves another person's entries with a different email stay untouched." A fresh Tier 1 reviewer, pinned to the first pushed head (`4412085`), returned STOP: the sentence was still false in two reachable states (see below). His STOP decisions, verbatim: "A: scrub auth_invitation.email in the same statement as the rest. Test that no row anywhere still holds the address after the erasure (invitations, history, users)." / "A, generalised: replace the trigger-specific conditions with one invariant: a non-operator account with no shelter membership and no live invitation is erased (account deleted, email scrubbed from every shelter's history and from invitations), whether or not it ever signed in. The three paths (removal, withdrawal, expiry) all just check this invariant through the shared mechanism. Update RG-Q3 accordingly, with my decision quoted. Tests include signing in after the invite expired → erased on the next sweep." / "A: add the expired-invitation sweep to the existing auth clean-up schedule. A dormant shelter's dead invitee is erased without any kabinet action. Test it with fake timers." / "The former operator: no code change. Document in docs/gdpr-analysis.md that an account with any operator grant, active or revoked, is outside this mechanism (operator audit trail), and that today that's only me." A fresh Tier 1 delta review of the STOP's fix, pinned to `abe951c`, returned PASS WITH NOTES; reproduced both of the first reviewer's blockers as fixed and all five of the builder's mutation-test claims, plus two of its own. His smoke on PR #198 (a child branch, then production dry-run) found one real address, fine to erase, and confirmed the 4-CTE statement runs cleanly over neon-http. His merge instruction, verbatim: "Merge #198 after the >/>= boundary fix (one shared comparison for erasure and accept, a test at the exact expiry instant), on green CI, with no further smoke if that's all it changes." His own `/pro` sentence, dictated and revised across several rounds of word-for-word checking against the code, landed as `ADMIN_ERASURE_SENTENCE`. | **Built (first pass, STOPped):** `eraseUsersAndScrubHistory` (`packages/db/src/repos/admin-erasure-repo.ts`), routed from both `registry.admins.remove` (accepted admins) and `kabinetInvitedUsersRepo.deleteCandidates` (withdrawn/expired invites, including the standalone `admin:sweep-invites`), with `auth-user-deletion-scan.test.ts` as the structural check. Two real gaps found and fixed by word-for-word checking, not glossed over: the "no live invite elsewhere" guard was missing from the sentence (now named directly — "і не запрошена до нього"), and the scrub itself only ever touched the *first* shelter an email was invited to (`invitation_created_users` being a fixed one-row-per-account link) until the join moved to email, closing a real multi-shelter gap with its own mutation-tested regression test. Both email comparisons in `eraseUsersAndScrubHistory` now go through `lower()`, tested with a differently-cased address and with a second admin's untouched entries, both mutation-tested. A builder decision (not his own ask): the same bare-`=` risk in `kabinet-invited-users-repo.ts`'s own "live invitation elsewhere" guard was fixed the same way, with its own mutation-tested regression test.<br><br>**STOP found two blockers in that build.** Finding 1: `auth_invitation.email` was never touched by the mechanism, so a deleted address survived on every invitation it was ever sent — "адреса пошти видаляються" was false in every real case. Finding 2: the clean-up only ever deleted a user with `firstSessionAt IS NULL`, so anyone who ever signed in (reachable — a magic link accepts any existing user, expired invitation or not) was never erased, contradicting "запрошення так і не прийняли … видаляються."<br><br>**Built (the STOP's fix):** a fourth CTE, `invitations_scrubbed`, scrubs every `auth_invitation` row matching a deleted user's email, any shelter, any status, independent of the history scrub. `NOT_ELSEWHERE_IN_USE` plus a new `noLiveInvitationElsewhere(now)` became one shared invariant, `erasableIf(userId, now)` (replacing the narrower `eraseOneUserIf`), used identically by every real deletion path — `kabinetInvitedUsersRepo`'s `firstSessionAt`/dead-invitation-specific filters are gone entirely. The auth-cleanup cron (`apps/web/src/kabinet/auth-cleanup.ts`, already running every 6 hours) now also sweeps every organisation's dead invitees, logging only a count. Decision 4 needed no code change, only the doc note above. All four mutation-tested (the invitations CTE, its own `lower()`, `erasableIf`'s live-invitation check, the `firstSessionAt` removal, and the cron's sweep call — each reverted and confirmed red). A genuine test-fixture gap, not a product bug, surfaced along the way: `registry.test.ts`'s `acceptedAdmin()` helper never flipped the test invitation to `accepted` the way the real accept flow does, so it looked, correctly, like a live invitation elsewhere once `erasableIf` started checking for one — fixed with a small test-only helper, not by weakening the invariant.<br><br>**Delta review: PASS WITH NOTES, then his own real-Neon smoke, then the boundary fix.** `docs/gdpr-analysis.md` records the full decision, the STOP, the delta review's notes, his smoke results and the boundary fix in full |

## Non-blocking follow-up notes (batched, not blocking merge)

A fresh Tier 1 delta review, pinned to the STOP's fix (`abe951c`), returned **PASS WITH NOTES**.
Reproduced all five of the builder's mutation-test claims (each went red as described) plus two
of its own, and found no new blocker. Oleksii then ran his own real-Neon smoke (a child branch,
then a production dry run) and confirmed the mechanism itself is sound, directing one fix before
merge (item 4 below, now done) and deferring the rest to a later batch, per `CLAUDE.md`'s "only
blockers loop":

1. **Medium, tests-only.** `ADMIN_EMAIL_HISTORY_KINDS` (`packages/domain/src/shelters/history.ts`)
   has no test tying it to the actual set of history kinds that carry an `email` field — the
   reviewer removed `admin_invitation_resent` from the list and every suite stayed green.
2. **Medium, tests-only.** `auth-cleanup.test.ts`'s "never logs an address" assertion only ever
   runs with `erasedInvitedUsers: 0`; the dormant-invitee test never reads the log at all, so a
   future change that logged an erased address there would go uncaught.
3. **Low, docs.** The comment at `registry-invitations.ts:400-405` (and the PR's own body) calls
   the withdrawn-pending erasure "immediate." It isn't when a *different* shelter's invitation
   created the account (invited at A, A's invite dies, re-invited at B, withdrawn at B — B-scoped
   clean-up finds nothing; only the global cron sweep erases it, within 6h). `ADMIN_ERASURE_SENTENCE`
   itself still holds, since it makes no timing claim.
4. **Low, new in the STOP's fix — fixed before merge, per Oleksii's own instruction.**
   `noLiveInvitationElsewhere` (`admin-erasure-repo.ts`) treated an invitation as live only while
   `expires_at > now`; the accept flow's own live-invitation check
   (`kabinet-invitation-accept-repo.ts`) uses `>=`. At exactly the expiry instant, a user could be
   a clean-up candidate while the accept would still succeed. His fix, verbatim: "one shared
   comparison for erasure and accept, a test at the exact expiry instant." Built:
   `invitationNotExpiredAt(now)` (`packages/db/src/repos/invitation-liveness.ts`), a single
   shared SQL fragment. While extracting it, two *more* sites with the identical bare-`>` gap
   were found — `kabinetInvitationRepo.roleOfAddress`'s "invited_elsewhere" refusal and
   `superAdminRepo.grant`'s "invited_admin" refusal — both guard the same one-role-per-person
   invariant (RG-T10) with the same "is this invitation live" question, so a builder decision
   (beyond his own ask) closed all four sites rather than leave the "shared comparison" only
   partly shared. Tested at the exact expiry instant on the erasure side
   (`admin-erasure-repo.test.ts`, "still treats an invitation elsewhere as live at its exact
   expiry instant") and confirmed to share the fix with the accept side's own pre-existing
   boundary test — a single mutation (reverting the shared helper's `>=` to `>`) turned both
   red simultaneously. `roleOfAddress`'s and `grant`'s own boundary behaviour changed too (same
   direction, same fix) but have no dedicated boundary test of their own yet — low cost,
   deferred to the batch rather than expanding this PR further.
5. **Low, docs.** `kabinet-invited-users-repo.ts:96`'s comment ("a sign-in … keeps the user") is
   stale, describing the pre-STOP rule. The shared `docs/decisions-inbox.md` table itself (not
   just this branch's own row) should get the RG-Q3 amendment noted once this merges.
6. **Low, scope.** Oleksii's "Test it with fake timers" was implemented with an injected `now`
   instead (equivalent, deterministic, matches this codebase's own "`now` is a parameter" rule) —
   a reasonable builder substitution, but it should have been recorded under "Decisions taken" in
   the PR rather than only in a test comment.

Also noted, not fixed (very low cost, tracked for the batch rather than slipped in unreviewed):
`no-self-serve-yet.test.ts`'s "only … SET email" test would stay green even if a second write
(e.g. a `status` column) were added alongside the email scrub — it checks the write is an
`UPDATE`, not that it touches nothing else.
