# Decisions inbox: feat/r-ui-3

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

Oleksii's answers below were sent to the coordinating session directly (his message of
2026-10-17, evening) and reach this branch through that session's answers file; they are
quoted verbatim from it. The questions are RU-Q4, RU-Q5 and RU-Q7 as asked in
`docs/decisions-inbox/docs-r-ui-scope.md`. Everything outside quotation marks is paraphrase:
the "Status" column says what this branch built against each answer. The reversible decisions
this branch took are listed in its report for `docs/decisions-inbox/away-2026-10-17.md`, not
here.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| RU-Q4 | 2026-10-17 | R-UI 3, S4 decision panel | Create, then verify (as asked in `docs-r-ui-scope.md`) | see `docs-r-ui-scope.md` | none | Verbatim: "4. Yes: Pending → «Взяти на розгляд» → «Схвалити», no shortcut." | built: `offered-actions.ts` offers no approve from `pending`; approve is offered only from `under_review`, gated by the domain's `evidenceGaps` (FSM parity test, `offered-actions.test.ts`). `pending → rejected` stays offered, as the domain keeps that edge open (CLAUDE.md decision #5) |
| RU-Q5 | 2026-10-17 | R-UI 3, support mode | Support mode in the first cut (as asked in `docs-r-ui-scope.md`) | see `docs-r-ui-scope.md` | none | Verbatim: "5. Yes: support mode in R-UI 3. Leaving it returns to the list." | built: `SupportEntry` on S4 calls `registry.support.enter`, then goes to `/kabinet`; `SupportBanner`'s exit now goes to `/kabinet/prytulky` (KS-T11's `/` superseded) |
| RU-Q7 | 2026-10-17 | R-UI 3, the shelter's side | The shelter seeing the reason (as asked in `docs-r-ui-scope.md`) | see `docs-r-ui-scope.md` | none | Verbatim: "7. Yes: a minimal shelter-side view in R-UI 3 showing the code and my note verbatim (keys in rui-copy-uk.md §3.4)." | built: `VerificationDecision` on `/kabinet` for `rejected` and `suspended` (admin and support view), with `kabinet.verificationDecision.*` as in the catalogue |
