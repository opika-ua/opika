# Decisions inbox: feat/k3-form

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. K milestone PR 4 (K3,
the animal form). The batch for Oleksii at PR 4's start: `docs/k3-draft-shapes.md` §12 and
`docs/k3-copy-sheet.md` §15.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| K3-Q1 | 2026-10-17 | Storage for the draft type (shapes D1) | K-Q5 (name + species create a draft) can't be stored: `size`, `age`, `age_anchor_at`, `description_uk` are NOT NULL | A: the four nullable plus three CHECKs, one production migration (SQL, rollback, no backfill: shapes §2.3–§2.7); he migrates production, then the smoke run (30 passed), both before merge · B: sentinel values · C: a drafts table | none: Tier 1, production migration (recommend A) | | open |
| K3-Q2 | 2026-10-17 | A new animal's sex (shapes D2) | | default `unknown` («Не записано»); nothing public shows sex · nullable, plus a `sex` publish gap | none (recommend `unknown`) | | open |
| K3-Q3 | 2026-10-17 | «Станом на» (shapes D3) | The server discards the date the shelter picks and stamps the save time, so the field's hint would be false | keep the chosen date (not after today in Kyiv, floor 30 years) · drop the field | none: a claim on the form (recommend keep) | | open |
| K3-Q4 | 2026-10-17 | RH-B7's mechanism (shapes D4) | «Оновлено» counts from `last_confirmed_at`; a photo change moves only `last_updated_at` today | (i) a photo add, reorder or remove on a published or reserved card sets the confirmation date; commitment #7 reworded (shapes §7.3) · (ii) «Оновлено» switches to `last_updated_at` (every typo fix moves it) | none: a public claim (recommend (i)) | | open |
| K3-Q5 | 2026-10-17 | Copy sheet questions | The Ukrainian for every key, plus 14 brand-voice and claim questions | `docs/k3-copy-sheet.md` §15 | none: his copy | | open |
| K3-T1..T11 | 2026-10-17 | Decisions taken (T7 detailed in its own row below) | — | — | — | — | Decisions taken, one line each in `docs/k3-draft-shapes.md` §12 (names and guards, union of two picks, createDraft input, clearing only the description, `en` cleared on a `uk` change, autosave timing, the race fix, explicit save on a listed animal, one photo-error message, no visible-needs-a-photo CHECK, the 30-year floor) |
| K3-T7 | 2026-10-17 | A race in PR 3's code, found while checking RH-B7 | — | — | — | — | Live today, narrow (two tabs or two people, the allowlisted shelter only): a publish and a last-photo removal can interleave either way and leave a public card with no photo (`photosRemove` decides on the listing it read and compare-and-sets on photos only; publish compare-and-sets on the listing only). Fixed in PR 4: photo writes compare-and-set on the listing too; publish also requires the read version and a non-empty photo list (shapes §7.5) |
