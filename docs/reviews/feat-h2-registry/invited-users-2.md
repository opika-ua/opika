# Re-review (delta only): fixes for invited-users.md findings 1-4, uncommitted tree on e4a61aa

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Rendered SQL (toSQL probe). The aliased subquery renders as `FROM "auth_invitation" live WHERE live.email = "auth_user"."email"`, so the outer column is table-qualified and can't silently resolve to `live.email`. `now` is bound as a parameter, not interpolated | The builder's two other mutations (the delete's live clause, the super_admins clause). They are recorded and described as real breakages, but I didn't re-run them |
| Over-exclusion probe: A has a dead invitation, B has an unrelated live one. A is still a candidate and is deleted (1) | The new NOT EXISTS clauses on neon-http. They are plain SQL with no result-shape parsing. Same Neon residual as pass 1 (RS-R1 rehearsal) |
| Case probe: invite "Olena@Example.org", then re-invite "OLENA@example.ORG". Shielded, because both `createInvitation` and `invite` trim and lowercase. The registry is the only writer of `auth_invitation` and `auth_user` for invitees | That no other path (the Better Auth user create via another plugin) writes a mixed-case `auth_user.email`. Today magic link has `disableSignUp`, so none exists |
| Revoked re-invite probe: a canceled newer invitation doesn't shield, and the user is deleted (1) | |
| Mutation spot-check: candidates' live clause → `sql\`true\``. The test failed: `never takes a user re-invited since… AssertionError: expected [ { userId: 'user-35', …(2) } ] to deeply equal []` at line 216. Killed | |
| Finding 3 comment (`ensureOrganization`) and finding 4 doc comment: both now match the code (I read them) | |
| RS-T2 inbox row present, marked open and Tier 1 | |

## Findings

1. **[low]** `kabinet-invited-users-repo.ts:103`: the `support_sessions` exclusion has no test. A mutant that removes it survives. The stated reason is "rows can't exist yet", but that doesn't hold for a test. `support_sessions` is in migration 0011 and needs only an `auth_user` and a `shelters` row, both of which the test's `beforeEach` already creates. Insert one directly, the same way the super_admin test inserts `superAdmins`. Failure scenario if unguarded: an operator who was once an invitee and never signed in through the invite gets swept, and the whole batch aborts with a raw FK error. Today that case is unreachable, which is why this is low.

All four pass-1 findings are otherwise resolved.

## Simplifications

None.

## Tests

packages/db test/kabinet-invitation-repo.test.ts: 1 file, 12 passed.
Scratch probes: 4 tests, all passed, file removed. Scratch mutant: 1 failed / 11 passed (killed), files removed.
