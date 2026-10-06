# Review: cfb16d2 — round 2 of the "offline reveal" row (delta since b22b7c1)

Tier 2, asynchronous, re-review. Reviewer: opika-reviewer.

```
VERDICT: PASS WITH NOTES

VERIFIED                                          | TAKEN ON TRUST
useReveal.ts: no-ensureSession branch now keeps   | typecheck / lint / build:web green (prose summary
  `[error]` from safe(bootstrap) into             |   in the body, not pasted output — same as round 1)
  bootstrapError; `!ready` branch maps            | DB suites and test:harness (builder says not run;
  `instanceof TypeError` -> "offline", else       |   unrelated to this diff)
  "loadFailed". Read the code, not the message.   |
Both new tests reject `bootstrap`, not            |
  `revealCall` (useReveal.test.tsx:143,           |
  RevealFlow.test.tsx:278), and both assert       |
  revealCall was never called                     |
Eyebrow «БЕЗ ЗВ'ЯЗКУ» and no-body assertions are  |
  present in the RevealFlow offline test          |
The 2 touched files: 22/22 pass                   |
Mutation spot-check: `false && bootstrapError     |
  instanceof TypeError` -> both new tests red     |
  (text below); restored, tree clean              |
The deck's scope-boundary argument: read          |
  use-feed-deck.ts:197-205 and SwipeDeck.tsx:     |
  168-175. It does not hold (finding 1)           |
```

## FINDINGS (most severe first)

1. **[medium] apps/web/src/features/reveal/useReveal.ts:81-94 (new comment) + use-feed-deck.ts:198-205.** The deck has the same bug, and the new comment gives a false reason for leaving it.
   - **The comment's claim:** "the deck's first bootstrap attempt happens before any reveal is possible … by the time `open()` can run, a prior bootstrap has already either succeeded (cached) or the adopter couldn't have swiped to begin with." That claim is false, for two reasons:
     - (a) In `SwipeDeck.tsx:168-175`, a right swipe calls `openReveal` *before* `onSwipe`. If the first swipe of a page load is a right swipe, the reveal's `ensureSession` is the very first bootstrap.
     - (b) `onSwipe` commits the swipe locally first and only then calls `ensureSession`, fire-and-forget. A failed bootstrap returns silently and clears `sessionReadyRef` (line 203). So swiping while offline is fully possible, and nothing gets cached.
   - **Failure scenario:** the feed loads, then the network drops, then the user right-swipes. Bootstrap throws a `TypeError`. `.then(([error]) => !error)` collapses it to `false`, so the user sees `reason: "loadFailed"` and the generic "Щось не спрацювало на нашому боці" instead of «Зараз немає інтернету.»
   - **Reviewer error:** round 1's statement that "the deck caches a successful bootstrap … so the reveal call is the first request to fail" was only true *after* a successful bootstrap. It was incomplete, and the commit relies on it ("the reviewer confirmed…"). That is my mistake, recorded here.
   - **Fix:** make `ensureSession` return the error, not a boolean. For example, `Promise<{ok:true} | {ok:false; error:unknown}>` (a discriminated union, per the standing constraint), and have both branches of `useReveal` use the same `instanceof TypeError` mapping. This is a small, separate commit. It is not a STOP.
   - **Follow-up comment fix:** fix the comment (a wrong rationale is worse than none). If the deck fix lands, the comment goes away anyway.
2. **[low] Commit body.** Still a prose summary of the check run, with no pasted `pnpm check` output. This carries over from round 1. The PR's full check run is what counts.

## Mutation spot-check
`false && bootstrapError instanceof TypeError`, which turns off the new offline mapping. Result: `Tests 2 failed | 20 passed (22)`.
- `× a session bootstrap that never reaches a server at all is reason: 'offline', not loadFailed`
- `× shows the offline copy when the session bootstrap itself never reaches a server`, with `Unable to find an accessible element with the role "dialog" and name "Зараз немає інтернету."`

This matches the builder's claim.

## SIMPLIFICATIONS
- Once `ensureSession` returns the error (finding 1), the `let bootstrapError` / `if (ensureSession)` split in `useReveal.ts:95-103` collapses. The default becomes `ensureSession ?? (() => safe(bootstrap).then(toResult))`, which is one path instead of two that differ only in where the error is dropped.

## TESTS
`apps/web`, the 2 touched files only: Test Files 2 passed (2), Tests 22 passed (22). With the mutation: 2 failed | 20 passed (22).

This is round 2 of 2. Per the review cadence, finding 1 becomes a follow-up commit or a build-plan row if it is not fixed on this branch. It does not block anything.
