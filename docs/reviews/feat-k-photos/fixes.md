# Review: feat/k-photos, PR 3 (photo upload), fixes re-review, Tier 1, pass 2

Delta reviewed: the fixes to `pre-commit.md`'s findings 1-7, its simplifications, and the owner inputs recorded in the inbox (P-B3, P-B4, P-T4, P-T15, P-Q15). Uncommitted tree in `D:\opika-worktrees\kp`.

VERDICT: PASS WITH NOTES. Commit when ready. The STOP is cleared, apart from two merge gates that stay with Oleksii:
- **G1.** Run the Neon smoke against real Neon (his authorization). Expected: 25 passed.
- **G2.** Run the overwrite probe (expected: 412), before uploads open to any shelter.

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Touched suites green (counts below) | Full `pnpm check`. No commit body yet; paste it there |
| 1. Step 25 compares against the list read back through the driver. Mutation A, below: step 25 goes red, step 24 stays green | P-B1/P-B4 are verbatim (they came through the brief). F-B10 on origin/main backs up the to-dos |
| 2. Onboarding doc: the key comes from listing the bucket; the probe is the operator's two puts to `_probe/<uuid>` with the onboarding token, expecting 412; cleanup needs his OK; it runs before uploads open | The aws CLI's `--if-none-match` flag; R2 honouring it (G2) |
| 4. A declared 1024 with a 5 MiB body gets 413 and no session. Mutation B, below | Whether the token can delete (P-T15, unverified, recorded as such) |
| 5. The scan's two exceptions hold. `r2-client.test.ts` is pinned to the same two names, and destructive names are still scanned in tests. `AdminCommand` is a string union in `admin.ts`, no SDK has a command by that name, and the scan pins its declaration. Mutation C, below | |
| 6. `stack-decision.md` has a pointer at :23 and :314 | |
| 7. The `test-harness` JSDoc is reattached and the rate-limits comment is fixed. The IPTC precondition is green. A script confirmed WebP drops IPTC even with `keepMetadata()`, while TIFF keeps it, so the comment is true | |
| 8. All three simplifications are applied | |
| P-T4 uses `scope.shelterId`, so charging first costs only the caller | |

Mutations (each restored, sha256 re-checked):
- **A.** Made `writePhotosIf`'s expected list drop `alt: null`. Red, step 25 only: "reorder conflict, remove conflict, stale conflict, 2 photo(s), version 0 → 0, 1 photos line(s)".
- **B.** Made `boundedBody` trust a declared length. Red: "a small declared Content-Length followed by a larger body" (rpc-body-limit.test.ts:132, sentinel thrown at :38).
- **C.** Added `UploadPartCopyCommand` to r2-client's import. Red, 2 tests: both named `packages/db/src/image-pipeline/r2-client.ts`.

## FINDINGS (most severe first)

1. **[Low] .env.example, sections 1 and 2; docs/h1-decisions.md.**
   - "UPLOAD-ONLY token" claims a restriction the token lacks. P-B4 says it is "Object Read & Write".
   - "(to confirm when the token is created)" is stale.
   - Fix: say "its own token, Object Read & Write, scoped to opika-photos (P-B4); whether it can delete is unverified (P-T15)".
2. **[Low] docs/onboarding-a-shelter.md, probe step 5.** The reasoning "K-Q2 … does not forbid" a manual delete is the builder's reading. It also predates "no R2 deletes" in WM-B1 (his words, CLAUDE.md on origin/main). Drop the cleanup step and the interpretive sentence (see simplifications).
3. **[Low] Same doc, probe step 2.** The aws CLI reads `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, not `R2_*`, and it needs a region. As written, the command fails loudly on credentials or region. Prefix it with `AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto`.
4. **[Low] Inbox, P-Q15 row.** "The query he ran" goes beyond his words, which are only "Photo-count query on production main: 0 rows". Say "the query as sent to him". The provenance of P-B3, P-B4, P-T15 and P-T4 is correctly separated: nothing outside quotation marks reads as his.
5. **[Info] PR body.** List P-T4 under "Decisions taken" (WM-B1).

## SIMPLIFICATIONS

- onboarding-a-shelter.md, probe step 5: remove the cleanup. A few bytes under `_probe/` harm nothing, and the probe then performs no production deletion at all. If that's wrong, one stray object stays in the bucket until DR-F3 or a manual delete removes it.

## TESTS (touched suites only, not the workspace total)

- db (image-pipeline + neon-smoke.test): 72 passed, 7 files
- web (photos, rpc-body-limit, photo-pipeline-scan): 45 passed, 3 files
- contracts (kabinet/photos, kabinet/contract): 241 passed, 2 files
- Total: 358 passed, 12 files
