# Review: b7dace6 (G4 part 1/2, deck exit timing)

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Touched suite `use-swipe-gesture.test.tsx`: 15/15 green | Full `pnpm check` green, 1007 unit / 217 harness (only a summary in the commit body, see #3) |
| Builder's mutation (exit path EXIT_EASE→EASE) reproduced: fails with `Expected "transform 280ms cubic-bezier(0.3, 0, 0, 1)" / Received "...(0.16, 1, 0.3, 1)"` | Rendered visual timing on a device (no harness assertion covers easing) |
| Mutation: spring path EASE→EXIT_EASE. The spring-back pin test fails as expected | |
| Mutation: reduced-motion *commit* exit (line 290) EXIT_EASE→EASE. **Survives, 15/15 green** (#1) | |
| README:203–204, :786 checked against the constants: 280ms and `cubic-bezier(0.3, 0, 0, 1)` match | |

Mutations ran in a temporary copy directory, which was then deleted. No tracked file was touched and `git status` is clean.

## FINDINGS (most severe first)

1. **[medium] use-swipe-gesture.ts:290: nothing tests the reduced-motion committed exit's easing.** This is the only reduced-motion path where easing is visible, because opacity goes from 1 to 0. The string the commit *does* test (line 314, reduced snap-back) has no visible effect: snap-back never changes opacity, so its easing never shows.
   Failure scenario: someone reverts line 290 to `EASE` and the suite stays green.
   Evidence: mutation A above, 15 passed. Fix: add one assertion for `opacity 120ms cubic-bezier(0.3, 0, 0, 1)` after a 150px drag with reduced motion stubbed.

2. **[low] use-swipe-gesture.ts (new `REDUCED_EXIT_MS` doc and line 306), test:439: the comments cite `docs/design/README.md:126, :348`.** Line 348 is the breakpoint table. The reduced-motion spec is at :204 (and :639 and :872). The citation was already wrong in the old comments, and this commit copies it into a new comment. Cite the section by name, not by line number.

3. **[low] The commit body has no pasted `pnpm check` output, only a one-line summary.** Under the review rules that is a finding in itself.

4. **[low] docs/build-plan.md G4 row says "3 new harness-adjacent unit assertions".** The commit actually has 2 new tests and 1 extended assertion, all happy-dom unit tests with no harness involvement. The row also implies the reduced-motion exit is pinned, and per #1 it is not.

5. **[note, pre-existing, out of scope] use-swipe-gesture.ts:334–343: `onPointerCancel` ignores reduced motion.** It always sets a 300ms transform transition, so under reduced motion the card visibly slides back. That contradicts README:204, "the stack does not move". The fix belongs to the Opus spring row, which rewrites this function anyway. Leaving it alone here was correct, but nothing records the gap. Add it to the G4 row's open half.

## Answers to the four questions

- **Q1 (reduced snap-back moved to EXIT_EASE): correct.** README:203 says all non-deck motion uses `(0.3, 0, 0, 1)` and the only spring is the deck's. README:204's reduced-motion spec is not that spring. The change has no visible effect (see #1), so there is no risk either way.
- **Q2 (`onPointerCancel` left alone): correctly out of scope.** It does need recording; see #5.
- **Q3 (do the tests catch regressions?):** they assert literal design strings, not the module's constants, so they are not self-referential. Two of the three catch the regression they exist for (mutations C and D). The third tests the inert path while the visible one goes untested (#1).
- **Q4 (is the comment enough for the Opus follow-up?):** the `SPRING_BACK_MS` comment plus the build-plan pointer are enough for that session to find the work. No inbox row is needed, since no default was taken on anything Oleksii must answer. The G4 row should add two things: the `onPointerCancel` reduced-motion gap (#5), and a note that the `300ms cubic-bezier(0.16, 1, 0.3, 1)` pin test is meant to be replaced, not kept.

## SIMPLIFICATIONS

- use-swipe-gesture.ts, the `SPRING_BACK_MS` doc comment (about 17 lines): cut it to 3–4 lines (the spec values 280/30 with no overshoot, the fact that CSS cannot express it, and a pointer to the G4 row). The rationale is already in the commit body and the build-plan row. Nothing breaks if this is wrong.

## TESTS

`apps/web` `use-swipe-gesture.test.tsx`: 1 file, 15 passed (15).
