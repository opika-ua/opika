# Decisions inbox: feat/migrate-expect

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| AW-F1 | 2026-10-18 | A real `--expect` on `db:migrate` | `db:migrate` passed `--expect` to drizzle-kit, which rejected it | — | — | Verbatim (2026-10-18): "AW-F1: a real --expect on db:migrate, as its own small Tier 1 PR (script change only, tests for wrong and missing endpoints). Draft, for my review." | built; draft for his review |
| MX-T1 | 2026-10-18 | When `--expect` is required | always · non-local only | — | — | — | Decision taken: required for every non-local target, refused on a local one (tests and Docker migrate without it); checked after the production guard, before the target line |
| MX-T2 | 2026-10-18 | Where the check lives | copy demo:remove's · share it | — | — | — | Decision taken: `expectedTargetOf` moved from `demo-remove.ts` to `prod-guard.ts` and re-exported from `demo-remove.ts` (no behaviour change there) |
