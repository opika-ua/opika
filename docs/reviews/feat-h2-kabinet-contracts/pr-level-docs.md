# PR-level Tier 3 pass: doc-only commits on feat/h2-kabinet-contracts (PR #85)

Scope: 680fabf, f48bb59, c68c354, a445663, 4b81960, c032c04, 62a13a1, plus the uncommitted HS-Q12 inbox row. Code commits are out of scope; they had their own Tier 1 reviews.

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
---|---
All 7 commits touch only `docs/*.md` (`git show --stat`). Nothing needs re-tiering | That any quoted text matches Oleksii's actual messages. I can't see them, so I checked internal consistency only
All 32 inbox rows have 8 cells (escaped `\|` inside code spans) | The 0009 rehearsal: no record in the repo either way
The same quotes match across inbox, S3 §8, phase0 and the PR body (S3-Q3 "before merge" correction, T1-T5, the 0008 "all as expected") | Oleksii's 0010 production re-check details (the PR body quotes only "expected")
Code at HEAD vs docs: `shelterKabinetContract`/`registryContract` split (contract.ts:23,38); `organization()` on with no org path in `FORWARDED_AUTH_PATHS` (auth.ts:184,203), which matches phase0; REGISTRY_CONFIRMED/WAS_PUBLISHED in errors.ts; the no-self-serve test names A1-A3/B1; timestamp CAS kept (kabinet-animal-repo.ts:52) | -
PR #85 body read via `gh pr view 85` | -

FINDINGS (most severe first)
1. [medium] 0009's rehearsal is recorded nowhere. Oleksii's own HS-Q6 order ("→ then 0009 rehearsal on a fresh child branch") and 2c48d9b's body ("0009 does not go to a rehearsal branch before that test passes") both expect one. The build-plan row skips from 0008's rehearsal to "0008 and 0009 applied to production", and the PR checklist has no 0009-rehearsal item. Fix: either record the rehearsal (branch, date, his result) or record that it was skipped and on whose word. Don't infer which.
2. [medium] The PR #85 body is stale, and HS-Q12 says "mark #85 ready". Problems: the title says "handlers slice to follow"; the checked cross-tenant item still says "today they are `it.todo`"; it describes `kabinetContract (35 procedures)`, which no longer exists; the verified counts are 1286, against 1370 at 1e62b04; 0008 says "post-check results not yet reported". The HS-T4/T4b box is unchecked under "Do not mark ready until every box is checked". Move it to the invite PR per HS-Q12 before flipping to ready, or the PR contradicts its own gate.
3. [low] Inbox statuses after HS-Q12. HS-T4 still says "Tracked on PR #85's checklist until then". HS-T4 and T4b should name the invite PR (HS-Q12). S3-T6 is still "open: decide in the handlers slice". The slice kept the timestamp guard (repo comment cites S3-T6), but the Neon round-trip test it promised doesn't exist. Record the default taken and where that test now lives. Small fixes: HS-T4b says "Both" over three items; HS-Q12 has no date, and its Default cell doesn't use the "None: Tier N" form.
4. [low] Build-plan H2 row (~4.8k chars). The new additions are migration post-check logs and a rehearsal endpoint id, which the diet puts in the PR body. The S3 clause still names `kabinetContract (35)`. The row doesn't say the 16 handlers and the real cross-tenant tests landed, and lists no open follow-up IDs (HS-T3/T4/T4b/T9/T10, S3-T6). Fix: collapse the S3 and handlers part into five lines or fewer (status, PR, what shipped, verified vs asserted, follow-up IDs).
5. [low] docs/h2-handlers-phase0.md: the Status line still says "questions… no code until answered". The Q4/Q6 bodies say super_admin lives "on the user record" / `users.role`, which HS-T2 superseded. The follow-up section records the change, but the Q4 decisions bullet needs a one-line pointer to it.

No provenance overreach found. Every "verbatim" is quoted, and paraphrases are marked ("in sense", "paraphrased", glosses outside the quotes).

SIMPLIFICATIONS
- build-plan.md:347: move the 0008/0009/0010 post-check detail to the PR body. Nothing breaks, because the PR body already holds it.

TESTS
None run (doc-only pass, per instruction).
