# Working loop and process tiers (historical)

Moved verbatim from CLAUDE.md in DS PR 5. Superseded by 'Working mode: lean' in CLAUDE.md; kept so past PRs and reviews stay legible. Contains a few mechanics CLAUDE.md still relies on (never generate artificial load, merge only the reviewed commit, serialised full checks).

# Working loop (historical - superseded 2026-10-26 by "Working mode: lean" above)

Everything below this point - the Tier 1/2/3 gate, the cloud/local "who does what" split, the
STOP/PASS-WITH-NOTES review loop, the decisions-inbox table, per-area follow-up batching, and
the documentation-diet row-length rule - described the process in force before 2026-10-26. It
is kept as a record of how past PRs were actually reviewed and merged (so e.g. a review file
under `docs/reviews/` or a row in `docs/decisions-inbox.md` is legible), not as current
instruction. Follow "Working mode: lean" above instead. `docs/decisions-inbox.md` and
`docs/decisions-inbox/*.md` are frozen as of 2026-10-26: new decisions go in the PR description
(lean rule 2), nothing new is appended to the inbox table.

A few pieces of mechanics from this section are still true and still used:

- **Never generate artificial CPU or memory load** to reproduce a bug - deterministic forcing
  only (fake clocks, injected delays, forced scheduling order), never busy-loops or piles of
  parallel processes. Permanent, Oleksii, 2026-10-19 (an agent crashed the PC doing this).
- **Merge only the commit that was reviewed/green.** `gh pr merge --squash --match-head-commit
  <sha>` - GitHub refuses if the head moved since. Never run `update-branch` yourself; a rebase
  produces a new head too and needs its own green CI check before merging.
- **A rebase needs no fresh review round** (lean rule 1 still applies to whether it needs one
  at all) **only when all three hold:** no conflicts; `git range-diff` shows every patch
  unchanged; the PR's changed files don't overlap the files changed by the new commits on
  `main`. Green CI on the rebased head is then the gate. Otherwise treat the new head like any
  other change under lean rule 1.
- **Full `pnpm check` runs are serialised:** at most two at once on the machine. Targeted test
  suites are free to run concurrently.
- A reviewer's STOP (rule-1 changes only, now) blocks the **merge**, not the **commit** -
  commit and push working code before raising the decision to Oleksii; never hold a green
  working tree uncommitted while waiting for an answer.

The rest of this section (everything from "Who does what" to "Process tiers") is archived
below unedited, for history only.

## Who does what (2026-10-23; supersedes the 2026-10-21 cloud/local split below, and the rules
further below where they conflict)

Cloud sessions ran from 2026-10-21 to 2026-10-23 (3-4 parallel builders, cloud Tier 1 reviewers).
Oleksii ended that, verbatim (2026-10-23): "From now on, everything runs locally; no cloud
sessions until I say otherwise. Keep local use lean." The mechanics he gave the same day,
verbatim: "Local agents only. At most two at once. Builder and reviewer are always separate
agents. A Tier 1 review is always a fresh agent pinned to the exact SHA. You do non-Tier-1
reviews, delta checks, rebases, and merges at the reviewed head on green CI. You're the only one
who merges. Only blockers loop. Notes go into one follow-up batch per area."

What each role may do:

- **The local agent** (this session, on Oleksii's machine) builds: implements the row,
  runs `pnpm check`, commits with the green run pasted in the body, pushes.
  - Opens each PR as a draft, with the verified-vs-asserted ledger in the body.
  - Reviews everything except Tier 1 itself, kept lean: the diff, the suites it touches, a few
    mutations, CI's `pnpm check`.
  - Merges at the reviewed head - its own review for non-Tier-1, a fresh local reviewer's for
    Tier 1 - on green CI. **It is the only one that merges.**
  - Writes a smoke sitting (`Claude outputs/SMOKE-sitting-<date>.txt`: one fresh child branch,
    `nvm use 24` first, every command in its `--filter` form, expected counts) for anything
    needing his real-Neon check, and does not merge that PR until he's run it.
  - Never runs a production action, writes a secret, or force-pushes `main`.
- **A Tier 1 reviewer** is a fresh local agent, never the one that built the change (a review run
  inside the building session doesn't count).
  - Read-only: it never edits code, pushes the PR branch, or merges, approves or closes a PR.
  - Its verdict names the exact head SHA on its first line; a verdict for any other SHA doesn't
    count.
  - It pushes only the review file, `docs/reviews/<branch>/<short-sha>.md`, on its own
    `reviews/pr-<n>-<short-sha>` branch - the same mechanism the cloud reviewers used, just run
    locally now.
- **Oleksii:** runs the real-Neon smokes in batched sittings, the production migrations, takes
  the decisions and writes the copy, runs every other production action (env, DNS, deletions).

The rules (carried over from the cloud era, unchanged by the switch to local-only):

- **Only blockers loop.**
  - A STOP is fixed and re-reviewed, as a delta.
  - A PASS WITH NOTES merges at the reviewed head on green CI. Where SQL or auth is involved, it
    waits for his smoke first. A PR with a migration also waits for his production migration.
  - The notes go into one follow-up batch per area, fixed and reviewed together later.
  - A Tier 1 note that touches a live security path counts as a blocker; tests-only and docs notes
    don't. A reviewer marks such a note `[Blocker]`.
- **Open PRs never share a file.** His rule, verbatim (2026-10-20): "Replace the hard "two PRs"
  limit with a rule: any number of PRs may be open as long as no two share a file. A PR that
  shares a file with an open one waits."
- **The rebase rule:** the verdict carries over when there is no conflict, `git range-diff` shows
  every patch `=`, and the PR's files don't overlap main's new commits. Green CI on the rebased
  head is then the gate. Anything else gets a short delta review. His wording is quoted in full
  under "Merge only the commit that was reviewed". A rebase with real conflicts (not just `=`
  patches over a clean range-diff) is never a bare "take one side" per hunk - a hunk can look like
  one branch's change when it's really unchanged context from a third branch that already landed;
  verify each resolved hunk against both sides' own diffs against their common ancestor, not just
  against the conflict markers.
- **Smokes** are batched: one sitting, one fresh child branch, the commands in order, once or
  twice a day, in `Claude outputs/SMOKE-sitting-<date>.txt`.

Dropped with the cloud sessions (2026-10-23): the cloud builder role; the "3-4 sessions in
parallel" scale; the launch-file ritual (`Claude outputs/LAUNCH-batch-<date>.txt`, Oleksii
starting each session by hand) - nothing starts a session for him to paste anymore; and the
launch-prompt network-naming rule, which existed only because a cloud prompt could end up quoted
in a commit or PR of this public repository.

Revised 2026-10-04 per `docs/handoff-2026-10-04.md` §4: review and decisions now run in
parallel with building rather than ahead of it. The quality bar, the standing constraints and
the Tier 1 gates are unchanged - what changed is *where* review happens and *what blocks the
builder*. See the 2026-10-04 amendment below for the mechanism. Who reviews and who merges was
revised on 2026-10-21 and again on 2026-10-23 ("Who does what", above).

## The loop

Work proceeds in iterations. One iteration is one plan item - a D-row, a DECK-row, a fix, a
sweep. For each iteration:

1. Do the work.
2. Run `pnpm check`.
3. Commit (green `pnpm check`, output pasted in the commit body) and push the branch. A branch
   commit ships nothing to anyone. Classify the row's tier (see Process tiers): it decides who
   reviews the pushed head ("Who does what", above):
   - **Tier 1:** a fresh local agent, pinned to the exact SHA, never the one that built it.
     Nothing merges before that review has passed. (Until 2026-10-21 it ran synchronously before
     the commit, through a local `opika-reviewer` subagent; 2026-10-21 to 2026-10-23 it ran in a
     cloud session; see "Who does what".)
   - **Everything else:** one review by the local agent, kept lean. A change the
     local agent wrote itself goes to a fresh local reviewer instead, for the same
     independence reason.
4. Act on the verdict:
   - **PASS:** the local agent merges it at that head on green CI.
   - **PASS WITH NOTES:** it merges the same way, after Oleksii's smoke where SQL or auth is
     involved. Its notes go into one follow-up batch per area, fixed and reviewed together later.
     The exception is a Tier 1 note that touches a live security path: it is a blocker, and is
     handled like a STOP.
   - **STOP:** do not continue past it and do not work around it. **Commit first, then push,
     then write to Oleksii:** what the decision is, the options with their consequences, and what
     you recommend. Then wait; the amendment below says why the commit comes first. The fix is
     reviewed again as a delta, and only blockers loop.
5. Builders never open PRs. The local agent opens each PR as a draft, with the
   verified-vs-asserted ledger in the body. It merges at the reviewed head, except the kinds that
   wait for Oleksii: a migration PR waits for his production migration, a Tier 1 PR waits until its
   full review has passed, and SQL or auth work waits for his smoke. See "Merge only the commit
   that was reviewed" under Agent rules.

Never spawn a review on work you have not finished, and never continue past a STOP by
reinterpreting it as a note.

### Amendment, 2026-09-06 - a STOP blocks a merge, not a commit

A reviewer STOP blocks a **merge**, not a **commit**. When the reviewer returns STOP: commit
the work on the branch first, push it, then surface the decision to Oleksii. Uncommitted work
is a risk (a branch commit is not - it ships nothing to anyone and is fully reversible); never
hold a green working tree uncommitted while waiting for an answer.

Corollary: STOP-list items about documentation, attribution and provenance are **PR-blocking**,
not commit-blocking. Only items that would reach users or destroy data block a commit -
production writes, deletions, and secrets. (*Since 2026-10-21* the review runs on the pushed head,
after the commit. So these three are the builder's own never-list in "Who does what": a secret, a
production write or a deletion is never committed at all. A reviewer's STOP on one still blocks
the merge, and the builder removes it.) If the open PR is still a draft, keep it in draft
until the STOP resolves; if it's already open for review, say in the same message that a STOP
finding is unresolved rather than merging over it.

### Amendment, 2026-09-06 - review cadence

Between review passes on the same row, run only the test suites the fix actually touches, not
the full `pnpm check`. Run a full `pnpm check` **once**, immediately before the commit - that
is the one run whose green matters for the commit message and the PR body. Re-running the
whole suite after every small fix is the same waste `test:harness` already warns against
running twice concurrently: it slows the loop without changing what gets asserted.

Tier 3 changes (see "Process tiers" below) get no reviewer pass at all - they are covered
once, in the batch, at the PR-level pass. (*Since 2026-10-21* everything outside Tier 1, Tier 3
included, gets one review: by the local agent, or by a fresh local reviewer when the local agent
wrote it. See "Who does what".)

### Amendment, 2026-10-04 - review runs beside building (superseded in part, 2026-10-21)

(`docs/handoff-2026-10-04.md` §4.1-§4.3, an owner-stated process change, not a quality
change - see "Process latency is a stated owner cost" in `docs/standing-constraints.md`.)

What still holds:
- **Review files are git-tracked:** every verdict is written to
  `docs/reviews/<branch>/<short-sha>.md` (Tier 3 to commit). A Tier 1 reviewer pushes it on its
  own `reviews/*` branch; the local agent commits the files of its own reviews the same way.
- **The full `pnpm check` is the builder's evidence.** A reviewer reads the commit's pasted green
  run, runs only the suites the diff touches, plus its own mutations. Mutation testing of a new
  guard, floor or assertion is **the builder's job**, recorded in the commit message as
  `mutation: <what was broken> → <failure text>`. The reviewer spot-checks at least one
  mutation per row and verifies the rest were done rather than redoing them.
- **A STOP blocks the PR, never the commit** (the 2026-09-06 amendment above stands for every
  tier).
- **Tier 1's Phase 0 questions go to Oleksii before code**, batched at the PR's start (WM-B1).

What 2026-10-21 replaced ("Who does what", above):
- the background `opika-reviewer` subagent in the builder's own session, and the three points at
  which the builder read its pending review files;
- the limit of two rows in flight, and the pause when the reviewer fell three rows behind;
- "fixes for a review finding are their own small commit, re-reviewed the same way". Now only a
  blocker's fix is re-reviewed; other notes wait for their area's follow-up batch.

Builds ran in parallel cloud sessions under the file-overlap rule from 2026-10-21 to 2026-10-23;
local-only since (see "Who does what"). Each review is done by a fresh local reviewer for Tier 1,
or by the local agent for everything else.

### Amendment, 2026-10-17 - working mode (supersedes the rules above and below where they conflict, except "Who does what", 2026-10-21 and 2026-10-23, which supersedes it)

Oleksii, 2026-10-17 (inbox WM-B1), verbatim:

"New working mode, to ship faster without losing security:
1. Tiered process.
   - Tier 1 = auth/access, data deletion, prod writes, secrets, R2, anything a public page or email claims. Keep the current process: review before commit, real-Neon when SQL changes, my explicit decisions, full inbox records.
   - Everything else: one review. A second only if the first finds a blocker. No review-of-the-fix loops.
2. Decisions.
   - Decide reversible things yourself and list them under "Decisions taken" in the PR description; I can overturn them at merge.
   - Ask me only for irreversible, security, public-claim or brand-voice questions. One batch per PR, at its start, with a recommendation each.
3. Copy gate scope.
   - Allow [COPY PENDING] strings on kabinet screens reachable only by the allowlisted test shelter. Keep the strict gate for public pages, emails, sign-in and anything a real shelter can reach.
   - PR 6 (opening writes to everyone) must refuse while any pending string remains.
   - This is a Tier 1 change: propose the exact mechanism and test before building.
4. Records. Non-Tier-1: one line per decision in the inbox. Tier 1: as now.
5. Parallelism. At most two open feature PRs at a time, touching different areas, to avoid #99-style conflicts.
Unchanged: prod guards, --expect, no secrets in chat, no R2 deletes, real-Neon for SQL, copy truth on public surfaces, I merge everything."

What that changes, concretely:
- **Two tiers, not three.**
  - **Tier 1:** auth and access, data deletion, production writes, secrets, R2, and anything a
    public page or an email claims. The full process stays: a full review before merge, real-Neon
    when SQL changes, his explicit decisions asked up front, full inbox records. (*Since
    2026-10-21* the review runs in a fresh reviewer session on the pushed head, before merge -
    cloud through 2026-10-23, a fresh local agent since. It used to run before the commit, in a
    worktree; see "Who does what".)
  - **Everything else** (the old Tiers 2 and 3) gets **one** review, by the local agent since
    2026-10-21. A second review happens only when the first finds a blocker. No review-of-the-fix
    loops: non-blocking notes go into one follow-up batch per area, fixed and reviewed together
    later.
- **Reversible decisions are taken, not asked.** Anything the builder can undo later (layout,
  naming, test shape, an ambiguous design point with no mock) is decided and listed under
  **"Decisions taken"** in the PR description, where he can overturn it at merge (or afterwards, as
  a follow-up, when the PR merged under "Merge only the commit that was reviewed"), and recorded
  as one inbox line. These are the builder's decisions and are recorded as such, never as his
  approval (standing constraints: only his own words are approval).
- **He is asked only** about irreversible, security, public-claim or brand-voice questions
  (Ukrainian copy is brand voice). One batch per PR, at its start, each with a recommendation.
- **Copy gate scope** (item 3): his mechanism (CG-Q1/CG-B1, built in PR 2 of the K milestone)
  let `[COPY PENDING]` sit under `kabinet.testShelterOnly.*`, readable only by the allowlisted test
  shelter. PR 6 deleted the allowlist and that namespace with it (his 0.3a), so the exemption has
  ended: no `[COPY PENDING]` anywhere under `kabinet.*`, in CI (`copy-status.test.ts`,
  `open-writes-copy-gate.test.ts`) and at run time (any pending string keeps production sign-in off).
- **Parallel PRs, replaced 2026-10-20:** his words, verbatim: "Replace the hard “two PRs” limit with a rule: any number of PRs may be open as long as no two share a file. A PR that shares a file with an open one waits." (The two-PR text in his WM-B1 quote above is kept as he wrote it.)
- **Unchanged:** production guards, `--expect`, no secrets in chat, no R2 deletes, real-Neon
  for SQL, copy truth on public surfaces. **"No R2 deletes" gained its one named exception,
  2026-10-25:** the GDPR photo-retention job (`r2-cleanup-client.ts`, `docs/gdpr-analysis.md`)
  deletes an R2 object only after it has sat unreferenced for the grace period, and is the one
  code path allowed `DeleteObjectsCommand`/`ListObjectsV2Command` - enforced structurally by
  `photo-pipeline-scan.test.ts`, which still fails any *other* file that imports either. "I merge
  everything" was narrowed twice:
  - *2026-10-19:* he allows merging a green PR whose exact head was reviewed, with two exceptions
    that wait for him (see "Merge only the commit that was reviewed" under Agent rules).
  - *2026-10-21:* the local agent merges, and it is the only one that does ("Who does what").

  His WM-B1 words above stay as he wrote them, including item 5's two-PR limit, which his
  2026-10-20 file rule replaced.

## Decisions stop blocking

(`docs/handoff-2026-10-04.md` §4.4.) `docs/decisions-inbox.md` - one table, on `main` only,
append-only, columns `ID | Date | Row | Question | Options | Default taken | Oleksii's answer
| Status` - replaces `docs/decisions-pending-review.md`'s 752-line narrative of per-branch
copies for new decisions.

- A **Tier 2 decision never blocks the builder.** Take the recommended default, write the
  inbox row, continue. (Since 2026-10-17: any reversible decision, recorded as one inbox line and
  listed under "Decisions taken" in the PR; see the working-mode amendment.) Oleksii answers in bulk when he reviews the PR; an override becomes a
  small follow-up commit. **This does not touch the STOP list below** ("Stop and ask,
  regardless of what the reviewer said") - an ambiguous design with no mock, a new or changed
  user-facing claim, and the rest of that list are never "a Tier 2 decision" no matter which
  tier the surrounding code change is, and still stop and wait rather than taking a default.
  The inbox is for the other kind: a reversible implementation judgement call that used to be
  a "decisions needing your eye, not blocking" entry in `docs/decisions-pending-review.md`.
- A **Tier 1 decision still blocks the merge** - but not the rest of the branch. Write the
  row, commit the work, move to the next row that doesn't depend on it. Oleksii answers the
  batch, not one question at a time.
- **Ukrainian copy never blocks code.** New strings ship as `[COPY PENDING]`, pinned by
  `copy-status.test.ts`, with the English sense and key name recorded in the inbox. The only
  copy that *does* block a merge is a `/prytulkam` commitment sentence (the register in
  `docs/standing-constraints.md`), because a false sentence must never be live.
- Branches write new rows to `docs/decisions-inbox/<branch>.md`; the PR merge appends them to
  the main table - no more hand-reconciled per-branch copies of a 750-line file.
- `docs/decisions-pending-review.md` is superseded and kept as read-only history as of
  2026-10-04 - don't add to it, don't migrate its already-resolved entries.

## Agent rules (every agent, every session)

- **Never generate artificial CPU or memory load.** No busy-loops, stress tools or piles of
  parallel processes to "reproduce under load". On 2026-10-19 an agent ran 30 busy-loops on 24
  cores and very likely crashed the PC. Reproduce timing bugs by deterministic forcing only: fake
  clocks, an injected delay, a `MutationObserver` hook, a forced scheduling order. Oleksii,
  2026-10-19, verbatim: "the no-artificial-load rule is right, keep it permanent (write it into
  CLAUDE.md's agent rules)."
- **Merge only the commit that was reviewed.** The permission, Oleksii, 2026-10-19, verbatim:
  "Auto-merge is allowed, including #137, #136 and #139, once each is green and has had its one
  review. Two exceptions wait for me: A PR with a migration. I run the production migration from
  the PR branch first, then merge. If it merges before that, production deploys code against the
  old schema. A Tier 1 PR (auth/access, deletion, prod writes, secrets, R2, public claims) until
  its full review has passed. Once it has, auto-merge is fine. Every PR states its migration kind
  (“none” / “additive” / “destructive”) so it’s clear which ones wait." Its limit, verbatim, the
  same day: "enable auto-merge only after the final push. The merge has to apply to the exact
  commit that was reviewed: if new commits arrive, the review is stale and auto-merge turns off
  until the delta is reviewed."

  How it's applied:
  - **Who merges:** the local agent, and only the local agent (2026-10-21, "Who does what"). A
    PASS WITH NOTES merges like a PASS. Where SQL or auth is involved, it waits for Oleksii's
    real-Neon smoke on the reviewed head.
  - A merge watcher takes the reviewed head SHA and merges with `gh pr merge --squash
    --match-head-commit <sha>`, so GitHub refuses if the head moved.
  - It never runs `update-branch` itself, which would create an unreviewed head.
  - Any new commit (a fix, his own copy, a merge commit carrying a conflict resolution) gets its
    delta reviewed before the merge.
  - A rebase is new commits too; the ruleset requires a PR to be up to date before it merges, so
    a PR that waits while the default branch moves gets one. His rule for it, verbatim
    (2026-10-19, replacing his earlier docs-only version): "Keep "require branches to be up to
    date" on. A rebase needs no delta review only when all three hold: no conflicts; git
    range-diff shows every patch unchanged; the PR's changed files don't overlap the files changed
    by the new commits on main. Then green CI on the rebased head is the gate. Paste the
    range-diff summary and the overlap check in the PR. Anything else (a conflict, a patch
    difference, an overlapping file) gets a short delta review, Tier 1 included."
  - The two exceptions in his words above: a PR with a migration waits for his production
    migration from the PR branch; a Tier 1 PR waits until its full review has passed, then
    merges like any other.
- **Full `pnpm check` runs are serialised:** at most two at once on the machine. In this session's
  scratchpad that's `check-slot.sh`; any equivalent lock will do. Targeted suites are free.

## What continues automatically, and what does not

Continue without asking:

- the next row in the current phase's plan
- fixes for a blocker: a STOP, or a Tier 1 note on a live security path. Since 2026-10-21 other
  review notes wait for their area's follow-up batch.
- sweeps the reviewer identified as the same defect class (into that batch, unless a blocker)
- anything already decided in this conversation or recorded in `docs/`

Stop and ask, regardless of what the reviewer said (narrowed 2026-10-17: ask only for
irreversible, security, public-claim or brand-voice questions, batched at a PR's start; an
ambiguous design point with no mock, or a reversible schema choice, is now decided and listed
under "Decisions taken"; see the working-mode amendment):

- the reviewer's STOP list (production, deletion, Ukrainian copy, user-facing claims, secrets,
  asset licensing, ambiguous design with no mock, widening a schema for a temporary mode)
- a collision between an instruction and the code that cannot be resolved without choosing
- a plan item whose acceptance criterion turns out not to be measurable as written
- anything that would take more than one phase to do properly

When you stop, stop with work in hand: do the preparatory part that is unambiguous, then
present the decision. Do not sit idle waiting.

## Reporting

Between iterations, keep it short - what shipped, what the reviewer found, what is next. The
long form belongs in the PR body, not in chat.

When you stop for a decision, the message has four parts and nothing else: the decision, the
options, the consequence of each, your recommendation. No recap of what you built.

Session reports to Oleksii: what shipped, what's in the inbox, what's next - under ten lines.
Everything else is in the PR.

## Documentation diet

(`docs/handoff-2026-10-04.md` §4.5.) The build-plan is this project's longest artefact and a
real tax on every session's context. Standing rule from 2026-10-04:

- A **build-plan row is at most five lines**: status, PR, one sentence of what shipped, what's
  verified vs asserted, follow-ups by ID. The narrative - review rounds, measurements, what
  was mutated - lives in the **PR body** and in `docs/reviews/`. Existing long rows are left
  alone (don't spend a session rewriting history); new rows follow the rule.
- The `pnpm check` wall-time paragraph and Part 3's hour-arithmetic paragraphs in
  `docs/build-plan.md` are frozen - no more updates; `docs/handoff-2026-10-04.md` §3's ledger
  is the plan of record for ordering from here.

## Standing constraints that outrank convenience

These live in `docs/standing-constraints.md` and are repeated here because the loop is where
they get skipped:

- Time is not a decision input. No deadline unless Oleksii states one. Where options differ,
  the better product wins. "Faster" never appears in a decision record.
- A claim verified against shape is not verified. Run it.
- The mutation for a floor is crossing it, not perturbing the measurement.
- A documented limit with no test exercising it is not a limit. (For visual limits, until the
  brand lands: see "Test logic, not looks".)
- An assertion inside a conditional is not an assertion.
- A test may not compare output against the same constant the code renders.
- Where a mock exists, open the mock. Where none exists, the prose is the specification.
  (For structure and content; not pixels, until the brand lands.)
- Anything demo mode suppresses needs harness coverage of its non-demo state.
- Local Postgres and Neon are not the same database. A driver-, connection-, or dialect-touching
  change needs a check against real Neon before it's called verified - a green local suite
  alone doesn't cover it.

## Process tiers

Not every change earns the same scrutiny. Classify before starting; say which tier and why.

**Superseded in part, 2026-10-17** (the working-mode amendment under "The loop"): Tier 1 is now
auth/access, data deletion, production writes, secrets, R2, and anything a public page or email
claims. Tiers 2 and 3 below merge into "everything else: one review". Read the definitions below
with that override. **And since 2026-10-21** ("Who does what", top of "Working loop"), the
reviewer is a fresh reviewer session for Tier 1 (cloud through 2026-10-23, a fresh local agent
since) and the local agent for everything else; a PASS WITH NOTES merges and its notes are
batched. Where Tier 2 below says to spawn `opika-reviewer` in the background, read that as the
local agent's one review.

TIER 1 - full gate. Phase 0 questions answered and sent to Oleksii before code. Reviewer
required. Mutation required. Applies to: production data, seed/truncate/migration paths,
secrets and security, user-facing claims and the /prytulkam commitments, Ukrainian copy,
asset licensing, anything a real shelter's data flows through.

**Deleting existing copy that a shipped change made false is not gated the same way** -
`docs/standing-constraints.md`'s "Removing a false claim is not the same gate as adding one":
a deletion needs no Phase 0 round trip, since it can only narrow what a page asserts, never
introduce a new claim. Writing whatever fuller, honest replacement comes later still goes
through the full Tier 1 gate like any other new copy - the deletion and its eventual
replacement are two separate actions on two separate tiers, not one held hostage to the other.

TIER 2 - reviewer only. No gate to Oleksii, no round trip. Do the work, pnpm check, commit,
spawn opika-reviewer in the background against the commit (see the 2026-10-04 amendment to
"The loop"), and continue to the next row without waiting on it. Applies to: app code, layout,
tests, harness work, refactors.

TIER 3 - light. pnpm check and commit. Reviewer runs once at PR level over the batch, not per
commit (since 2026-10-21, that review is the local agent's, or a fresh local reviewer's when the
local agent wrote it). Applies to: renames with no behaviour change, doc edits, comments, formatting,
config with no runtime effect.

When a tier is ambiguous, pick the higher one and say so in one line. When a Tier 3 change
turns out to touch behaviour, stop and re-tier rather than continuing at the lower bar.

Do not bundle tiers. A Tier 1 item riding inside a Tier 3 commit erases the distinction.
