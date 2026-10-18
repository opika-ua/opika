# Decisions inbox: feat/q9-age-words

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| Q9-1 | 2026-10-18 | Follow-up Q9 (K3-F1): sex-aware age words on the card | — | — | — | Verbatim (2026-10-18): "Follow-up Q9: sex-aware age words for the card (domain function plus tests). Copy pending." | built and wired with his words (Q9-2) |
| Q9-T1 | 2026-10-18 | An animal whose sex is «Не записано» | masculine (today's words) · feminine · a neutral form | — | — | — | Decision taken: the generic masculine the card already uses; a guessed gender would state something nobody recorded |
| Q9-T2 (superseded by Q9-2: his words are final, in `uk.cardMeta`) | 2026-10-18 | Where the pending feminine words live | in `uk` as `[COPY PENDING]` · beside the helper | — | — | — | Decision taken: `PENDING_FEMININE_AGE_LABELS` beside `ageBucketLabelFor` in `animal-labels.ts`, outside `uk`, so no catalogue gate sees a pending public string; a source scan fails if anything outside `packages/i18n` imports them while pending |
| Q9-2 | 2026-10-18 | His feminine words, and wiring | — | — | — | Verbatim (2026-10-18): "Q9 copy (#125), age word on the card by sex: male: «малюк» / «молодий» / «дорослий» / «літній» (as today); female: «малючка» / «молода» / «доросла» / «літня»; unknown sex: keep today's forms («малюк» / «молодий» / «дорослий» / «літній»). Filter chips stay as they are: they name categories, not one animal. Wire it in #125 and add a test for each sex × bucket." | applied: `uk.cardMeta.age*Female`; `ageWordFor(bucket, sex)` on the gallery card (meta line and accessible name), the swipe card, the animal page subtitle and its page description; filter chips untouched |
| Q9-T3 | 2026-10-18 | Where the wiring reads the animal's sex | a new public field · the views' existing `sex` | — | — | — | Decision taken: the public card and detail views already pick `sex`; no contract change |
