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
| **Remove every test shelter** before the first real shelter | Oleksii runs; mechanism already built | **OPEN** (by nature — can't happen before a real shelter exists) | `demo:remove` + admin-removal rehearsed | First real shelter onboarded |
| **DMARC to `p=quarantine`** on both records | Oleksii (Cloudflare DNS) | **OPEN.** Runbook fully written (`docs/onboarding-a-shelter.md`) | Both records raised, delivery test passed | Brevo DNS records removed first, same step |
| **Google Postmaster Tools** for `mail.opika.org.ua` | Oleksii | **OPEN**, not done per the repo | Domain verified | nothing |
| **Location fuzzing wired into production** | — | **DONE** | — | — |
| **BR-3** | — | **DONE** (PR #183) | — | — |

## B. Before any route is indexed, one hour earlier: D-7

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **D-5** — the full `test`-profile demo corpus live in production today. His instruction, directly: "Drop D-5: demo data is wiped before any real data, and the flip needs real shelters with the demo gone, so no demo contact is ever indexed." On the corrected timing (the wipe happens *after* the real shelter is onboarded, not before one exists; see `docs/build-plan.md`'s corrected row) the instruction still holds: no demo contact is ever live while the site is indexable. **A related, narrower item already exists and isn't closed by that:** `docs/handoff-2026-10-04.md` §3 pulled a version of this same concern forward for the separate, two-shelter `demo` seed profile shown during the dress rehearsal — built and pinned, but its placeholder-format choice (SP-1) is still a default, not his confirmed answer | Oleksii (the timing call, made); SP-1 is a separate open item if picked up | **DONE, different scope** for this row's own concern; **SP-1 still open** on its own, unrelated track | — | Depends on section A's test-shelter removal and section C's flip both happening in the order `docs/build-plan.md`'s launch order already specifies — not yet exercised for real, since no real shelter exists yet |
| **D-7** — write the demo-to-real transition into `docs/standing-constraints.md` and the onboarding checklist | Local agent | **OPEN**, not written | Doc section exists naming the wipe sequence and the two-constants distinction | nothing |

## C. Before any route is indexed

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **Flip `SITE_IS_PUBLICLY_DISCOVERABLE`** | Oleksii decides the moment; local agent flips + verifies | **OPEN** — currently `false` | Flag `true`, tests green, runtime invariant checked | `REGISTRY_HAS_NO_REAL_SHELTERS` already `false`; shared-store rate limiter (**already true**) |
| **Remove the pre-launch access gate**, in the same change | Local agent | **OPEN** | Gate removed/no-ops, verified against a real unauthenticated request; `PRELAUNCH_GATE_SECRET` dropped from env schema same commit | Same commit as the flip |
| **Land the R4-2 sentence**, same change as the gate removal | Local agent | **OPEN but prepared** — current constant value (with the saved-list sentence and the «Написати» fix already landed) just needs appending to `uk.about.analytics`; the tripwire (`assertAnalyticsCopyMatchesGateState`) already enforces this | Sentence lands, tripwire green | Same commit as the gate removal |
| **Shared-store rate limiter** | — | **DONE** | — | — |

## D. Before the MVP gate (lower urgency)

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **O-19** — touch-target/keyboard enforcement mechanism | Local agent, when picked up | **OPEN, filed-not-designed** by Oleksii's own instruction | A shared Playwright helper + a sweep, strategy undecided | not scheduled |

## Items from the 2026-10-24 brief, not yet rows in `docs/build-plan.md`

| Item | Owner | What gets produced | Status |
|---|---|---|---|
| **GDPR check of `/pro` and shelter-admin data** | Local agent analyzes and proposes; Oleksii decides any public-claim change | Analysis doc (`docs/gdpr-analysis.md`) | **Drafted**, under revision after review — see that PR |
| **Wipe-and-flip script + runbook** | Local agent prepares, dry-run default; Oleksii runs it | A script plus a runbook, building on existing `demo:remove` and the onboarding doc's "Retiring the rehearsal shelter" | **OPEN** — pieces exist separately, no combined runbook+script yet |
| **Email: DMARC + Postmaster + Brevo removal** | DNS: Oleksii. Code-removal PR: local agent prepares, doesn't merge until told | DMARC/Postmaster runbooks exist (above); Brevo code-removal PR is new, held unmerged until the ~14 Nov dashboard check | **OPEN** for the Brevo PR specifically |
| **Discoverability-flip runbook** | Local agent writes it; Oleksii executes | One ordered runbook assembling section C's three items with verification steps | **OPEN** — individual steps documented, not assembled |
| **PG-F3** | Oleksii | tests + Tier 1 | **PARKED**, kept on the list |
