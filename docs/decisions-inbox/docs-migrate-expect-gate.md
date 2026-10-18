# Decisions inbox: docs/migrate-expect-gate

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| GB-B1 | 2026-10-18 | The production migration gate block | — | — | — | Verbatim: "From now on every gate block uses db:migrate --prod --expect <ep>; update the runbook." | done: `docs/onboarding-a-shelter.md`, "Migrating production"; `pr6-checklist.md` 8.2 points to it; `k3-draft-shapes.md` §2.7 step 2 marked as the record from before #124 |
| GB-T1 | 2026-10-18 | Where `--expect`'s value comes from | `$ep` (derived from `$env:DATABASE_URL`) · typed | — | — | — | Decision taken: typed, the value of `PROD_NEON_ENDPOINT`. Derived from the URL it checks, `--expect` would always agree and catch nothing |
| GB-T2 | 2026-10-18 | When the block runs | after the merge · before it, from the PR's head | — | — | — | Decision taken: before the merge, from the main checkout switched to the PR's head (as 0012 ran for #116): Vercel deploys the default branch on merge, so the schema goes first |
