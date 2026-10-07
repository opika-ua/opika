# R5 — reachable-count design handoff

Investigated 2026-10-06 (Sonnet), handed off to Opus per `docs/model-policy.md`'s explicit
assignment of seen-set-exclusion and keyset-query work before any contract or repo code was
written. This document is the starting point for that session — the shape below is a proposal,
not a decision; `docs/build-plan.md`'s R5 row links here rather than carrying this detail inline,
per the documentation-diet rule in `CLAUDE.md`.

## What R5 is

`docs/build-plan.md`'s R5 row: R1 suppresses the deck's «N з M» counter and progress bar once an
adopter's seen-set is non-empty (`hasActiveSeenSet: boolean | null` on `feed.list`'s output),
rather than show a number that might overstate what the deck can actually still reach. R5 is the
fuller fix Oleksii asked for on R1's STOP: a real count of how many animals the *current caller*,
with their own seen-set excluded, can still reach under the active filters — restoring an
accurate «N з M» for a returning visitor instead of hiding it.

## Why the existing `total` can't just be fixed in place

The denominator shown today is not computed by `feed.list` at all. It is the gallery's own
`gallery.list`'s `totalMatching`, read once when a visitor is on `/tvaryny` and then carried
across to `/tvaryny/gortaty` as a literal `?total=` query parameter on the deck-entry link
(`apps/web/src/features/gallery/filter-url.ts:382` `TOTAL_PARAM`, `:394` `deckEntryHref`,
`:448` `parseDeckQuery`) — a deliberate zero-extra-query trick, documented in that file's own
comment: "`feed.list` has no total field at all — a keyset feed doesn't carry one for free. ...
`parseDeckQuery`'s `total` comes back [from the URL,] a number the caller already has."

This means the server component rendering `/tvaryny/gortaty` (`apps/web/src/app/tvaryny/gortaty/
page.tsx`) never has an adopter identity to compute a seen-set-aware count with even if it wanted
to — the anonymous session is minted client-side (`session.bootstrap`, called from
`use-feed-deck.ts`), not available to that server component's own render. Any real fix has to
live where the adopter identity already is: `feed.list` itself, which already receives
`context.adopterId` resolved from the request's cookie on every call (the same context
`hasActiveSeenSet`'s own computation already uses).

## Proposed shape (not decided — Opus's to confirm or revise)

**Contract** (`packages/contracts`): a new field on `feed.list`'s output,
`reachableCount: number | null`, alongside the existing `hasActiveSeenSet: boolean | null`. Kept
as a second field, not merged into one — these are genuinely different facts that diverge in a
real case the existing code already documents: an adopter who has only ever swiped on dogs gets
`hasActiveSeenSet: true` against a cats-only feed, where the seen-set excludes nothing at all
under that filter combination. `hasActiveSeenSet` is a cheap, filter-independent pre-check;
`reachableCount` is the real, filter-scoped number. Collapsing them would be exactly the anti-
pattern `docs/standing-constraints.md`'s "two facts that happen to be true at the same time are
not one fact" warns about.

`reachableCount` is non-null only when all of:
- the call is a real fetch, not a prefetch (same distinction `hasActiveSeenSet` already makes —
  check how that's threaded through the handler/hook today before replicating it)
- `adopterId` is present
- `hasActiveSeenSet` came back `true` for this adopter under the active filters

When `hasActiveSeenSet` is `false`, the gallery's existing unfiltered total is already accurate
for this adopter (nothing is excluded), so `reachableCount` stays `null` and no extra query runs
— the common case (a first-time visitor) pays nothing.

**Repo** (`packages/db/src/repos/feed-repo.ts`): a plain `COUNT(*)` over `animals`, reusing the
exact same `buildFeedPredicate(opts.filters, opts.now)` conditions and `buildSeenExclusion`
clause the keyset page fetch already builds (`feedRepo.list`, same file) — no `ORDER BY`, no
`LIMIT`. This is a genuinely separate query from the page fetch, run only when the gate above
says to.

**Query-cost finding:** `animals_feed_idx` (`packages/db/src/schema/animals.ts:124`) is already
`(listingKind, cityId, species, size, lastUpdatedAt, id)` — the exact equality-filter prefix a
plain count over the same predicate would use. The seen-set anti-join (`NOT IN` against a
`swipes` subquery already capped at `policy.maxTracked` rows) adds a small, bounded hash-lookup
cost per matching row, not a second unbounded scan. At this product's real scale — one oblast,
realistically hundreds to low thousands of animal listings even at full growth, per
`docs/stack-decision.md` — a count over an index-selected filter match is cheap in absolute
terms. The ADR's "hold up past 300k MAU" scale target (§11.1) is about *visitor* traffic, not
animal-corpus size; a bigger user base doesn't make this query any more expensive. Rejected: a
maintained/cached running count — real invalidation complexity (on every animal edit and every
swipe) for a saving this scale does not need. The simpler option is also the correct one here,
not a shortcut taken under time pressure (`docs/standing-constraints.md`'s "time is not a
decision input" cuts both ways: it also means not over-engineering against a scale this product
will not actually reach).

**Client** (`apps/web/src/features/discovery/DeckScreen.tsx`, `use-feed-deck.ts`): when the
first real `feed.list` response carries a non-null `reachableCount`, use it as the deck's `total`
instead of the gallery-passed prop, restoring `showPosition` instead of keeping it suppressed.
When `reachableCount` is `null`, behaviour is unchanged from today (R1's suppression, or the
gallery-passed total when there's no active seen-set). This needs its own look at
`DeckScreen.tsx`'s existing `total`/`shownCount`/`position` state machine (lines ~50-115) to
decide exactly where the override happens without disturbing the `useRef`-frozen `1 з N`
announcement, which is deliberately computed once at mount.

## What is NOT decided here

- The exact handler/hook wiring for the prefetch-vs-real-fetch distinction `reachableCount`
  needs to replicate — read how `hasActiveSeenSet` does it today before assuming the same
  mechanism generalises cleanly.
- Whether `reachableCount` should be computed once per deck mount and then held fixed
  client-side (matching how `total` behaves today — a snapshot, not live-updated per swipe), or
  recomputed on a later page fetch. The existing `total` prop is a frozen snapshot; the model-
  policy concern this work was handed off for is exactly the kind of subtle correctness question
  ("does this count drift from client-side `shownCount` under some sequence of swipes and
  prefetches") that is cheap to get wrong and expensive to debug after the fact.
- Whether this needs a new integration test against real Postgres (the project's own standing
  constraint: "Local Postgres and Neon are not the same database" — if the count query uses any
  construct whose result shape or NULL-handling could differ between `postgres-js` and
  `neon-http`, verify against both, the way `hasActiveSeenSet`'s own `RowList`-vs-`{rows}` bug
  was caught).

## Opus resolution, 2026-10-07: approved (R5-1) and implemented; the Neon check (R5-2) is pending

All three open questions above are answered from the code. Two changes to the shape above
were proposed, and one existing bug was found. Oleksii approved the shape (inbox R5-1) and it
is implemented as written below, plus the zero-total guard noted under §1's drift list. The
real-Neon run (R5-2) is still pending, so the count is not yet called verified.

### 1. The count is a frozen snapshot, taken at the start of each fresh feed

That's the only reading that stays consistent with `shownCount`.
`reachableCount` is the number of animals the deck can serve *at the moment the feed starts*.
As the visitor swipes, `shownCount` counts up toward it.
- **Recomputing it on a later page would double-count.** By then the visitor's own swipes
  this session are server-side exclusions. They would shrink the denominator *and* advance
  `shownCount`, so «12 з 30» could jump to «13 з 18».
- **A fresh feed resets both together.** `onRetry` and a filter change already reset
  `swipedCountRef` to 0 (`use-feed-deck.ts`). The new fetch's count then correctly
  excludes the swipes made earlier in the session, so the pair stays consistent there too.

The prefetch distinction is therefore exactly `hasActiveSeenSet`'s (`cursorData === null` in
`handlers/feed.ts`): computed on a fresh fetch, `null` on every prefetch. The client keeps the
value from the latest fresh fetch of the current generation (the same `generationRef` guard
that already discards stale responses).

Remaining drift, accepted and stated. "Excludes exactly what the page fetch excludes" holds at
the moment of the count, not across the whole session:
- **Animals published or withdrawn mid-session, and `pass` swipes expiring mid-session.** The
  `Math.min(shownCount + 1, total)` clamp bounds the position.
- **The `maxTracked` cap rolling over** (1000 rows, `seen-set.ts`). For an adopter with more
  than 1000 active swipes, each new swipe pushes the oldest exclusion out of the `NOT IN`
  subquery. Later pages can then serve animals the snapshot didn't count, and the position
  sticks at «N з N» via the clamp. That understates progress; it never overstates the total.
- **A retry while a `swipes.record` is still in flight.** The new count includes that animal.
  If it sits on a later page, the record lands first and the page excludes it, so the
  denominator is one too high and the deck reaches «exhausted» one short of it. That *is* the
  overstatement R1 exists to prevent, bounded at one card per in-flight record, in a
  sub-second window, and only on a fresh feed (a retry or a filter change). Accepted and recorded here. The alternative, making
  the retry await pending records, would block the error card's recovery on a best-effort
  write that decision #9 says must never block anything.
- **A zero count while cards are served.** The count and the page are two statements run side
  by side, not one snapshot, so a race can in principle return `reachableCount: 0` alongside a
  non-empty page. The header shows no position at all for a total of 0 (`DeckScreen.tsx`)
  rather than «0 з 0» or a `NaN%` bar.

### 2. Gate on "fresh fetch + session", not on `hasActiveSeenSet === true`

The two checks run in parallel (`Promise.all`, O-9's reason). Gating the count on the other
check's answer would mean running them in sequence, which costs a full extra Neon round trip
on every fresh deck entry. So the count runs whenever there's a session.
- **A visitor with no cookie** (every first visit) still pays nothing: `adopterId` is null, so
  `reachableCount` is null and the gallery's `total` stands, which is accurate because nothing
  is excluded.
- **A visitor with a session and an empty seen-set** pays one count over an indexed predicate.
  That's cheap at this corpus size (the query-cost finding above stands).

**Contract:** `reachableCount: z.int().nonnegative().nullable()` on `FeedListOutputSchema`,
replacing `hasActiveSeenSet`. They are separate facts, as argued above, but the client rule
below leaves nothing that reads `hasActiveSeenSet`. See "dead weight" below.

**Repo:** `feedRepo(db).reachableCount(opts)` uses a typed
`select({ n: sql<number>\`count(*)\`.mapWith(Number) })`, the exact pattern
`gallery-repo.ts`'s `countMatching` (`:254-259`) already uses. It runs over `buildFeedPredicate(...)` plus `buildSeenExclusion(...)` unchanged:
no raw `.execute()`, and `bigint` is normalised by `mapWith` on both adapters. Reusing
`buildSeenExclusion` matters because its `LIMIT maxTracked` cap means the count excludes
exactly what the page fetch excludes, not every swipe ever made.

**Client:** the snapshot comes from the current generation's fresh fetch, whichever way it
answers:
- **The fetch had a session:** `reachableCount` is non-null, and it's the total.
- **The fetch had no session:** nothing was excluded, so the gallery's `total` *is* the
  snapshot. That stays true after this visitor's first swipe mints a session mid-mount,
  because the fetch that defined the snapshot excluded nothing.
- **No swipe suppresses the counter in either case.** The snapshot already accounts for the
  session's own swipes. That retires R1's local `setHasActiveSeenSet(true)` in `onSwipe`.
  Without this, a first-time visitor (the most common one) would still lose «N з M» on swipe 1
  and get none of R5's fix.

**`hasActiveSeenSet` becomes dead weight.** Under this gating, every fresh fetch with a session
returns a non-null `reachableCount`, and every fetch without one has `hasActiveSeenSet` fixed
at `false`. No client branch reads it any more, while the server still runs its query on every
fresh fetch. **Proposed:** drop the query, the field and the local flag in the same PR. This
walks back the earlier "both stay" in this section: they were two different facts, but now
nothing consumes one of them.

One assumption is carried over from R1, not introduced here: the gallery's `totalMatching`
counts the same predicate the deck serves. The PR asserts this with a test (gallery count ==
feed count for one empty-session filter set) rather than leaving it assumed.

### 3. Existing bug: the entry announcement promises the unreachable total

`entryAnnouncement` (`DeckScreen.tsx:112`) is frozen at mount from the gallery `total` prop,
before any fetch, and R1 never gated it. A returning visitor whose header R1 suppresses still
hears «Тварина 1 з {gallery total}». That's the same overstated number R1 removed from the
screen, now only for screen-reader users.
- **Proposed:** the announcement is still written once, but on the first `ready` state of the
  mount, from the §2 client snapshot and the same rule the header uses after R5 (not today's
  `showPosition`, which still gates on the `hasActiveSeenSet` this proposal drops). When no
  honest total exists,
  the whole announcement is omitted, exactly as happens today when `total === null`. It is not
  replaced by a number-less «Режим по одній» variant, which would be new Ukrainian copy.
- The string itself (`uk.feed.deckEntryAnnouncement`) is unchanged, so this is not copy work.
- It's announced one fetch later than today. That's a polite live region on entry, so a
  sub-second delay changes nothing a listener would notice.

### 4. Neon

The count adds no new construct: a typed select, the same aggregate-plus-`mapWith` pattern as
the gallery, and an unchanged exclusion clause. It is still a new query on the driver path,
though, and the standing constraint says a green local suite doesn't cover that. **Proposed:**
an integration test against local Postgres (both a seen-set and an empty-session case), plus
one run of the same query against a **non-production Neon branch** before calling it
verified.

### Questions for Oleksii

- **R5-1:** approve the shape: frozen snapshot per fresh feed, gated on a session rather than on
  `hasActiveSeenSet`, the client rule (including retiring R1's local suppression), dropping the
  now-unread `hasActiveSeenSet` query and field, and fixing the announcement in the same PR.
- **R5-2:** a non-production Neon branch connection string for the verification run in §4. If
  you'd rather keep credentials out of agent sessions, I'll hand you a one-command script to run
  yourself.

## Tier and process

Tier 1 per `docs/model-policy.md`'s model assignment (not because the *change itself* is
production data or secrets, but because `packages/contracts`/`packages/domain` shape changes
require proposing the type/union shape for review before implementation, per `CLAUDE.md`'s
engineering principles, and the model assignment itself is non-negotiable for this code area:
"M2 keyset feed query | Opus | Cursor stability, seen-set exclusion, filter binding. Subtly wrong
is the default outcome here.").
