# Decisions inbox: feat/followups-age-word-name-cap

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. Every row here is a
decision the builder took (reversible, listed under "Decisions taken" in the PR), not his answer.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| F5-T1 | 2026-10-18 | AW-F5: the K3 form's live age line | Which word the line names before a sex is chosen | `ageWordFor`'s own rule (the form starts on «Не записано», so today's forms) · wait for a sex · the female word | — | — | Decision taken: `ageWordFor(bucket, values.sex)`; the form's sex starts on "unknown", which his Q9 copy (#125) keeps on today's forms, so the line reads as the card would. Reverse: one argument in `FormSections.tsx` |
| F5-T2 | 2026-10-18 | AW-F5: the «Тепер на картці — «{label}».» line | Since #125 it named the sex-neutral word for a female animal, while her card names the female one | the saved sex · the form's current sex · leave it | — | — | Decision taken: `ageWordFor` with the **saved** sex, because the line describes the card as saved; the form's unsaved sex shows only in the live line. Reverse: `ageBucketLabel(...)` back on that one line |
