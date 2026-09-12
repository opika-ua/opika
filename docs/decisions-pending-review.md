# Decisions pending Oleksii's review

Working log for the autonomous session started 2026-09-09, after PR #53 merged. Every
reversible judgement call made without asking goes here instead of blocking on an answer —
see `CLAUDE.md`'s working loop for the rule this implements. Newest entry last within each
section.

**Note on scope:** this copy covers only this branch's own row (Phase S, city slugs). R2's and
R3's decisions (the deck rebuild, PRs #54/#55) live in their own copies of this file on
`feat/deck-two-action`/`feat/deck-inline-reveal` — an earlier version of this file on this branch
carried all three rows' decisions in one document; a reviewer round correctly flagged that as
scope creep (this diff should not carry ~200 lines belonging to two other, already-open PRs), so
it was trimmed back to Phase S alone. The three copies will need reconciling by hand when the
first of the three PRs merges — a straightforward concatenation, since each PR's own decisions
are additions, not edits to a shared entry.

## Summary — read this first

**Row completed this session:** Phase S — city slugs (`docs/build-plan.md`'s reprioritisation
queue item 5, closing O-6 + O-12 from `docs/observations.md`).

**PR:** [#56](https://github.com/opika-ua/opika/pull/56) — `feat/city-slugs` → `main`. Three reviewer rounds (STOP resolved, then two PASS WITH NOTES), all findings addressed, `pnpm check` green. Not merged — merging stays yours; see the migration-verification procedure above before you do.

**A real decision, escalated by the reviewer rather than made here — resolved, not left open:**
The first reviewer round returned **STOP** on the generated migration
(`packages/db/drizzle/0005_nervous_shinko_yamashiro.sql`): a plain `ADD COLUMN "slug" text NOT
NULL` with no default fails outright against any `cities` table that already has rows — which
describes the one database that matters (Neon holds the same 8 seeded cities O-9 measured
against). The reviewer named two routes and declined to pick between them (both sit on the STOP
register — a production migration path and, for the other route, data deletion): (a) hand-edit
the migration the way `0004`'s own backfill was hand-edited — add nullable, backfill by known
`id`, assert completeness, then tighten to `NOT NULL` + `UNIQUE`; or (b) truncate and reseed the
deployed database. **Resolved by implementing (a)** — the reviewer's own recommendation, matching
established precedent (0004) exactly, and destroying nothing. `packages/db/test/
city-slug-backfill.test.ts` proves the rewritten migration against a locally-reproduced
pre-migration shape (the real 8 seeded ids/names, inserted via raw SQL), including that it
*aborts* rather than guesses when it encounters a city id the hardcoded backfill doesn't
recognise. **Still genuinely unverified, and parked rather than assumed:** whether Neon's actual
`cities` table today holds exactly these 8 rows and nothing else. If it doesn't (a real city has
already been onboarded, or the deployed corpus differs from this repo's own seed data for any
other reason), the migration's own `DO $$ ... RAISE EXCEPTION` block aborts loudly rather than
producing a broken constraint or a guessed slug — so the risk this parks is "the migration fails
and needs a one-line addition to its `CASE`," not "the migration silently corrupts data."
**Verified, 2026-09-12 — Oleksii ran the query.** Neon's real `cities` table holds exactly 8
rows, ids `c1000000-…-000000000000` through `…007`, matching the seed set exactly — nothing
extra, nothing missing. The migration-verification procedure above is now resolved; the
production assumption held.

**Changed in the same response, before rebase — not a "decision needing your eye" anymore, an
instruction already acted on:** `citySlugOf` no longer transliterates `name.uk` (item 1 below,
as it read before this change). Oleksii's own reasoning: the table already stores a
human-authored, already-curated English name (`name_en_text`) for exactly this purpose, and
computing the same city's Latin spelling a *second* way — an algorithm run against the
Ukrainian name — creates two independent sources of truth for one string that are correct only
for as long as they happen to agree. `citySlugOf` now takes that English name directly
(lowercase, spaces to hyphens); the Ukrainian transliteration table it used to run is deleted
from the codebase entirely, not merely unused, so there is nothing left to accidentally fall
back to. Full reasoning: `Phase S — transliteration over a hand-curated slug list` below, which
records both the original (now-superseded) reasoning and the correction, per this project's own
"one document per subject... when superseded, replace it."

Also asked and answered, first pass: **can `name_en_text` ever be null, given no fallback exists
anymore?** Yes, at the time this was asked — it was a nullable column
(`packages/db/src/schema/cities.ts`), checked directly, not assumed. Every real call site refused
to derive a slug from a missing English name rather than silently reading `null.text` or falling
back to anything: `seed.ts`'s new `requireEnglishCityName` throws, naming the city, before
`citySlugOf` is ever called with bad input — proven by a dedicated test (`seed-corpus.test.ts`),
not merely typed.

**Follow-up instruction, same day: tighten `name_en_text` to `NOT NULL` in the same migration —
a required value (the slug) cannot honestly depend on an optional one.** Verified against Neon
first: all 8 real rows carry it (Oleksii's own cities-query message, quoting all 8 English
names). Implemented as a new first block in `0005`, before the `slug` column is even added: a
`DO $$ ... RAISE EXCEPTION` re-checks the claim independently at migration time (the same
abort-loudly posture `slug`'s own backfill assertion uses two blocks down, applied to a fact
instead of a computation), then `ALTER COLUMN name_en_text SET NOT NULL`.

**Tightened together with `name_en_provenance`, not `name_en_text` alone** — found while
implementing, not asked for explicitly, but the same class of bug one column over:
`packages/db/src/repos/mappers.ts`'s `columnsToLocalizedText` already requires *both*
`nameEnText` and `nameEnProvenance` non-null before it treats a city as having a real English
name at all. A `name_en_text` that's `NOT NULL` but paired with a still-nullable
`name_en_provenance` would let the DB guarantee a value the domain-object mapper could still
silently read as absent (text present, provenance null → `en: null`) — the exact "required value
depending on an optional one" problem restated one field over, and in a way the `NOT NULL`
constraint itself would never surface, since it only watches its own column.

The now-obsolete "backfill succeeds even when `name_en_text` is null" test
(`city-slug-backfill.test.ts`) is replaced, not deleted-and-forgotten — its premise (the
migration doesn't care about the column) stopped being true the moment the column became
required; a new test proves the migration now aborts over exactly that gap instead, with the
real error message asserted, not just "it throws."

**Decisions needing your eye (reversible, not blocking), ranked by cost to reverse:**
1. **[trivial to reverse] O-12's back-link restores only the city filter, not the adopter's full
   filter state (species/size/age).** See `Phase S — back-link scope: city only` below. A
   narrower fix than the design's own words might suggest; widening it needs a place to carry
   the rest of the filter state across the detail page, which doesn't exist yet.
2. **[moderate to reverse — a real, unmeasured latency cost] The gallery and deck pages now fetch
   `cities.list` before parsing the URL, sequentially rather than in parallel with the main
   query.** See `Phase S — cities-before-parse ordering` below. Reversing means caching the city
   list somewhere request-independent (a module-level cache with a TTL, or a build-time
   snapshot) so parsing doesn't have to wait on a network round trip at all — a real optimisation
   this row didn't build, not a correctness gap.

**Reviewer round 2: PASS WITH NOTES**, after verifying round 1's STOP was genuinely resolved
(not just asserted) and every other round-1 fix was real. Found and fixed: the O-12 test itself
was gameable (a mutation swapping in a hardcoded city still passed a bare "is this a known slug"
check) — fixed by cross-checking the link's own visible city name against its href's slug, two
independently-computed fields; a `DeckScreen` test that never exercised the `citySlugs`-threading
path it claimed to; a self-comparing `FilterRail` assertion; and three doc inaccuracies (recorded
in `docs/build-plan.md`'s own Phase S entry, not repeated here).

**Reviewer round 3: PASS WITH NOTES**, confirming rounds 1–2 held and catching that round 2's own
fix comment overclaimed itself: cross-checking the visible city name against the href's slug
catches the two fields disagreeing, but **not** a `page.tsx` city lookup that resolves the
*wrong* city consistently (both props built from the same wrong `city`) — a real, accepted gap
this harness test cannot close without a database read it doesn't have. Comment corrected to say
so plainly rather than overclaim. Also found: the `DeckScreen` fix for finding 2 above
reintroduced finding 3's exact self-comparison pattern (`citySlugOf("Бровари")` compared against
itself) — fixed with the same literal-string approach `FilterRail` already used. Both fixes are
one-line reword/literal changes, not new test logic.

**Debt flagged, not fixed this row:** `apps/web/test/harness/animal-detail.harness.ts` sits at a
hard per-file request-budget ceiling (~20 real page loads against a shared rate limit) where the
next test anyone adds risks breaking a *different*, unrelated test with a failure that points
nowhere near the actual cause — reproduced live during this round (adding a real O-12 test broke
an unrelated pre-existing test in the same file; folding the assertion into an existing test
instead, at zero extra page loads, fixed it). A second spoofed IP for a second describe block in
that file would remove the ceiling; not built here, since it's unrelated to Phase S itself.

**Parked:** the Neon verification for the migration above — see that entry for the written
procedure.

---

## Decisions

## Phase S — English name over transliteration (supersedes this entry's original version)
**Corrected 2026-09-12, Oleksii's own instruction, after the Neon cities-query verification
above confirmed the production assumption held.** The original version of this entry (below,
kept rather than deleted, since the reasoning it records — what's wrong with a hand-curated
per-city list, and with a naive ASCII-fold slugify — still holds and shouldn't need
rediscovering) chose to implement the official Ukrainian National transliteration system (КМУ
Resolution №55, 2010) as a pure function applied to `name.uk`.

**What was wrong with it, found only by Oleksii, not by any reviewer round or test:** the
transliterated slug and `seed.ts`'s own hand-authored `CITY_DATA.en.text` field were two
independently-computed Latin spellings of the same city, verified to *agree* for all 8 seeded
cities before shipping — but agreement today is not agreement forever. The table already stores
a real, human-verified English name for exactly this purpose (`nameEnText` /
`nameEnProvenance`, `packages/db/src/schema/cities.ts`); running a second algorithm against a
different field to produce what should be the same string is a standing risk that the two
sources diverge the first time a city's actual official English spelling doesn't match what the
transliteration table would produce (a documented KMU exception, a long-conventional spelling
outside the table's coverage) — and nothing before this correction would have caught that
divergence, since the transliterated value silently *is* the slug, never checked against the
authored one at write time.

Chose instead: `citySlugOf` takes the plain English name directly (lowercase, spaces to
hyphens — the literal instruction, not widened into a general punctuation sanitiser) and no
longer touches `name.uk` at all. The Ukrainian transliteration table (letter map, digraph rule,
word-initial exceptions) is deleted from the codebase, not merely unused — there is nothing left
for a future edit to quietly reintroduce as a "fallback." `LocalizedText.en` is nullable at the
schema level (a city can be Ukrainian-only), so every caller must resolve and reject a missing
English name itself before calling `citySlugOf`; `seed.ts`'s new `requireEnglishCityName` is the
one real caller's guard today, proven by a dedicated test rather than merely typed.
Reversibility: moderate now, not trivial — reintroducing transliteration means writing the table
back (it's gone, not disabled), and would resurrect the exact two-sources risk this correction
removes.
Confidence: high — this was Oleksii's own explicit instruction, not a judgement call between
options.
Commit: (recorded once this row's own follow-up commit lands).

**Original entry, 2026-09-10, kept for its still-valid reasoning against the alternatives:**
Chose: `citySlugOf` implements the official Ukrainian National transliteration system (КМУ
Resolution №55, 2010) as a pure function, applied to every seeded city's name, rather than a
hand-picked slug per city.
Alternatives: (a) a hand-curated `Record<CityId, string>` lookup — trivial for today's 8 cities,
but every future city (H2 admin) would need a human to invent a slug rather than one falling out
of the name for free; (b) a simpler ASCII-fold/slugify library ignoring Ukrainian-specific
digraphs — would produce wrong-looking results (e.g. naive letter-by-letter mapping breaks on
щ/ц/ж/х's multi-letter Latin forms, and on the зг→zgh digraph a reviewer round caught missing
from the first draft — `Розгон` was transliterating to `rozhon`, indistinguishable from a name
that actually contained ж, before the fix).
Why this one (superseded by the correction above, kept for the record): the official table
reproduced exactly the Latin spellings already in `seed.ts`'s own `CITY_DATA.en.text` for every
one of the 8 seeded cities (`Kyiv`, `Brovary`, `Irpin`, `Bucha`, `Vyshhorod`, `Boryspil`,
`Fastiv`, `Bila Tserkva`) — verified by hand before writing the implementation, not assumed. A
general, correct function also meant H2's future admin-created cities would get a slug for free
instead of needing a human to invent one per row. **This is exactly the reasoning the correction
above found insufficient — reproducing the same 8 values today was never proof the two sources
would keep agreeing.**
Commit: 7b32ece

## Phase S — cities-before-parse ordering
Chose: `renderGallery` (`apps/web/src/app/tvaryny/page.tsx`) and `GortatyPage`
(`.../gortaty/page.tsx`) now fetch `cities.list` and await it *before* parsing `searchParams`,
losing the previous `Promise.all([cities.list(), gallery.list()])` parallelism.
Alternatives: (a) parse filters optimistically as raw `CityId`s first and re-resolve slugs
after cities arrive — rejected, this reintroduces exactly the UUID-in-the-URL problem O-6 exists
to close, even if only transiently; (b) cache `cities.list` at the module or edge-config level
so the fetch essentially never blocks — a real fix, not built this row (below).
Why this one: resolving a slug to a `CityId` needs the real city list — there is no way to
parse `?misto=brovary` into `FeedFilters` without it, so the two fetches have a genuine data
dependency the old raw-UUID scheme never had.
Reversibility: moderate — undoing this means building the cache (option b), not just reverting
a diff; a real optimisation, tracked as a decision needing your eye above, not silently absorbed.
Confidence: medium — `cities.list` is an 8-row, unfiltered table scan, cheap in absolute terms,
but not measured against a real deployed instance the way O-9's timing work was.
Commit: 7b32ece

## Phase S — back-link scope: city only
Chose: the animal detail page's «← Усі тварини у {city}» now returns to `/tvaryny` filtered by
this animal's city alone — not the adopter's full incoming filter state (species/size/age), if
any.
Alternatives: (a) carry the adopter's full filter state across the detail page (via a `?from=`
param or a referrer capture) and restore all of it on back — a bigger feature, no existing
mechanism to build on, and not what O-12's own wording complains about; (b) do nothing until a
fuller fix is designed — rejected, the current bug (returns to the *unfiltered* gallery) is
strictly worse than this narrower fix in every case.
Why this one: O-12's complaint is specifically that the link's text ("all animals in Brovary")
promises a city filter the navigation doesn't honour — the city is the whole claim the copy
makes, and restoring exactly that claim closes the gap the observation names, without inventing
scope beyond it.
Reversibility: trivial to widen later — `backToGalleryHref` is a single prop already isolated to
this one computation (`tvaryny/[animalId]/page.tsx`); a future full-filter-restore would replace
its one call site, not thread anything new through `AnimalDetailScreen.tsx` itself.
Confidence: high — matches the literal wording of the observation being closed.
Commit: 7b32ece

## Phase S — the redirect only fires when every city token is fully resolvable
Chose: `redirectHrefForLegacyCityIds` bails out to `null` (no redirect at all) if any city token
in the URL is a raw `CityId` with no known slug — rather than rewriting the tokens it can and
silently dropping the one it can't, which the first implementation did.
Alternatives: rewrite what can be rewritten and drop the rest (the original behaviour) —
rejected on reviewer finding: dropping an unresolvable city id changes what the destination page
shows (from "no matches for this city" to "every city," a materially different result set), and
this redirect is a permanent 308 a browser caches — a wrong redirect here is not cheaply
recoverable the way a wrong render would be.
Why this one: a redirect this codebase can't fully verify as correct should not fire at all;
falling through to the normal render path (where `parseGalleryQuery`'s own tolerant per-token
parsing already handles an unresolvable id exactly as it always did) is strictly safer than
guessing under caching that outlives the mistake.
Reversibility: trivial — a behavioural branch in one function, reverting is deleting the early
`return null`.
Confidence: high — this is a correctness fix, not a judgement call.
Commit: 7b32ece
