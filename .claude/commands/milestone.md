---
description: Implement a milestone from docs/build-plan.md on a branch, review it, and open a pull request.
argument-hint: <milestone id, e.g. M2>
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Task
---

Implement milestone **$ARGUMENTS** from `docs/build-plan.md`.

Read `CLAUDE.md`, `docs/build-plan.md` and `docs/stack-decision.md` first. They are the
source of truth. Do not relitigate decisions recorded there — if you believe one is
wrong, say so and stop; do not quietly work around it.

## Phase 0 — Orient

Confirm the working tree is clean and `main` is up to date. Confirm `pnpm check` passes
*before* you change anything, so a pre-existing failure is never mistaken for one you
introduced. If it fails, stop and report.

Extract from the build plan, for this milestone only: the task list, the hour estimate,
and the definition of done. Restate the definition of done in your own words — that is
the contract you will be held to at the end.

## Phase 1 — Plan, then STOP

Produce a short plan:

- The tasks, in dependency order.
- For each, the **model** you would use and why, per the model policy in `CLAUDE.md`.
- Every decision the milestone requires that the build plan does not settle. This is
  the important part — list them explicitly as questions rather than choosing.
- Anything you expect to be hard, and what you'd do if it doesn't work.
- What you are deliberately NOT doing, so scope is agreed before it drifts.

**Stop here and wait for approval.** Do not create a branch, do not write code.
The plan gate exists because wrong-direction work is far more expensive than a
round-trip, and on a ten-hour week a wasted session is a wasted week.

## Phase 2 — Implement

Once approved:

1. Branch: `git switch -c feat/<milestone-id-lowercase>-<short-slug>`
2. Implement in dependency order. Tests alongside each unit, not batched at the end.
3. Commit in logical units. Messages say what the change accomplishes and why, not
   which files moved.
4. Run `pnpm check` at every natural checkpoint, not only at the end.

Hold to these throughout:

- No `any`. Biome errors on it deliberately.
- Discriminated unions over booleans-plus-a-comment.
- `now` is a parameter to pure functions; the clock is never read inside them.
- Public views are built with `pick`, never `omit`.
- Comments explain *why*. Update any comment your change invalidates.
- No brand strings ("Opika") in `packages/domain` or `packages/contracts`.
- Stay inside the milestone. If you find an unrelated defect, note it for the report
  rather than fixing it.

If something is genuinely ambiguous and was not settled in Phase 1, **stop and ask**.
Guessing is what produces work that has to be redone.

## Phase 3 — Review

Invoke the **reviewer** subagent against `git diff main...HEAD`.

It may fix what it finds and re-review, up to two rounds. If a finding survives two
rounds, it stops — that is a design question for a human, and you must not attempt a
third fix. Carry unresolved findings into the pull request body verbatim.

If the reviewer returns `blocked`, stop and report. Do not open a pull request.

If tests fail at any point and the cause is not obvious, invoke the **debugger**
subagent rather than guessing at a fix.

## Phase 4 — Pull request

Only after `pnpm check` is green and the reviewer has returned `clean` or `findings`:

```
git push -u origin <branch>
gh pr create --fill
```

The pull request body must contain:

- **Milestone** — id and one-line description.
- **Definition of done** — the criteria from the build plan, each marked met or not,
  honestly. An unmet criterion stated plainly is useful; a checkbox ticked
  optimistically is a lie that costs a day later.
- **Decisions made** — anything you settled during implementation that the plan did
  not, and the reasoning.
- **Reviewer report** — resolved, unresolved, and observations, in full.
- **Unresolved findings** — called out at the top if any exist. These are the reason
  the human is reading.
- **Follow-ups** — anything deliberately deferred, and to which milestone.

**Then stop.** Do not merge. Do not push to `main`. The pull request is the handoff.

## Reporting back

Finish with a short summary in chat: what was built, the test count before and after,
what the reviewer found, what needs a decision, and the pull request URL. Keep it to a
few sentences — the detail lives in the pull request.
