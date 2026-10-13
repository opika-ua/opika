# Review: H2 handlers slice rows 4-5 (uncommitted tree vs 1e62b04), Tier 1, synchronous

VERDICT: STOP (blocks merge, not commit, per the 2026-09-06 amendment)

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Targeted suites green (counts below) | Workspace `pnpm check` green (1474 + harness 217): stated in the prompt, no commit body yet |
| Ownership mutation (findWithCity rewritten to report A as owner, via a temp vi.mock, since deleted): all 6 animalId cases go red, named per procedure (`expected 200 to be 403`; undoConfirm `expected 409 to be 403`) | The other 8 builder mutations |
| `applyAudited` SQL via `drizzle.mock().toSQL()`: `with "upd" as (update … returning "id") insert into "shelter_history" ("id","shelter_id","kind","at","entry") SELECT $3,"upd"."id",$4,$5::timestamptz,$6::text::jsonb FROM "upd"`. Column order matches, one statement, zero rows updated means zero rows inserted | neon-http behaviour of the CTE insert and the `::text::jsonb` listing compare (local postgres-js only) |
| jsonb CAS round-trip: 0004/0006 backfills write `to_char(…'.MS"Z"')`, the same form `toISOString` produces; 0008 sets `undoable: null` and JSON keeps null | Oleksii's verbatim quotes in the inbox |
| Commitment #2: no reveal/swipe/engagement field in views, handlers or repos (grep). The output-schema identity lock covers all 16 | |
| Commitment #7: edit writes no listing or `last_confirmed_at`; undo restores `previousConfirmedAt` (tests read) | |
| Once-public animal deletion, temp test (deleted): published, then a swipe, then withdraw, then restore_to_draft, then deleteDraft gives **500 INTERNAL_SERVER_ERROR**. The same path with no swipes gives **200, row hard-deleted** | |

## Findings (most severe first)

1. [high, STOP] `handlers/animals.ts:374-396`, `kabinet-animal-repo.ts:110`: "anything that was ever public is withdrawn, never deleted" is false. withdrawn→draft drops `publishedAt`, so `deleteDraft` hard-deletes a once-public listing (its public URL 404s, its record is gone). If any adopter swiped or revealed it, the FK (`ON DELETE no action`) turns the call into an untyped 500. Evidence: temp test above.
2. [medium, STOP] `app/api/kabinet/[...rpc]/route.ts:12`: the kabinet RPC shares `apiRateLimiter`'s public per-IP bucket (100/min). Nobody decided that. The STOP list includes rate limits.
3. [low] `kabinet-animal-repo.ts:27-31`: the header says state moves compare-and-set on `last_updated_at`. They compare-and-set on the listing jsonb. The comment is wrong.
4. [low] HS-T8 was applied to *every* listing move (publish, reserve, withdraw…), not only «Ще шукає». I think that reading is right ("most recently edited", and a move is not an edit), but the decision was made silently. Add an inbox row.
5. [low] `handlers.test.ts:322-333`: the test makes its two calls one after the other, so the handler's lost-race replan and the 3-attempt 500 never run. Only the repo CAS is tested. A listing stored in non-canonical form (e.g. a note string that matches the ISO regex) would fail CAS every time and produce 500s from then on.
6. [low] `handlers/profile.ts:66`: `Planned` discriminates on whether `"kind"` is present. The standing rule wants one consistent `kind` field.
7. [obligation] Run the CTE insert and the jsonb CAS against a Neon child branch before the production 503 lifts. Add this to HS-T4's checklist.

## Simplifications
- `tap` (animals), `tapWithRetry` (profile) and the `deleteDraft` loop are three copies of one bounded retry. One helper would replace them. If it's wrong, the replan-on-each-attempt semantics break.

## STOP reason (decisions needed from Oleksii, ranked)
1. May a draft that was once published (restored from withdrawn) be deleted? Options: (a) refuse, with ILLEGAL_TRANSITION, if it has any swipe/reveal, or (b) if it was ever published, which needs a durable marker because restore drops `publishedAt`; (c) allow it, and map the FK failure to a typed error. Recommend (b). The handler's own comment already states that rule.
2. Kabinet RPC rate limit: share the public 100/min per-IP bucket, or give it its own named limiter with its own budget. Recommend its own limiter.

## Tests
- contracts `src/kabinet`: 1 file, 140 passed
- db kabinet repos: 2 files, 9 passed
- web api (src/kabinet + cross-tenant + implement-contract): 6 files, 145 passed
- (local Node v22.22.3 against the pinned >=24; engine warning only)
