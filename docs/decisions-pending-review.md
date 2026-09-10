# Decisions pending Oleksii's review

Working log for the autonomous session started 2026-09-09. Every reversible judgement call made
without asking goes here instead of blocking on an answer — see `CLAUDE.md`'s working loop for
the rule this implements. Newest entry last within each section.

**Note on history:** this file's prior content (R2 — notice moved/notice geometry/photo height
assertion) shipped via PR #54, merged into `main`. Replaced here rather than left to read as
still-pending, per "one document per subject... when superseded, replace it."

## Summary — read this first

**Row completed this session:** the reveal rate limit now counts distinct shelters, not reveal
actions — Oleksii's own diagnosis and instruction (§55 status call, 2026-09-10), not a
unilateral decision.

**PR:** [#58](https://github.com/opika-ua/opika/pull/58), open against `main`, not merged.

**What changed:** `checkRevealRateLimit` (`apps/web/src/api/reveal-rate-limit.ts`) takes the
target `shelterId`. Free re-reveal if this adopter already revealed this shelter within the 24h
window (a new `hasRevealedShelterRecently` existence check); otherwise the 30-per-24h budget now
bounds `COUNT(DISTINCT shelter_id)`, not raw reveal-row count. `reveals.shelter_id` already
existed with its own index — no migration.

**Reviewer round: PASS WITH NOTES**, two high findings fixed before commit:
1. `hasRevealedShelterRecently`'s adopter-scoping had no test proving it was load-bearing —
   deleting the `adopterId` condition left every test green. Added: adopter B, already at their
   own 30-shelter cap, targeting a shelter only adopter A ever revealed, must still be
   rate-limited. Mutation-confirmed red without the fix.
2. The 30-shelter budget was only pinned from above (blocked at 30) — a mutation to `maxReveals:
   29` passed every test. Added: 29 distinct shelters must not rate-limit a 30th. Mutation-
   confirmed red without the fix.

Three medium findings addressed by correcting doc comments rather than code (the reviewer's own
call on which route was right): a math error in the "cheap existence check" claim (real-corpus
`EXPLAIN` showed it isn't cheap when a popular shelter has many other adopters' rows — comment
now says so rather than overclaiming); a "gesture parity is closed by this change" overclaim
(only *repeat* accidental drags become free — a first-time accidental drag on a never-revealed
shelter still spends a unit and still irreversibly discloses contact details, same as an
accidental button tap always did); CLAUDE.md's decision #14 correction note understated the
change (added the free-re-reveal short-circuit to the description, not just the aggregate
change).

**Filed, not fixed:** O-20 (`docs/observations.md`) — `RATE_LIMITED` and other `ORPCError` codes
carry no HTTP status mapping and answer bare `500`. Pre-existing (found by the reviewer, not
introduced here); becomes user-visible once the deck's inline reveal (R3, gesture parity) ships
and a real adopter hits the budget. Not filed as its own numbered entry in `docs/observations.md`
in this branch's own copy — that file's `O-19` lives only on `feat/polish-batch` (PR #57,
unmerged), and inserting `O-20` here would number-collide once the two merge in either order.
Recorded here instead; move it into `docs/observations.md` proper once one of the two merges.

**Decisions needing your eye (reversible, not blocking):**
1. **[trivial to reverse] Two sequential queries (existence check, then distinct count) rather
   than one combined query.** The reviewer measured the two-query shape as faster for the common
   case (a repeat reveal short-circuits before ever running the more expensive distinct-count
   query) and slower for the rare one (a first-time reveal pays both). Combining them into one
   query (`count(distinct shelter_id), bool_or(shelter_id = $target)`) trades one for the other.
   Not changed — the common case is the one worth optimising for, but it's a real trade, not a
   free simplification, so it's flagged rather than assumed.
2. **[trivial to reverse] `checkRevealRateLimit`'s new `shelterId` parameter reuses the shelter
   object `reveal.ts`'s handler already fetched** for verification-status checking, rather than
   a second lookup. Confirmed safe: `shelter.id` cannot diverge from `animal.shelterId` — the
   fetch is keyed on it.

**Parked:**
(none)

---

## Decisions

## Reveal budget — counts distinct shelters, not reveal rows
Chose: `COUNT(DISTINCT shelter_id)` over the 24h window, with a free short-circuit for a shelter
already revealed by this adopter in that window — exactly Oleksii's own instruction, not a
judgement call between alternatives.
Why: contacts are scrapeable per shelter, not per animal — the old row-count let a device
right-swiping 40 cards across 6 shelters burn 40 units to see 6 phone numbers, which was the
counter measuring the wrong quantity, not the budget being genuinely tight.
Reversibility: trivial to revert the counting change itself (swap `countDistinct` back to
`count()`, drop the short-circuit); the seven tests pinning this behaviour would need reverting
alongside it or they'd fail against the reverted code.
Confidence: high — implementation matches the instruction's own wording exactly
(`COUNT(DISTINCT shelter_id)`), independently mutation-tested per finding.
Commit: 60d69a1.

---

## PARKED

(none)
