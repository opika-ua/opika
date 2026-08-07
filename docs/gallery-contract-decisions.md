# Gallery ↔ contract reconciliation

**Status:** decided, 2026-08-07 (owner sign-off — see the summary at the bottom) — nothing
here is implemented. This is what Phase E (Gallery) in `docs/build-plan.md` builds from,
and what its own definition of done is checked against.

**Why this exists as its own document:** it is a different subject from "what to build
and in what order" (`docs/build-plan.md`) — this is the technical shape of five things
the v2 gallery design needs that do not exist yet in `packages/contracts` or the schema.
Per `docs/standing-constraints.md`, one document per subject.

Read `docs/design/README.md`'s "Breakpoints & Surfaces", "The Gallery" and "Desktop
Breakpoints" sections alongside this. Every decision below traces to a specific line
there.

---

## 1. Pagination — OFFSET for the gallery, keyset stays for the deck

**Agree with the proposal.** Reasoning, then the guard.

### Why OFFSET is correct here, not just tolerated

Keyset pagination's entire advantage over OFFSET is avoiding two costs: the O(offset)
row-skip as depth grows, and instability under concurrent writes at that depth. Neither
cost is real at this table's size. ~320 animals at 24/page is 14 pages; even a
6× corpus (Phase 2 shelter growth) is under 90 pages. Postgres skipping a few hundred to
a couple of thousand rows via an index it already has for the ordering (`animals_feed_idx`,
`animals_feed_unfiltered_idx`) is sub-millisecond. The ADR's "past 300k MAU" scale target
(CLAUDE.md, Engineering principles) is about **concurrent request throughput**, not the
depth of any single pagination — the deck's seen-set-excluding infinite scroll could
plausibly walk deep into a session; nobody clicks to gallery page 80.

More importantly, the numbered-page requirement **cannot be served by keyset at all**,
independent of scale. "What's on page 7" has no answer from a cursor without walking
pages 1–6 first, or maintaining a page-number → cursor index that goes stale on every
write. This is not a discipline question — the shape of the requirement (`?stor=N`,
degrades to a plain list without JS, indexed by search engines) only fits a query that
can jump to an arbitrary offset.

### The guard

This is the first deliberate exception to a rule the codebase has enforced since M2
(`docs/build-plan.md`'s M2 definition of done: *"feed query `EXPLAIN` shows index scan,
no sort"*, and the task list's own *"Never `OFFSET`"*). Without a written, bounded
exception, `/review-pr`'s pattern-matching (*"a green check on a broken artifact,"* the
general "was this actually checked" instinct) will flag every future OFFSET site as the
same mistake, including this deliberate one.

**Written into `docs/standing-constraints.md`**, "Code" section, verbatim:

> **Keyset pagination, never `OFFSET` — with one named exception.** `gallery.list` and
> `gallery.relaxationCounts` may use `OFFSET`, because the gallery's numbered pages
> (`?stor=N`, indexed, degrading to a plain list without JS) are a product requirement a
> keyset cursor cannot serve at all — not a discipline question, a shape one. Bounded at
> 2,000 matching rows per filter combination (~83 pages at 24/page); beyond that,
> `gallery.list` caps navigable pages at the boundary rather than serving unbounded depth.
> `feed.list` (the deck) stays keyset — this exception does not extend to it, and any
> other `OFFSET` in the codebase is the finding it always was. Full reasoning in
> `docs/gallery-contract-decisions.md` §1.

2,000 matching rows is ~6× today's corpus of 320.

What the boundary looks like in the UI is **not settled here and is not mine to settle** —
the design's string table has no copy for "there are more results than this surface will
page through," and inventing Ukrainian UI copy in an engineering document is how a string
nobody approved ends up in the product. Phase E should take that copy from
`docs/design/README.md` or ask for it, not from this file.

2,000 is a number to revisit, not a permanent ceiling — if the corpus legitimately
approaches it, that is a milestone worth its own review, not a silent slowdown.

**Decided (2026-08-07): keep 2,000. The rationale above was wrong, and is corrected
here rather than left standing.** The guard was framed as protecting the database — it
doesn't need protecting. `OFFSET` at 2,000 rows is free, and would still be free at
20,000; skipping a few thousand rows via an index Postgres already has for the ordering
costs nothing worth guarding against. The actual limit is the UI: 83 pages is already
past where numbered pagination is a sensible way to browse anything — nobody pages to
40. The cap is really an admission that past this depth the fix isn't a higher ceiling,
it's better filtering — narrower results, not more pages of the same ones. Writing it as
a performance guard invites someone to raise it to 20,000 later on a performance
argument that was never the actual reason it exists — that argument would be correct on
its own terms and would still be the wrong move.

⚠ **2,000 is my proposal, not your specification** — the same flag CLAUDE.md's decision
#6 uses for the verification-evidence thresholds. The *shape* of the guard (a bounded
exception, named procedures, a cap rather than unbounded depth) is what this document is
actually deciding; the specific number is mine to suggest and yours to change. Confirmed
at 2,000, with the UI-sensibility rationale above superseding the row-skip-cost argument
this section originally gave.

### What changes in contracts

A new namespace, **not** an extension of `feed.list`. The two consumption patterns
(cursor-in, cursor-out, no total vs. page-number-in, total-out) don't share an input or
output shape cleanly, and forcing them into one procedure with a discriminated
`pagination` union would make every caller — including the deck, which never needs any
of this — carry the gallery's concerns.

```
gallery.list
  input:  { filters: FeedFilters, sort: GallerySort, page: PositiveInt, pageSize }
  output: { items: readonly FeedCardView[], totalMatching: number,
            totalShelters: number, totalPages: number }
```

`FeedCardView` is reused as-is — the gallery card's data needs (name, species, size,
freshness, shelter summary, primary photo) are the same fields the deck card already
projects through `pick`. No new view schema.

### What changes in the schema and repositories

Nothing new for pagination itself — `LIMIT`/`OFFSET` needs no new column or index, only
a new repository method. But the **filter-predicate construction currently lives inside
`feedRepo.list`** (`packages/db/src/repos/feed-repo.ts`), built inline as a `conditions:
SQL[]` array. That has to be factored into a shared function —

```
buildFeedPredicate(filters: FeedFilters, now: Date): SQL[]
```

— called by both `feedRepo.list` (keyset) and the new `galleryRepo.list` (OFFSET). This
is not optional cleanup: without it, a future filter (a sixth `FeedFilters` field) is a
two-site edit, and `/review-pr`'s "denormalised values that can drift" check exists
precisely for this shape of duplication. `feedRepo.list`'s keyset predicate and ordering
stay untouched; only the WHERE-clause construction moves to a shared helper.

`galleryRepo.list` orders by the `sort` input (see §2) and computes `totalMatching` via
`COUNT(*) OVER()` in the same query as the page fetch — see §3 for why, and why this
changes the answer to §3's original framing.

---

## 2. Sort — "freshest first" reuses the existing index; "longest waiting" needs a new column

### Freshest first (default)

No new work. This is `feed.list`'s existing ordering, `(last_updated_at DESC, id)`,
already covered by `animals_feed_unfiltered_idx` and the ordering tail of
`animals_feed_idx`. `gallery.list` reuses the same tuple for this sort mode.

### Longest waiting — new column, new index, and a flag on the domain shape

`lastUpdatedAt` is edit time, not availability time — a shelter fixing a typo resets it.
"Longest waiting" needs when the animal **became available**, which the domain already
models but does not index: `AnimalListingState`'s `published` variant carries
`publishedAt: Date` (`packages/domain/src/animals/listing.ts`), buried in the `listing`
JSONB column, unindexed.

**Decision: add `wait_anchor_at`, mirroring the `age_anchor_at` pattern CLAUDE.md already
establishes** (*"Store `age_anchor_at`... as the indexed column... rather than storing
the age union"*). A new domain function, `waitAnchorOf(listing: AnimalListingState):
Date | null`, computed at write time into an indexed `timestamptz` column — the exact
shape `age_anchor_at` already set the precedent for, so this is a known obligation
pattern, not a new one.

```sql
CREATE INDEX animals_wait_anchor_idx
  ON animals (wait_anchor_at ASC NULLS LAST, id ASC)
  WHERE listing_kind IN ('published', 'reserved');
```

Ascending, not descending — "longest waiting" is oldest-anchor-first, the mirror image of
the freshness index.

### `reserved` carrying `publishedAt` forward — decided

`reserved` carries only `since: Date` (when the reservation started), not the original
`publishedAt`. Under a literal `waitAnchorOf`, an animal that has waited four months and
was reserved yesterday would show `wait_anchor_at = yesterday` — reading as freshly
available, when it has waited the longest of anyone on the page. That is the wrong answer
for a sort literally named "longest waiting."

The fix is the same shape CLAUDE.md's decision #5 already used for `suspended` carrying
`priorStatus` — for exactly the same reason: *"otherwise `suspended` means both 'paused,
may return' and 'banned'"* — here, `reserved` would mean both "just became unavailable"
and "has been waiting a long time, provisionally spoken for."

**Decided (2026-08-07): yes.** There's a product reason beyond the sort-correctness
argument: `reserved` animals stay in the feed deliberately, because reservations fall
through (the comment on `DISCOVERABLE_LISTING_KINDS` in
`packages/domain/src/animals/listing.ts` already says as much) — so the animal that has
waited longest and is provisionally spoken for is exactly the one that should stay
visible high in that sort, not drop to the bottom because a reservation reset its clock
yesterday.

```
reserved: { kind: "reserved", since: Date, publishedAt: Date }
```

`waitAnchorOf` then reads `publishedAt` for both `published` and `reserved`, continuous
across the transition.

**This is a `packages/domain` type change plus a backfill across the 320 seeded rows.**
It is decided here, in writing, per `docs/standing-constraints.md` and
`.claude/commands/phase.md`'s stop-gate requirement that a domain type change surface
before it's built — but it is not built in this document; it lands as an explicit Phase
E0 task (`docs/build-plan.md`).

### One index is not enough — the unfiltered case only

`animals_wait_anchor_idx` above is the mirror of `animals_feed_unfiltered_idx`: it serves
"longest waiting, no filters." It does **not** serve the normal case — filtered — because
Postgres can't skip a middle column, and the rail applies filters immediately
(`docs/design/README.md:411`, and the deck inherits "the current filters and sort" when
entered from the gallery, `:503-504`). Without a filtered counterpart, the index CLAUDE.md's
own obligation calls for ("put equality columns before the ordering tuple") is missing
for this ordering specifically — `animals_feed_idx` has it for the freshest-first sort,
nothing mirrors it for wait-anchor.

**Add a second index, mirroring `animals_feed_idx`'s own shape:**

```sql
CREATE INDEX animals_wait_anchor_filtered_idx
  ON animals (listing_kind, city_id, species, size, wait_anchor_at, id)
  WHERE listing_kind IN ('published', 'reserved');
```

Without it, `feed-explain.test.ts`'s own bar — no `Sort` node — would **fail** for any
filtered longest-waiting query, contradicting the recommendation two paragraphs below to
extend that exact test to the new ordering.

**Decided (2026-08-07): add it.** A `Sort` over a few hundred to low-thousand rows is
cheap today — that was never in question. What's not acceptable is a hole in the M2 "no
sort" bar for one ordering while this same document argues for extending that bar to
cover it. Waiving the bar here, to save one index, sets a precedent for waiving it
elsewhere — that precedent is a materially worse trade than the write amplification
below, on a table whose writes are shelters editing listings, not a per-request or
per-user event.

### Cost

Two `timestamptz`-adjacent additions, not one: the column (8 bytes/row — irrelevant at
this table's size) and now two partial indexes, not one — `animals_wait_anchor_idx` for
the unfiltered case, `animals_wait_anchor_filtered_idx` for the filtered one. Doubling the
composite index is real write amplification on `animals`, not free: negligible at
today's volume, a genuine (if still small) cost at Phase 2 scale, which is exactly why
it's written down here as a decision rather than discovered mid-implementation. Plus one
domain function, one write-time obligation to add to the existing `age_anchor_at`
obligation list, and a `feed-explain.test.ts`-shaped assertion for **both** the filtered
and unfiltered wait-anchor orderings — the M2 definition of done ("`EXPLAIN` shows an
index scan, no sort") should apply to the new ordering exactly as it does to the old one,
and `packages/db/test/feed-explain.test.ts` is the pattern to extend, not a new mechanism
to invent.

---

## 3. Counts — folded into `gallery.list`, not a standalone `feed.count`

The task as given asks for `feed.count` returning matching animals and distinct
shelters. **I'm proposing something narrower, and flagging the deviation rather than
quietly building what was asked.**

### Matching-animal count: same query plan as the page fetch, not a separate one

A separate `COUNT(*)` query is correct but wasteful for the common case: every gallery
page load wants the count (for "Знайдено 34 тварини" and for computing page numbers), and
a second round-trip risks the two queries disagreeing under a concurrent write — rare at
this traffic, but a real class of bug for no benefit. Postgres answers "the page, and the
total that page is drawn from" in one query via a window function:

```sql
SELECT *, COUNT(*) OVER() AS total_matching
FROM animals
WHERE <predicate>
ORDER BY <sort>
LIMIT 24 OFFSET :offset
```

So `gallery.list`'s own output carries `totalMatching` (shown above in §1's output
shape) — free, same scan, same round-trip the page fetch already needed.

Not quite free, one correction to §1's own cost argument: §1 says the OFFSET cost is a
bounded index skip, sub-millisecond. `COUNT(*) OVER()` changes what actually runs — the
window function has to consume every matching row to compute the total, not just the
`LIMIT` window, so the real per-request cost is a full scan of the match set, not a
bounded skip. Harmless at today's scale (2,000 rows, this decision's own ceiling, is
still a trivial scan) but the two sections' arguments should be read together, not §1's
in isolation, if this is ever revisited at a materially larger corpus.

**An edge case this shape doesn't handle on its own: a page number past the end.**
`OFFSET` landing beyond the last matching row returns zero rows — and with it, no row to
carry `total_matching`, since the window function has nothing to attach the aggregate to.
`gallery.list` would report `{ items: [], totalMatching: 0, totalPages: 0 }` for, say,
`?stor=900` against 34 real matches — indistinguishable from a genuine no-match, on a
surface where the page number is user-editable, crawler-indexed, and pasted into
Telegram. The no-match state would render "Під ці фільтри зараз нікого немає" for a
filter set that isn't empty.

**Decided (2026-08-07): serve the last valid page, 200, no redirect, no error.** An
out-of-range page is not a broken link — it's a shared link that went stale: someone sent
`?stor=7`, animals got adopted, there are four pages now. That's the product working (the
feed shrinking as animals find homes), not a failure state, and it should read that way:
a 200 response carrying the last valid page, with a plain, non-alarming note explaining
that the page moved and nothing was hidden. Not a 404 — the link isn't broken. Not a
silent redirect to page 1 — that loses the person's place in the list and hides what
actually happened, which is exactly the "no phantom tiles," nothing-hidden honesty the
rest of this design already commits to (the "Error (next page)" state,
`docs/design/README.md:437-439`: *"Ті, кого вже видно, залишаються на місці. Ми нічого не
приховали"* — "what's already visible stays in place; we haven't hidden anything" — is
the same tonal contract this state needs).

Mechanically: this needs a second, cheap query only in the out-of-range case (the common,
in-range path stays the single-query shape above) — fetch `totalMatching` alone when the
first attempt returns zero rows, compute `totalPages`, and re-run bounded to it.

**The copy is written, but in `docs/design/README.md`'s "Gallery states," not here** —
inventing Ukrainian UI copy in an engineering document is how a string nobody approved
ends up in the product, which is exactly what this document refused to do, and exactly
why it was left as an open Phase E4 task until it had an owner-approved home. Final copy
(2026-08-07): "Сторінки 7 більше немає." / "Список став коротшим — комусь із тварин уже
знайшли дім. Показуємо останню, 4." — both numbers computed per request, not static.
Placed as a note above the grid, not a full-screen state, since real cards render
underneath it.

### Distinct-shelter count: a genuinely different aggregate, still same handler

`COUNT(DISTINCT shelter_id)` isn't answerable by the same window trick. It needs its own
query — but bundled server-side into the same `gallery.list` handler call, so the client
still makes one round-trip. Two queries inside one handler, sharing `buildFeedPredicate`
(§1), is the shape; `totalShelters` rides in the same output object.

### So what happened to `feed.count`

It doesn't exist as its own client-callable procedure. The two numbers the design needs
on the result line are both answered by calling `gallery.list` — which every gallery page
load does anyway. A standalone count-only procedure would be a second way to get numbers
the first way already produces on every request that needs them, which is exactly the
"second source of truth" `/review-pr` asks about (§4 of that skill: *"does it add a
second source of truth?"*).

The one place a real standalone count is needed — the no-match state, where there is no
page of results to piggyback a count onto — is §4, and it is a different query with a
different shape, not a reuse of this one.

If you want `feed.count` to exist anyway (e.g. a future "N animals waiting" badge
somewhere that isn't the gallery grid), that's a one-procedure addition later, cheaply —
but building it now with no caller would be exactly the premature scaffolding CLAUDE.md's
milestone-discipline section warns against.

---

## 4. Relaxation counts — one grouped query via `FILTER`, plus one flag on the copy

### The query

Postgres's `COUNT(*) FILTER (WHERE ...)` computes multiple conditional counts in a single
table scan — the standard idiom for exactly this "faceted count" shape, and it satisfies
"one grouped query, not N round-trips" literally, not approximately:

```sql
SELECT
  COUNT(*) FILTER (WHERE <all active filters>)                    AS current,
  COUNT(*) FILTER (WHERE <all active filters except size>)        AS without_size,
  COUNT(*) FILTER (WHERE <all active filters except species>)     AS without_species,
  COUNT(*) FILTER (WHERE <all active filters except age>)         AS without_age,
  COUNT(*) FILTER (WHERE <all active filters except city>)        AS without_city
FROM animals
WHERE listing_kind IN ('published','reserved') AND <verified-shelter subquery>
```

Only the dimensions **currently constrained** (`kind !== "any"`) get a `FILTER` clause —
no point computing "remove size" when size isn't applied, and it keeps the query as small
as the active filter set rather than a fixed five columns every time. `gallery.relaxationCounts`
takes the same `FeedFilters` input as `gallery.list`, built from the same
`buildFeedPredicate` helper (§1) with one dimension dropped per column. The `+N` yield
the design requires ("Прибрати «розмір» (+11 тварин)") is `without_X - current`, computed
in the handler, not the query.

### The thing the design names that the schema can't do — decided: change the copy, not the schema

"Додати сусідні міста (+34)" (add neighbouring cities) implies a city-adjacency concept.
It doesn't exist — `cities` (`packages/db/src/schema/cities.ts`) is id, name, centroid;
no oblast hierarchy, no adjacency table, and PostGIS is explicitly not enabled at MVP
(CLAUDE.md's stack table). The cheapest correct thing this query can compute today is
`without_city` — identical mechanism to dropping any other dimension, not a genuine
nearest-neighbour expansion.

**Decided (2026-08-07): change the copy, don't build adjacency.** Since all seed cities
already sit in one oblast (CLAUDE.md: *"verified shelters in one Ukrainian oblast"*),
"drop the city filter" and "expand to the whole oblast" are the same operation today —
and "Уся Київщина" is not a new string invented for this: it's the existing МІСТО chip
value (`docs/design/README.md:180, :212`, the first-run screen and the filter sheet), so
reusing it here is consistency, not invention. "Сусідні міста" promises a capability
(real geographic adjacency) that isn't there and would need PostGIS or a hand-authored
adjacency table to actually mean what it says — that's real work for a feature whose only
observable effect today would be identical to dropping the city filter. Not building it
now; it becomes real when coverage expands past one oblast, which is Phase 2.

Recorded as a deliberate design deviation directly in `docs/design/README.md`, with the
reasoning, at both places the "сусідні міста" copy appears (the gallery no-match state
and the deck's Exhausted screen) — so the next person reading the design sees why it
says what it says, instead of reading "сусідні міста," assuming it's still live, and
reinstating a string the schema can't back.

### Cost

Negligible at this table's size — one scan, a handful of `FILTER` aggregates over the
same base predicate `gallery.list` uses. Not quite "the same indexes," though the
conclusion doesn't change: each relaxation deliberately drops one equality column, so it
can't ride `animals_feed_idx`'s full `(city_id, species, size)` prefix the way
`gallery.list`'s own query can — a `without_city` count, for instance, only has
`listing_kind` and the verified-shelter subquery to seek on. Still a single, cheap,
partial-index-assisted scan at hundreds to low thousands of rows; just not the identical
plan. No new index either way.

---

## 5. Server rendering — in-process router call, not repositories directly

**Decision: the gallery Server Component calls the oRPC router in-process
(`createRouterClient`, exported by `@orpc/server@1.14.14`), not `feedRepo`/`shelterRepo`
directly.**

### Why repositories-directly is the wrong answer, not just a style preference

CLAUDE.md's "Obligations the contract cannot express" section states the mechanism
plainly: output stripping only happens for a handler built through `implement(contract)`
and invoked *through* it. A Server Component calling `feedRepo.list()` or
`shelterRepo.findById()` directly gets the raw domain object back — `Shelter.exactAddress`,
unredacted `ShelterContactSnapshot` fields, everything `pick`-based view projection exists
to withhold — with no schema in the path to strip it. This session's own
`handlers-implement-contract.test.ts` (the security lock from the previous PR) walks the
`router` tree specifically; a repository call bypassing the router entirely is invisible
to it, the same shape of hole that test exists to close, just on a different door.

### The mechanism

`@orpc/server` exports `createRouterClient`, which wraps a router (the same `router`
object `apps/web/src/app/api/rpc/[...rpc]/route.ts` already serves) as a directly
callable client — **in the same process, no HTTP round-trip, no JSON
serialize/deserialize** — while still running every procedure through
`implement(contract)`'s output-schema validation and stripping. A Server Component gets:

- the SSR/SEO the design requires ("degrades to a plain list without JS," indexed
  `/tvaryny?misto=...&stor=N` URLs, and — this is the acquisition-channel argument —
  `generateMetadata`/Open Graph tags on animal profile pages, computed from the same
  `implement(contract)`-stripped view, so a crawler or a Telegram link preview can never
  see more than a client already could);
- the exact same leak protection the HTTP path has, because it's the same router;
- and it's *faster* than the client-side path the deck currently uses, since there's no
  network hop.

### Context is simpler here than it looks

`gallery.list` needs no `adopterId` — the gallery has no seen-set exclusion
("'Не зараз' hides an animal for the rest of the deck session but NOT in the gallery,"
docs/design/README.md, "Gallery ↔ Deck") and no personalization. The Server Component
calls the in-process router with a minimal, anonymous `AppContext` — `db`,
`adopterId: null`, `tokenHash: null`, `now: new Date()`, and a `setCookies` array that
stays empty, since nothing on this path mints or reads a session. No cookie-writing
problem to solve (which would otherwise be real — Server Components can read cookies via
`next/headers` but cannot write them; a Server Action or route handler would be needed for
that, and this path needs neither).

### What changes in contracts

`gallery.list`, `gallery.relaxationCounts` (and, per §3, no standalone `gallery.count`)
join the same `contract` object `packages/contracts/src/contract.ts` already exports
alongside `feed`, `cities`, `animals`, etc. — which is what puts them inside
`handlers-implement-contract.test.ts`'s coverage automatically, the same lock that
already watches the other eight procedures. This is a consequence of the decision worth
stating so it isn't forgotten when Phase E actually wires the handlers: a `gallery`
namespace added to the router but built on the plain `os` builder, not through `impl`,
would be exactly the bypass that test exists to catch — and would catch it, as long as
the new procedures are added to `contract` in the same commit as the router wiring.

---

## Summary — what Phase E actually builds because of this document

| Area | New surface | New schema | New index |
|---|---|---|---|
| Pagination | `gallery.list` (OFFSET) | — | — (reuses existing) |
| Sort (freshest) | `sort` input on `gallery.list` | — | — (reuses existing) |
| Sort (longest waiting) | same | `animals.wait_anchor_at` + `waitAnchorOf` | `animals_wait_anchor_idx` (unfiltered) + `animals_wait_anchor_filtered_idx` |
| Counts | `totalMatching`/`totalShelters` on `gallery.list`'s output, out-of-range page clamped server-side | — | — |
| Relaxation counts | `gallery.relaxationCounts` | — | — (reuses existing) |
| Server rendering | Server Component via `createRouterClient` | — | — |

Plus the shared-predicate factoring (`buildFeedPredicate`) §1 calls for, since two
repositories now build the same WHERE clause.

**Decided, 2026-08-07 (owner sign-off — none of these are open going into Phase E):**
1. `reserved` carries `publishedAt` forward (§2) — yes. A `packages/domain` type change
   plus a backfill across the 320 seeded rows; lands as an explicit Phase E0 task, not
   built in this document.
2. The "сусідні міста" copy (§4) — changed to reuse the existing "Уся Київщина" chip
   vocabulary, recorded as a deviation directly in `docs/design/README.md`. No adjacency
   schema built.
3. The 2,000-row OFFSET boundary (§1) — kept at 2,000, with the rationale corrected: the
   guard isn't protecting the database (that cost is negligible even at 20,000), it's
   admitting numbered pagination stops being sensible UI past that depth. The number
   remains a proposal in the sense CLAUDE.md's decision #6 uses that word — reviewable,
   not permanent — but is not open going into Phase E.
4. Out-of-range gallery pages (§3) — clamp server-side to the last valid page, 200, a
   plain non-alarming note, not a redirect and not an error. Copy written and placed in
   `docs/design/README.md`'s "Gallery states."
5. The second, filtered `wait_anchor_at` index (§2) — built. Waiving the M2 "no sort" bar
   for one ordering, to save one index, sets a worse precedent than the write
   amplification costs.

**Not building:** a standalone `feed.count`/`gallery.count` procedure (§3) — folded into
`gallery.list`'s output instead, with the reasoning for why that's not a lesser version
of what was asked.
