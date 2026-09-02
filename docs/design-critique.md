# Design critique — live site, post-Phase F

Assessment only. Nothing in this document was acted on; every finding below is a candidate for its own phase, not a change already made. Captured against `https://opika.org.ua` (commit `a0826ac`) at 360/768/1280/1920px, real seeded content, no synthetic data.

**Evidence policy: no screenshots are committed, and none are needed.** Every finding below is backed by a measured value (read from the live DOM via `getComputedStyle`/`getBoundingClientRect`), a cause located in source, or an exact reproduction — a URL, a viewport width, and the element to look at. The ~50 MB of full-page PNGs this pass was captured against were deliberately not committed: git keeps them in every clone forever, and a finding that is only legible beside a 3 MB image is a finding that was not written precisely enough. Where a view is worth seeing, the reproduction is stated inline so it can be regenerated in seconds.

---

## A. Deviations from the mock — measured

Every value below was read with `getComputedStyle`/`getBoundingClientRect` against the live DOM, not eyeballed from a screenshot. The mock (`Opika Registry System.dc.html` / `Opika Registry Frames.dc.html`) is content-box; this app is border-box — measurements below are the rendered (border-box) values, compared against the mock's stated values as documented in `docs/design/README.md`.

### A1 — Gallery card name drops to the compact size at desktop widths, not just tablet/mobile-horizontal

**Spec** (`README.md` "Scale" table + "Mobile card name drops to 22/26·700·−0.02em on the compact horizontal card"): the gallery card name is `display-s` (24/28) on the standard vertical card, dropping to 22/26 *only* on the 600–1023px horizontal-card layout.

**Measured**, `[data-testid="card-name"]`:

| Width | Layout (per spec's own breakpoint table) | Font/line-height rendered |
|---|---|---|
| 390px | 1 column, vertical card | **24px/28px** ✓ matches display-s |
| 768px | 2 columns, horizontal card | **22px/26px** ✓ matches the documented compact size |
| 1280px | 3 columns, **vertical** card, rail open | **22px/26px** ✗ should be 24/28 |
| 1920px | 4 columns, **vertical** card | **22px/26px** ✗ should be 24/28 |

**Cause, read from source**: `AnimalCard.tsx`'s name span is `text-[24px]/[28px] tablet:text-[22px]/[26px]` — the `tablet:` breakpoint (768px) drops to the compact size and nothing resets it at `desktop:`/`wide:`. The class was written for the 768px horizontal-card case and never un-set once the layout returns to a vertical card at 1024px+.

**Reproduce**: `/tvaryny` at 1280px or 1920px, inspect `[data-testid="card-name"]` — `font-size` reads 22px where the table above expects 24px. Compare against the same element at 360px, which correctly reads 24px.

### A2 — Header height is under the spec's touch-target minimum at both breakpoints

**Spec** ("Screens" > "Gallery": *"min-height 88 desktop / 64 mobile"*; also restated under "Touch targets": *"64 mobile header · 88 desktop header"*).

**Measured** (`<header>` `getBoundingClientRect().height`):

| Width | Measured | Spec | Gap |
|---|---|---|---|
| 390px | 56px | 64px | −8px |
| 768px | 64px | 64px | ✓ |
| 1280px / 1920px | 68px | 88px | −20px |

**Cause**: `min-h-14 tablet:min-h-16 desktop:min-h-17` in `tvaryny/page.tsx` — Tailwind's default scale makes these 56/64/68px. `min-h-14` (56) undershoots the mobile spec (64) by a full step; there's no class close to 88 in the default scale (`min-h-22` would be 88, but the code stops at 17/68).

### A3 — Desktop page padding is 60px, not the spec's 32px

**Spec**: *"Page padding 40 32 56 desktop, 20 16 mobile"* (top/horizontal/bottom).

**Measured**: header and content container both use `desktop:px-15` → 60px horizontal padding at 1280px and 1920px, not 32px. Mobile (`px-4` → 16px) is close to spec's 16px mobile figure but the desktop figure is off by 28px, a 1.875× overshoot.

**Note**: this may be intentional — 60px leaves more breathing room at the two widest breakpoints, and the content column's own `max-w-[960px]`/`max-w-[1320px]` ceiling (confirmed correct, see A5) means the extra padding only affects how much air surrounds the capped content, not the content's own width. Flagging as measured, not asserting it's wrong.

### A4 — Detail page name tracking is −0.03em, not display-l's −0.035em

**Spec**: display-l (44/46, used for "detail page name") specifies `−0.035em` tracking; display-m (34/38) specifies `−0.03em`.

**Measured**, `[data-testid="animal-name"]` at desktop width: `font-size: 44px; line-height: 46px; letter-spacing: -1.32px` → `-1.32/44 = -0.03em`, not `-0.035em` (`-1.54px`).

**Cause**: `AnimalDetailScreen.tsx`'s name uses one hardcoded `tracking-[-0.03em]` across both the mobile (34px, correctly `-0.03em` for display-m) and desktop (44px, should be `-0.035em` for display-l) sizes — the class doesn't change between breakpoints even though the font-size does. Visually a ~0.2px difference at this size; flagged for completeness, not because it's perceptible.

### A5 — Content-width ceilings confirmed correct (not a deviation)

**Spec**: content max **960** at 1024–1439px, max **1320** at 1440px+, fluid below the ceiling.

**Measured**: grid width 848px at 1280px viewport, 1320px at 1920px viewport. 848 < 960 is correct — the code's own comment in `tvaryny/page.tsx` documents this as an intentional ceiling, not a fixed width, and the arithmetic checks out (1280 − 60×2 padding − 280 rail − 32 rail-gap = 848). At 1920px the grid reaches its 1320px ceiling exactly. **No deviation** — recorded here because it looked like one before checking the available-width arithmetic.

### A6 — Everything else checked matches the spec exactly

Measured and confirmed identical to the documented value:

| Element | Spec | Measured |
|---|---|---|
| Gallery card | white / radius 24 / padding 12 / gap 16 | ✓ exact |
| Card photo | radius 16, aspect 4/5 | ✓ exact |
| Card meta text | body 15/22, `#45484B` | ✓ exact |
| Card shelter line | caption 13/18, `#63676B` | ✓ exact |
| Filter rail | white / radius 24 / padding 24 / gap 28 | ✓ exact |
| Filter chip | 48px min-height, padding `0 20`, radius 999 | ✓ exact |
| Chip-to-chip spacing (sheet, 360px) | not numerically specified, but within the 4·8·12·16·24·32·48 scale | **8px** both axes — see B4, this directly answers the thumb-spacing concern |
| Freshness pips | 10×10px, `gap: 6` between pips, filled = `#1B3A6B`, empty = transparent + border | ✓ exact (border width reads as 1px via `getComputedStyle`, class specifies `1.5px` — likely a sub-pixel rounding artifact at `deviceScaleFactor: 1`, not re-verified with a higher-precision tool; flagged, not asserted) |
| Freshness block (detail page) | `#F2F2F0`, radius 16, padding 16 | ✓ exact |
| Detail photo | radius 24 | ✓ exact |
| Reveal modal | 640px wide, radius 24, padding 24, shadow `0 24px 48px -32px rgba(16,17,18,0.4)` | ✓ exact, including the exact shadow value |
| Reveal backdrop | `#B9B9B5` | ✓ exact (`rgb(185,185,181)`, measured at 90% opacity — spec gives the hex but not an explicit alpha, so the 0.9 isn't itself a deviation) |
| Result-count singular/plural at n=1, 21, 74 | `Intl.RelativeTimeFormat`/`PluralRules`-correct Ukrainian | ✓ "1 тварина", "21 тварина", "+74 тварини" — all grammatically correct (see C4 for the one boundary that couldn't be tested) |

---

## B. What only the running app reveals — judgment

### B1 — Vertical rhythm holds up across a full scroll, with one real wrinkle

Scrolled the full 24-card gallery at 360px and 1920px rather than judging from the mock's single ideal card. The 4·8·12·16·24·32·48 spacing scale reads as genuinely calm down the whole page — no drift, no accumulating misalignment, gap rhythm stays constant card after card.

The one real wrinkle: fostered animals carry a longer meta line (`молодий · мала · живе у волонтерки, м. Вишгород`) that wraps to two lines where every other card's meta stays on one. CSS Grid's default row-stretch handles this gracefully — every card in that row grows to match the tallest, so nothing misaligns — but it does mean the one-line cards sharing a row with a wrapped neighbour are stretched to the taller card's height and pick up unclaimed whitespace below their shelter line. **Reproduce**: `/tvaryny` at 1920px (4 columns) and find any row containing a fostered animal — its meta line runs to two lines, the other three in that row stay at one, and all four render at the fostered card's height. Minor, not a defect — the mock's single-card frame has no way to show this at all, since it never renders two cards side by side.

### B2 — Gallery → detail → back reads as one product

Ground color (`#ECECEA` page / white cards) and type scale carry through consistently between `/tvaryny` and the detail page — no jarring shift in density or palette on the click-through from `/tvaryny` to `/tvaryny/{animalId}` at 360px. The header treatment is the one place it doesn't fully carry: the gallery header shows the wordmark + (on desktop) a deck-entry button; the detail page header is just a bare "← До списку" link with no wordmark, so a user who clicked in mid-scroll loses the "Opika" branding entirely on the page after the one they clicked from. Small, but it's a real discontinuity a single-frame mock can't surface since it never shows two connected screens back to back.

### B3 — The band + no-match combination reads oddly together

Not covered by any mock frame, since the band's spec only describes it above a *populated* grid. When a filter combination yields zero results while no city has been chosen — **reproduce** at `/tvaryny?vyd=cat&rozmir=large&vik=senior` (or any zero-yield combination) at 360px, with no `misto` param — the promise band ("Тварини з перевірених притулків Київщини. Перегляньте список...") still renders directly above "Під ці фільтри зараз нікого немає" — the platform's opening pitch sits immediately above a screen telling the visitor there's nothing to see. Not broken (the "nothing blocks browsing" rule is honored literally — the band's presence is correctly gated only on city selection, not on result count), but it reads as slightly tone-deaf on first encounter. Worth a look once real deviations are being fixed, not urgent on its own.

### B4 — Touch-target spacing at 360px: no problem found

Measured directly (not eyeballed) rather than assuming the worst: every chip pair in the mobile filter sheet is **8px apart, both axes**, chip height 48px — measured at 360px with the sheet open. The "chips sitting 4px apart" failure mode this was checking for doesn't occur — 8px is one full step on the design's own spacing scale, and the 48px targets never come closer than that on either axis. Recorded as a checked-and-clear item, not a finding.

### B5 — Nothing depends on hover

Grepped the codebase for hover-only-visible patterns (`opacity-0 hover:`, `hidden hover:`, `group-hover:opacity`) — none exist. The design's own hover spec (a 120ms background tint, no lift, no shadow) is purely decorative feedback, never a discoverability mechanism, and the code matches that. Checked and clear — worth stating explicitly since it was one of the four things this pass was asked to verify, not because anything was found.

---

## C. Real-content stress — the category no mock covers

### C1 — Longest/shortest names: no problem

The seed corpus draws from a 32-name pool for 220 animals; the longest are `Мухтар`/`Грізлі` (6 characters). Both fit on one line with room to spare at every breakpoint tested — the `truncate` class never engages, at any width. **Real risk not covered by this corpus**: a genuine shelter's animal names in production won't be drawn from a curated 6-character-max pool. The card's own `truncate` class (per spec: "Animal names truncate to one line with ellipsis") is the safety net, but it was never exercised against anything close to its actual limit in this pass — worth a manual test with a deliberately long fabricated name (e.g. 25+ characters) before real shelter data lands.

### C2 — Longest fostered-location string: wraps, doesn't break

`живе у волонтерки, м. Біла Церква` (34 characters, the longest card-meta string in the corpus) wraps to two lines on the card rather than shrinking or truncating — matches spec's "Metadata rows wrap rather than shrink" rule exactly, and ties back to B1's row-height observation.

### C3 — Freshness sentences: real range is 90–111 characters, both render cleanly

Only 6 unique sentences exist across the whole corpus (one per shelter, not per animal — confirmed the field is shelter-level). Shortest (90 chars) and longest (111 chars) both sit comfortably within the spec's 4-line clamp and 88px min-height reservation — no visible truncation or awkward wrap at either extreme.

### C4 — Result counts: 1, 2, 5, 21, 74 all verified grammatically correct; 11 could not be produced

Found real filter combinations on the live corpus for four of the five requested boundary values plus one more found along the way:

| Count | URL | Rendered |
|---|---|---|
| 1 | `?misto=<Київ>&vyd=dog&rozmir=large&vik=young` | "Підходить 1 тварина" ✓ |
| 2 | `?vyd=dog&rozmir=small&vik=baby` | "2 тварини" ✓ |
| 5 | `?vyd=cat&rozmir=medium&vik=baby` | "5 тварин" ✓ |
| 21 | `?misto=<Київ>&vik=baby` | "Підходить 21 тварина" ✓ |
| 74 (found while searching) | no-match suggestion count | "+74 тварини" ✓ |

**11 was not reachable** through any species/size/age/city combination tried (a systematic sweep of every species×size×age triple, then every city×size and city×species pairing). This isn't evidence of a bug — `Intl.PluralRules('uk')` is exercised and tested at exactly this boundary in `packages/domain`'s own unit tests, per `CLAUDE.md`'s "non-negotiable test suites" — but it means **this specific live-corpus pass could not visually confirm** the one Ukrainian plural boundary that actually differs from the "ends in 1" pattern (11 takes the "many" form despite ending in 1, unlike 21 which takes singular). Recorded as an honest gap, not silently dropped: worth a five-minute manual check once a filter combination happens to land on 11, or a synthetic test if this matters enough to not wait for one.

Also could not test **4-digit pagination counts** — the live corpus tops out at 220 animals / 10 pages. Untestable at current scale, not a finding either way.

### C5 — Multiple simultaneous «Не записано» fields: only ever 2, never more

Checked the actual ceiling rather than assuming: `Не записано` can only appear in the medical section (vaccination + sterilization status) — the chip/rabies row is *omitted entirely* when absent, per spec's "never «немає документів»" rule, and every other field (location, freshness) has its own non-blank fallback copy. Found an animal with both medical fields blank simultaneously — the maximum the design's own rules allow, and it renders cleanly, two honest "Не записано" rows on consecutive labelled lines with the section's normal row spacing, no crowding.

### C6 — Mixed photo aspect ratios: not tested against real variance

The seed corpus's 9 photos (`cat-1..4.jpg`, `dog-1..5.jpg`) are all real photographs, so some natural aspect variance exists, but every card view crops them into the same 4:5 `object-fit: cover` frame regardless of source ratio — by design, per spec ("Photos 4:5, `object-fit: cover`"). This means the *card* is inherently safe from aspect-ratio stress (cover always fills the frame). Not checked in this pass: the detail page's photo carousel, where a landscape source photo inside a portrait 4:5 frame could crop faces/subjects out of frame in a way `object-fit: cover` doesn't protect against — that needs a manual look at each of the 9 real source images against the detail-page crop, not just a rendering check. Flagged as unchecked, not passed.

### C7 — Dark mode: fully specified in the design, not implemented at all

`docs/design/README.md`'s Colour section documents a complete dark theme — 8 tokens, each with its own measured contrast ratio (page `#0E0F10`, surface `#17191B`, ink `#F4F5F6` at 17.4:1, etc.). **Grepped `globals.css`: zero `prefers-color-scheme` or `dark:` rules exist anywhere.** Forced a real dark-scheme render (Chromium's `prefers-color-scheme: dark` emulation, `/tvaryny` at 390px) — the page renders pixel-identical to its light-mode render; the OS/browser dark-mode signal is not read at all. The grep result above is the load-bearing evidence here, not the image: there is no rule to apply. Not a rendering bug (nothing breaks, nothing goes illegible) but a real design-fidelity gap: the design work is done and specified with real numbers, and the implementation never picked it up. Given the user's own framing — many Ukrainian Android users run forced dark mode permanently — this is a real, sizeable population seeing a page the design system explicitly planned for but never shipped.

---

## Prioritized findings — most damaging first

1. **(C7) Dark mode is fully specified but entirely unimplemented.** A real design theme with measured contrast ratios exists in the docs and was never wired into `globals.css`. Every user with forced dark mode — a meaningful share of the Ukrainian Android install base per the brief's own framing — sees the light theme regardless of their OS setting. Highest priority because it's the widest-reaching gap: not a corner case, a whole rendering mode.

2. **(A1) Gallery card name renders at the compact 22/26 size at desktop and wide breakpoints, not the spec's display-s 24/28.** Affects 2 of the design's 4 documented breakpoints (1024–1439 and 1440+) — the majority of desktop and all wide-viewport visitors see undersized card names. A one-line CSS fix (reset the tracking class at `desktop:`) once prioritized.

3. **(A2) Header height is 12–23% under the spec's touch-target minimum** at both mobile (56px vs 64px) and desktop (68px vs 88px). Not failing WCAG's 24px floor, but under this project's own stated 64/88px civic-trust standard at every breakpoint checked.

4. **(C6) Detail-page photo crops were not checked against the real source images' aspect ratios.** Unlike the card (safely cover-cropped by design), this is a genuine unchecked risk — a landscape photo could crop a subject out of frame on the detail page's portrait carousel. Needs a follow-up look before it's ruled out either way.

5. **(A3) Desktop page padding measures 60px against the spec's stated 32px** — a 1.875× overshoot. Possibly intentional (more breathing room doesn't break the content-width ceiling), but undocumented as a deliberate deviation if so.

6. **(B2) The detail page header drops the "Opika" wordmark**, breaking brand continuity for anyone who clicked into a detail page mid-gallery-scroll.

7. **(B3) The first-run band renders above a zero-result no-match state**, pairing the platform's opening pitch with "nothing here." Not broken, reads slightly tone-deaf.

8. **(C1) Longest-name handling was only checked against the seed corpus's actual 6-character maximum**, not against a name anywhere near the `truncate` class's real breaking point. Low risk (the safety net exists per spec) but genuinely unverified at scale.

9. **(C4) The Ukrainian "11" plural boundary — the one case that doesn't follow the "ends in 1" pattern — could not be produced on the live corpus** to visually confirm, though it's covered by `packages/domain`'s own unit tests. A documentation gap in this pass, not a known defect.

10. **(A4) Detail page name tracking is −0.03em instead of display-l's −0.035em** at desktop widths. ~0.2px difference at 44px — likely imperceptible, included for completeness.

11. **(B1) Fostered-animal cards with wrapped meta text leave unclaimed whitespace in shorter neighbor cards** in the same grid row. CSS Grid's row-stretch prevents actual misalignment; this is a minor whitespace observation, not a layout break.

**Checked and confirmed clear** (not findings, listed because they were explicitly asked about): touch-target spacing in the mobile filter sheet (8px both axes, B4); hover-dependent discoverability (none found, B5); content-width ceilings at 1280/1920 (A5, correct fluid-below-ceiling behavior); plural/grammar correctness at n=1/2/5/21/74 (C4); simultaneous blank-field rendering (C5); every gallery-card/rail/chip/pip/modal geometry and color value not called out above as a deviation (A6).
