# Review: 3136e7c (registry handlers, support mode, RG-Q9 guard), Tier 1, synchronous

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Ran the touched suites against opika_review2: db 17/17, web 212/212 (below) | The full `pnpm check`: the WIP commit body pastes no output and no `mutation:` lines
Access: registry.* is super_admin only; support_view gets 403 on registry and shelter writes (access test, read and ran) | Every one of the builder's 12 mutations. My one spot-check (removeMember deleting every session) was refused by the permission classifier, so no mutation was run by me
RG-Q9 guard: the full path, the two live conditions, the failure text naming the copy keys (read and ran) | neon-http behaviour of every new raw-SQL statement
RG-Q6, RG-Q5, RS-Q1, RG-Q8 against the inbox verbatims (read handlers and tests) | That `updateVerifiedData` with an unknown city returns 500 (worked out from the FK; not run)
STOP #5 items (support cookie, registry cursors, LOCATION_HMAC_SECRET) checked: they stay within RG-Q4, RG-Q10 and decision #15 |

FINDINGS (most severe first)
1. [High] registry-writes.ts `donationDecisionPlan` and inbox RG-T4: "a race never approves an unseen link" is false. The guard is against the handler's *own* first read. `donation.approve`'s input is only `{shelterId}`.
   Failure scenario: the operator opens byId and sees link A. The shelter proposes B. The operator taps approve. The handler's first read sees B, so B goes live, and the operator never saw it.
   Evidence: procedures.ts:392, `registryShelter.input(shelterRef)`. The test comment at registry.test.ts:570 ("the link they looked at") claims the same thing. Shelters can't sign in today (the production 503), so nobody is exposed yet. Fix: correct RG-T4 and the comment now, and add a Tier 1 inbox row for `expectedVersion` (or an expected URL) on donation.approve/reject. That is a contract change, so it needs Oleksii. It must be settled before the invite PR.
2. [Med] registry-writes.ts `registryUpdateVerifiedData`: an exact_address with an unknown `cityId` hits the FK `shelters.city_id → cities` and comes back as a 500. `shelters.create` checks this and answers 400 (RG-T5); the update path does not.
3. [Med] registry-invitations.ts `invite` and `registryAdminsResendInvite`: the invitation write and its `admin_invited` / `admin_invitation_resent` history are separate statements. A crash between them leaves an unrecorded write. That contradicts removeMember's own rule, "an unrecorded one never happened". Also, on a create-time race the shelter persists but the operator gets ALREADY_A_MEMBER, so a retry creates a duplicate shelter. RG-T6 records the admin-less shelter but not the misleading refusal.
4. [Low] support.ts `exitSupport` doc comment: "a view already ended (idle, replaced) is left either way" can't happen. An ended view resolves to super_admin, and the matrix answers 403 (pinned: kabinet-registry-access.test.ts, "super_admin outside support → 403"). After 30 idle minutes, «Вийти з режиму» returns 403 and the dead cookie stays. Fix the comment, or change the matrix (Tier 1).
5. [Low] Tests that are weaker than their names:
   - The removeMember test seeds one session only, so deleting *all* sessions would stay green. Add another user's session and assert it survives.
   - The 503 test is named "every registry call" but covers 2 of 18.
   - The access test's "writes nothing" checks only shelters and history, not support_sessions or auth_invitation.
6. [Note] Neon: deferring is acceptable only because the kabinet is unreachable in production. Name each statement in h2-next-prs' real-Neon item:
   - the applyAuditedMany VALUES/CROSS JOIN and the animals CTE
   - removeMember's double delete
   - withdrawPending
   - createWithHistory
   - touch's `make_interval`
   - the S1 row-comparison keyset

   The PR body must list them as unverified on Neon.

SIMPLIFICATIONS
- kabinet-invitation-repo.ts `historyValues`, kabinet-shelter-repo.ts createWithHistory, applyAuditedMany: three copies of the history-row SQL. Make it one helper. If this is wrong, a jsonb double-encode fix lands in one copy only.
- cursor.ts `RegistrySheltersPosition` duplicates the repo's `RegistryListPosition`, which forces the `after as Parameters<…>` cast in registry-router.ts. Use one type.

TESTS
packages/db (2 files): 17 passed. apps/web (9 touched files): 212 passed. These are scoped counts, not the workspace total.

---

# Re-review (pass 2): the uncommitted fix delta on top of 3136e7c

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Read the delta for F1-F6 and both simplifications | The builder's mutations (check removed, history dropped, delete-all sessions). In pass 1 the permission classifier refused me the same kind of worktree edit, so I did not retry it. Each test I read does assert the thing its mutation breaks
F1: the registry-writes.ts comment, the test name and comment, and RG-T4 now state the true property. RG-Q12 is open as Tier 1. The contract is unchanged | That the create-time race returns the admin-less view: no test, as disclosed
F2: the new 400 test asserts both the status and that the address is unchanged | Neon: unchanged from pass 1. Every listed statement is still local-only
F3: invite and resend history are written in one statement (CTE off the invitation insert/update). The resend test asserts `admin_invitation_resent` at `later` |
F5: the removeMember test leaves exactly `["sess-op"]`. The 503 test covers all 18 paths and would fail on 400/403 too. The access test asserts no support_sessions, auth_invitation or auth_user rows |
`shelter_history.id` is `text`, so UNION ALL resolving the unknown-typed params to text inserts cleanly. Multi-entry test green |
Ran the touched suites (below) |

FINDINGS
1. [Low, attribution] h2-next-prs.md:36-37 says "(Oleksii, 2026-10-13: on `rehearsal-0011`, after 0011, before production)". The nearest verbatim source is RS-R1. It says to freeze 0011 "before any rehearsal" and to check the journal hash "on the rehearsal branch". It names no `rehearsal-0011`, and it does not say to run these statements there. Correct wording: "(sequence per RS-R1: on the rehearsal branch, after 0011 is frozen, before production)", or cite the message where he said it. Paperwork only; not blocking.
2. [Low] `createInvitation` and `resend` take `history` as optional, and the only no-history calls are in tests (auth.test.ts:572/611, kabinet-invitation-repo.test.ts:203/208). A future production caller could again write an invitation with no history line. Make `history` required and update those four call sites.

SIMPLIFICATIONS
- kabinet-shelter-repo.ts:208 `appendHistory` now has zero callers. Remove it. Nothing breaks: grep finds no other use.

TESTS
packages/db (kabinet-registry-repo, kabinet-shelter-repo-many, kabinet-invitation-repo): 30 passed. apps/web (registry, kabinet-registry-access, registry-cursor, support, no-self-serve-yet): 62 passed. These are scoped counts, not the workspace total.
This is pass 2 of 2. The notes above become follow-ups, not blockers.
