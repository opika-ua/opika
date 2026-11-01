---
name: opika-smoke
description: Use for any PR that touches SQL, a Drizzle migration, a repository query or the DB driver in Opika, and whenever a real-Neon smoke sitting is mentioned. Smoke sitting rules and the smoke-sitting generator.
---

# Opika smoke sitting (SQL PRs only)

Local Postgres and Neon are different databases (`neon-http` vs `postgres-js`); a SQL change is not
verified until a sitting has run against real Neon.

- **Never production. Always a fresh Neon child branch**, with `PROD_NEON_ENDPOINT` set, and no "no
  migration, so run it directly" exception. The fixture writes in `neon-smoke.ts` are disposable only on a
  real child branch.
- **Do not hand-write the commands.** Generate the block with `pnpm --filter @opika/db smoke-sitting`
  (`packages/db/src/tools/smoke-sitting.ts`); it refuses to render a sitting that says otherwise.
- PowerShell, secrets read with `Read-Secret` (never printed, echoed or logged; branch URLs carry the
  production password), one sitting file per day under `Claude outputs/`.
- Every command takes `--filter` (`db:migrate` and the smokes have no root alias); a non-local target needs
  `--prod` and `--expect ep-...` (`packages/db/src/prod-guard.ts`).
- Migrations and SQL also get a separate reviewer (lean rule 1). The owner runs the production migration
  from the PR branch before the merge. State the migration kind in the PR: none, additive or destructive.
- The production settlement import is the one sitting with a production part: generate it with the
  `rehearsal` + `production` input shape (`renderProductionImportSitting`): a child-branch rehearsal first, then
  the import behind `--prod --expect`, a Neon restore branch and a typed endpoint confirmation. Never a hand edit.
- The owner runs the sitting; you prepare the file and the expected counts, and you do not merge before it.
