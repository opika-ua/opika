# Decisions inbox: chore/follow-ups-2

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. They record two of his
2026-10-19 instructions that landed in #150 without inbox lines.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| MR-B2 | 2026-10-19 | Rebases under "merge only the reviewed commit" | - | - | - | Verbatim: "Rebases, a narrower rule. Keep "require branches to be up to date" on. A rebase needs no delta review only when all three hold: no conflicts; git range-diff shows every patch unchanged; the PR's changed files don't overlap the files changed by the new commits on main. Then green CI on the rebased head is the gate. Paste the range-diff summary and the overlap check in the PR. Anything else (a conflict, a patch difference, an overlapping file) gets a short delta review, Tier 1 included. Put the rule in the merge-rule doc in the next docs follow-up. Apply it now to #146 and invite logging after #145 merges." | Done: CLAUDE.md's agent rules (#150); applied to #145, #147, #150 |
| LG-B1 | 2026-10-19 | PG-F3 and the launch gate | - | - | - | Verbatim: "Add PG-F3 to the launch gate as a hard item: no real shelters before it's merged." | Done: `docs/build-plan.md` Part 5 (#150) |
