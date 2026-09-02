---
description: Implement a phase from docs/build-plan.md — plan, gate if needed, build, review, open a PR.
argument-hint: <phase id, e.g. E or E1, or a phase name>
---

Implement phase **$ARGUMENTS** from `docs/build-plan.md`.

## Read first

`CLAUDE.md`, `docs/standing-constraints.md`, `docs/build-plan.md`, and the sections of
`docs/design/README.md` relevant to this phase. These are the source of truth. If you
believe one is wrong, say so and stop — do not quietly work around it.

**Check the documents against reality before trusting them.** A plan describes a moment.
Confirm the paths, files and branches it names actually exist. This project has been
misled twice by a document that was true when written.

## Phase 0 — Orient

Confirm the working tree is clean, `main` is current, and `pnpm check` passes **before**
you change anything, so a pre-existing failure is never mistaken for one you introduced.
If it fails, stop and report.

Extract this phase's tasks, hour estimate and definition of done. Restate the definition
of done in your own words — that is the contract you will be held to.

## Phase 1 — Plan, and decide whether to stop

Produce a short plan: tasks in dependency order, the model for each per
`docs/model-policy.md`, what you expect to be hard, and what you are deliberately not
doing.

Then check it against the gate conditions below.

**STOP and wait for approval if the phase involves any of:**

- a change to a database schema, migration, or index
- a change to `packages/contracts`, or to any type in `packages/domain`
- anything touching sessions, authentication, rate limiting, cursors, or the fields that
  `implement(contract)` strips
- a deviation from `docs/design/README.md`, including any value the design specifies
  exactly (colours, spacing, motion timings, thresholds)
- a decision the build plan does not settle, or a conflict between two documents
- an estimate exceeding 150% of the plan's hours

**Otherwise proceed without waiting.** Say in one line which gate conditions you checked
and why none applied.

If Phase 0's own investigation is what reveals the 150% line has been crossed — not the
plan's original number, but what you found once you looked — say so in gate terms before
moving on to whatever other question the finding raises. E5 crossed it in Phase 0 (3 h
planned, and the investigation alone found several times that missing) and the stop that
followed was framed around two architecture questions, never around the hours condition
itself; the right outcome happened, but not because the gate fired — see
`docs/build-plan.md`'s Part 3, E5 correction paragraph. A gate satisfied by coincidence
isn't one the next overrun can rely on.

The gate exists because wrong-direction work is far more expensive than a round-trip, and
on a ten-hour week a wasted session is a wasted week. It is not a formality — but nor
should it fire on work that is genuinely mechanical.

## Phase 2 — Implement

1. Branch: `git switch -c <type>/<phase-id>-<short-slug>`
2. Implement in dependency order. Tests alongside each unit, not batched at the end.
3. **Commit after each task, not at the end.** Nine files of finished work were once lost
   to a branch switch because they sat uncommitted for hours.
4. Run `pnpm check` at every natural checkpoint.

Apply `docs/standing-constraints.md` throughout. If something is genuinely ambiguous and
Phase 1 did not settle it, stop and ask rather than guessing.

## Phase 3 — Review

Invoke the **reviewer** subagent against `git diff main...HEAD`. It may fix what it finds
and re-review, up to two rounds; anything surviving two rounds goes into the pull request
as unresolved rather than being attempted a third time.

If tests fail and the cause is not obvious, invoke the **debugger** subagent rather than
guessing.

If the reviewer returns `blocked`, stop and report. Do not open a pull request.

## Phase 4 — Pull request

Only once `pnpm check` is green, including `next build` and the harness:

```
git push -u origin <branch>
gh pr create --fill
```

The body must contain:

- **Phase** — id and one line.
- **Definition of done** — each criterion marked **verified** (you ran something that
  would fail if it were false) or **asserted** (you believe it but did not check). Never
  tick a user-interface item on markup inspection. An unmet criterion stated plainly is
  useful; a checkbox ticked optimistically costs a day later.
- **Decisions made** — anything you settled that the plan did not, and why.
- **Reviewer report** — resolved, unresolved, observations, in full.
- **Follow-ups** — deferred work, and which phase owns it. File GitHub issues for
  anything that will outlive this branch.

Then stop. Do not merge, do not push to `main`.

## Reporting back

A few sentences: what was built, test count before and after, what the reviewer found,
what needs a decision, and the pull request URL. The detail belongs in the pull request.
