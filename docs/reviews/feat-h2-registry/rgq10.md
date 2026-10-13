# Review: 2b8a2e0 (RG-Q10 / RG-Q11 location:verify), Tier 1, pass 2

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
verify-locations + prod-guard tests: 34/34 green (opika_review) | Workspace `pnpm check` (1599 unit, 217 harness), from the builder's report, not pasted in this commit
CLI end to end on local: right key gives match 1 / demo 1 / MISMATCH 0, exit 0; other key gives MISMATCH 1, exit 1 | Builder's other 4 mutations (each listed with a red count, consistent with the tests as written)
NODE_ENV=production gives refusal, exit 1, before the DB is touched; missing secret gives exit 1 | Behaviour on Neon / neon-http jsonb round trip (Oleksii's rollout run is the first)
Output is counts and hostname only. No ids, coordinates or addresses (I read formatReport and the CLI output) | RG-Q10/Q11 verbatim quotes match the prompt's text (RG-Q10's full text only from the inbox)
Mutation spot-check: isSeedShelterId gives `true` → 2 red ("demo: 2 vs 1, testKeyOnRealShelter: 0 vs 1"), matches the builder's claim |
Seed range: seededUuid gives `51000000-…`. Onboarding ids come from a hash, so a collision is 2^-32 |
All three RG-Q11 paths are tested, plus a seed id matching neither key counting as a mismatch. No silent exemption |
§8 separates the verbatim quote from paraphrase. Guard wording is tested for both verbs |

FINDINGS (most severe first)
1. [low] packages/db/test/prod-guard.test.ts:121: the new describe was put under the `/** PG-2: … .env.local … */` comment. That comment now heads the wrong block. Move the new block above it.
2. [low] packages/db/src/seed-ids.ts:4: "the kabinet uses `randomUUID`" describes a shelter-create path that does not exist on this branch (the grep finds no shelter id minting outside the seed and onboarding). Reword it to what exists. When `registry.shelters.create` lands, it should get the claim and a test.
3. [low] packages/db/src/verify-locations.ts:91: the label `"seed"` is a second literal of seed.ts:212. If the two drift, every demo row turns into a MISMATCH. That fails closed, so it is not a privacy hole, but the rollout gate would show it as an unexplained mismatch. Export the label from seed-ids.ts next to the prefix.
4. [low] docs/h2-registry-shapes.md §8: "the app's key reproduces every stored location" overstates. Demo rows are reproduced by the test key. Make it "every non-demo stored location".
5. [process] The commit body has no `pnpm check` output (WIP commit). The real commit must paste it, including that the first harness run hit CONNECT_TIMEOUT and the rerun passed.

RG-T1 (zero shelters passes) stays an open inbox row. Not re-raised.

SIMPLIFICATIONS
- None of size. The `access` parameter is the minimum needed for finding 3 of the earlier review.

TESTS
packages/db verify-locations.test.ts + prod-guard.test.ts: 2 files, 34 passed (34). Mutation run: 2 failed / 6 passed in verify-locations, reverted, tree clean.

---

# Re-review: 953f2a1 (fixes only), pass 2 of 2

VERDICT: PASS

VERIFIED | TAKEN ON TRUST
--- | ---
(1) The new describe now sits above the PG-2 comment, and PG-2 heads `productionEndpoint` again (diff read) | The drift claim in (3): I did not mutate the constant, because the builder's `pnpm check` was running in this worktree and an edit would have corrupted that run
(2) The seed-ids.ts comment now claims only the hash-derived onboarding ids, which exist | Pasted `pnpm check` (note 5), which goes into the real commit
(3) `SEED_LOCATION_POLICY_KEY` is the only `"seed"` literal left in `src/`. seed.ts:212 and verify-locations.ts both use it. The test keeps its own literal |
(4) §8 now reads "every non-demo stored location", with the reason given |
Both test files re-run: 2 files, 34 passed |

On (3): the test inserts demo rows with the literal `"seed"`. If the constant changed, verify would recompute those rows with another key. Its first branch would also fail, so they would count as MISMATCH, which is the "matches neither key" path a pass-1 test already covers. The demo tests expecting `demo: 2` / `demo: 1` would go red. This is reasoned from code read, not a run mutation.

No new findings. Note 5 stays open until the real commit carries the pasted output.

TESTS
verify-locations.test.ts + prod-guard.test.ts: 2 files, 34 passed (34).
