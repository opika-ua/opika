# Launch gate - the checklist

One list, pulled from `docs/build-plan.md` Part 5, `docs/decisions-inbox.md` and the branch
inbox files, corrected against `git`/`gh` where the source docs had gone stale. Each item:
owner, status, what "done" means, dependency. Supersedes nothing - `docs/build-plan.md`
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
draft - PR #186 added a saved-list sentence, and this pass fixed its now-stale «Запитати»
to «Написати» only, matching copy audit #19). PW1-F5/F6/F8 (all merged, none previously in
the shared table) are folded into `docs/decisions-inbox.md` in full, with their three
superseded branch-inbox files deleted.

## A. Before the first real shelter or animal record is inserted

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **PG-F3** - `db:migrate` can reach a database the prod guard never checked | A fresh Tier 1 reviewer, then a smoke sitting on a fresh Neon child branch | **DONE** (PR #352 merged; the smoke sitting is done) | - | - |
| **PW1-F5** | - | **DONE** (PR #158) | - | - |
| **PW1-F6** | - | **DONE** (PR #159) | - | - |
| **S8-F5** - a card's real name can come back for a listing that was never actually rendered publicly, in two distinct windows: a shelter paused/suspended after being verified, publishing-then-withdrawing a new card inside that window; *and* a shelter still pending/under_review, publishing-then-withdrawing a card before it's ever verified at all | - | **DONE** (PR #196, merged `2fca25b`) - a per-listing `ever_served_at` fact, set the first time a listing is simultaneously discoverable and its shelter publicly verified, via three exhaustive write-path hooks. Migration `0015` rehearsed and applied to production by Oleksii; a first Tier 1 review (STOP, two blockers plus five further findings, all fixed with mutation-verified tests) and a second Tier 1 delta review (PASS WITH NOTES, non-blocking, batched) both passed. Deployed, and Oleksii's post-deploy `everServed:backfill` run on production closed the migrate→merge deploy window (dry run, then `--commit`, remaining candidates 0) | - | - |
| **Remove every test shelter** before the first real shelter | Oleksii runs; mechanism already built | **DONE, different scope** - superseded by `docs/launch-sequence.md`'s two-cycle full reset: cycle 1's reset (step 2) empties every table, so every pre-existing test shelter is already gone before step 5 ever creates the one rehearsal shelter; cycle 2's reset (step 8) then removes that rehearsal shelter too, before step 12's real onboarding - a second run of the same script, not a `demo:remove --shelter` call | steps 2 and 8 of `docs/launch-sequence.md` | - |
| **DMARC to `p=quarantine`** on both records | Oleksii (Cloudflare DNS) | **DONE, 2026-11-02** (Oleksii): both `_dmarc.opika.org.ua` and `_dmarc.mail.opika.org.ua` are at `p=quarantine`; the Brevo DNS records were removed first; test mail from `hello@` passed SPF, DKIM and DMARC, aligned. Runbook: `docs/onboarding-a-shelter.md`. `p=reject` is a later follow-up, after a week of clean reports | - | - |
| **Google Postmaster Tools** for `mail.opika.org.ua` | Oleksii | **DONE, 2026-11-02** (Oleksii): `mail.opika.org.ua` verified | - | - |
| **`OPIKA_TEST_FAIL_GALLERY` is unset in every deployed environment** | Oleksii (Vercel env list) | **OPEN**, check at launch | Not present in Production, Preview or any other deployed environment. The variable arms a test-only failure hook (`apps/web/src/features/gallery/test-only-failure.ts`). Its second guard is the Vercel check (`VERCEL` / `VERCEL_ENV`); a move off Vercel (the OpenNext / Cloudflare exit ramp) must swap that guard first, because the check would no longer protect anything there | nothing |
| **Location fuzzing wired into production** | - | **DONE** | - | - |
| **Upgrade production Neon from Free to Launch** | Oleksii (Neon console) | **OPEN**, before shelters are onboarded | Project on Launch. Free today: 100 CU-hours per month per project, compute suspends when exhausted, 6 h history retention, Postgres 18, default compute 0.25 CU. Estimated ~120 CU-h per month at launch traffic, so Free would suspend. | - |
| **BR-3** | - | **DONE** (PR #183) | - | - |

## B. Before any route is indexed, one hour earlier: D-7

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **D-5** - the full `test`-profile demo corpus live in production today. His instruction, directly: "Drop D-5: demo data is wiped before any real data, and the flip needs real shelters with the demo gone, so no demo contact is ever indexed." **Superseded by the full reset** (`docs/launch-sequence.md`, Oleksii's own instruction, 2026-10-24, corrected 2026-10-25 on the order: reset *before* the dress rehearsal, run twice - once to clear whatever's already in production, once more right after the rehearsal to remove the rehearsal shelter too): a full reset, not a demo-only wipe, run personally - so no demo data and no rehearsal data ever coexists with real data, closing this concern by construction rather than by timing. **A related, narrower item already exists and isn't closed by that:** `docs/handoff-2026-10-04.md` §3 pulled a version of this same concern forward for the separate, two-shelter `demo` seed profile shown during the dress rehearsal - built and pinned, but its placeholder-format choice (SP-1) is still a default, not his confirmed answer | Oleksii runs `docs/launch-sequence.md`; SP-1 is a separate open item if picked up | **DONE, different scope** for this row's own concern, closed by construction rather than timing; **SP-1 still open** on its own, unrelated track | - | `docs/launch-sequence.md` steps 2 and 8 |
| **D-7** - write the demo-to-real transition into `docs/standing-constraints.md` and the onboarding checklist | Local agent | **DONE, different scope** - `docs/launch-sequence.md` is this document: a full, ordered runbook (fifteen steps across two reset cycles, each with verification and rollback, plus a one-time child-branch rehearsal of the script itself) rather than a `docs/standing-constraints.md` section, since the full-reset pivot made a one-section write-up too thin for what's now an irreversible, two-cycle production sequence. Its own closing section ("D-5/D-7, closed by this document") names exactly what moved and why | `docs/launch-sequence.md` | - |

## C. Before any route is indexed

All three rows below are now one assembled step, `docs/launch-sequence.md`'s step 14 (one
commit, since `assertAnalyticsCopyMatchesGateState` is a test-time tripwire that fails CI if
they land out of step with each other - it does not throw at boot; that's
`assertDemoDiscoverabilityInvariant`, for the other pair of constants) - the runbook exists;
execution is still open.

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **Flip `SITE_IS_PUBLICLY_DISCOVERABLE`** | Oleksii decides the moment; local agent flips + verifies | **OPEN** - currently `false`; runbook ready (`docs/launch-sequence.md` step 14.1) | Flag `true`, tests green, runtime invariant checked | `REGISTRY_HAS_NO_REAL_SHELTERS` already `false` (step 13); shared-store rate limiter (**already true**) |
| **Remove the pre-launch access gate**, in the same change | Local agent | **OPEN** - runbook ready (step 14.1 removes it by flipping the same flag; `proxy.ts`'s gate only runs when the flag is still `false`) | Gate removed/no-ops, verified against a real unauthenticated request; `PRELAUNCH_GATE_SECRET` dropped from env schema same commit (step 14.2) | Same commit as the flip |
| **Land the R4-2 sentence**, same change as the gate removal | Local agent | **OPEN but prepared** - runbook ready (step 14.3); current constant value (with the saved-list sentence and the «Написати» fix already landed) just needs appending to `uk.about.analytics`; the tripwire (`assertAnalyticsCopyMatchesGateState`) already enforces this | Sentence lands, tripwire green | Same commit as the gate removal |
| **Shared-store rate limiter** | - | **DONE** | - | - |

## D. Before the MVP gate (lower urgency)

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **O-19** - touch-target/keyboard enforcement mechanism | Local agent, when picked up | **OPEN, filed-not-designed** by Oleksii's own instruction | A shared Playwright helper + a sweep, strategy undecided | not scheduled |
| **Sitemap scale** | Local agent | **OPEN, follow-up** (owner accepted #241's limits for launch) | Sitemap: when listed animals pass ~1,500, switch to a sitemap index with keyset-paginated chunks and a dedicated shelters listing (needs SQL + smoke). | not scheduled |
| **Unauthenticated body cap on Vercel** | Local agent | **DONE, 2026-11-02** (Oleksii's Production check of 57eee29; PR #360): holds on Vercel via platform buffering and its 4.5 MB limit; the in-app 16 KB cap matters on the OpenNext/Cloudflare exit ramp. Oleksii is still checking Vercel logs for long invocations on photos/add and reports only if any exist | No Vercel preview exists (only the default branch deploys) and a preview has sign-in off, so `/api/kabinet/*` answers 503 before reading a body: the check only means something on Production. A local probe found the cap did NOT hold: `proxy.ts` matched every path, and Next buffers every matched non-GET request's whole body (chunked or not; `/api/monitoring`, `/api/cron/*` and page POSTs included) before the route runs, 10 MB by default, and the proxy's own 403/429 also waits for the body to finish. Fixes: (1) `/api/kabinet` and `/api/auth` (gate-exempt, no other proxy effect) are out of the matcher (`proxy-matcher.test.ts`); an unterminated chunked body to them now gets 401/413 at once, one 64 KB transport chunk read. (2) `experimental.proxyClientMaxBodySize` is 128 KB (`next.config.ts`), so every other matched request buffers at most 128 KB. Largest legitimate body per matched path: `/api/rpc/*` 64 KB (`PUBLIC_RPC_MAX_BODY_BYTES`), `/api/monitoring` 64 KB (`MONITORING_MAX_BODY_BYTES`), `/api/monitoring/test` small JSON, `/api/cron/*` GET, no body, `/kabinet/*` and other pages: sign-in form POSTs of a token or email (a few hundred bytes), no server actions; photo uploads (4 MiB) go to `/api/kabinet`, outside the matcher. What remains: a matched request still holds up to 128 KB while the body streams in, and an unterminated chunked stream to a matched path gets no reply until the client ends it or the platform times out (Next discards the excess). Production result (raw TLS probes): an unterminated chunked 4 MiB to photos/add (with and without a fake session cookie) and a Content-Length 8 MiB with 1 MiB sent got no reply within 12 s; terminated, a small body gave 401 (1.2 s), 4 MiB chunked 401 (1.5 s), Content-Length 8 MiB sent in full 413 (0.4 s); `/api/rpc/animals/list` 256 KB chunked gave 403 terminated (1.1 s) and no reply unterminated. Reading: Vercel buffers the whole body at its edge before the function runs, so the early in-app 401/413 cannot fire there and the 4.5 MB platform limit bounds it. `/api/auth` had no body cap (`request.json()` unbounded before `signInAllowed`); the `fix/auth-body-cap` PR adds one (16 KB, `AUTH_MAX_BODY_BYTES`, 413 before any parse; largest real body 3.1 KB), for the exit ramp | before launch |

## Items from the 2026-10-24 brief, not yet rows in `docs/build-plan.md`

| Item | Owner | What gets produced | Status |
|---|---|---|---|
| **GDPR check of `/pro` and shelter-admin data** | Local agent analyzed and proposed; Oleksii decided | Analysis doc (`docs/gdpr-analysis.md`); the departed-admin erasure decision (option A) built | **Decided and built, 2026-10-24; a Tier 1 STOP on the first head found the sentence still false in two reachable states, both fixed the same day** - `eraseUsersAndScrubHistory` (`packages/db/src/repos/admin-erasure-repo.ts`) now also scrubs `auth_invitation.email` (every shelter, any status), and `erasableIf(userId, now)` - one invariant (no membership, not an operator, no live invitation anywhere) - replaces the narrower `eraseOneUserIf`, used identically by `registry.admins.remove`, `kabinetInvitedUsersRepo.cleanupCandidates`/`deleteCandidates`, and now the auth-cleanup cron's own invite sweep (every 6 hours, no kabinet action needed), with a structural scan enforcing the complete list of `auth_user`-deleting call sites. Mutation-tested throughout, including the multi-shelter case and the STOP's own fixes. `ADMIN_ERASURE_SENTENCE` (`packages/i18n/src/messages/uk.ts`) is his own dictated Ukrainian, landed directly in `uk.about.data`, re-checked word for word against the STOP-fixed code with nothing left differing. The rest of the analysis (G1-G7) is still open, unscheduled |
| **Wipe-and-flip script + runbook** | Local agent prepared (`packages/db/src/full-reset.ts`, `docs/launch-sequence.md`); Oleksii runs it | A script plus a runbook, building on existing `demo:remove` and the onboarding doc's "Retiring the rehearsal shelter" | **DONE, different scope** - superseded by `docs/launch-sequence.md`'s two-cycle full reset (Oleksii's own pivot, 2026-10-24: a full reset, not a demo-only wipe; corrected 2026-10-25 on the order and the two-run design - reset before the rehearsal, run twice, no `demo:remove --shelter` step), built and tested (`full-reset.test.ts`, `full-reset-table-coverage.test.ts`, the CLI's own guard tests in `prod-guard.test.ts`), with a Tier 1 STOP and its six findings fixed the same round; not yet run - that's `docs/launch-sequence.md` steps 2 and 8, his to execute, each preceded by the one-time child-branch rehearsal above |
| **Email: DMARC + Postmaster + Brevo removal** | DNS: Oleksii. Code-removal PR: local agent | DMARC/Postmaster runbooks exist (above); Brevo removed from the code (provider, block-list reader, `BREVO_API_KEY`, delivery-test flags) and from DNS | **DONE:** DNS records removed 2026-11-01, code removed by the removal PR (auth email is Resend only). DMARC and Postmaster are done (section A) |
| **Discoverability-flip runbook** | Local agent writes it; Oleksii executes | One ordered runbook assembling section C's three items with verification steps | **DONE** - `docs/launch-sequence.md` step 14 is this runbook, assembling the three Section C items into the one commit the CI tripwire requires; not yet executed |
| **PG-F3** | Oleksii | Tier 1 + smoke sitting | **DONE** (PR #352 merged, sitting done) |
