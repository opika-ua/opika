# Test logic, not looks (full text)

Moved verbatim from CLAUDE.md in DS PR 5. CLAUDE.md keeps the current rule in four lines; this is the owner's wording and the 2026-10-20 removal of visual tests.

### The two browser-layer gates

`build:web` and `test:harness` are the last two steps of `check` on
purpose, and neither is redundant:

- **`build:web`** catches what typecheck structurally cannot (see
  "Module resolution"). It fails in seconds with a compiler error.
- **`test:harness`** catches what a green build cannot: an app that
  compiles perfectly and lays out wrongly. It measures real geometry and
  drives real pointer events. (Until the brand lands, its geometry checks
  are frozen and new specs test flows only: see "Test logic, not looks".)
  **2026-10-20:** removed, not frozen. Oleksii, verbatim: "UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance." The
  harness now drives flows, keyboard operation and pointer events; the
  only size measurement left is V-B2's 48px min-height test on the shared
  primitives (`kabinet-profile-edit.harness.ts`). A few computed reads stay
  as presence checks, not measurements of looks: the V-B2 focus test's
  outline/box-shadow (an indicator is there), UI-U1's `boundingBox()`
  widths (a control exists at a width) and UI-U6's `naturalWidth` (a photo
  decoded). Its timing waits wait on a settled state or a stated event
  time, never the real clock (his condition for UI-U1..U7, 2026-10-20).

The harness builds the app too, which makes `build:web` look duplicated.
Keep both - `build:web` is the fast, specific failure, and it keeps
working if the harness is ever broken or quarantined.

(Frozen with the other visual checks, until the brand lands.) One assertion in the harness is
marked `test.fail()`: the deck
(`/tvaryny/gortaty`, migrated from `/discovery` in E5) is a 390px phone
column and does not adapt at 1280x800. That gap is recorded, not hidden.
When the responsive pass lands, Playwright will report an unexpected
pass - that is the signal to delete the marker.
**2026-10-20:** that marker is deleted, with the other UI-measuring tests (Oleksii, verbatim:
"UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance."). The deck's desktop gap is no longer asserted anywhere; the responsive pass is
tracked as design work, not as a failing test.

## Test logic, not looks (standing convention until the brand lands)

Oleksii, 2026-10-17 (inbox V-B1), verbatim: "Standing rule from now (until the designer's brand
lands): the visual design, fonts included, will change. Test logic, not looks.
- Stop: screenshot/pixel-diff checks, markup snapshots, assertions on CSS classes/colours/sizes/line-wrapping, mock-faithful styling work.
- Keep: domain, contract, handler and repository tests; Neon smokes; history checks; copy-gate; a few Playwright flow tests that query by role/label/text only; accessibility basics (labels, keyboard, aria-live).
- K2/K3/K4 screens: functional first, styled only through shared design tokens (colour, type, spacing) so the rebrand is a token swap. No one-off styles in components.
- Existing visual tests: don't extend them; remove any that start failing because of a visual change rather than fixing them."

His clarification (V-B2), verbatim: "both count as accessibility basics, not looks. - Visible
focus: keep one presence test (focused element shows an indicator when tabbing), never its
appearance. - 48px touch target: a shared min-height token on the shared button/control
primitives, plus ONE test on those primitives that the computed min-height is ≥ 48px. No
per-component or per-screen size checks."

In practice:
- **New tests assert behaviour:** states, flows, errors, what a control does. A Playwright test
  finds elements by role, label or text, never by class or position, and measures nothing.
- **New components use theme tokens only** (`apps/web/src/app/globals.css`, `@theme`): no
  arbitrary values (`text-[13px]`, `#hex`, `px-[7px]`) and no per-component font, colour or
  spacing. A rebrand edits the tokens, not the screens.
- **Accessibility basics stay tested:**
  - labels, keyboard operation and aria-live, per component, as behaviour;
  - focus visibility: one presence test;
  - the 48px floor: one test on the shared primitives.

  The constraints the brand itself must keep are in `docs/design/brand-constraints.md`.
- **Existing visual tests** (geometry, sizes, contrast, wrapping, `sizes` attributes, class
  assertions) are frozen, not extended. One that fails because of a visual change is **deleted,
  not fixed**, and the deletion is listed for Oleksii in the PR body.
- **A mock still decides structure and content** (which fields, which states, which copy), not
  pixels. So "when a mock exists, open the mock" (`docs/standing-constraints.md`) still holds for
  what a screen contains.
- **`test:harness` (above) still runs in `check`.** Its job narrows to flows and behaviour in a
  real browser. Its geometry assertions are the frozen visual tests just described.
- Rules in `docs/standing-constraints.md` that this narrows carry a pointer back here.

**2026-10-20: the visual tests are removed, not frozen.** Oleksii, 2026-10-20, verbatim: "UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance."
So every harness and unit test that measured appearance (geometry, sizes, margins, overflow,
contrast, wrapping and truncation, `sizes`/srcset, CSS class and colour assertions, focus-ring
width) is deleted, and the `test.fail()` desktop-deck marker with it. Two V-B2 tests stay, both in
`kabinet-profile-edit.harness.ts`: the shared controls' computed min-height ≥ 48px, and a focused
control showing an indicator when tabbing. Where a deleted check also walked the tab order, the
walk stays as keyboard reachability (`expectReachableByTab`). The list of what went and what was
kept as unsure is `docs/decisions-inbox/chore-drop-ui-measuring-tests.md`. The bullets above that
say "frozen" describe the state before that date.

