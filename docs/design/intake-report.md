# V1 intake report — «Реєстр» visual system

Phase V1 (`docs/build-plan.md`). Read against `docs/design/README.md` and
`docs/design/Opika Registry System.dc.html`, both now in the repo, replacing
the "Keeper's Voice" handoff entirely. Every claim below cites a file and
line/section — per the rule just added to `docs/standing-constraints.md`,
this report is written from having opened the mock, not from the README's
prose alone, and each disagreement found between the two is called out as
exactly that.

**Stop here.** This is the intake, not the re-skin. Nothing in `apps/web`,
`packages/ui`, or the Tailwind config has been touched.

---

## A. Coverage

### What has an actual rendered mock frame in `Opika Registry System.dc.html`

Every `data-screen-label` in the file, in document order:

| Label | What it shows |
|---|---|
| (unlabelled) palette + type swatches | Light colour system, type scale, both as rendered swatches |
| B0 Logo lockup | Mark + wordmark, header lockup, dark-background variant, favicon sizes |
| B1 Gallery 1920 | Full desktop gallery: header, rail, sort, 4-col grid, pagination (2 pages) |
| B2 Gallery 360 | Full phone gallery: header, result count, one vertical card, one horizontal card, sticky bottom bar |
| B3 Freshness | All three freshness states + the shelter's sentence block |
| B4 No match | The no-match empty state |
| B5 Card variants | Standard, reserved, resolved — all three gallery card variants |
| B6 Sheet | The filter sheet at 360 |
| B7 Deck card | One deck card (stack + buttons), no header/exit chrome |
| Z Scope | Text-only: "unchanged" list and "four rules, where they live" list |

### What the README specifies in prose but has no mock frame at all

- **Detail page (04)** — README's "Detail (04)" section gives a full two-column
  layout, sticky photo column, medical-status row treatment, the "Де живе"
  circle/no-map block. Zero pixels of it are in the canvas.
- **Contact reveal modal (05)** — fully described (640-wide, radius 24,
  padding 24), not drawn.
- **My reveals (06)**, **Exhausted (07)**, **Error states (08)** — each has a
  paragraph in "The other screens," no frame.
- **Loading skeleton** — described ("Photo block `#DCDCD9`, text bars
  `#F2F2F0`, radius 8... no shimmer, no pulse"), not drawn.
- **Error, whole list / Error, next page** — copy given, no frame.
- **1024–1439 desktop bracket (3 columns, rail)** — the canvas has 1920
  (4-col) and 360 (1-col) only. The 3-column bracket exists solely as a row
  in the README's breakpoint table, never rendered.
- **600–1023 tablet bracket as its own screen** — a horizontal card is shown
  *inside* the 360px phone mock (`Opika Registry System.dc.html:224-231`) as
  a component sample, not inside an actual ~768px-wide tablet gallery frame.
  There is no tablet-width screen anywhere in the canvas.
- **Out-of-range page notice** — present in the *previous* handoff and in
  `docs/gallery-contract-decisions.md` §3 as a decided, built behaviour
  (E0's server clamp, this repo's own code). **This new README does not
  mention it at all** — not in "Gallery states," not anywhere. Not a
  contradiction (nothing says remove it), but a real gap: there is no visual
  or copy guidance for how the existing clamp-and-note behaviour should look
  in the new system. Flagged, not guessed at.

### What this means concretely

The README's own claim — "Fidelity: high. Every colour, size, line-height,
radius, spacing step, motion timing and contrast ratio below is final" — is
true of the *values*, verified in section C below. It is not true of
*coverage*: roughly half the app's actual screens (everything past the
gallery and the deck's single card) have numbers to build from but nothing
to look at. E3 is the concrete cost of building from numbers alone without
opening a mock that exists; here, for several surfaces, no mock exists to
open. V2 will be building those from prose, the exact situation the new
standing-constraints entry warns about, without the option of doing
otherwise. Worth surfacing before V2 starts, not discovering mid-phase.

---

## B. Product rules

All four survive, and — unusually — the handoff restates them itself, twice:
once in its own "Four product rules" section, and again, independently, in
the mock canvas's own "Z Scope" frame ("Чотири правила · де саме вони живуть
у скіні"). Quoting both.

**1. Freshness — honest, non-alarming.**
> "Freshness is honest and non-alarming. Three pips plus a day count in
> words, always both. Never red, never amber — those hues are not in the
> token set at all. Opacity never carries meaning." (README, "Four product
> rules" #1)

Mock's own restatement: "Три пипки 10px плюс дні словами, завжди обидва.
Червоного й бурштинового немає серед токенів узагалі. Прозорість ніде не
несе сенсу: «уже вдома» — інша заливка картки." (`Opika Registry
System.dc.html:406`) **Holds.** The three pip states use `#1B3A6B`
(registry blue), `#63676B` (ink-3) and `#101112` (ink) — no red, no amber,
consistent with the token table in section C having neither hue at all.

**2. Unknown reads as «Не записано».**
> "Unknown reads as «Не записано» — never as 'no', never as an error state."
> (README #2)

Mock: "Порожнє поле — це слово «Не записано» кольором ink-3, не прочерк і не
червоне." (`:407`) **Holds, and stated more specifically than before** — the
mock explicitly also rules out a dash, which the original standing-constraint
wording didn't name.

**3. Fostered animals — no map pin.**
> "A fostered animal never gets a map pin. City-precision location renders
> as a place name in a filled block. No map is drawn, even at 1920 where
> there is room. A pin would claim precision the data does not have."
> (README #3)

Mock: "Тварина під опікою волонтерки отримує назву міста в блоці-заливці.
Мапа не малюється взагалі, навіть на 1920." (`:408`) **Holds.** The
detail-page shelter-with-premises treatment even *adds* a new, deliberately
imprecise circle marker (`README.md`, "Де живе": 76px circle, `rgba` fill,
8px dot, "deliberately offset ~1 km") — precision-hedging is more explicit
than before, not less.

**4. The platform never touches money.**
> "The platform never handles money. Donations are external links with the
> destination domain (`dobro.ua ↗`) visible before the tap. The blue is
> never used on the donate row." (README #4)

Mock: "Донат — рядок-заливка з доменом dobro.ua і стрілкою ↗ перед
натисканням. Синій #1B3A6B на ньому не використовується." (`:409`) **Holds.**

**None of the four is a stop.** All four are load-bearing enough in the new
handoff that they're stated twice independently, which is stronger evidence
than the previous handoff gave for the same rules.

### The shelter's sentence — still first person, not a metadata row

Confirmed first-person, not demoted. README's "The shelter's sentence"
section: "Written once by the shelter at verification, in their own words...
Do not write, paraphrase or generate these sentences." The mock renders it
literally in quotation marks: *«Ми оновлювали цю картку 25 червня. З того
часу не заходили — напишіть, і ми скажемо, чи Ластівка ще з нами.»*
(`Opika Registry System.dc.html:256`, `:359`) — "Ми" (we) is the actual
first-person plural pronoun, present in both the freshness-block mock and
the deck-card mock. The attribution line "Слова притулку · дата
автоматична" sits directly under it in both places, unchanged in function
from the previous handoff. **Not a metadata row.**

---

## C. Exact values

The README gives numeric values almost everywhere: 8 colours (+ 8 dark-mode
counterparts) with measured contrast ratios, an 8-role type scale with
size/line-height/weight/tracking for each, 4 radii, 1 shadow value, a
7-step spacing scale, 4 touch-target sizes, exact motion timings and easing,
and per-component padding/gap down to the 4px step. This is denser and more
exhaustive than the previous handoff.

### Prose-only, no exact number given

- Font payload: "≈ 84 KB total" — approximate, not exact (reasonable for a
  three-file total; get the real number from the actual woff2 files once
  self-hosted, don't ship 84 as a build-time assertion).
- "Мобільна назва картки" (mobile card name) drops to "22/26 · 700 ·
  −0.02em" — this is exact, correcting an initial read; no further
  prose-only gaps found beyond the font payload figure.

### Two internal discrepancies found — mock vs. its own README, and mock vs. itself

**1. The "label" role's letter-spacing and colour disagree between the type
scale's own swatch and every place the role is actually used.**

- `docs/design/README.md:129` (the type-scale table): `label` role is
  `12/16 · 500 · 0.08em, uppercase` — and this row's own "Used for" column
  says "filter group labels" explicitly.
- `Opika Registry System.dc.html:73` (the type-scale swatch demonstrating
  exactly this role): renders it at `letter-spacing: 0.08em; color:
  #45484B` (ink-2) — matches the README's table.
- `Opika Registry System.dc.html:131` (the rail's actual МІСТО/ВИД/РОЗМІР/
  ВІК group labels) and `:330` (the sheet's identical labels): both render
  at `letter-spacing: 0.06em; color: #63676B` (ink-3), with no explicit
  `line-height` set at all — not `0.08em`/`#45484B` as documented for the
  exact role the table says these labels use.

This is a real, citable disagreement, not a rounding artifact — 0.06 vs
0.08 and ink-2 vs ink-3 are both deliberate-looking, different values. V2
needs to pick one and, per the standing-constraints entry just added, that
pick should go back to whoever owns this handoff rather than being silently
resolved either direction.

**2. The resolved-card photo placeholder's exact hex only exists in the
mock, not in the README.**

README says only "photo placeholder darkens to its own hatch" (the "Resolved"
card-variant bullet) — no value given. The mock has it exactly:
`repeating-linear-gradient(135deg, #CFCFCB 0 10px, #E0E0DD 10px 20px)`
(`Opika Registry System.dc.html:311`), distinct from the standard
placeholder's `#DCDCD9 0 10px, #EFEFED 10px 20px` (`:144` and every other
card instance). This is exactly the class of value the new standing-
constraints entry exists to catch — it would have shipped as a guess without
opening the mock.

### One behavioural rule that is genuinely new logic, not a re-skin

The README's own framing is explicit: "This is a re-skin, not a redesign...
what changes is palette, typeface, type scale, radii, borders-vs-fills,
elevation, density, iconography and motion" (README, "What this is," and
restated in the mock's own subtitle, `:32`). Structure and behaviour are
supposed to be unchanged.

One value breaks that framing on its own terms. Pagination's page-count
label is now **conditional**:
> "«з N» renders only when the number list is truncated with an ellipsis
> (1 2 3 … 9, з 12) — while every number is on screen the counter just
> restates what you can count." (README, "Pagination — not infinite
> scroll")

Restated in the mock's token block: "«з N» з'являється тільки з
трикрапкою: 1 2 3 … 9, з 12. Дві сторінки поруч самі себе рахують."
(`:380`), and the actual B1 gallery mock — 2 total pages, no ellipsis —
correctly shows **no** "з N" label at all (`:188-196`).

**This did not exist in any form in the previous handoff.** E3's
just-shipped `GalleryPagination` always renders "з N" unconditionally
(`apps/web/src/features/gallery/GalleryPagination.tsx`). This is new
*behaviour* (a conditional-rendering rule), not merely a new visual
treatment of existing behaviour — the one place this handoff's "re-skin, not
redesign" promise doesn't hold precisely. V2's work order (section F) has to
include a logic change here, not just a restyle.

### The "verified against an automated harness" claim

README's fidelity line says the values are "final and verified against an
automated harness." No harness in this repository currently asserts any
value from this handoff — `apps/web/test/harness` still asserts the
*previous* design's colours, radii and spacing (see section F). Read
charitably, this describes the design author's own external verification
process, not a claim about this repo's CI. Noted so it isn't later mistaken
for "V2 has nothing to verify."

---

## D. Geometry

**Unchanged**, and stated as directly as a document can state it. The
mock's own "Z Scope" frame, "Не змінено" ("Unchanged"):

> "Breakpoints 0–599 / 600–1023 / 1024–1439 / 1440+ and column counts
> 1 / 2 / 3 / 4. Container 960 at 1024–1439, 1320 at 1440+; at 1920 the page
> doesn't stretch — the margins grow. Rail from 1024, sheet below. The
> filter group composition is the same. Pages with addresses,
> `/tvaryny?misto=…&stor=…`, and `/tvaryny/gortaty` with `noindex`. What
> sits on which screen — nothing moved and nothing new appeared."
> (`Opika Registry System.dc.html:396-400`, translated)

The README's own "This package specifies" paragraph makes the identical
claim in the opening section. Cross-checked against the actual B1 (1920)
and B2 (360) mock frames: header structure, rail position, grid column
counts, and the 960/1320 content ceilings are all consistent with what's
currently built and harness-asserted (`gallery-layout.harness.ts`'s
content-width tests, `docs/design/README.md`'s prior "Breakpoints &
Surfaces" note — now gone, but the numbers it asserted are the numbers this
new handoff repeats).

**This is not a re-plan trigger.** V2 is a re-skin in the geometric sense
the build-plan row assumes; no column-count or container-width harness
assertion needs to change.

---

## E. Typeface

**e-Ukraine**, three weights only: Regular 400, Medium 500, Bold 700.
Self-hosted woff2, subset to Cyrillic + Latin basic + punctuation,
`font-display: swap`, ≈84 KB total for all three files (README,
"Typeface"). Explicitly: do not load e-Ukraine Head (Bold covers every
heading), never go below 400 (Light is described as unreadable on cheap
Android panels at the sizes this design uses).

This **replaces** the current two-family system (Literata serif for
display/names + Commissioner sans for everything else, both via
`next/font/google`, `apps/web/src/app/fonts.ts`) with one family used
everywhere. Every serif use in the current app disappears under this
handoff — there is no serif role anywhere in the new type scale.

**Licence — verified independently, not taken from the README as given.**
The README states "free to use, full Cyrillic and Latin" with no licence
name. Checked directly: e-Ukraine is commissioned by Ukraine's Ministry of
Digital Transformation (designed by Dmytro Rastvortsev at Fedoriv), and is
licensed **CC BY 4.0 (Creative Commons Attribution 4.0 International)** —
confirmed via the font's GitHub mirror
([bennetfabian/e-Ukraine](https://github.com/bennetfabian/e-Ukraine), whose
own README states the CC BY 4.0 licence explicitly) and cross-referenced
against the official source, `thedigital.gov.ua/fonts`.

**This matters concretely: CC BY 4.0 requires attribution.** Neither the
README nor the mock says where that attribution needs to live in the
product (a footer, an about/licences page, neither exists yet). Literata
and Commissioner are both OFL-licensed via Google Fonts and need no such
credit — this is a genuinely new obligation, not a continuation of an
existing one, and belongs on V2's work order, not assumed away.

**Source provenance, also worth a note before self-hosting anything:** the
mock's own `<head>` block loads the font from a third-party GitHub mirror
(`cdn.jsdelivr.net/gh/haos616/e-Ukraine@master/...`,
`Opika Registry System.dc.html:15-17`), not an official government CDN.
Fine for a prototype canvas; V2 should source the actual files to self-host
from the authoritative origin (`thedigital.gov.ua/fonts`) or a mirror
whose file hashes can be checked against it, not copy the prototype's
convenience CDN link into production.

---

## F. Harness impact — V2's work order

Checked every file in `apps/web/test/harness/`, every `*.test.ts(x)` under
`packages/ui` and `apps/web/src/features`, and every source file referencing
the old design doc by name.

### Colour — one literal assertion, but a full-palette replacement underneath it

Only one test in the entire suite pins a raw colour value:
`apps/web/test/harness/gallery-pagination.harness.ts:90-92` asserts the
active page pill's `getComputedStyle(...).backgroundColor` equals
`rgb(79, 107, 58)` (`--color-leaf`, `#4f6b3a`). That single assertion has
to change to whatever renders the new `#101112`/ink fill for an active
pagination pill.

The real scope is underneath: `apps/web/src/app/globals.css`'s entire
`@theme` colour block (`--color-paper`, `-paper-alt`, `-sunken-deep`,
`-line`, `-line-strong`, `-line-heavy`, `-ink` through `-ink-4`, `-leaf`,
`-leaf-press`, `-leaf-hover`, `-avatar-bg` — 13 tokens) has no counterpart
in the new 8-token light palette (`page`, `surface`, `fill`, `fill-strong`,
`ink`, `ink-2`, `ink-3`, `registry`) plus its 8-token dark mirror. Notably:
**the new palette has no 4th ink step** (old had `ink`/`ink-2`/`ink-3`/
`ink-4`; new has `ink`/`ink-2`/`ink-3` only), and **no `leaf` equivalent** —
`registry` (`#1B3A6B`) plays a much narrower role than `leaf` did (freshness
first pip + focus ring only, never a general accent or button fill; the new
system's buttons are `ink`-filled, not accent-coloured).

### A type-level change, not just a Tailwind class rename

`packages/ui/src/freshness-display.ts`'s `PipFill` union is `"bg-leaf" |
"bg-ink-4" | "bg-ink" | null`, and `freshness-display.test.ts` pins those
exact strings (`toEqual(["bg-leaf", null, null])` for fresh, etc.). Under
the new palette: `bg-leaf` has no target token to become (fresh's filled
pip is `registry`, an entirely different role than the old system's
general-purpose accent), and `bg-ink-4` has no target at all (aging's
filled pips are `ink-3` in the new scale, which only goes three deep). This
is a **type signature change** in `packages/ui`, not a CSS-only edit —
worth naming explicitly since `packages/ui`/`packages/domain` type changes
are one of `docs/build-plan.md`'s standing stop-gate conditions, and V2's
plan should flag this rather than discover it mid-implementation.

### Radii, spacing, and shadow — full remap, no 1:1 survivors

- Radii: old (`--radius-card: 20px`, `-photo`/`-button`/`-freshness`: 12px
  each, `-chip: 999px`) → new (`8` pips/tags, `16` buttons/fields/photo-in-
  card, `24` cards/rail/sheet/modal, `999` chips). No shared numeric value
  except chip radius.
- Spacing: old 5-step scale (`4/8/16/24/40`, named `label/row/group/
  section/screen`) → new 7-step scale (`4·8·12·16·24·32·48`). Three old
  steps (`4`, `8`, `16` as *group*, `24` as *section*) survive as numbers;
  `40` (*screen*) has no equivalent, and two new steps (`12`, `48`) have no
  old counterpart. Token names will need to expand, not just renumber.
- Shadow: old `--shadow-card: 0 18px 40px -24px rgba(60,44,24,0.45)` → new
  `0 24px 48px -32px rgba(16,17,18,0.4)`, and the new system is explicit
  that this is "one step, two places only" (deck top card + sheet) — the
  sheet did not have a shadow in the old system per `globals.css`'s own
  comment ("the design's other elevation step... was never implemented").
  One new shadow *use site* to add, not just a value swap.
- **Borders are structurally gone.** "Nothing in the system has a stroke...
  separation is carried by fill contrast" (README, "The premise of the
  skin"). Every `border-line`/`border-line-strong`/`border-line-heavy`
  class currently in the codebase (the rail, the sheet, `AnimalCard`,
  `GalleryPagination`'s prev/next buttons, chips, `SortControl`) represents
  a component whose separation mechanism changes conceptually, not just its
  border colour. This is the single largest-surface-area item on V2's list.

### Touch targets — the minimum itself moves, not just its colour

`gallery-pagination.harness.ts:32`: `const MIN_TARGET_PX = 44`. New
handoff: "48 minimum anywhere · 56 primary actions and pagination · 64
mobile header · 88 desktop header. (Raised from 44 — this is a civic-trust
metric, not just an a11y floor.)" (README, "Geometry, density, elevation,
motion"). This assertion needs to become **56**, specifically, for
pagination (not the 48 general floor) — the mock's own pagination row uses
`min-height: 56px` throughout (`Opika Registry System.dc.html:189-195`).

### Motion — a gesture-physics change, not a CSS timing swap

Old (`globals.css`, `--ease-keeper: cubic-bezier(0.16, 1, 0.3, 1)`, quick
160ms · settle 300ms · reveal 340ms · exit 300ms · reducedExit 120ms) → new
(quick 120ms · settle 220ms · reveal 280ms, **all** on
`cubic-bezier(0.3, 0, 0, 1)`, explicitly "short and dry; no springiness in
the interface"). The deck's own spring physics also change: new spec gives
"stiffness 280, damping 30, no overshoot" as the deck's release spring,
distinct from the interface easing curve. `apps/web/src/features/discovery/
use-swipe-gesture.ts` keeps its own copy of motion constants (per
`globals.css`'s own comment, deliberately not reading the CSS theme) — that
file's real gesture-physics values are what actually need to change, not
just `globals.css`. Per `docs/model-policy.md`, gesture physics is named
Opus-tier work ("M5 swipe deck | Opus | Gesture physics and pointer
capture") — V2's plan should split this out rather than treat the whole
phase as Sonnet-tier restyling.

### Icons

New: "No library. Seven hand-drawn glyphs, 2px stroke at 24, round caps:
`▾ ← → ↓ ✕ ✓ ↗`." Nothing currently in the codebase defines an icon system
at all (existing UI uses text/emoji-free plain characters, e.g. `GalleryPagination`'s literal `‹`/`›`, already being replaced per E3's own reviewer round). New scope, not a re-skin of existing icon code.

### Stale file-path references — 7 sites across 6 files, all comments

Every one of these cites `docs/design/Opika - Keeper's Voice.dc.html` by
its exact former filename, which no longer exists in the repo as of this
commit:

- `apps/web/src/app/fonts.ts:79`
- `apps/web/src/features/gallery/GalleryPagination.tsx:17`
- `apps/web/src/features/home/HomeScreen.tsx:27`
- `apps/web/test/harness/gallery-pagination.harness.ts:35`
- `apps/web/test/harness/gallery-pagination.harness.ts:219`
- `packages/i18n/src/messages/en.ts:6`
- `packages/i18n/src/messages/uk.ts:255`

All are comments (no build or test failure results from the rename), but
each is a "next reader trusts it" rationale citation
(`docs/standing-constraints.md`, "How work is kept") pointing at a file
that's gone. V2 touches most of these files anyway for the re-skin itself;
worth fixing as part of that pass rather than a separate sweep.

Separately, and larger: `CLAUDE.md`, `docs/build-plan.md`,
`docs/gallery-contract-decisions.md` and `docs/standing-constraints.md`
collectively reference `docs/design/README.md` by section name or
description 28 times (e.g. `CLAUDE.md`'s own description of it as "the
'Keeper's Voice' design handoff — tokens, typography, spacing, motion,
gesture spec, string table, all eight screens, and the gallery + desktop
breakpoints... 34.5 KB"). Not enumerated line-by-line here — that count
alone is the signal that `CLAUDE.md`'s own description of `docs/design/`
needs a pass once V2's shape is known, not before.

### What does *not* need to change

Worth stating plainly so V2 doesn't over-scope: `gallery-layout.harness.ts`'s
960/1320 content-width ceiling assertions, its column-count assertions
(1/2/3/4 cards per row by breakpoint), and its 4:5 photo aspect-ratio
assertion all survive unmodified — confirmed against section D above. The
tablet card's `~120px photo column` assertion
(`gallery-layout.harness.ts:94-102`, `toBeCloseTo(120, 0)`) is the one
partial exception: the new README gives a *range* — "96–120px photo left"
(README, "Gallery — the primary surface," 600–1023 row) — not a fixed
value, so this assertion needs a decision (fixed at one end of the range,
or genuinely fluid) before it can be re-pinned, not just a new constant.

---

## Summary for the "decide" step

Nothing here is a stop on product-rule grounds — all four survive, twice
confirmed. Two real open questions before V2 starts, not during it: the
label letter-spacing/colour discrepancy (section C) needs a call from
whoever owns this handoff, and the conditional "з N" pagination logic
(section C) is new behaviour E3 didn't build and needs to, not merely
restyle. The gesture-physics motion change (section F) is large enough and
Opus-tier enough that V2's own task breakdown should probably split it out
rather than fold it into a single 10h line. Coverage (section A) means
several screens will be built from prose with no mock to fall back on,
which is worth knowing going in rather than discovering per-screen.
