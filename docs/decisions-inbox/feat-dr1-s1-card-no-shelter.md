# Decisions inbox: feat/dr1-s1-card-no-shelter

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. Builder's decisions,
reversible; none is Oleksii's approval.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| DR1-S1-T1 | 2026-10-20 | Designer round 1, S1 (`docs/designer-round-1.md` §3, DR1-D1) | Which gallery-card variants lose the shelter line | standard only · all three (standard, reserved, resolved) | All three, as §3 says; the deck card's line is unchanged | - | Decision taken. Reverse: restore the `shelter-line` div in `AnimalCard.tsx` for the variants wanted |
| DR1-S1-T2 | 2026-10-20 | S1 | What happens to `verificationSuffix` and the copy it renders | delete with the gallery line · keep | Kept: `SwipeCard.tsx` still calls it and «· перевірений» is still used by the deck. No string removed, none added | - | Decision taken |
| DR1-S1-T3 | 2026-10-20 | S1 | The resolved-variant test "gives the shelter line ink-2" (a class assertion on the removed element) | delete · rewrite | Deleted: the element it measured no longer exists, and class assertions are frozen visual tests ("Test logic, not looks"). Replaced by behaviour tests that the name is absent from the text and the accessible name in all three variants | - | Decision taken; listed for Oleksii in the commit/PR body |
