# Review: feat/h2-invite consolidation (HEAD 2a24a54, base 5453e3c)

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Union check: simulated the three old tips merged (`git merge-tree`: 411a30a + 2daeddc over e8db018, + ccdaa5c over d1743a3, + origin/main over ccd9301), then diffed that tree against HEAD. Every difference is a conflict hunk resolved as the union of both sides, or one of the two rebase-fix commits / the 009bae5 fold. Nothing lost, nothing duplicated | Full `pnpm check` / harness green (1975 unit; 221 passed / 3 skipped; port 3425): not re-run, as instructed
uk.ts / en.ts: #93's `shell`…`signOutDisabled` block kept, then `email`, `signInCard`, `confirm`, `history` each appear once. No duplicate keys, no conflict markers | 1bcdb6f's mutation (`auth_member` insert skipped → "/kabinet after sign-in Expected: 200 Received: 404"): harness not run
copy-status.test.ts: #93's block plus the IN-Q5, IN-Q11 and IN-Q14 describes, each once, braces balanced; 19/19 pass | Second `next start` leaves no process behind (it runs outside #92's orphan check, which only watches the harness port)
package.json: `test:harness` = `node ./test/run-harness.mjs` AND `email:delivery-test` present. playwright.config.ts: `harnessPort()` ORIGIN, `BETTER_AUTH_URL: ORIGIN`, secrets moved into harness-env.ts | 
Inbox: every IN-E1..E15, IN-Q0..Q14, IN-T1..T8 row appears exactly once (IN-Q2 appears twice in all three old tips too, so the rebase didn't cause it) | 
7de3300: page.tsx still calls `kabinetAuthOrNotFound()` first, before `getDb()`. Mutation: `kabinetAvailabilityOrNotFound` returns instead of calling `notFound()` → 4/4 red, both routes named ("/kabinet … expected 'undefined' to contain '404'", same for /kabinet/vkhid). Restored | 
1bcdb6f: `no-self-serve-yet.test.ts` only scans `SOURCE_ROOTS` = `*/src`, and its header says "nothing outside tests can create one", so a harness insert is inside that intent. The harness DB is `assertDisposableTestDatabase(testDatabaseUrl("harness"))` and the shelter is seeded fiction. No production path | 
#93 behaviour: the email work changes no #93 consumer. `shelter.profile.get` reads neither `invites` nor `linkBaseURL`; nothing in #93 used `ALREADY_A_MEMBER` or `ShelterAdminViewSchema` as an output | 

FINDINGS (most severe first)
1. [medium] docs/decisions-inbox/feat-h2-invite.md:42-44 vs feat-h2-admin-joined.md — IN-Q12, Q13 and Q14 are now in one branch, in two files, with opposite statuses (`open` in one, `answered` in the other).
   Failure scenario: the PR merge appends both files to the main table, giving the same ID twice, once open and once answered.
   Evidence: grep of both files on HEAD. Fix: mark the feat-h2-invite.md rows as answered, pointing at the admin-joined rows, or merge the two files.
2. [low] docs/h2-invite-copy-sheet.md:62,92 — two sections are both headed "## C." (the sign-in card fallback, and the confirm page). Each old branch used letter C on its own; the union put them side by side. uk.ts and copy-status.test.ts cite "sheet C" for the confirm page, which is now ambiguous. Rename one of them.
3. [low] uk.ts `signInCard` comment ("Rendered by the screens PR"), IN-T6 ("restyle once the screens PR lands") and copy sheet C and L ("screens PR") — #93 *is* the screens PR and is merged. It renders neither `notArrived` nor the confirm restyle, so these obligations now point at a PR that has already shipped. Re-bind each one to a named follow-up.
4. [low] The commit bodies record `pnpm check` on "Node 22.22.3; engines want 24". #90 pins Node 24, so the green run is evidence on the wrong major. CI on 24 is the real gate.
5. [info] The 009bae5 fold is fine. Its stale counts (1823) and its "no-referrer" wording describe that commit's moment. This doesn't matter if the PR is squash-merged as #89–#93 were. Note that 659b499..944086a do not typecheck on the new base (7de3300 says so itself), so the rewritten commits are not bisectable.

SIMPLIFICATIONS
- apps/web/src/app/kabinet/page.tsx:23-24 — computes availability twice. Call `kabinetAvailabilityOrNotFound()` once, then `kabinetAuth()`. If this is wrong, the page's 404 would follow `kabinetAuth()`, and available-auth.test.ts catches that (mutated above).

TESTS
- packages/i18n copy-status.test.ts: 1 file, 19 passed
- apps/web available-auth, layout, home-page, auth, confirm-route: 5 files, 68 passed
- Mutation run: 4 failed, as expected; file restored, tree clean
