# Decisions inbox: fix/s1-f1-stale-comments

Row for the shared table (`docs/decisions-inbox.md`), appended at merge. Tier 3 (comment-only).
One review (local agent wrote the fix, so a fresh local reviewer did the one review).

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| S1-F1 | 2026-10-23 | `docs/reviews/feat-dr1-s1-card-no-shelter/c4d2b5e.md`, finding 1: two stale comments left over from S1 (no shelter name on gallery cards) and S6 (shelter sentence moved to `/prytulky/{id}`) | — | — | fixed: `seo-flags.ts`'s `verificationSuffix` doc corrected to name only `SwipeCard.tsx` as a caller; `AnimalCard.tsx`'s JSX comment corrected on why the deck keeps its shelter line | — | resolved |

## What this fixes

Two stale comments (see the original PR body for the full before/after). The review of this
PR's own first commit (`docs/reviews/fix-s1-f1-stale-comments/34b13ec.md`, PASS WITH NOTES)
found a THIRD stale claim two lines above the edited block in `AnimalCard.tsx` ("no shelter
sentence here, unlike the deck" — false since S6 removed the deck's sentence too), fixed in the
same PR since it was directly adjacent to what this PR already touches. Also applied the
review's simplification suggestion: dropped the "(review of ..., S1-F1)" provenance asides,
since git blame already carries that history and the comments read better without it.

## Review notes (not fixed here — follow-up batch, different files)

The review found the same stale-claim pattern in files this PR doesn't touch:
- `seo-flags.test.ts:253` and `SwipeCard.test.tsx:131-132` both still say "`verificationSuffix`
  is the shared gate both cards now call" — same inaccuracy as the one fixed in `seo-flags.ts`,
  just in the test files.
- `SwipeCard.tsx:87` still gives "the shelter's sentence is not [croppable]" as a reason the
  photo shrinks first — the sentence it's referring to no longer exists on that card.

## Verified

Typecheck and lint green (comment-only). `seo-flags.test.ts` + `AnimalCard.test.tsx`: 53/53,
re-run after the follow-up fix too. Migration: none.
