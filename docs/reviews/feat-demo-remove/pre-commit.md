# Review: feat/demo-remove (uncommitted), Tier 1 synchronous

VERDICT: STOP

VERIFIED | TAKEN ON TRUST
---|---
db suites: `demo-remove.test.ts` + `verify-locations.test.ts` 21/21 | `pnpm check` green (2584 unit / 226 harness): no commit yet, so no pasted output. It must go in the commit body
web suites: api, use-feed-deck, no-self-serve-yet 71/71 | Phase 0 list contents ("exactly as listed"): not in the repo, so I can't see what it named
Mutation: drift check off → red, but only on the message (`Failed query: delete from "shelters"`): the FK rolls back anyway | Other builder mutations (no_real_shelter, member NOT EXISTS, members guard, swipe 404)
Mutation: skip trigger on `auth_user` + drift off → `promise resolved "{ kind: 'removed' }"`: the guard's real case | postgres-js on Neon (pooled or direct, interactive tx): the rehearsal is the Neon check. Unverified until it runs
Scratch test: a user with a live pending real-shelter invite gets deleted (`USER LEFT 0`, invite left behind) | `--prod` read/write wording (read prod-guard, didn't run the CLI)
DR-T2 equivalence: correct. The crossing refusal runs in the same tx, before the deletes |

FINDINGS (most severe first)

1. [STOP] demo-remove.ts TARGETS.support_sessions. This deletes `support_sessions` rows. RS-Q0, verbatim from Oleksii: "Rows never deleted." The schema comment (`schema/auth.ts:187`) says the same. The FK doesn't cascade, so a demo shelter can't go without this. DR-B1 doesn't mention RS-Q0. That is a silent resolution, and the comment is now false.

2. [High] demo-remove.ts `demoOnlyUserIds`. The rule misses links by email. A user created by a demo invitation who has since been invited to a real shelter (pending, by email) passes every NOT EXISTS check and is deleted. The real invitation survives with no user behind it, and sign-up is off, so it can never be accepted. `kabinet-invited-users-repo.ts:73/103` excludes exactly this case (an earlier review finding). Answer 2 says "only link". Fix: `NOT EXISTS auth_invitation WHERE email = user.email AND organization_id NOT IN demoOrgs`, with any status, plus a test.

3. [Medium] demo-remove.test.ts, rollback test. The trigger sits on `shelter_history`. Skipping it already FK-fails the shelters delete, so the test can't show the drift check prevents a partial commit. Move the trigger to `auth_user`, as above.

4. [Low] Uncounted cascades. Deleting demo invitations also removes the `invitation_created_users` row of a user who survives (`movedOn`). Deleting users removes their `auth_session` and `auth_account` rows. None of these is printed, and "second run all zeros" doesn't cover them. Count them or name them in the runbook.

5. [Low] docs/onboarding-a-shelter.md. The runbook omits three things the code does: the reverse crossing-reveal refusal, the NODE_ENV=production refusal, and that live swipes during the run cause a rollback (just retry).

SIMPLIFICATIONS
- demo-remove.ts, the `auth_member` delete step: the members refusal makes it always 0. Keep the count for the guard and drop the delete. If that's wrong, the drift check catches the leftover members.
- use-feed-deck.test.tsx, new test: it duplicates "a swipes.record failure does not block…" with only the error type changed. Fold it in as a case.

STOP REASON
Deleting support_sessions contradicts RS-Q0's "Rows never deleted". This clears in one of two ways:
- If the Phase 0 list Oleksii approved named support-session deletion explicitly, quote that line in DR-B1, record that it overrides RS-Q0 for demo shelters, and update the schema comment.
- If it didn't, Oleksii has to choose: delete them; keep the demo shelters' audit rows (which means the shelter can't be deleted, or support_sessions needs a schema change); or move them to an archive.

DR-T1 honours HS-Q7/IN-Q13's intent: the script is delete-only and pinned by the test.

TESTS
db: 2 files, 21 passed. web: 3 files, 71 passed.
