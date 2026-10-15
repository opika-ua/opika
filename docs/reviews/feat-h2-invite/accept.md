# Review: automatic invitation accept (IN-Q12/Q13/Q14), uncommitted on 9aa7e8b

Tier 1, synchronous. Reviewer: opika-reviewer.

VERDICT: STOP (one design decision with no mock; plus one merge-gate verification that is Oleksii's to run). The code itself is sound.

VERIFIED | TAKEN ON TRUST
--- | ---
Touched suites green: db accept-repo + neon-smoke 19/19; web invitation-accept, confirm-route, auth, no-self-serve-yet, JoinFailedCard 72/72; i18n copy-status 20/20 | Builder's full `pnpm check` (2006 unit / harness 221), read from msg-accept.txt + check-accept.log, not re-run
`tsc --noEmit --incremental false` clean in apps/web and packages/db; biome: no findings in new files | neon-http error shape (`constraint`, wrapped in Drizzle's `cause`): smoke step 15 written, never run on Neon
Races, with a second real connection (scratch test, deleted): (a) same invitation, write held open in tx B, A blocks then `not_written`, 1 member/1 history; (b) two shelters, A blocks on the unique index then `membership_conflict`, A's invitation stays pending, 1 member/1 history; (c) invitation canceled in an open tx, A blocks then `not_written`, 0/0; (d) two `accept()` calls in parallel: one `accepted`, one `nothing_to_accept` | `/kabinet` page.tsx wiring of `selfHealingIdentity`/`JoinFailedCard`: read only, no harness case (the builder says so too)
The CTE: the member insert selects `FROM "accepted"`, history `FROM "joined"`, so an update that matches nothing inserts nothing. One statement, so any error rolls back all three. `shelters.organization_id` is unique, so the history join yields exactly 0 or 1 rows. Every rule the read checks is checked again inside the UPDATE | Better Auth's verify body shape on future upgrades (pinned today by "is given Better Auth's own user")
The user id comes from Better Auth's verify response only after `status===200 && cookies`. A refused verify never calls the accept (test). Self-heal runs only for `no_role` with a session userId, and email+verified are matched in SQL, so nobody can accept someone else's invitation |
Mutations run by me: MEMBERSHIP_INDEX renamed → "maps the one-membership index…" red (PostgresError 23505 auth_member_user_id_unique). Status check dropped from UPDATE → "writes nothing when the invitation stopped being pending…": expected written to equal not_written. Second writer (raw `INSERT INTO auth_member` + `.update(t.authInvitation)`) in a temp file → both guards red, naming the file. All restored, tree checked |
Builder's mutation list (16 entries) is present and each one describes a concrete break and its failure text |

FINDINGS (most severe first)
1. [STOP #7] apps/web/src/features/kabinet/JoinFailedCard.tsx:24 and confirm-route.ts `join_failed`: there is no mock for the "signed in, join failed" state, and the heading reuses `kabinet.confirm.title` ("Sign in to the shelters' cabinet") for someone who *is* signed in.
   Failure scenario: an accept fails → the person reads "sign in" above "couldn't join" and may think the sign-in failed too, which IN-Q12 says must not happen. Not resolved here, as instructed.
2. [merge gate] kabinet-invitation-accept-repo.ts:62 `membershipConflict`: correct on postgres-js (I mutated it and the test failed), but the neon-http branch (`cause.constraint`) is unexercised. Per "Local Postgres and Neon are not the same database", this is unverified until `db:neon-smoke` step 15 runs on Neon. If it is wrong, a production race returns a 500-free `failed` instead of `address_has_a_role`: degraded, not dangerous.
3. [low] no-self-serve-yet.test.ts "two writers" guard is a file allowlist. The accept module could later *insert* or *delete* `auth_invitation` and stay green. Add one assertion: the only `auth_invitation` write in ACCEPT_MODULE is `.update(authInvitation)`.
4. [low] JoinFailedCard.test.tsx:24: focus-visible and 56px are checked as className substrings. That is a shape check, and no harness renders the state. Record it as asserted, not verified, in the PR ledger.
5. [info] The operator `NOT EXISTS` uses the statement snapshot. A grant committed concurrently can slip past it, because no index backs that rule. This is a residual risk, not a bug at this scale.

SIMPLIFICATIONS
- packages/db/src/repos/index.ts: drop the `AcceptableInvitation`/`AcceptPlan` re-exports. Nothing outside the module imports them, so nothing breaks.

STOP REASON
Decisions needed from Oleksii, ranked:
(1) The design of the failure view: approve the K1-card reuse, and give a heading. Recommend a new `[COPY PENDING]` key, e.g. `kabinet.confirm.joinFailedTitle`, rather than the sign-in title.
(2) Run `db:neon-smoke` (step 15) against Neon before merge, or authorise it to be run.

TESTS
db 19 passed (2 files); web 72 passed (5 files); i18n 20 passed (1 file); scratch race test 4 passed (deleted).
