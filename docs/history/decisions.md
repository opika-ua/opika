# Decision history (moved out of CLAUDE.md)

Moved verbatim from CLAUDE.md in DS PR 5. Settled decisions (M1, M4, gallery contract) and the obligations the contract cannot express: do not re-ask, and carry the obligations into any work in those areas. Not loaded by default.

## Decisions made during M1 scoping (settled - don't re-ask)

1. **Contract layer: oRPC, on the stable 1.x line** (not the 2.0 beta).
   Matches the contract-first principle natively; keep every procedure
   definition in `packages/contracts` as a thin declarative object so a
   future 1.x→2.0 migration stays a one-package job. tRPC v11 remains the
   documented fallback if oRPC 1.x causes real friction.
2. **Shelter location: the city only, before and after a reveal.** Public
   views carry the city and nothing finer (no district, no coordinates).
   `Shelter.exactAddress` exists on the domain object but never leaves the
   server for adopters: not in `PublicShelterSchema`, not in the
   `ContactReveal` views. A reveal discloses contact channels only; the
   meeting place is agreed with the shelter in correspondence.
   **Revised 2026-10-15 (Oleksii, inbox EM-D1).**
3. **Size buckets: 3-tier** - `small` / `medium` / `large`. Weight is
   **never stored**, only the bucket. `SIZE_BUCKET_WEIGHT_HINTS_KG`
   (<10kg / 10-25kg / 25kg+) exists purely as guidance for whoever fills in
   the listing. _(Superseded the earlier 4-tier `giant` variant - that tier
   is gone, deliberately, not by oversight.)_
4. **Age buckets:** 4-tier, Petfinder-style - `baby` (<1yr) / `young`
   (1-3yr) / `adult` (3-8yr) / `senior` (8yr+). **The bucket is derived, not
   stored.** `Animal.age` holds an `AgeEstimate` (a birth date, or a bucket
   declared at a known time) and `ageBucketOf(estimate, now)` computes the
   bucket at read time, so a puppy listed in March is not still advertised
   as a puppy in December.

## Decisions settled during the M1 build (also don't re-ask)

5. **Verification FSM edges.** 5 states × 6 events = 30 pairs, all asserted.
   Open: `pending → rejected` (a rejection always has a moderator behind it;
   requiring a formal review first on spam models a click, not a lifecycle)
   and `suspended → rejected` (otherwise `suspended` means both "paused, may
   return" and "banned"). Closed: `under_review → suspended` (nothing to
   suspend - it isn't in the feed) and `verified → under_review` (it would
   drop a shelter from the feed with no record it was ever verified, which is
   what `priorStatus` exists to prevent). Periodic re-verification, when
   needed, is a **new `re_review` state** carrying its prior status - not an
   overload of `under_review`.
6. **`VerificationEvidence` is a list of discriminated items**, not a fixed
   record, because what a shelter can produce depends on its legal form. The
   requirement rule therefore lives in `DEFAULT_VERIFICATION_POLICY` as a
   pure predicate. An **unregistered volunteer group can reach `verified`**,
   substituting a moderator site visit plus two independent references for
   the registration and banking records a registered entity supplies.
   ⚠ Those thresholds are my proposal, not your specification - the shape is
   settled, the numbers are yours to change.
7. **`RejectionReason` and `SuspensionReason` are separate code lists**
   (+ optional free-text note). A shelter is rejected for reasons about its
   application and suspended for reasons about its conduct; one merged enum
   would be mostly invalid in either context.
8. **Species stays closed at `dog | cat`.** Adding a literal later is a
   compiler-guided edit; an open `other` variant would make the feed filter
   permanently unenumerable and break the weight hints, which describe dogs
   and cats.
9. **`swipes.record` and `animals.reveal` stay separate.** Swipes are
   best-effort and batchable; a reveal is transactional, idempotent and
   append-only, and is the Phase 2 reward-ledger event.
10. **Feed ordering: keyset on `(last_confirmed_at DESC, id)`**, with
    `scoreAnimal` re-ranking within the fetched page. No materialised score
    column, so no recompute job as freshness decays and no backfill when the
    weights are tuned. The accepted cost: de-ranking stale listings is a
    within-page effect, not a global ordering. **M2 implemented this** on
    `lastUpdatedAt`. **Revised 2026-10-07 (H2-3, Oleksii's answer in
    `docs/decisions-inbox.md`):** the key, freshness
    itself and the gallery's `freshest` sort all moved to `last_confirmed_at`
    (`listing.confirmedAt`, set at publish and by «Ще шукає»). `lastUpdatedAt`
    is edit time, and once shelters can edit, a typo fix must not make an old
    card read as fresh or jump the queue. Backfilled from `last_updated_at`
    (H2-14), never from `created_at`, because a listing's creation is not a
    confirmation.
11. **Coordinate fuzzing: 1 km, one global policy.** `fuzzCoordinates` is
    deterministic on the shelter id - a per-request offset would let an
    observer average repeated samples back to the true position.
12. **`pick`, never `omit`, decided here first** - for `Shelter`
    specifically, where what's withheld is the exact address. Generalised
    into a standing rule in `docs/standing-constraints.md`; this entry
    just records that M1 is where and why it started.

## Decisions settled during M4 (also don't re-ask)

13. **Anonymous device session is hand-rolled, not Better Auth.** Better Auth's
    value is the `organization` plugin for shelter accounts at M8; the anonymous
    session is a simpler primitive. Token: ≥256 bits from `crypto.randomBytes`,
    hex-encoded. Storage: SHA-256 hash of the token (never the token itself).
    Lookup: timing-safe comparison. Cookie: `__Host-session` in production
    (falls back to `session` in dev, where HTTPS is unavailable). Behaviour:
    get-or-reject, never get-or-create. Expiry: absolute (30 days) AND idle
    (7 days). The domain's `AdopterIdentity.anonymous.deviceSessionId` stores
    the hash, not the token. Better Auth is deferred to M8, where it replaces
    the anonymous session for adopters who upgrade to a real account and provides
    the organization plugin for shelters.
14. **Rate limiting is split.** Generic per-IP: in-memory sliding window behind
    a `RateLimiter` interface (acknowledged per-instance in serverless; the
    interface is stable for a Redis/KV swap). Reveal limit: Postgres-persisted,
    30 per 24h, counted from the existing `reveals` table - no new table needed,
    survives cold starts. **Correction, 2026-09-10:** the 30 counts *distinct
    shelters revealed*, not reveal rows - `reveals.shelter_id` was already on
    the row (decision unchanged), so no migration; the check gained a second
    query (a free-re-reveal existence check ahead of the distinct-count one).
    Contacts are scrapeable per shelter, not per animal; re-revealing a
    shelter already seen in the window is free, and does not consume a unit.
    See `apps/web/src/api/reveal-rate-limit.ts`'s own doc comment for the full
    reasoning and its connection to the deck's gesture-parity decision.
15. **Cursor is HMAC-signed.** `CURSOR_HMAC_SECRET` env var (separate from
    `LOCATION_HMAC_SECRET`). Payload carries a `kind` tag (`feed` / `reveal`)
    and `filtersFingerprint(filters)`; verification is timing-safe. Prevents
    cross-list and cross-filter cursor reuse.

## Decisions settled during gallery contract reconciliation (also don't re-ask)

Full reasoning for all five: `docs/gallery-contract-decisions.md`. Implemented in
Phase E (`docs/build-plan.md`), not yet built as of this entry.

16. **`AnimalListingState`'s `reserved` variant gains `publishedAt`, alongside its
    existing `since`.** Same shape as decision #5's `suspended` carrying
    `priorStatus`, for the same reason: without it, `reserved` means both "just
    became unavailable" and "has waited the longest of anyone on the page,"
    and a sort named longest-waiting needs the second meaning, not the first.
    Reserved animals stay in the feed deliberately (reservations fall through),
    so the one that's waited longest and is provisionally spoken for is exactly
    the one that should stay visible. Requires a backfill across the 320 seeded
    rows - a domain type change, not a pure addition.
17. **Gallery pagination is OFFSET, by name and in writing an exception to
    "keyset, never OFFSET."** `docs/standing-constraints.md`'s Code section
    carries the guard; this entry just confirms it's not an oversight. Bounded
    at 2,000 matching rows per filter combination - chosen because past that
    depth numbered pagination stops being sensible UI, not because Postgres
    needs protecting from the row-skip.

## Obligations the contract cannot express - carry these into M2/M4

Each is something the type system genuinely cannot enforce, so it has to
live in a checklist rather than in a schema:

- **Every handler goes through `implement(contract)`** (the standing
  rule; see `docs/standing-constraints.md`). Mechanism: oRPC validates
  outputs at runtime and returns the _stripped_ object - verified in
  `@orpc/server@1.14.14` - but only when a schema is attached. A handler
  on the plain `os` builder with no `.output()` returns whatever the
  handler produced, and the `pick`-based leak protection evaporates.
  `apps/web/src/api/handlers-implement-contract.test.ts` is the test that
  makes this a build failure rather than a checklist item: it walks the
  router tree and asserts every served procedure's output schema is the
  contract's own schema instance, not merely present.
- **The session cookie is server-minted only**: ≥128 bits from a CSPRNG,
  HttpOnly + Secure + SameSite=Lax. Session _validation_ is get-or-reject:
  an unknown token is `{ ok: false }`, never a new session.
  `session.bootstrap` is the sole endpoint that mints - when validation
  rejects (stale cookie, first visit), it creates a fresh adopter + session.
  This is safe because tokens are 256-bit random (no client-supplied value
  to collide on), but it means bootstrap MUST sit behind per-IP rate
  limiting - without it, unauthenticated callers can create unbounded
  adopter rows.
- **Sign the cursor and bind it to the filters.** Payload carries a kind
  tag (`feed` / `reveal`) and `filtersFingerprint(filters)`; a mismatch is
  `INVALID_CURSOR`. The branded type is a convenience for honest callers
  and provides nothing at a trust boundary.
- **Clamp `swipes.record`'s `at`** to `[now - maxOfflineWindow, now]`.
- **Never construct a `PublicLocation` by hand** - `publicLocationOf`
  (for shelters, always `fuzzed_address` precision) and
  `animalPublicLocationOf` (for fostered animals, always `city`
  precision) are the only sanctioned paths. `PublicLocation` is a
  discriminated union on `precision`: `fuzzed_address` carries
  `FuzzedCoordinates`, `city` carries no coordinates at all. Both stay
  server-side: public responses, the reveal's included, carry the city
  only (`PublicCityLocationViewSchema`). The `LocationPrivacyPolicy.digest`
  must be an HMAC over a server-held key; `insecureUnkeyedDigest` is for
  tests and seed data.
- **Keep evidence documents out of the public image bucket.** Animal
  photo keys are public; `documentKey` on verification evidence is the
  same kind of value pointing at shelter registration paperwork.
- **Store `age_anchor_at`** (from `ageAnchorOf`) as the indexed column and
  filter with `ageAnchorRange`, rather than storing the age union.
- **Store `wait_anchor_at`** (from `waitAnchorOf`) as the indexed column,
  nullable, the same pattern as `age_anchor_at` above. Never sort "longest
  waiting" on `last_updated_at` (edit time, not availability time) or on
  `reserved.since` (reservation start, not original publish - `reserved`
  carries `publishedAt` forward precisely so the two don't collide). Two
  partial indexes, not one - `animals_wait_anchor_idx` (unfiltered) and
  `animals_wait_anchor_filtered_idx` (filtered) - see
  `docs/gallery-contract-decisions.md` §2 for why one index can't serve
  both cases.
- **`city_id` on animals** is the city the animal is discoverable in.
  For animals at their shelter it mirrors the shelter's city
  (denormalised); for fostered animals it is the foster city - a
  first-class property, not a projection. `Animal.publicLocation`
  (nullable) is `city`-precision when set (city + district, no
  coordinates); when null the animal is at the shelter and inherits the
  shelter's `fuzzed_address`-precision public location. Put equality
  columns before the ordering tuple in the feed index.

## Still open in M1

- The evidence item list and the two reason code lists are proposals, not
  specifications (see 6 and 7 above). The **shapes** are settled; changing a
  code or a threshold is a one-line edit plus a test.
- `Money` is deliberately unattached to any entity. Adding
  `Animal.adoptionFee` would invite recording exactly the "symbolic fee" the
  EU enforcement guidance flags, so it waits for a real requirement.

