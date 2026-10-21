# Visual tests inventory (2026-10-17)

Asked for by Oleksii with the "Test logic, not looks" convention (CLAUDE.md, inbox V-B1: "List
which ones exist so I know"). These tests are **frozen**: not extended, and one that fails
because of a visual change is deleted (listed in that PR's body), not fixed. Classified against
`origin/main` at `ac3e02f`. This is a snapshot, not maintained; when the brand lands the whole
list is reconsidered.

**2026-10-20: superseded.** Oleksii, verbatim: "UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance." The LOOKS tests and the LOOKS parts of
the MIXED ones listed below are deleted (branch `chore/drop-ui-measuring-tests`); the record of
what went is `docs/decisions-inbox/chore-drop-ui-measuring-tests.md`. This file is kept as the
pre-removal snapshot. Its line numbers are `ac3e02f`'s.

Classes: **LOOKS** (geometry, sizes, margins, font size, wrapping or truncation, colours,
contrast, `sizes` attributes, columns, CSS values, focus-ring appearance) · **LOGIC** · **A11Y**
(labels, keyboard, aria-live, focus order) · **MIXED** (part LOOKS, part LOGIC or A11Y).

## Totals

- **Harness** (`apps/web/test/harness/`, 225 test runs across 129 `test()` calls): LOOKS 101 ·
  MIXED 57 · LOGIC 50 · A11Y 17. No screenshot or pixel-diff assertions (Playwright only saves a
  screenshot on failure).
- **Unit and component tests:** 37 LOOKS assertion lines in 15 files, all class-string or
  exact-style checks; 2 MIXED.
- **No lint or test enforces design-token use** today.

## Two shared harness helpers decide many classifications (`harness.ts`)

- **`expectFocusVisibleOutline` (:324-379):** reaches the element with real Tab presses (A11Y),
  then checks outline width and offset ≥ 2px to tell the design's 3px ring from the browser's
  default (LOOKS). So every focus-ring test is MIXED. V-B2 keeps one presence test only.
- **`expectMinTouchTarget` (:122-138, `MIN_TOUCH_TARGET_PX` 48):** per-element size checks
  (LOOKS). V-B2 replaces them going forward with one test on the shared primitives.

## Harness tests that are LOOKS or MIXED, by file

| File | LOOKS | MIXED (what part is looks) |
|---|---|---|
| animal-detail | — | :120, :139 breakpoint visibility · :226–:302 focus ring ×7 |
| detail-photo-gallery | :81 photo dots ≥ 48px | :96, :106 focus ring |
| discovery-layout | :137 action row vs card overlap ×5 · :147, :156 freshness / shelter line inside card ×10 · :167 `MIN_SHELTER_MARGIN_PX` ×5 · :184 photo ≥ 152px ×5 · :208 back button ≥ 48px ×5 · :265 photo exactly 386px · :286 photo shrink at 390×640 · :344 notice hidden at 320 · :378 `test.fail()` 1280×800 deck width · :527 retry ≥ 56px | :216 overflow (vertical fit) ×5 · :324 notice position ×4 · :406 demo banner clipping/height ×4 · :460–:532 focus ring ×4 |
| discovery-reveal | — | :108 focus ring |
| freshness-pip-contrast | :76, :100 empty pips ≥ 3:1 | — |
| gallery-error | — | :118 focus ring |
| gallery-filters | :122 deck entry ≥ 48px | :49, :64 rail/sheet visibility · :90, :99 focus ring |
| gallery-layout | :99, :111 photo size / 4:5 ×5 · :170 first-row span ×6 · :278 photo box stable ×2 · :354 toolbar fits ×3 | :59 column count ×5 · :83 no sideways scroll ×5 |
| gallery-pagination | :65 targets ≥ 56px | :81 active page background colour · :154 skip link size |
| gallery-photo-sizes | :246 chosen variant ×12 · :270 `sizes` within 1px ×12 | — |
| kabinet | — | :122 no sideways scroll ×2 · :143 sign-out ≥ 48px + ring |
| site-header | :125 header height ×5 · :138, :152 links ≥ 48px · :198 logo baseline ×4 · :334 card name 24/22px ×4 · :363, :409 name truncation ×6 | :248, :254 no overflow ×4 · :273, :299 demo banner at 320 ×2 · :450, :458 focus ring |

Fully LOGIC or A11Y and untouched by the convention: discovery-gesture, gallery-arrow-nav (A11Y),
gallery-rate-limit, kabinet-confirm, prelaunch-gate, plus the LOGIC tests inside the files above
(reveal, not-found, pagination behaviour, filters' URL state, gate, sign-in flows).

**No-horizontal-scroll checks are MIXED.** Sideways overflow at 320/360 hides content (WCAG
1.4.10 Reflow), but the check is a raw pixel comparison that has failed on harmless 1–2px
platform font differences (`gallery-layout:332-347`).

## Unit and component LOOKS assertions

| File:line | What it asserts |
|---|---|
| `features/kabinet/SignInCard.test.tsx:207-208` | buttons/inputs carry `focus-visible:outline` and `min-h-14` |
| `features/kabinet/ShelterProfile.test.tsx:127, 143-145, 256, 262-263, 267-268` | `border-dashed`, `outline-4`, `focus-visible:outline`, `min-h-1[2-9]` |
| `features/kabinet/JoinFailedCard.test.tsx:39-40`, `InviteLandingForm.test.tsx:59-60`, `InviteLandingCard.test.tsx:117-118` | `focus-visible:outline`, `min-h-14` |
| `app/pro/page.test.tsx:43`, `features/chrome/Footer.test.tsx:40`, `features/chrome/SiteHeader.test.tsx:53` | links carry `focus-visible:outline` |
| `features/gallery/AnimalCard.test.tsx:169` | `text-rg-ink-2` on the resolved card's shelter line |
| `features/discovery/SwipeCard.test.tsx:86-88, 90, 166` | pip colour classes; `truncate` on the name |
| `features/discovery/DeckScreen.test.tsx:515-517, 541-543` | progress bar `hidden` / `block` |
| `features/discovery/use-swipe-gesture.test.tsx:232` | exact exit transition timing (MIXED at :250-251, :518: reduced motion is behaviour, its timing is looks) |
| `features/animal-detail/medical-labels.test.ts:24-90` | `barClassName` colour token per state (the labels in the same tests are LOGIC) |
| `packages/ui/src/freshness-display.test.ts:11, 15, 19` | MIXED: fill pattern is logic, colour token names are looks |

(All paths under `apps/web/src/` unless shown.) LOGIC despite touching styles or markup:
`DeckScreen.test.tsx:102` (progress width carries a computed value), `RevealFlow.test.tsx:326,
332` (scroll lock), the gesture position transforms, server-rendered HTML checks in the kabinet
tests, image-pipeline pixel dimensions, and `feed-predicate-identity`'s SQL snapshot (the only
`toMatchSnapshot` in the repo).

## Rule sentences narrowed by the convention

Each now carries a pointer to CLAUDE.md, "Test logic, not looks":

- `docs/standing-constraints.md`: "A user-interface item may not be marked done on the basis
  of inspecting markup"; "A documented limit with no test…"; "The mutation for a floor…"; "When a
  mock exists, open the mock"; "An interactive element ships with its focus-visible styling and a
  test".
- CLAUDE.md: the harness's "real geometry" description, the `test.fail()` marker paragraph, and
  the repeated lines under "Standing constraints that outrank convenience".
- `docs/observations.md` O-19: the page-wide size sweep is withdrawn.
- `.claude/agents/opika-reviewer.md`: the mock and 48px/focus lines.
- `.claude/commands/review-pr.md`: the screenshot evidence line and "exact values" design check.
