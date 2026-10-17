# Decisions inbox: copy/reyestr-drafts

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| CB-Q2 | 2026-10-17 | «реєстр» rows 4–21 (`docs/copy-reyestr-hits.md`) | Wording for the remaining hits under his default rule CB-B2 | — | drafts under CB-B2, each before/after in the PR body | Verbatim (2026-10-17): "«реєстр» rows 4–21: draft them with the CB-B2 default rule in a separate draft PR, with each before/after in the PR body. I review it tomorrow; don't mark it ready." | drafted; awaiting his review (this PR stays a draft) |
| CB-T4 | 2026-10-17 | The operator in third person on the sign-in page | CB-B2 says «я» for the person checking shelters; `signIn.intro` addresses everyone | «я» · his role label | — | — | Decision taken: `signIn.intro` uses his role label «адміністратора сайту» (answer 9); `addressNote` and `inviteLanding.expired` use «я» per CB-B2 |
| CB-T5 | 2026-10-17 | The guard test | — | — | — | — | Decision taken: `copy-status.test.ts`'s CB-B1 guard now covers every reworded key (uk "no «реєстр»", skipping the legal term «зареєстр…»; en "no registry") |
