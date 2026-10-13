# Review: animals.version (S3-T6 / RG-Q7), uncommitted tree on feat/h2-registry vs ad5ae2d

Synchronous Tier 1 review (migration + compare-and-set change).

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Targeted suites green: contracts src/kabinet 140/140; db kabinet-animal-repo + feed-predicate-identity 13/13; web api src/kabinet + cross-tenant 127/127 | Full `pnpm check` (1495 unit + 217 harness): builder's run. It must be pasted into the commit body |
| No `expectedLastUpdatedAt` left anywhere in apps/ or packages/ (grep) | Both builder mutations (edit not bumping, move bumping). I was told not to edit source, so I didn't re-run them |
| 0011_snapshot vs 0010_snapshot: the only difference is `animals.version` (integer, notNull, default 0); prevId chains correctly; the journal entry is idx 11 | Child-branch rehearsal and Neon apply: not done yet. The migration header claims it |
| Feed snapshot diff: only `, "version"` was added to the select list (6 snapshots) | neon-http behaviour: worked out by reasoning, not run |
| Response version = stored version: the handler rejects unless `animal.version === expectedVersion`; the repo writes `version + 1` under `WHERE version = expectedVersion`; so both are expected+1. The new test asserts `body.version` and `reload().version` both equal `a.version + 1` | |
| Oleksii's S3-T6 quote in the domain/repo comments matches the inbox row verbatim | |

## Findings (most severe first)

1. [low] packages/db/drizzle/0011_lovely_black_knight.sql:4. "rehearsed on a child branch before production" is written as a property of the migration, but it is still an obligation. Applying it with `--prod` is a separate step under the production gate. It needs the rehearsal recorded (branch id, `\d animals` showing the column, row count 18 with every row at version 0) before it runs. Suggest rewording to "to be rehearsed…", or recording the evidence in the PR body.
2. [low] packages/db/test/kabinet-animal-repo.test.ts:~91. The repo-level "ok" test doesn't check that the stored `version` was bumped. Only the handler test checks the +1. A future caller of `writeEditIf` that skips the handler would be unguarded at repo level. Optional fix: add `expect((await animalRepo(db).findById(id)).version).toBe(animal.version + 1)`.
3. [info] deleteDraft on version: no regression. Listing moves never touched `last_updated_at` either (HS-T9), so before and after this change, a move landing between read and delete is caught only by `listing_kind='draft' AND first_published_at IS NULL`. That predicate is enough: publish leaves listing_kind non-draft, and publish→restore sets first_published_at. A move from draft to draft doesn't exist. A concurrent edit is now caught by version.
4. [info] Leaving KabinetAnimalRowView without `version` is correct. List rows don't save, and the K3 form reads KabinetAnimalView, which now carries it. Public views use `pick`, so nothing leaks.
5. [info] Migration safety: `ADD COLUMN integer NOT NULL DEFAULT 0` is a metadata-only change on PG ≥ 11 (no table rewrite), purely additive, and has no backfill. The `UPDATE … SET version = version + 1 … RETURNING` is adapter-agnostic (no raw `execute`), and its result is used the same way as before (`.length === 1`).

## Simplifications
None worth taking.

## Tests
contracts 140 passed (1 file) · db 13 passed (2 files) · web/api 127 passed (5 files)
