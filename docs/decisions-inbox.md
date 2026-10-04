# Decisions inbox

One table, on `main` only, append-only. Replaces `docs/decisions-pending-review.md`'s
per-branch narrative copies for every decision made from 2026-10-04 onward — see
`docs/handoff-2026-10-04.md` §4.4 and `CLAUDE.md`'s working loop, "Decisions stop blocking."

`docs/decisions-pending-review.md` is superseded and kept as read-only history; its own entries
are not migrated here.

## How this file is used

- A **Tier 2 decision never blocks the builder.** Take the recommended default, add a row here,
  continue. Oleksii answers in bulk when he reviews the PR; an override becomes a small
  follow-up commit, and the row's **Status** column is updated to `overridden` with a pointer to
  that commit. **This is not the STOP list** (`CLAUDE.md`'s "Stop and ask, regardless of what the
  reviewer said") — an ambiguous design with no mock, a new or changed user-facing claim, and the
  rest of that list still stop and wait, never take a default, no matter which tier the
  surrounding code is.
- A **Tier 1 decision still blocks the merge** — but not the rest of the branch. Add the row,
  commit the work, move to the next row that doesn't depend on it.
- **Ukrainian copy never blocks code.** New strings ship as `[COPY PENDING]`, pinned by
  `copy-status.test.ts`; the English sense and key name go in the **Question**/**Options**
  columns here. The only copy that *does* block a merge is a `/prytulkam` commitment sentence
  (`docs/standing-constraints.md`'s register), because a false sentence must never be live.
- **Branches write new rows to `docs/decisions-inbox/<branch>.md`** (same columns, one table, no
  header boilerplate needed beyond the column row) rather than editing this file directly — this
  file lives on `main` only. **Appending the branch's rows to the table below is part of merging
  the PR** — Oleksii's own action, since the agent never merges — done at the same time as
  deleting the branch's own `docs/decisions-inbox/<branch>.md`. A branch's rows are not "in" the
  inbox for his bulk-answer pass until that append has happened; say so explicitly in the PR body
  rather than assuming it's automatic.
- **Status** is one of: `open` (Tier 1, awaiting Oleksii), `default-taken` (Tier 2, no response
  needed unless he overrides), `answered` (he responded — see his answer column), `overridden`
  (he changed a default-taken row after the fact).

## Table

| ID | Date | Row | Question (one line) | Options | Default taken | Oleksii's answer | Status |
|----|------|-----|----------------------|---------|----------------|-------------------|--------|

No entries yet. **Deliberate deviation from the kickoff prompt's literal wording:** this
session (block 0, `chore/handoff-2026-10-04`) only built the mechanism and did not pre-record
the handoff's own DEFAULTs from §3/§3.1 (seed profiles, H2 scoping, EN-locale deferral, and the
rest) — none of those blocks have started yet, and recording a default before the row that
needs it exists would be exactly the kind of scaffolding-ahead-of-phase `CLAUDE.md`'s "Phase
scope discipline" warns against. Each DEFAULT is recorded here when the block that takes it is
actually started, not in advance.
