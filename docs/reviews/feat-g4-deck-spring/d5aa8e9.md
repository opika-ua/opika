# Review: feat/g4-deck-spring @ d5aa8e9 (Tier 2, async)

VERDICT: PASS WITH NOTES

VERIFIED                                                        | TAKEN ON TRUST
--------------------------------------------------------------- | ------------------------------
Discovery unit suites at d5aa8e9, in an isolated worktree: 7 files, 110 passed (96 before, so +14 matches the commit) | Workspace total 1029 / apps/web 493 / harness 217 (from the pasted `pnpm check`)
Closed forms, checked by hand: underdamped x and v (uses ωd² + ζ²ω² = ω²), critically damped, overdamped c1/c2 all correct | Harness run (not rerun; the poll change was reasoned about, not run)
ζ = 30/(2√280) ≈ 0.896. Free overshoot ≈ e^(−πζ/√(1−ζ²)) ≈ 0.15%. Speed at the first crossing from 100px at rest ≈ 6 px/s, so the clamp stop can't be seen and G4-2's clamp is a faithful reading of README:203/:786 | Feel on a real device (the commit itself lists this as asserted)
"≤390ms settle": the first crossing from rest is ≈369ms whatever x0 is (the zero doesn't depend on x0) | The other 4 builder mutations (all present and specific)
Spot-check of the builder's mutation (cancelAnimationFrame removed): "drops a pending snap-back when the card is grabbed again" goes red, as claimed |
My own mutations: (a) `velocityPxPerMs * 1000` → `velocityPxPerMs`; (b) the pointerup's `releaseVelocity(...)` → `0`. **Both pass, 110/110.** |

FINDINGS (most severe first)
1. [medium] use-swipe-gesture.ts:398–402, 195. No test covers how the release velocity gets into the hook. Every hook test releases at velocity 0, and spring.test.ts gives v0 directly in px/s.
   Failure scenario: the unit conversion is lost, or `releaseVelocity` is bypassed. Every release then returns as if the finger were at rest (or 1000× too slow), which is the one behaviour the commit says sets a spring apart from a curve. The suite stays green.
   Evidence: mutations (a) and (b) above, both 110 passed. Fix: one hook test that drags with explicit `timeStamp`s, lets go while moving outward, and asserts a frame past the release x.
2. [low] spring.test.ts:66. The assertion in "never renders the card past the origin" sits inside `if (frame.kind === "moving")`. A `returnToOrigin` that always returns `at_rest` passes it by skipping it. Other tests cover 88/0 and 40/400 only. Assert that each grid case renders at least one moving frame.
3. [low] spring.ts:31–34. The comment says the rest thresholds are "only reachable" when critically damped or overdamped. That is false for |x0| < 0.5px: `returnToOrigin(DECK, 0.4, 0)(0)` is `at_rest` without ever crossing. Reword it.
4. [low, not a regression] use-swipe-gesture.ts:327–338. Grabbing a card mid-return freezes it at the spring's x. The first move then jumps it to `clientX − startX`, and a tap jumps it straight to the origin. The old version jumped too, to the origin at grab. Seeding `startX = clientX − currentX` would make the grab continuous. Suggest a follow-up row.

Reduced motion: correct. Every return path now writes an opacity-only transition and lands on the origin in one frame (README:204). The new cancel test pins this.
Harness poll: can't hide the bug. A card stuck at its exit position never reaches the origin, and the topCardName check at 600ms still guards against the deck advancing.

SIMPLIFICATIONS
- spring.ts:62–75. The critically damped and overdamped branches, plus the rest thresholds (which only matter in those regimes), serve only the test configs. The one production config is underdamped. Removing them loses nothing until damping is retuned to ≥33.5, and spring.test.ts's "crosses the origin" test already turns red at that moment.
- `SpringConfig.mass` is always 1. It could become a fixed constant. If the design ever specifies a mass, it has to come back.

TESTS
apps/web src/features/discovery @ d5aa8e9: Test Files 7 passed (7), Tests 110 passed (110).
