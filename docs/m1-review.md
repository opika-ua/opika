# M1 code review — PR #1 `feat/m1-domain-contracts`

Four independent reviewers (correctness, data exposure, gap analysis, test
quality), then every serious claim re-verified by hand. Findings the reviewers
raised that did **not** survive verification are listed in §6 — they're
excluded from the counts.

**Verdict: request changes.** One finding is critical and defeats a settled
security decision outright. Three more are structural and cheapest to fix
before M2 exists.

The M1 code is, on the whole, well built — the union discipline is real, the
FSM table is genuinely exhaustive, and `pick`-not-`omit` closes the field-leak
class properly (and does so *at runtime*, confirmed below). The failures
cluster in one specific place: **behaviour that is asserted in a comment but
enforced by nothing.**

---

## 1. Critical

### C1 — The location fuzzing is exactly reversible from public data, and is never called anyway

`packages/domain/src/primitives/coordinates.ts:52-75`

The offset derives from exactly two inputs: the shelter id and
`fuzzRadiusMetres`. **Both ship to the client in the same response** —
`PublicShelterViewSchema` sends `id` and `publicLocation.approximate`, and
`approximate` carries `precisionMetres` verbatim. There is no secret anywhere
in the derivation, and the algorithm is in a public repo.

I inverted it. Attacker input is one unauthenticated feed response:

```
true       { lat: 49.9935,            lng: 36.2304 }
published  { lat: 49.99509869579027,  lng: 36.24010293913989 }
recovered  { lat: 49.9935,            lng: 36.23039999999994 }
error      0.0000 metres
```

Exact recovery of a shelter's street coordinates. This defeats locked decisions
#2 and #11 completely. For shelters in a Ukrainian oblast this is a
physical-safety exposure, not a privacy nicety.

My own doc comment — "a fixed offset per shelter leaks nothing beyond the first
observation" — is true only against someone who doesn't know the algorithm.
Everyone knows the algorithm. That comment was reasoning about the wrong threat
model and I should have caught it when I wrote it.

**Second half, worse:** `fuzzCoordinates` has **no production call site**. It is
referenced only by its own test. Grep confirms the same for `isPubliclyVerified`,
`isDiscoverable`, `donationHost` and `meetsEvidenceRequirements`. So today
nothing fuzzes anything — the function is a promise the codebase doesn't keep.

**Fix (two parts, both needed):**

1. Add a server-held pepper to the derivation, passed in as a field on
   `LocationPrivacyPolicy` so the domain stays I/O-free:
   `hashSeed(policy.pepper + seed, salt)`. Determinism per shelter survives;
   client reproducibility does not.
2. Make fuzzing structurally unskippable — brand the output so
   `fuzzCoordinates` is its only constructor:
   ```ts
   export const FuzzedCoordinatesSchema =
     ApproximateCoordinatesSchema.brand<"FuzzedCoordinates">();
   ```
   and have `PublicLocationSchema.approximate` require the branded type. Today
   `ApproximateCoordinates.center` and `ExactAddress.coordinates` are the same
   type, so an M2 repository can write
   `approximate: { center: shelter.exactAddress.coordinates, precisionMetres: 1000 }`
   — which typechecks, passes output validation, passes every existing test, and
   ships the exact position while the UI draws a reassuring 1 km circle around it.

---

## 2. High

### H1 — `session.bootstrap` cannot return the session id it promises to issue

`packages/contracts/src/procedures/session.ts:7`, `views/session.ts:18-27`

The input comment says "Null on a first visit; the server issues one in that
case." The output is `{ adopter, filters, serverTime }`, and `AdopterView` is
`{ id, country, preferredLocale, isAnonymous }`. **No field carries the issued
id.**

PWA first launch sends `null`, gets a response with nothing to persist. Second
launch sends `null` again, gets a *new* anonymous adopter. Saved filters gone,
`reveals.listMine` empty, every previously revealed shelter orphaned. The
anonymous-first model — the thing that makes deferring accounts safe — breaks on
day one.

### H2 — `deviceSessionId` is a client-chosen bearer token with no entropy requirement

`packages/contracts/src/procedures/session.ts:8` — `z.string().min(1)`

It is the only identity input in the whole eight-procedure surface, and
`reveals.listMine` documents itself as "scoped to the caller's own session by
the server". The server has nothing else to scope by.

Call `session.bootstrap` with `{ deviceSessionId: "1" }`. If the handler does the
natural get-or-create, you are now whichever adopter first claimed `"1"` — and
`reveals.listMine` hands over their entire history, including every
`shelterSnapshot.exactAddress` and `contact` they ever unlocked.

H1 and H2 are the same design hole from either side: the contract is two
incompatible designs half-merged. **Pick one — see the question at the end.**

---

## 3. Medium — structural, cheapest to fix now

| # | Finding | Where | Why now |
|---|---|---|---|
| M1 | **`ContactReveal` has no top-level `shelterId`** — it exists only inside `shelterSnapshot` | `reveals/contact-reveal.ts` | Phase 2's reward ledger credits *the shelter*. Abuse queries need "all reveals for shelter X". Joining via `animals` is wrong — the animal can be withdrawn, the snapshot is the historical truth. One field now; an expression index over jsonb later |
| M2 | **The age filter has no indexable form** | `animals/age.ts` | The stored union needs a 6-branch OR across two columns, which Postgres cannot combine with a keyset seek without a sort — so M2's own DoD ("`EXPLAIN` shows index scan, no sort") is unreachable. See the fix below; it's ~20 lines |
| M3 | **No `Swipe` entity and no seen-set model at all** | domain | The build plan calls the seen-set *the* design problem in M2, twice. Also `SwipeDirection` is declared in `packages/contracts`, inverting the stated dependency rule — a domain concept living in the transport layer |
| M4 | **Feed eligibility is TS predicates SQL can't call** | `listing.ts`, `verification/state.ts` | `isDiscoverable` and `isPubliclyVerified` are unused; M2 will hand-write `IN ('published','reserved')` with no compile-time link. Add a `satisfies`-checked exported array so a new variant breaks the build |
| M5 | **`SHELTER_NOT_VISIBLE` is a moderation-state oracle** | `procedures/shelters.ts:19-20` | `NOT_FOUND` is deliberately fused ("does not exist **or** is not visible") and then un-fused by the sibling code on the same procedure. Shelter ids are public on every card; any id returning `SHELTER_NOT_VISIBLE` is one a moderator suspended or rejected. Drop it from `shelters.byId`; keep it on `animals.reveal`, where the caller already knows the shelter exists |
| M6 | **The declared-age derivation understates age — the inverse of what its comment claims** | `animals/age.ts:73` | Adding the bucket's *lower* bound yields the *youngest* consistent bucket. A dog declared `adult` at 7.5y shows as `adult` for four more years while genuinely `senior`, and `isAgeEstimateStale` returns false throughout. My commit message argued the opposite direction was the safe one; the code does the unsafe one |
| M7 | **`canonicalizeFilters` doesn't collapse an exhaustive selection** | `adopters/feed-filters.ts:54-63` | Verified: ticking every species box gives `{oneOf:["cat","dog"]}` while "any" gives `{any}`. Two filter sets that mean the same thing serialise differently — precisely the cursor mismatch the function exists to prevent. `isUnfiltered` also returns false for a filter constraining nothing |
| M8 | **Cursors aren't bound to the filters they were issued against** | `procedures/feed.ts` | Any cursor parses with any filter set. `canonicalizeFilters`' own comment explains why that silently restarts or corrupts a page. Specify now: cursor payload embeds a fingerprint of the canonicalised filters; mismatch is the already-declared `INVALID_CURSOR` |
| M9 | **`FreshnessPolicy` accepts an inverted policy** | `discovery/freshness.ts:20` | Verified: `{freshMaxDays: 30, agingMaxDays: 7}` parses, and a 20-day-old listing classifies as `fresh`. The `aging` band becomes unreachable. One `.refine()` |
| M10 | **Scoring's description term is dead code** | `discovery/scoring.ts:35` | `LocalizedText.uk` is `min(1)`, so `description.uk.length > 0` is true for every schema-valid animal — a constant 0.25. Verified. Worse, the three tests "covering" it construct `{uk: ""}` as a bare TS literal, asserting behaviour on a state the schema forbids. Also gameable: `" "` earns full credit |

### The M2 age fix, concretely

`ageBucketOf` on a `declared_bucket` is algebraically identical to a birth date
of `declaredAt − AGE_BUCKET_MIN_YEARS[bucket]`. So add:

```ts
export const ageAnchorOf = (estimate: AgeEstimate): Date;
export const ageAnchorRange = (bucket: AgeBucket, now: Date):
  { afterExclusive: Date | null; atOrBefore: Date | null };
```

M2 then stores one `age_anchor_at timestamptz` column and the filter becomes
`age_anchor_at > $1 AND age_anchor_at <= $2` — sargable, one column, and
contiguous bucket selections collapse to a single range. Add a table-driven test
asserting `bucketForYears(ageAnchorOf(e))` never disagrees with
`ageBucketOf(e, now)`, and the derived column can't drift from the displayed one.

---

## 4. The tests are the weakest part of M1

A reviewer ran **30 targeted mutants against the suite. 9 were caught, 21
escaped.** That reframes the "137 tests passing" number: the suite is articulate
about intent and thin on assertions that fail.

The worst offenders, each confirmed by an escaping mutant:

- **`fuzzCoordinates`: 5 mutants, 5 escapes.** Pinning the bearing to 0 (every
  shelter offset due north), dropping the `cos(latitude)` correction, replacing
  `sqrt(u)` with `u**4` (points collapse onto the true position), and shrinking
  the radius to **1 metre while still reporting `precisionMetres: 1000`** all
  pass the existing tests. The suite tests only an upper bound and a single
  inequality.
- **`scoring`: no numeric value depending on a weight is pinned anywhere.**
  `hasPhotos: 0.5 → 0.05` passes. `aging: 0.6 → 0.95` passes — the honesty
  property silently stops working. Dropping the `sizes` dimension from
  `preferenceOf` entirely passes.
- **Contract view projections have no tests at all.** Adding `identity: true` to
  `AdopterViewSchema` — which carries `accountId` and `email` — passes all 13
  contract tests. Adding `shelterId` and `listing` to `AnimalDetailViewSchema`
  passes. The existing tests assert only what's *absent* from shelter views, so
  the public surface can silently shrink or grow.
- **`enteredAt` is only ever exercised on its `pending` branch.** Every fixture
  state is at `T0` and every event at `T1`, so the monotonicity guard is only
  ever satisfied, never triggered, for four of five statuses. Returning
  `new Date(0)` for `verified` passes all 44 tests.
- **Evidence carry-through is asserted on 2 of 6 legal edges.** Dropping
  `evidence: current.evidence` from `verified --suspend-->` passes, because every
  fixture shares one indistinguishable empty evidence record.
- **`MAX_PAGE_SIZE` is unpinned** — the assertion is computed from the constant
  under test, so raising it from 50 to 5000 passes.

The FSM table and the Ukrainian plural suite both hold up under mutation and are
the strongest files in the repo.

### Confirmed: `pick` really does strip at runtime

Worth recording, because the whole leak-prevention argument rests on it. From
`@orpc/server@1.14.14`:

```js
async function validateOutput(procedure, output) {
  const schema = procedure["~orpc"].outputSchema;
  if (!schema) return output;                    // ← the caveat
  ...
  return result.value;                           // the stripped object
}
```

So it is a real runtime property — **provided the server is built via
`implement(contract)`.** A handler on the plain `os` builder with no `.output()`
has `outputSchema === undefined` and returns the object untouched. Nothing in
`packages/contracts` can force that, and nothing tests it. **Write it into M4's
definition of done.**

---

## 5. Lower priority, worth recording

- `countEvidence` counts duplicates, so "two *independent* references" is
  satisfiable by submitting one reference twice.
- `transition()` never consults `meetsEvidenceRequirements`, so
  `under_review --approve--> verified` succeeds with `{items: []}` — the test does
  exactly that. Structurally it *can't*, since `ShelterVerification` carries no
  `ShelterLegalEntity`. It's a caller obligation nothing expresses.
- `ScoringPolicy` is the only policy without a Zod schema. A negative weight
  produces scores far outside `[0,1]` (measured: 7,500,000).
- No `UNAUTHENTICATED` error code, so an expired session has to masquerade as
  `NOT_FOUND`.
- `AnimalDetailView` and `FeedCardView` can't express "reserved", so
  `isDiscoverable`'s deliberate choice to keep reserved animals in the feed is
  unrenderable.
- No `country` on `City` or `Shelter` — the ADR assumed it existed for Phase 4.
- No donation-intent event. The ADR said to model this "now, for free"; it's the
  one direct ADR instruction M1 didn't execute.
- `swipes.record` takes one swipe but is documented as batchable — a reconnect
  flush of 200 queued swipes is 200 round trips.
- Photos as `photos[0]` makes array position load-bearing; store as ordered jsonb
  to avoid the ADR's documented 61-query N+1 at M5.

---

## 6. Raised but rejected on verification

Recorded so nobody re-litigates them:

- **"CLAUDE.md's size-bucket decision is stale (4-tier)."** False — the repo file
  says 3-tier with an explicit supersession note. The reviewer was reading an
  older copy.
- **"`canonicalizeSelection`'s default `Array.sort()` is a locale bug."** No —
  all four type parameters are strings, and UTF-16 code-unit ordering is exactly
  what a canonical form needs. `localeCompare` would be the defect.
- **"The two `hashSeed` salts are correlated."** No. Over 20,000 seeds: Pearson
  r = −0.026, means 0.5010/0.5002, octiles uniform within ~3%. No distribution
  defect. (The function is still broken, for the reason in C1 — but not this one.)
- **"A moderator entity is missing."** No — `ModeratorId` is sufficient, and
  keeping authorization out of `transition()` is correct.

---

## 7. What looks good

- The FSM transition table is genuinely exhaustive over all 30 pairs and
  survives mutation testing.
- The Ukrainian plural suite is the strongest file in the repo: mutating
  `numeric:"auto"→"always"` fails 3 tests, `"day"→"week"` fails 9, and the
  threshold off-by-one fails 2. All four plural forms reachable by an integer day
  count are covered.
- `pick`-not-`omit` is correct, and correct *at runtime*, and strips recursively.
- No input schema anywhere accepts an `AdopterId` — `reveals.listMine` cannot be
  pointed at another adopter directly.
- Phase 3 additivity is clean: the `source` discriminant is exactly what the ADR
  asked for, and the zero-payment-data discipline is enforced by the type.
