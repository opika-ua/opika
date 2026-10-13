# Review: uncommitted working tree vs e4a61aa (migration 0011 regenerated, invite/cleanup repos, session hook)

VERDICT: PASS WITH NOTES (Tier 1: fix finding 1 before committing, then re-review the delta)

| VERIFIED | TAKEN ON TRUST |
|---|---|
| The re-invite probe (scratch test, deleted afterwards). Invite A creates U and links it to inv1. inv1 expires. Re-inviting the same address reuses U (`createdUser:false`) and creates inv2. `cleanupCandidates` returns U against inv1, and `deleteCandidates` removes it (1 row) while inv2 is still `pending` and unexpired. Finding 1 | The single `WITH … INSERT … RETURNING` + `INSERT … SELECT` statement on neon-http. It is plain Postgres with no result-shape parsing, but it has never run against Neon (standing constraint). Run it on the RS-R1 rehearsal branch |
| The super_admin probe. One candidate holding a `super_admins` row makes the whole DELETE throw a raw FK error, and the other candidate is not deleted. Finding 2 | That an error thrown by the `session.create.after` hook doesn't break or half-complete a sign-in |
| Mutation spot-check. I copied the repo to a scratch file without the `NOT EXISTS auth_member` re-check. A membership-holding user is then deleted: `expected 1 to be +0`. Killed. The builder's mutation (hook removed) was not re-run | That the regenerated 0011 has run on no Neon branch (RS-R1) |
| Concurrent probe: two `invite()` calls for the same new address. One fails with a raw `auth_organization` insert error. Finding 3 | |
| Cascade on deleting an invited user: auth_session, auth_account, auth_member and invitation_created_users. `auth_invitation.inviter_id` cascades on the inviter, never the invitee (invitee is email-only), so no invitation the operator wants is lost. Read from the schema | |
| `no-self-serve-yet.test.ts` scans auth_member and auth_invitation writes only (read) | |

## Findings

1. **[high]** `kabinet-invited-users-repo.ts` `cleanupCandidates`/`deleteCandidates`: these key on the one invitation that created the user, not on whether any invitation is still live. Failure: invite → expiry or revoke → re-invite the same address → the lazy clean-up on `registry.admins.*` deletes the user. Because magic link has `disableSignUp: true`, the invitee can then never sign in to accept the pending inv2. Evidence: the re-invite probe above. Fix: exclude (in both the SELECT and the DELETE re-check) any user whose email has a pending invitation with `expires_at > now`, or re-point `invitation_created_users.invitation_id` on reuse. Both only narrow the approved deletion. Record which one in the inbox. Add the re-invite case as a test.
2. **[medium]** `deleteCandidates`: it doesn't exclude users with a `super_admins` or `support_sessions` row, and both FKs have no cascade. One such user aborts the whole batch with a raw DB error. Latent today because `admin:grant` doesn't exist yet. Add `NOT EXISTS super_admins` to both queries, or delete per user.
3. **[low]** `invite()` calls race: `ensureOrganization`'s comment says "the loser's org is left unlinked", but slug = shelterId is unique, so the loser throws on insert instead. The code predates this diff, but `invite()` is now its caller. A partial failure (invitation written, user insert fails) leaves an orphan pending invitation with no user. A retry creates a second invitation, which is harmless. Pending invitations are never de-duplicated per (org, email).
4. **[low]** `kabinet-invitation-repo.ts:22-24`: the comment says "only one that creates … an invitee's user. A test scans the source tree and fails if anything else does". No test scans `authUser` inserts. Either add the regex to `no-self-serve-yet.test.ts` or drop that clause.

## Simplifications

None.

## Tests

packages/db: kabinet-invitation-repo, check-migration-hashes, undo-backfill: 3 files, 19 passed.
apps/web: auth.test.ts, no-self-serve-yet.test.ts: 2 files, 37 passed.
Scratch probes: 4, removed. The mutant was killed.
