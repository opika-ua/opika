# Decisions inbox: feat/r-ui-3

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

Oleksii's answers below were sent to the coordinating session directly (his message of
2026-10-17, evening, and the RU-R2 row from his round-2 answers to the coordinator's questions
the same evening) and reach this branch through that session's answers file; they are quoted
verbatim from it. The questions are RU-Q4, RU-Q5 and RU-Q7 as asked in
`docs/decisions-inbox/docs-r-ui-scope.md`, and the coordinator's round-2 question 2 (summarised
here, not quoted). Everything outside quotation marks is paraphrase: the "Status" column says
what this branch built against each answer. The reversible decisions this branch took are listed
in its report for `docs/decisions-inbox/away-2026-10-17.md`, not here.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| RU-Q4 | 2026-10-17 | R-UI 3, S4 decision panel | Create, then verify (as asked in `docs-r-ui-scope.md`) | see `docs-r-ui-scope.md` | none | Verbatim: "4. Yes: Pending → «Взяти на розгляд» → «Схвалити», no shortcut." | built: `offered-actions.ts` offers no approve from `pending`; approve is offered only from `under_review`, gated by the domain's `evidenceGaps` (FSM parity test, `offered-actions.test.ts`). `pending → rejected` stays offered, as the domain keeps that edge open (CLAUDE.md decision #5) |
| RU-Q5 | 2026-10-17 | R-UI 3, support mode | Support mode in the first cut (as asked in `docs-r-ui-scope.md`) | see `docs-r-ui-scope.md` | none | Verbatim: "5. Yes: support mode in R-UI 3. Leaving it returns to the list." | built: `SupportEntry` on S4 calls `registry.support.enter`, then goes to `/kabinet`; `SupportBanner`'s exit now goes to `/kabinet/prytulky` (KS-T11's `/` superseded); harness: S4 → support view → exit → «Притулки» |
| RU-Q7 | 2026-10-17 | R-UI 3, the shelter's side | The shelter seeing the reason (as asked in `docs-r-ui-scope.md`) | see `docs-r-ui-scope.md` | none | Verbatim: "7. Yes: a minimal shelter-side view in R-UI 3 showing the code and my note verbatim (keys in rui-copy-uk.md §3.4)." | built: `VerificationDecision` on `/kabinet` for `rejected` and `suspended` (admin and support view), with `kabinet.verificationDecision.*` as in the catalogue; the note's label and signature as RU-R2-2 below |
| RU-R2-2 | 2026-10-17 | R-UI 3, the shelter's side (RU-Q7) | His §3.4 label «Пояснення від {operator}:» needs the operator's name in the genitive after «від», and the configured name is nominative only (RS-Q2): what should the label say? | (the coordinator's round-2 question 2) | until his answer, the label rendered «Пояснення:» (the coordinator's AW-R3-1) | Verbatim: "2. Reason view on the shelter side: «Пояснення:», then my note verbatim, then a signature line «— {operator}» (nominative, as in the emails). No new env var." | applied: `verificationDecision.noteLabel` is «Пояснення:»; a new key `verificationDecision.signature` «— {operator}» renders under the note, outside its quotation, filled with `standaloneOperatorName` (the configured `KABINET_OPERATOR_DISPLAY_NAME`, else «Адміністратор сайту», what both emails sign); no new env var. A reason with no note shows neither label nor signature. Pinned in `copy-status.test.ts` (typed literals, the label against his first text) and `VerificationDecision.test.tsx` per status; the harness reads all three lines on `/kabinet` while suspended |
