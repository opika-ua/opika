# Review: feat/test-shelter-remove, pre-commit (Tier 1, synchronous)

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
---|---
`demo-remove.test.ts`: 34/34 green | Full `pnpm check` green (counts given in the brief; the commit isn't made yet)
`no-self-serve-yet.test.ts`: 11/11 green | Oleksii's DR-B3 wording (it reached the branch through the coordinating brief, and the inbox says so honestly)
Mutation: drop `target_in_demo_range` → "an id inside the demo range": `expected 'removed' to be 'refused'`. The demo shelter really was deleted, so this refusal is the only thing guarding the demo range, and it is tested | Behaviour against real Neon (no driver change: the script still uses postgres-js)
Mutation: drop the zero-remaining check → both the seed-range test and the `--shelter` test go red |
Mutation: drop the `elsewhere` clause → 4 red, including "invitedToDemo stays" |
Mutation: drop the `isRealPhotoKey` filter → `expected [ …(9) ] to deeply equal [ …(6) ]` |
Mutation: drop the `--shelter=` refusal → argv test red |
Seed-range run unchanged (read, not run): the LIKE fragments are the same, `NOT (x LIKE p)` matches `NOT LIKE` on a non-null PK, and labels/refusal text are "demo" by default. Exception, by design: a photo section appears if a demo animal holds an `animals/` key (DR-T7) |
Isolation (read): every target is the id list or the target orgs (one org per shelter, so `organization_id` is UNIQUE); crossing reveals are refused; members and support sessions are refused; user deletion leaves out superadmin, member, operator, inviter and users invited elsewhere (demo included, and tested). Every FK cascade has been checked against the schema |

## FINDINGS (most severe first)

1. **[medium] `packages/db/src/demo-remove.ts:514-539`.** Any argv spelling other than exactly `--shelter` or `--shelter=` is silently ignored, and the run falls back to the seed range.
   Failure scenario: `demo:remove --expect ep-… --prod --shelters <id> --commit` (or `--Shelter`, `-shelter`) deletes the whole demo corpus. On production that passes every guard, because his own test shelters count as "a shelter outside the range". DR-T5 refuses `--shelter=` for exactly this reason, and the reason applies here too.
   Fix: refuse any argv token that isn't a known flag (`--expect`, `--prod`, `--commit`, `--shelter`) or the value after one. At minimum, refuse anything matching `/^-+shelter/i` other than exactly `--shelter`. Add one test.
   Evidence: read `parseRemovalTarget`. Only those two exact forms are checked.
2. **[low] `:351` with DR-T6.** "Would leave zero shelters" counts demo shelters. This is the literal reading of answer 3, and safe either way. But the other reading ("no real shelter would remain") fits DR-Q2's "same moment, after the first real shelter" better. The guard decides when a deletion may run, so I'd treat this as a Tier 1 question that blocks the merge, not a Tier 2 default. It is already in the inbox. Get his answer before the merge.
3. **[low] `:657`.** After a `--shelter` commit, the script prints "Run the dry run again: every count should be 0", and that dry run then exits 1 with `REFUSED`. The runbook explains it, but the script's own line doesn't. Suggest adding "and it refuses each id as not found" when `target.kind === "shelters"`.
4. **[low] `:112`, `:195`.** `{kind:"shelters", ids: []}` from a programmatic caller produces `IN ()`, which is a Postgres syntax error rather than a refusal. It fails safe, but the doc comment says a direct caller "is still guarded".
5. **[note]** The inbox lists no builder mutations. Put the five above (or your own) in the commit body as `mutation: … → …`.

## SIMPLIFICATIONS
- `:180`, `:256`: `Scope.animalIds` is returned but never read outside `scopeOf`. Remove it from the type and the return value. Nothing breaks.
- DR-T4's `demo…` field names: renaming them to `target…` is a fine Tier 3 follow-up. Keeping them for this diff is right.

## Builder decisions
DR-T4 accept. DR-T5 accept (extend it to finding 1). DR-T6 is a literal reading, but escalate it as a merge-blocking question. DR-T7 accept.

## TESTS
packages/db `test/demo-remove.test.ts`: 34 passed (34). apps/web `src/kabinet/no-self-serve-yet.test.ts`: 11 passed (11).
