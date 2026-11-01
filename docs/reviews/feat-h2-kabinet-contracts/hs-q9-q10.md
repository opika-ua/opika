# Review: HS-Q9 / HS-Q10 (uncommitted tree vs 5988fb6), Tier 1, synchronous

VERDICT: STOP (blocks the PR, not the commit). One decision only: HS-Q11. Every other condition in HS-Q9 and HS-Q10 is met.

| VERIFIED | TAKEN ON TRUST |
|---|---|
| db: first-published-backfill, kabinet-animal-repo, confirmation-backfill, feed-predicate-identity: 4 files, 23 passed | Workspace `pnpm check` (1486 + harness 217): uncommitted, so there's no commit body to read it from |
| web: kabinet/handlers, api/kabinet-cross-tenant, kabinet/auth: 3 files, 80 passed | The builder's 7 mutations. I didn't spot-check one: the brief forbids source edits |
| FK mapping on the neon-http shape: ran `deleteDraftIf` on a fake db that throws `DrizzleQueryError(cause: NeonDbError{code:"23503"})` → `{kind:"referenced"}`; the same with 23505 → rethrown | That a real Neon HTTP 400 fills in `NeonDbError.code` (the bundle copies `code` from the response; never run against Neon) |
| Never cleared on every write path. Read: `writeEditIf` whitelists columns, `writeListingIf` and `animalRepo.update` COALESCE, seed and onboard only insert, the only raw SQL writing `animals` is in migrations and tests | That production holds no non-draft row whose `listing` lacks its timestamp. If one exists, the guard aborts, which is safe |
| Limiter prefixes differ (`opika-kabinet-user-…`, `opika-kabinet-ip-…`), keys are `user:`/`ip:`, and `proxy.ts` only limits `/tvaryny*`, so the adopter budget isn't shared | |
| 0010 journal and snapshot chain correctly (prevId = 0009's id, `when` increases). drizzle-kit runs the migration in a transaction, so a guard abort rolls back the ADD COLUMN (0004-0008 use the same pattern) | |

## Findings

1. **[STOP, HS-Q11] `0010_clear_bastion.sql:20-26`, `mappers.ts firstPublishedAnchorOf`**: backfilling adopted/withdrawn rows goes beyond "where present". It is escalated correctly, but option B is described wrongly. The SQL comment says "this statement is the part to drop", and the inbox calls it "the one statement to drop". Dropping it alone makes the guard (`listing_kind <> 'draft' AND first_published_at IS NULL`) abort the migration on any database with an adopted or withdrawn row. B also needs the guard narrowed to published/reserved and `firstPublishedAnchorOf` changed to return null for adopted/withdrawn. Fix the HS-Q11 Options text so Oleksii decides on the real cost.
2. **[low] `0010:38-39`**: the "marked drafts" clause can never fire. The column is created in the same migration and the backfill only touches non-drafts. Production demo drafts can't trip it. It guards nothing, and the builder's guard mutation only exercised the unmarked half.
3. **[low] `handlers/swipes.ts:45`, inbox HS-T10**: WAS_PUBLISHED on an FK violation assumes a referenced row was public. `swipesRecord` checks only that the animal exists, not its listing state. Any session holding a draft's id can swipe it, which makes the draft undeletable, and the error then tells the shelter something false ("has been public"). Draft ids come from `randomUUID`, so this is low risk. Record it in HS-T10. A separate code isn't needed now.
4. **[low, obligation] HS-T4b**: add the neon-http 23503 catch to the real-Neon checks before the production 503 is lifted.
5. **[note] `rpc-route.ts:53-58`**: the per-user check runs after `getSession` + `roleOf`, so per-IP (300/min) is the only gate in front of two DB reads. That matches Oleksii's spec. Checking per-IP before the 503 reveals nothing (429 and 503 both carry no data). The only side effect: if Upstash is down, the production 503 shows as 429.
6. **[note] `handlers.test.ts` "never uses the adopter limiter"**: this checks the source text, not behaviour. The route's wiring (`kabinetLimiters`, `ip`, `userId` spread) is exercised by nothing else.

## Simplifications

- `principal.ts principalOf`: the only callers left are in `auth.test.ts`. Point those tests at `kabinetIdentityOf(...).principal` and delete the wrapper. Risk if wrong: none at runtime.
- `0010:38-39`: drop the marked-drafts count (finding 2). Risk if wrong: none. It can't fire.

## STOP reason

HS-Q11: does "Backfill from published_at where present" cover adopted/withdrawn rows using their own instant (A, as written), or leave them null (B: a withdrawn listing restored to draft becomes deletable again, and the guard plus mapper must change as well as the UPDATE)? Needed from Oleksii: A or B.

## Tests

db 4 files / 23 passed; apps/web 3 files / 80 passed (targeted only; run one after the other).
