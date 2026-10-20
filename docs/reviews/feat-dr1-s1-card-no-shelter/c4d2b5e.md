Verdict for c4d2b5e1e7f4904a42c1a65074e911174238e27f: PASS WITH NOTES

PR #162, branch `feat/dr1-s1-card-no-shelter`, reviewed at exactly `c4d2b5e` (the branch head at
review time; it had not moved). Not Tier 1; one review. Plan: `docs/designer-round-1.md` §3 (S1),
DR1-D1, his §10 answers (on `origin/docs/designer-round-1-plan`).

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Shelter line (name + `verificationSuffix`) removed from all three `AnimalCard` variants; diff read, and the new tests render each variant | The builder's full `pnpm check` (lint warning count, domain/i18n/contracts/ui/db totals, `build:web`): I ran only the suites below, not the whole check |
| Accessible name unchanged (`cardAccessibleName` untouched; existing test still passes) | That the builder's own two mutations failed with the text quoted; I ran equivalent ones myself (below) |
| `apps/web` unit suite: 2708 passed (149 files), same as the commit body | |
| Touched suites (`features/gallery`, `SwipeCard.test.tsx`, `seo-flags.test.ts`): 182 passed (12 files) | |
| `test:harness`: 251 passed (4.9 min); same count as the commit body. Chromium 141 aliased into a scratch `PLAYWRIGHT_BROWSERS_PATH` (pinned build not installed); no repo change | |
| Every harness `shelter-line` reference is the deck's (`discovery-layout.harness.ts`, `viewports.ts`); none was deleted | |
| Exactly one visual test deleted (the `text-rg-ink-2` class assertion), listed in the commit body as CLAUDE.md "Test logic, not looks" requires | |
| `verificationSuffix` still has a live caller (`SwipeCard.tsx:249`); `card.shelter` still feeds `cardCityId` (`card-text.ts:35`) | |
| No Ukrainian added or removed; no contract or DB change; migration none | |
| Biome clean on both changed files; `@opika/web` typecheck clean | |

Mutations I ran (scratch copy, discarded):
1. Shelter name rendered back into the card body → 3 red: "shows neither the shelter's name nor a
   verification on the {standard,reserved,resolved} card".
2. Shelter name appended to `aria-label` → 4 red: the three "keeps the shelter's name out of the …
   accessible name" tests plus the existing `cardAccessibleName` test.
3. A second `<a>` inside the card → 9 red, including all six new tests (the one-link assertion).

FINDINGS (most severe first; none blocking)
1. [minor] `apps/web/src/seo-flags.ts:72-76` — the doc comment still says "`AnimalCard.tsx` and
   `SwipeCard.tsx` both call this". After this PR only `SwipeCard.tsx` does. The README sentence
   saying the same thing was corrected; the code comment wasn't. Comments are claims (standing
   constraints: update any comment your change invalidates).
   Failure scenario: a reader trusts the comment, assumes the gallery still states verification
   through this gate, and misjudges the launch-gate work when the flag flips.
2. [minor] `apps/web/src/features/gallery/AnimalCard.tsx:234-236` — the reason given for the deck
   keeping its shelter line ("because it carries the shelter's sentence, which needs its speaker")
   is true today, but his DR1-Q1 final answer (§10) moves the sentence off the deck. The plan's
   own DR1-D1 row says "(until DR1-Q1)". Either word the comment so it survives that change, or
   the Q1 slice has to correct it. Name the follow-up so it isn't lost.
3. [info] The new `"перевірений"` absence assertion can't fail today: while
   `REGISTRY_HAS_NO_REAL_SHELTERS` is `true`, `verificationSuffix` returns `null` anyway. The
   name-absence assertion carries the test (mutation 1), so nothing needs to change. Just don't
   count it as coverage of the suffix.

SIMPLIFICATIONS
- None worth the churn. `verificationSuffix` now has a single caller, but it still holds the one
  gate for the claim, so keep it.

TESTS
- apps/web unit: Test Files 149 passed (149); Tests 2708 passed (2708)
- touched suites: Test Files 12 passed (12); Tests 182 passed (182)
- harness: 251 passed (4.9m)
- Not run by me: packages/* suites, `build:web` on its own (the harness builds the app), full
  `pnpm check`.
