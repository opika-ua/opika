# Decisions inbox: feat/q9-age-words

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| Q9-1 | 2026-10-18 | Follow-up Q9 (K3-F1): sex-aware age words on the card | — | — | — | Verbatim (2026-10-18): "Follow-up Q9: sex-aware age words for the card (domain function plus tests). Copy pending." | built, not wired; his feminine words pending |
| Q9-T1 | 2026-10-18 | An animal whose sex is «Не записано» | masculine (today's words) · feminine · a neutral form | — | — | — | Decision taken: the generic masculine the card already uses; a guessed gender would state something nobody recorded |
| Q9-T2 | 2026-10-18 | Where the pending feminine words live | in `uk` as `[COPY PENDING]` · beside the helper | — | — | — | Decision taken: `PENDING_FEMININE_AGE_LABELS` beside `ageBucketLabelFor` in `animal-labels.ts`, outside `uk`, so no catalogue gate sees a pending public string; a source scan fails if anything outside `packages/i18n` imports them while pending |
