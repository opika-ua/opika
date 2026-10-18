# Decisions inbox: docs/migrate-expect-gate

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| GB-B1 | 2026-10-18 | The production migration gate block | — | — | — | Verbatim: "From now on every gate block uses db:migrate --prod --expect <ep>; update the runbook." | done: `docs/onboarding-a-shelter.md`, "Migrating production"; `pr6-checklist.md` 8.2 points to it; `k3-draft-shapes.md` §2.7 step 2 marked as the record from before #124 |
| GB-T1 | 2026-10-18 | Where `--expect`'s value comes from | `$ep` (derived from `$env:DATABASE_URL`) · typed | — | — | Verbatim (2026-10-18): "Endpoint typed in, never derived. Print the production id in the block as the value to type: --expect ep-dawn-pond-b1dz515g." Also: "Smoke blocks keep deriving $ep from the child URL; their protection is the script's production refusal. Say that in one line so nobody "fixes" it." | approved; the block prints the id, the helper section carries the smoke line |
| GB-T2 | 2026-10-18 | When the block runs | after the merge · before it, from the PR's head | — | — | Verbatim (2026-10-18): "Migrate before merge, from the PR branch: correct for additive migrations. Add one rule to the block: "Additive changes (new columns, DROP NOT NULL, constraints existing rows pass) → migrate, then merge. Destructive changes (DROP/RENAME a column or table, tightening a constraint) → expand/contract: first merge code that no longer uses the old shape, then migrate in a later PR. If in doubt, it's destructive: ask me." Each migration PR states which kind it is in its body." | approved; the rule is in the block, verbatim |
