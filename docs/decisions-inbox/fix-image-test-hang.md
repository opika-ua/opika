# Decisions inbox: fix/image-test-hang (#145, merged)

Rows for the shared table (`docs/decisions-inbox.md`). Recorded after the merge, in the follow-ups
PR, so #145 merged at exactly its reviewed head.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| IH-B1 | 2026-10-19 | The image fix, and the route's time limit | — | — | — | Verbatim: "Image fix: fine as you have it. Add a check that the upload route's Vercel maxDuration is above the 10 s processing budget, so the budget always fires first. Generic timeout error, no new copy: OK." | Done in #145: `export const maxDuration = 60` on the kabinet route, pinned by `photo-processing-budget.test.ts` |
| IH-B2 | 2026-10-19 | maxDuration's value | — | — | — | Verbatim: "Image fix: maxDuration = 60 is accepted, with the test guarding it." | Done (#145) |
| IH-T1 | 2026-10-19 | The processing budget | — | — | — | — | Decision taken: 10 s (`PHOTO_PROCESSING_BUDGET_MS`). Reverse: change the constant; the maxDuration test keeps it under the route's limit |
| IH-T2 | 2026-10-19 | What an over-budget upload answers | `PHOTO_REJECTED` · the generic 500 | — | — | His words above: "Generic timeout error, no new copy: OK." | Decision taken, confirmed by him: the generic 500. A timeout doesn't prove the file is unusable, and it needs no new error code or copy |
| IH-T3 | 2026-10-19 | The over-budget log line | — | — | — | — | Decision taken: `{ event: "photo_processing_over_budget", budgetMs }` only: no file, name, shelter, address or key. Reverse: add fields |
| IH-T4 | 2026-10-19 | The bounded test's memory ceiling | — | — | — | — | Decision taken: 256 MB (before the fix 2.6–2.7 GB, after it about 14 MB; it scales with libvips' thread count). Reverse: change the constant in `generate-variants-bounded.test.ts` |
| IH-T5 | 2026-10-19 | When the crop-first path runs | always · only when the source doesn't cover the variant | — | — | — | Decision taken: only when the source doesn't cover the variant; one that does takes the old single pass, byte-identical. Ordinary landscapes under 1,400 px tall take crop-first for `detail`, framed the same within one source pixel. Reverse: always crop first |
| IH-T6 | 2026-10-19 | The `Math.min` clamp in `attentionCropBox` (a review suggested removing it) | remove · keep | — | — | — | Decision taken: keep, as a defensive bound; the sweep over every source 1..2000 shows it never binds. Reverse: remove it |
