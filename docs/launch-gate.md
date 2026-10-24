# Launch gate — the checklist

One list, pulled from `docs/build-plan.md` Part 5, `docs/decisions-inbox.md` and the branch
inbox files, corrected against `git`/`gh` where the source docs had gone stale. Each item:
owner, status, what "done" means, dependency. Supersedes nothing — `docs/build-plan.md`
Part 5 stays the long-form source, itself corrected in the same pass; this is the flat list
for tracking. The two documents track the same items; reconciling them into one isn't done
in this pass and should be scheduled on its own.

Status key: **DONE** (verified) / **PARKED** (explicitly held, not abandoned) / **OPEN**
(not started or in progress) / **DONE, different scope** (the underlying concern is already
addressed, but by a narrower or differently-scoped mechanism than this row originally named).

Six items in `docs/build-plan.md` and `docs/decisions-inbox.md` were stale when this pass
started, fixed directly in those two files rather than only noted here: the shared-store
rate limiter (already done since 2026-10-06, PR #70); PW1-F5 and PW1-F6 (both already
merged, 2026-10-20, PRs #158/#159); BR-3 (already done, PR #183); location fuzzing (already
wired into every real write path); and the held R4-2 sentence (moved since its 2026-10-06
draft — PR #186 added a saved-list sentence, and this pass fixed its now-stale «Запитати»
to «Написати» only, matching copy audit #19). PW1-F5/F6/F8 (all merged, none previously in
the shared table) are folded into `docs/decisions-inbox.md` in full, with their three
superseded branch-inbox files deleted.

## A. Before the first real shelter or animal record is inserted

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **PG-F3** — `db:migrate` can reach a database the prod guard never checked | Oleksii writes the tests; then a fresh Tier 1 reviewer | **PARKED** — his own instruction, 2026-10-19. WIP on `fix/pgf3-migrate-bypass` (`D:\opika-worktrees\guard`, head `8618428`), 11 named tests missing | Tests written, Tier 1 PASS, merged | nothing |
| **PW1-F5** | — | **DONE** (PR #158) | — | — |
| **PW1-F6** | — | **DONE** (PR #159) | — | — |
| **S8-F5** — a card's real name can come back for a listing that was never actually rendered publicly, in two distinct windows: a shelter paused/suspended after being verified, publishing-then-withdrawing a new card inside that window; *and* a shelter still pending/under_review, publishing-then-withdrawing a card before it's ever verified at all | — | **DONE** (PR #196, merged `2fca25b`) — a per-listing `ever_served_at` fact, set the first time a listing is simultaneously discoverable and its shelter publicly verified, via three exhaustive write-path hooks. Migration `0015` rehearsed and applied to production by Oleksii; a first Tier 1 review (STOP, two blockers plus five further findings, all fixed with mutation-verified tests) and a second Tier 1 delta review (PASS WITH NOTES, non-blocking, batched) both passed. Deployed, and Oleksii's post-deploy `everServed:backfill` run on production closed the migrate→merge deploy window (dry run, then `--commit`, remaining candidates 0) | — | — |
| **Remove every test shelter** before the first real shelter | Oleksii runs; mechanism already built | **DONE, different scope** — superseded by `docs/launch-sequence.md`'s full reset (step 1 empties every table, so every pre-existing test shelter is already gone before step 4 ever creates the one rehearsal shelter this row's own removal step (5) then retires). The ordering is the reverse of this row's original phrasing: removal happens *before* real onboarding (step 6), not after | step 5 of `docs/launch-sequence.md` | — |
| **DMARC to `p=quarantine`** on both records | Oleksii (Cloudflare DNS) | **OPEN.** Runbook fully written (`docs/onboarding-a-shelter.md`) | Both records raised, delivery test passed | Brevo DNS records removed first, same step |
| **Google Postmaster Tools** for `mail.opika.org.ua` | Oleksii | **OPEN**, not done per the repo | Domain verified | nothing |
| **Location fuzzing wired into production** | — | **DONE** | — | — |
| **BR-3** | — | **DONE** (PR #183) | — | — |

## B. Before any route is indexed, one hour earlier: D-7

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **D-5** — the full `test`-profile demo corpus live in production today. His instruction, directly: "Drop D-5: demo data is wiped before any real data, and the flip needs real shelters with the demo gone, so no demo contact is ever indexed." **Superseded by the full reset** (`docs/launch-sequence.md`, Oleksii's own instruction, 2026-10-24): a full reset, not a demo-only wipe, run once personally right after his own dress rehearsal — so no demo data and no rehearsal data ever coexists with real data, closing this concern by construction rather than by timing. **A related, narrower item already exists and isn't closed by that:** `docs/handoff-2026-10-04.md` §3 pulled a version of this same concern forward for the separate, two-shelter `demo` seed profile shown during the dress rehearsal — built and pinned, but its placeholder-format choice (SP-1) is still a default, not his confirmed answer | Oleksii runs `docs/launch-sequence.md`; SP-1 is a separate open item if picked up | **DONE, different scope** for this row's own concern, closed by construction rather than timing; **SP-1 still open** on its own, unrelated track | — | `docs/launch-sequence.md` steps 0–1 |
| **D-7** — write the demo-to-real transition into `docs/standing-constraints.md` and the onboarding checklist | Local agent | **DONE, different scope** — `docs/launch-sequence.md` is this document: a full, ordered runbook (ten steps, each with verification and rollback) rather than a `docs/standing-constraints.md` section, since the full-reset pivot made a one-section write-up too thin for what's now an irreversible, ten-step production sequence. Its own closing section ("D-5/D-7, closed by this document") names exactly what moved and why | `docs/launch-sequence.md` | — |

## C. Before any route is indexed

All three rows below are now one assembled step, `docs/launch-sequence.md`'s step 8 (one
commit, since `assertAnalyticsCopyMatchesGateState` throws at boot if they land out of step
with each other) — the runbook exists; execution is still open.

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **Flip `SITE_IS_PUBLICLY_DISCOVERABLE`** | Oleksii decides the moment; local agent flips + verifies | **OPEN** — currently `false`; runbook ready (`docs/launch-sequence.md` step 8.1) | Flag `true`, tests green, runtime invariant checked | `REGISTRY_HAS_NO_REAL_SHELTERS` already `false` (step 7); shared-store rate limiter (**already true**) |
| **Remove the pre-launch access gate**, in the same change | Local agent | **OPEN** — runbook ready (step 8.1 removes it by flipping the same flag; `proxy.ts`'s gate only runs when the flag is still `false`) | Gate removed/no-ops, verified against a real unauthenticated request; `PRELAUNCH_GATE_SECRET` dropped from env schema same commit (step 8.2) | Same commit as the flip |
| **Land the R4-2 sentence**, same change as the gate removal | Local agent | **OPEN but prepared** — runbook ready (step 8.3); current constant value (with the saved-list sentence and the «Написати» fix already landed) just needs appending to `uk.about.analytics`; the tripwire (`assertAnalyticsCopyMatchesGateState`) already enforces this | Sentence lands, tripwire green | Same commit as the gate removal |
| **Shared-store rate limiter** | — | **DONE** | — | — |

## D. Before the MVP gate (lower urgency)

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **O-19** — touch-target/keyboard enforcement mechanism | Local agent, when picked up | **OPEN, filed-not-designed** by Oleksii's own instruction | A shared Playwright helper + a sweep, strategy undecided | not scheduled |

## Items from the 2026-10-24 brief, not yet rows in `docs/build-plan.md`

| Item | Owner | What gets produced | Status |
|---|---|---|---|
| **GDPR check of `/pro` and shelter-admin data** | Local agent analyzed and proposed; Oleksii decided | Analysis doc (`docs/gdpr-analysis.md`); the departed-admin erasure decision (option A) built | **Decided and built, 2026-10-24; a Tier 1 STOP on the first head found the sentence still false in two reachable states, both fixed the same day** — `eraseUsersAndScrubHistory` (`packages/db/src/repos/admin-erasure-repo.ts`) now also scrubs `auth_invitation.email` (every shelter, any status), and `erasableIf(userId, now)` — one invariant (no membership, not an operator, no live invitation anywhere) — replaces the narrower `eraseOneUserIf`, used identically by `registry.admins.remove`, `kabinetInvitedUsersRepo.cleanupCandidates`/`deleteCandidates`, and now the auth-cleanup cron's own invite sweep (every 6 hours, no kabinet action needed), with a structural scan enforcing the complete list of `auth_user`-deleting call sites. Mutation-tested throughout, including the multi-shelter case and the STOP's own fixes. `ADMIN_ERASURE_SENTENCE` (`packages/i18n/src/messages/uk.ts`) is his own dictated Ukrainian, landed directly in `uk.about.data`, re-checked word for word against the STOP-fixed code with nothing left differing. The rest of the analysis (G1–G7) is still open, unscheduled |
| **Wipe-and-flip script + runbook** | Local agent prepared (`packages/db/src/full-reset.ts`, `docs/launch-sequence.md`); Oleksii runs it | A script plus a runbook, building on existing `demo:remove` and the onboarding doc's "Retiring the rehearsal shelter" | **DONE, different scope** — superseded by `docs/launch-sequence.md`'s full reset (Oleksii's own pivot, 2026-10-24: a full reset, not a demo-only wipe), built and tested (`full-reset.test.ts`, `full-reset-table-coverage.test.ts`, the CLI's own guard tests in `prod-guard.test.ts`); not yet run — that's `docs/launch-sequence.md` step 1, his to execute |
| **Email: DMARC + Postmaster + Brevo removal** | DNS: Oleksii. Code-removal PR: local agent prepares, doesn't merge until told | DMARC/Postmaster runbooks exist (above); Brevo code-removal PR is new, held unmerged until the ~14 Nov dashboard check | **OPEN** for the Brevo PR specifically |
| **Discoverability-flip runbook** | Local agent writes it; Oleksii executes | One ordered runbook assembling section C's three items with verification steps | **DONE** — `docs/launch-sequence.md` step 8 is this runbook, assembling the three Section C items into the one commit the boot-time invariant requires; not yet executed |
| **PG-F3** | Oleksii | tests + Tier 1 | **PARKED**, kept on the list |
