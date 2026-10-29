# Settlement import (nationwide N2)

Loads the ministry's codifier of administrative-territorial units (КАТОТТГ) into `cities`.
The XLSX is not in this repository; the owner downloads it and passes its path.

- Pinned edition: 2026-07-07, order 1321, `kodifikator-07-07.xlsx`, sha256
  `5c5317759b2b90208e9b00338bc3db3c5e694272a166acf73f1543b3e18ecbea` (`editions.ts`). A file whose
  checksum is not pinned is refused; a new edition is pinned by hand after reading its dry run.
- Source page: mininfra.gov.ua, "Кодифікатор адміністративно-територіальних одиниць та територій
  територіальних громад".
- Licence: the ministry page states none. The data.gov.ua record says "Creative Commons
  Attribution" with no version (unverified) and was last modified in 2021, so treat it as stale.
  The source is credited anyway, whatever the version: the site footer carries
  `footer.dataCredit` (the codifier, Мінрозвитку, «Creative Commons Attribution»).
- Re-import: quarterly, and when a rename affects a listed shelter.

```
pnpm --filter @opika/db db:import-settlements --file <xlsx> [--expect ep-...]                   dry run
pnpm --filter @opika/db db:import-settlements --file <xlsx> [--expect ep-...] --commit
pnpm --filter @opika/db db:import-settlements --prod --expect ep-... --file <xlsx> [--commit]   production
```

Targets (`import-target.ts`, decided before anything connects or prints):

- A local database takes no `--expect`. A Neon child branch needs `--expect` naming its own compute.
- Production needs ALL of: `--prod`; `PROD_NEON_ENDPOINT` known (environment or the root
  `.env.local`; unset, every Neon target is refused, `--prod` included); `--expect` equal to that
  compute and to the target (the `db:migrate` check); and a clear readiness scan. Each is a refusal
  of its own. `--prod` on a target that is not production is refused too.
- Readiness scan (`readiness.ts`): no non-test source file under `packages/` or `apps/` may still
  read the whole city list (the city repo's list-everything method or the removed public list
  procedure). The CLI runs it from the checkout it runs in, so the import cannot be pointed at
  production from a tree that still contains such a read. An unreadable tree refuses too.
- The typed confirmation before `--commit`, and the Neon restore branch, belong to the smoke
  sitting (`pnpm --filter @opika/db smoke-sitting`, the production-import shape), not to the CLI.
- Printed first, whatever the target: the pre-flight (migration 0020 present, regions equal the
  27-row constant, file matches the pinned edition, how many cities and aliases the table starts
  with). In production a row without a code that is not one of the 8 legacy cities prints a loud
  line; it is left alone, not refused, as everywhere.
- `pnpm --filter @opika/db db:city-references [--prod --expect ep-...]` is read-only: animals and
  shelters per city plus a fingerprint over ids and counts. The import keeps the 8 legacy ids, so
  the fingerprint before and after is identical.
- `db:seed` still refuses production, `--prod` included, and only inserts cities that are missing.

Rules: identity is the КАТОТТГ code; a slug is assigned once and frozen; the 8 seeded cities are
adopted in place (7 renamed to `{name}-kyivska`, old slug kept as a `legacy` alias); a vanished code
is retired, never deleted, and refused while a shelter or animal points at it; centroids are never
written. Every region is treated alike, Crimea and Sevastopol included.
