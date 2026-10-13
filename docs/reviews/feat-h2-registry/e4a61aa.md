# Review: e4a61aa, db:check-hashes reports UNKNOWN and SKIPPED (fix for f842808 finding 1)

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| `compareHashes` logic. I extracted the committed `compareHashes`/`isFailure` (`git show e4a61aa:`) into a scratch file and ran it with tsx, no DB. A middle gap gives `match,skipped,match` and fails. A gap at index 0 with a later row gives `skipped,match,not_applied` and fails. Trailing unapplied gives `match,not_applied,not_applied` and passes. Empty gives all `not_applied` and passes. A regenerated last entry gives `match,match,not_applied,unknown` and fails. Numeric `created_at` matches | The two DB-backed tests (test 1, mismatch, regenerated-0011) were **not run**: the shared test DB is in use, as instructed. I checked them by reading the code only |
| `lastApplied` = highest committed index that has a recorded row. Since `index === lastApplied` always has a row, `<` and `<=` behave the same, so there is no off-by-one | The pasted `pnpm check` green: 1554 workspace, harness 217 |
| Mutation spot-check (scratch copy): `skipped` → `"not_applied"` makes the skip-middle case `match,not_applied,match` with fail=false. New test 2 asserts `["match","skipped","match"]`, so it goes red. `if (!known.has…)` → `if (false)` drops `unknown` from regen-last. The regenerated-0011 test's `filter(isFailure)…toEqual(["unknown"])` would then see `[]`, so it goes red (reasoned, DB test). Both `mutation:` lines in the commit describe real code breaks with test names | That `main()` prints the new lines and exits 1 at runtime. It is not exercised by any test (see note 1) |
| Exit code: `process.exit(checks.some(isFailure) ? 1 : 0)`. `isFailure` covers mismatch/unknown/skipped. Dropping `unknown` from `isFailure` turns the regen test red, and dropping `skipped` turns test 2's `some(isFailure)` red | |
| Formatting: all five prefixes are 10 columns wide and aligned. The UNKNOWN line names the hash prefix and `created_at`, so an operator can find the row | |

## Findings

1. [low] `check-migration-hashes.ts` `main()`: no test covers the report lines or the exit mapping, and the `switch` has no `never` default. If a sixth status is added later, it prints nothing, and nothing goes red. Exit codes are safe because they go through the tested `isFailure`. Optional fix: add `default: { const _: never = check; }`. Not blocking.
2. [low] Test 1 (`check.status !== "match"` → `[]`) now also implicitly asserts that the migrated test DB has no `unknown` row. That is good, but it is a side effect worth knowing: the builder's uncommitted regenerated 0011 will turn test 1 red on any test DB that still holds the old 0011 row until it is recreated. `setupTestDatabase` presumably recreates it. Not verified.

No defects found in the fix itself. Finding 1 of f842808 is resolved.

## Simplifications

None.

## Tests

None run against the DB (instructed). Scratch tsx run of the committed pure functions: 6 scenarios as listed above, plus 2 mutations, both detected.
