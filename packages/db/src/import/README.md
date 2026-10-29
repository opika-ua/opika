# Settlement import (nationwide N2)

Loads the ministry's codifier of administrative-territorial units (КАТОТТГ) into `cities`.
The XLSX is not in this repository; the owner downloads it and passes its path.

- Pinned edition: 2026-07-07, order 1321, `kodifikator-07-07.xlsx`, sha256
  `5c5317759b2b90208e9b00338bc3db3c5e694272a166acf73f1543b3e18ecbea` (`editions.ts`). A file whose
  checksum is not pinned is refused; a new edition is pinned by hand after reading its dry run.
- Source page: mininfra.gov.ua, "Кодифікатор адміністративно-територіальних одиниць та територій
  територіальних громад".
- Licence: the ministry page states none. The data.gov.ua record says "Creative Commons
  Attribution" with no version and was last modified in 2021, so treat it as stale. Attribute the
  source anyway (a line on the shelter-facing or about page, N5) so a CC BY reading is covered.
- Re-import: quarterly, and when a rename affects a listed shelter.

```
pnpm --filter @opika/db db:import-settlements --file <xlsx> [--expect ep-...]            dry run
pnpm --filter @opika/db db:import-settlements --file <xlsx> [--expect ep-...] --commit
```

Child branches and local databases only. A production target is refused with or without `--prod`,
until the gallery and the pickers stop reading the full city list (N3 and N4); the production
import is a later sitting with its own change to the guard. `db:seed` refuses production too, and
only inserts cities that are missing.

Rules: identity is the КАТОТТГ code; a slug is assigned once and frozen; the 8 seeded cities are
adopted in place (7 renamed to `{name}-kyivska`, old slug kept as a `legacy` alias); a vanished code
is retired, never deleted, and refused while a shelter or animal points at it; centroids are never
written; Crimea and Sevastopol are stored but never offered.
