# Review: feat/test-shelter-remove, pre-commit re-review (Tier 1, delta only)

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
---|---
`demo-remove.test.ts`: 41/41 green (was 34) | Full `pnpm check` (no commit yet; paste it in the body)
Finding 1 fixed: any token other than `--expect <ep>`, `--commit`, `--prod`, `--shelter <id>` is refused; `--shelters`, `--Shelter`, `--shelter-id`, `-shelter`, `--commt` and positionals are tested; a pasted URL is named by position only (`hunter2` absent, tested) | Oleksii's DR-B3 wording (came via the brief, and the inbox says so)
Mutation: unknown-arg branch → `continue` → 2 red: "refuses a mistyped --shelter…" and "refuses a stray positional…", `expected { kind: 'demo_range' } to deeply equal { kind: 'refused', …(1) }`. Source restored | Real Neon (no driver change)
Finding 3 fixed: `closingLine` is printed after a `--shelter` commit (read in `main`), and its exact text is tested |
Finding 4 fixed: `EmptyRemovalTarget` is thrown in `scopeOf` before any SQL; plan and remove are both tested, rows unchanged |
Simplification done: `Scope.animalIds` is gone from the type and the return; it is a local only |
DR-Q3: open, merge-blocking, Tier 1. Only his DR-B3 answer 3 is quoted ("Keep the existing guards: … zero shelters."); options (a) and (b) are paraphrase and marked as such. Option (b)'s "same condition the seed-range run applies" is accurate (`no_real_shelter` counts the shelters outside the range) |
Runbook: the commands at onboarding-a-shelter.md:261/263/294/297 use only the accepted flags (argv test "takes the runbook's full command line" plus the seed-range test). The new sentence matches the code: refusal list, "others counted, never named", "`--commit` prints the keys again", and the post-commit not-found refusal |

## FINDINGS
1. **[low] `packages/db/src/demo-remove.ts` (`parseRemovalTarget`, UUID refusal).** `--shelter ${value} is not a shelter id` echoes the token after `--shelter`, and that token is a non-flag token. Failure scenario: `--shelter postgres://u:<pw>@ep-….neon.tech/db` (a paste into the wrong slot) prints the production password to the terminal and scrollback. The positional case was fixed for exactly this reason. Fix: echo the value only if it matches a short safe pattern, such as `/^[A-Za-z0-9-]{1,64}$/`, and otherwise say "the value after --shelter N". Add one test with `hunter2`. I missed this in the first pass too.
2. **[note]** The commit body still needs the builder's `mutation: … → …` lines (finding 5 of the first pass).

## SIMPLIFICATIONS
None new.

## TESTS
packages/db `test/demo-remove.test.ts`: 41 passed (41).
