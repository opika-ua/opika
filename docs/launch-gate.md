# Launch gate — the checklist

One list, pulled from `docs/build-plan.md` Part 5, `docs/decisions-inbox.md`, the branch
inbox files and `Claude outputs/HANDOFF-2026-10-24.md`, corrected against `git`/`gh` where
the source docs had gone stale. Each item: owner, status, what "done" means, dependency.
Supersedes nothing — `docs/build-plan.md` Part 5 stays the long-form source, now itself
corrected in the same pass; this is the flat list for tracking.

Status key: **DONE** (verified) / **PARKED** (explicitly held, not abandoned) / **OPEN**
(not started or in progress) / **DROPPED** (the item's premise no longer holds).

---

## Corrections made this pass (source docs fixed, not re-decided)

Six items were stale — four caught in review (thank you), two in the first pass. All fixed
directly in `docs/build-plan.md` and `docs/decisions-inbox.md` in this same commit, not just
noted here:

| # | What the doc said | What's actually true |
|---|---|---|
| 1 | Shared-store rate limiter: open, blocking the flip | **Done since 2026-10-06** (PR #70, RL-1..RL-4). Upstash is live and required at boot for every real Vercel instance |
| 2 | `[ ] PW1-F5 merged` | **Done.** PR #158, merged 2026-10-20. His rehearsal and production migration are both quoted verbatim in the PR body |
| 3 | `[ ] PW1-F6 merged: ... a known gap` | **Done.** PR #159, merged 2026-10-20 (`61da308`). His real-Neon smoke: 14 passed, step 14 is the raced sign-in |
| 4 | BR-3: open, a wording decision pending | **Done.** PR #183 (copy audit 2026-10-22) shipped «Перевірено вручну · на сайті з {year} року» — a since-date sentence, not a year count |
| 5 | Location fuzzing: "nothing yet calls `productionLocationPolicy` from a real handler" | **Done.** `app/api/kabinet/[...rpc]/route.ts`'s `locationPolicy()` feeds every real write path (shelter creation, address changes); the route 503s without the secret. Confirmed every other path too — animal creation hardcodes `publicLocation: null`, inheriting the shelter's already-fuzzed location; no unguarded second path exists |
| 6 | R4-2's text: "in hand" in the 2026-10-06 inbox file | The text moved — it now lives only in `PENDING_R4_2_ANALYTICS_SENTENCE` (`packages/i18n/src/messages/uk.ts`), amended since with the saved-list sentence (PR #186) and, in this pass, the right-swipe word fixed to «Написати» only (copy audit #19, PR #183, already merged — «Запитати» no longer names anything live) |

Also fixed: `docs/decisions-inbox.md` never had PW1-F5/PW1-F6/PW1-F8 folded into the shared
table despite all three being merged for four days — folded in this pass, with the three
superseded branch-inbox files deleted. PW1-F8 (log privacy follow-up, opened inside the
PW1-F6 branch) turned out to be done too — PR #168, merged 2026-10-21 — found while verifying
#4; its own two follow-ups (F8-F1, F8-F2, both merged) are *not* yet folded, left as
pre-existing docs debt, out of scope here.

**D-5 dropped** (your call, this pass): the launch order already wipes the demo corpus
before the first real shelter's invite, so no demo contact is ever live while the site is
indexable. D-5's placeholder-format question never arises. D-7 (the transition doc) stays,
unbuilt.

**S8-F5 needs a migration**, noted in `docs/build-plan.md`: additive (a new per-listing
"was this ever served" fact), your rehearsal plus production migration before merge, same
flow as `0013`/`0014`, steps written in PowerShell form.

---

## A. Before the first real shelter or animal record is inserted

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **PG-F3** — `db:migrate` can reach a database the prod guard never checked | **You** write the tests; then a fresh Tier 1 reviewer | **PARKED** — your own instruction, 2026-10-19. WIP on `fix/pgf3-migrate-bypass` (`D:\opika-worktrees\guard`, head `8618428`), 11 named tests missing. Untouched by me | Tests written, Tier 1 PASS, merged | nothing |
| **PW1-F5** | — | **DONE** | — | — |
| **PW1-F6** | — | **DONE** | — | — |
| **PW1-F5/F6's launch-gate checkboxes and shared-table rows** | Local agent | **DONE, this pass** | Checkboxes ticked, rows folded, three branch files deleted | — |
| **S8-F5** — a never-shown card's name can come back in a narrow paused/suspended withdraw window | Local agent builds; Tier 1 review | **OPEN**, not started. Needs an additive migration (a stored "was this listing ever served" fact) — your rehearsal and production migration before merge, same as `0013`/`0014` | Built, Tier 1 PASS, your rehearsal + migration, merged | nothing |
| **Remove every test shelter** before the first real shelter | **You** run; I prepare commands | **OPEN** (by nature). Mechanism exists: `demo:remove` (#103); operator-removal path documented in `docs/onboarding-a-shelter.md` | demo:remove + admin-removal rehearsed | First real shelter onboarded |
| **DMARC to `p=quarantine`** on both records | **You** (Cloudflare DNS) | **OPEN.** Runbook fully written (`docs/onboarding-a-shelter.md` "DMARC: raising the policy") | Both records raised, delivery test passed | Brevo DNS records removed first, same step |
| **Google Postmaster Tools** for `mail.opika.org.ua` | **You** | **OPEN**, not done per the repo | Domain verified | nothing |
| **Location fuzzing wired into production** | — | **DONE** | — | — |
| **BR-3** | — | **DONE** | — | — |

## B. Before any route is indexed, one hour earlier: D-7 only (D-5 dropped)

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **D-5** | — | **DROPPED, 2026-10-24** (your call) — no demo contact is ever live while the site is indexable, given the existing wipe-before-invite sequence | — | — |
| **D-7** — write the demo-to-real transition into `docs/standing-constraints.md` and the onboarding checklist | Local agent | **OPEN**, not written | Doc section exists naming the wipe sequence and the two-constants distinction | nothing |

## C. Before any route is indexed

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **Flip `SITE_IS_PUBLICLY_DISCOVERABLE`** | **You** decide the moment; local agent flips + verifies | **OPEN** — currently `false` | Flag `true`, tests green, runtime invariant checked | `REGISTRY_HAS_NO_REAL_SHELTERS` already `false`; shared-store rate limiter (**already true**) |
| **Remove the pre-launch access gate**, in the same change | Local agent | **OPEN** | Gate removed/no-ops, verified against a real unauthenticated request; `PRELAUNCH_GATE_SECRET` dropped from env schema same commit | Same commit as the flip |
| **Land the R4-2 sentence**, same change as the gate removal | Local agent | **OPEN but fully prepared** — current constant value (with the saved-list sentence and the «Написати» fix, both already landed) just needs appending to `uk.about.analytics`; the tripwire (`assertAnalyticsCopyMatchesGateState`) already enforces this | Sentence lands, tripwire green | Same commit as the gate removal |
| **Shared-store rate limiter** | — | **DONE** | — | — |

## D. Before the MVP gate (lower urgency)

| Item | Owner | Status | Done means | Depends on |
|---|---|---|---|---|
| **O-19** — touch-target/keyboard enforcement mechanism | Local agent, when picked up | **OPEN, filed-not-designed** by your own instruction. Listed for completeness only | A shared Playwright helper + a sweep, strategy undecided | not scheduled |

---

## Items from your brief, not yet rows in `docs/build-plan.md`

| Item | Owner | What I'll produce | Status |
|---|---|---|---|
| **GDPR check of `/pro` and shelter-admin data** | I analyze and propose; **you** decide any public-claim change | Analysis doc: what's collected, why, retention, legal basis, what `/pro` says, the gaps | **OPEN** — not started. Pulled forward ahead of Phase H5 per your ask |
| **Wipe-and-flip script + runbook** | I prepare, dry-run default; **you** run it | A script plus a runbook, building on existing `demo:remove` and the onboarding doc's "Retiring the rehearsal shelter" | **OPEN** — pieces exist separately, no combined runbook+script yet |
| **Email: DMARC + Postmaster + Brevo removal** | DNS: **you**. Code-removal PR: I prepare, don't merge until you say | DMARC/Postmaster runbooks exist (above); Brevo code-removal PR is new, held unmerged until your ~14 Nov check | **OPEN** for the Brevo PR specifically |
| **Discoverability-flip runbook** | I write it; **you** execute | One ordered runbook assembling section C's three items with verification steps | **OPEN** — individual steps documented, not assembled |
| **PG-F3** | **You** | tests + Tier 1 | **PARKED**, kept on the list |

---

## Next, in order (per your "go")

1. ~~Stale docs, including these fixes~~ — **done, this commit.**
2. GDPR analysis (`/pro` + shelter-admin data) — starting now.
3. S8-F5 — real schema work, additive migration, Tier 1.
4. Runbooks (wipe-and-flip, discoverability-flip) and the held Brevo removal PR.

PG-F3 stays parked. Items 4 and 5 from the first pass (shared rate limiter, location fuzzing)
are done — dropped from the queue, not deferred.
