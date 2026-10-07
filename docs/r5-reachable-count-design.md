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

## Tier and process

Tier 1 per `docs/model-policy.md`'s model assignment (not because the *change itself* is
production data or secrets, but because `packages/contracts`/`packages/domain` shape changes
require proposing the type/union shape for review before implementation, per `CLAUDE.md`'s
engineering principles, and the model assignment itself is non-negotiable for this code area:
"M2 keyset feed query | Opus | Cursor stability, seen-set exclusion, filter binding. Subtly wrong
is the default outcome here.").
