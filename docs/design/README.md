# Opika — «Реєстр» visual system · developer handoff

## What this is
Opika is a pet-adoption platform for Kyiv oblast (Київщина), Ukrainian-first, mobile-heavy,
targeting mid-range Android on carrier networks. Adopters browse animals from manually verified
shelters in a **responsive gallery** (the primary, indexed, shareable surface) and can enter a
**one-at-a-time swipe deck** from it. The platform never handles money and requires no account.

This package specifies the **«Реєстр» visual system** — a re-skin of an already-built and verified
layout. Structure, breakpoints, column counts, container widths, the rail/sheet split and the URL
scheme are **unchanged**; what changes is palette, typeface, type scale, radii, borders-vs-fills,
elevation, density, iconography and motion.

The design reference is `Opika Registry System.dc.html` — a flat canvas of mock frames, not an app.
Open it in a browser and scroll; it is wide. Recreate the values in the repository's own stack
(Next.js 16 / React 19 / Tailwind per the stack decision). Do not ship the HTML. It uses inline
styles and a prototyping runtime wrapper (`support.js`) — take the numbers, not the markup.

**Fidelity: high.** Every colour, size, line-height, radius, spacing step, motion timing and
contrast ratio below is final and verified against an automated harness. The only placeholders are
photographs: every image area is a diagonal hatch standing in for a real 4:5 shelter photo.

---

## The premise of the skin
The Дія / Резерв+ treatment applied without softening. Large confident type, generous whitespace,
flat surfaces, large radii, high contrast — and **no colour in the interface at all**. The primary
action is black. Exactly one blue, `#1B3A6B`, carries the single signal that has earned a colour:
*confirmed by the state registry*. Everything else is an ink scale on paper grey. All colour on
screen comes from the animals' photographs.

The single structural move that does most of the work: **borders are gone**. Nothing in the system
has a stroke. Separation is carried by fill contrast — a card is white on a grey page, a sunken
block is grey on white. This removes hundreds of hairlines and is cheaper to paint on a weak GPU
than a 1px border with a radius.

---

## Four product rules — non-negotiable, survive any visual change

1. **Freshness is honest and non-alarming.** Three pips plus a day count in words, always both.
   Never red, never amber — those hues are not in the token set at all. Opacity never carries
   meaning.
2. **Unknown reads as «Не записано»** — never as "no", never as an error state.
3. **A fostered animal never gets a map pin.** City-precision location renders as a place name in a
   filled block. No map is drawn, even at 1920 where there is room. A pin would claim precision the
   data does not have.
4. **The platform never touches money.** Donations are external links with the destination domain
   (`dobro.ua ↗`) visible before the tap. The blue is never used on the donate row.

A fifth, from the deck: the swipe is filtering, not judging. «Не зараз», never "nope". No stamps,
scores, streaks or celebration.

---

## Colour

### Light (default)
| Token | Hex | Use |
|---|---|---|
| page | `#ECECEA` | page background behind cards |
| surface | `#FFFFFF` | cards, rail, sheet, header |
| fill | `#F2F2F0` | sunken blocks, unselected chips, secondary buttons |
| fill-strong | `#DCDCD9` | resolved/closed cards, empty pips, image placeholder |
| ink | `#101112` | primary text **and** the primary action fill |
| ink-2 | `#45484B` | body and metadata |
| ink-3 | `#63676B` | captions, labels, tertiary |
| registry | `#1B3A6B` | state-registry confirmation, the fresh pip, focus ring |

### Contrast, measured
| Pairing | Ratio |
|---|---|
| ink `#101112` on surface | **18.7:1** |
| ink-2 `#45484B` on surface | **9.6:1** |
| registry `#1B3A6B` on surface | **11.3:1** |
| white on ink `#101112` | 18.7:1 |
| ink-3 `#63676B` on surface | **5.9:1** ⚠ under 7:1 |
| ink-3 `#63676B` on page `#ECECEA` | **5.4:1** ⚠ under 7:1 |
| ink-3 `#63676B` on fill `#F2F2F0` | **5.6:1** ⚠ under 7:1 |

Those three are the **only** pairings in the system below 7:1. All clear WCAG AA comfortably.
ink-3 is restricted to 13px+ captions and labels and never carries meaning on its own.

`#1B3A6B` is never used as a button fill and never appears in freshness except as the first pip —
otherwise it stops meaning "registry".

### Dark
| Token | Hex | Ratio |
|---|---|---|
| page | `#0E0F10` | |
| surface | `#17191B` | |
| fill | `#202325` | |
| fill-strong | `#2C3033` | |
| ink | `#F4F5F6` | 17.4:1 |
| ink-2 | `#B9BEC2` | 9.7:1 |
| ink-3 | `#8E9498` | 5.7:1 |
| registry | `#8FB4E6` | 8.6:1 |

---

## Typeface

**e-Ukraine** (Dmytro Rastvortsev, commissioned by the Ministry of Digital Transformation for Diia,
free to use, full Cyrillic and Latin). It carries civic credibility in Ukraine that no neutral grotesk
can buy, and it is the correct reference for a Дія-adjacent surface.

**Load exactly three files, self-hosted, woff2, ≈ 84 KB total:**

| Weight | Used for |
|---|---|
| Regular **400** | all body, metadata, captions |
| Medium **500** | titles, chip labels, button labels, uppercase labels |
| Bold **700** | display sizes, animal names, wordmark |

Subset to Cyrillic + Latin basic + punctuation. `font-display: swap`. **Do not load e-Ukraine Head** —
Bold covers every heading. **Never go below 400**: Light shimmers on cheap Android panels.
This replaces the four families the current build loads.

### Scale
| Role | Size / line-height | Weight | Tracking | Used for |
|---|---|---|---|---|
| display-l | 44 / 46 | 700 | −0.035em | detail page name |
| display-m | 34 / 38 | 700 | −0.03em | screen titles, deck card name, result count |
| display-s | 24 / 28 | 700 | −0.02em | gallery card name, sheet title |
| title | 19 / 24 | 500 | — | section headings ("Медичний стан") |
| body-l | 17 / 26 | 400 | — | the shelter's sentence, empty-state prose |
| body | 15 / 22 | 400 | — | metadata, buttons, chips, freshness label |
| caption | 13 / 18 | 400 | — | shelter line, attribution, helper text |
| label | 12 / 16 | 500 | 0.06em, uppercase, `ink-3` | filter group labels |

**Correction (V1 intake, `docs/design/intake-report.md` §C):** the type-scale
swatch this table was transcribed from renders the "label" role at `0.08em`
in `ink-2` (`#45484B`) — but every actual instance of a filter group label in
the mock (the rail and the sheet, `Opika Registry System.dc.html`, `МІСТО`/
`ВИД`/`РОЗМІР`/`ВІК`) renders at `0.06em` in `ink-3` (`#63676B`), with no
explicit `line-height` set. The applied instances win: they are what
actually renders on the two real screens this role is used on, not the
abstract legend. Row above corrected to match; build from `0.06em`/`ink-3`.

Mobile card name drops to 22 / 26 · 700 · −0.02em on the compact horizontal card.

### Ukrainian length
Ukrainian runs 10–15% longer than English. In priority order:
- Animal names truncate to one line with ellipsis.
- Shelter speech blocks reserve **min-height 88px** and clamp at 4 lines.
- Metadata rows wrap rather than shrink.
- **Nothing shrinks type to fit.** No auto-fit, no clamping.
- `text-wrap: pretty` on all multi-line prose.

Day counts come from `Intl.RelativeTimeFormat('uk')` — correct plurals for free. **No dates or
numbers live in the message JSON**; strings are templates, values interpolate at render.

---

## Geometry, density, elevation, motion

| | Value |
|---|---|
| **Radii** | `8` pips and small tags · `16` buttons, fields, inner blocks, photo inside a card · `24` cards, rail, sheet, modal · `999` chips |
| **Borders** | **None.** Not on cards, not on chips, not as dividers. Inside a card, separation is a 24px gap, not a line. |
| **Elevation** | **One step, two places only** — the deck's top card and the bottom sheet: `0 24px 48px -32px rgba(16,17,18,0.4)`. Nothing else casts a shadow. |
| **Spacing** | `4 · 8 · 12 · 16 · 24 · 32 · 48`. Every vertical distance is one of these seven, implemented as flex-column `gap` — never margins, never empty elements. |
| **Touch targets** | `48` minimum anywhere · `56` primary actions and pagination · `64` mobile header · `88` desktop header. (Raised from 44 — this is a civic-trust metric, not just an a11y floor.) |
| **Focus** | `outline: 3px solid #1B3A6B; outline-offset: 3px`. The one place blue escapes "registry", because a focus ring must be visibly not-black. Never removed. |
| **Hover** | Card fill `#FFFFFF → #F7F7F5`, 120ms. No lift, no shadow, and **no underline on the name** — in a monochrome layout that reads as a document hyperlink. |
| **Motion** | quick `120ms` · settle `220ms` · reveal `280ms`, all `cubic-bezier(0.3, 0, 0, 1)`. Short and dry; no springiness in the interface. The only spring is the deck's: stiffness `280`, damping `30`, no overshoot. |
| **prefers-reduced-motion** | Opacity only, `120ms`. The card fades; the stack does not move. |
| **Icons** | No library. **Seven** hand-drawn glyphs, 2px stroke at 24, round caps: `▾ ← → ↓ ✕ ✓ ↗`. In monochrome an icon is more conspicuous than in colour, so use one only where a word would be longer. `↗` appears only beside the donate domain. |
| **Photos** | 4:5, `object-fit: cover`, placeholder fill `#DCDCD9`. The neutral frame does nothing to the photograph's colour — that is the point. |

---

## The logo — «Поріг · Межа»

An abstract mark: an **arch that does not touch the ground, a separate threshold line below it, and
a dot between them** — someone mid-crossing. A threshold is an opening, not a house; the mark draws
the gap, not the building. No paw, no muzzle.

Drawn in a 96 grid:
```
arch      M22 70 V46 a26 26 0 0 1 52 0 v24     stroke 10, round caps
threshold M14 88 h68                            stroke 10, round caps
dot       circle cx=48 cy=79 r=6                filled
```

- **Colour: ink `#101112` only.** Never `#1B3A6B` — the blue must keep meaning "registry".
  On dark, `#F4F5F6`.
- **Header lockup:** mark 30px + wordmark 26/700/−0.03em desktop; mark 26px + wordmark 22 on mobile.
  Gap between mark and word = the dot's height. Align optically to the threshold line, not the box.
- **Clear space** = half the mark's height on all sides.
- At **16 and 24px the dot is dropped**, leaving arch-over-threshold — three elements merge into a
  blur at that size, and the silhouette still carries the idea. Favicon: white mark on an `#101112`
  rounded square.
- Never tilt it, never add a shadow or gradient, never fill the gap.

---

## The freshness marker

**Three pips, always all three, always in the same position**, immediately followed by
"оновлено N днів тому" in words. Filled pips count how far the last confirmation has travelled.

| State | Age | Pips (left → right) | Label |
|---|---|---|---|
| `fresh` | ≤ 7 days | 1 × `#1B3A6B`, 2 × `#DCDCD9` | Оновлено 3 дні тому |
| `aging` | 8–30 days | 2 × `#63676B`, 1 × `#DCDCD9` | Оновлено 19 днів тому |
| `stale` | 30+ days | 2 × `#63676B`, 3rd `#101112` | Оновлено 41 день тому |

Geometry: **10×10px**, `border-radius: 50%`, `gap: 6` between pips, `gap: 10` to the label.
Grown from 7px — at 1.5× density on a cheap Android panel 7px pips disappeared. The empty pip is a
**fill**, not a 1px ring: a hairline circle moirés on a weak GPU.

The blue on the first pip is deliberately the same blue as "registry" — both mean *someone confirmed
this*.

These three states map **1:1 to the `Freshness` discriminated union in `packages/domain`**. Do not
add a fourth bucket or re-derive the thresholds in the UI layer.

Constraints: the pips are never the only carrier — the day count in words always sits beside them,
and `aria-label` repeats the sentence while the pips are `aria-hidden`.

### The shelter's sentence
Below the marker, body-l 17/26, in «…»:

> «Ми оновлювали цю картку 25 червня. З того часу не заходили — напишіть, і ми скажемо, чи Ластівка ще з нами.»

Written **once by the shelter at verification, in their own words**, stored per shelter. Opika
substitutes only the date and the animal's name. The attribution line below reads
**«Слова притулку · дата автоматична»** so the quote can never be mistaken for a message sent today.
Do not write, paraphrase or generate these sentences. A shelter with none on file falls back to the
marker plus day count alone.

The sentence does **not** appear on gallery cards — pips plus the day count do. It needs 3–4 lines
to read as speech rather than a status string, so it lives on the detail page and the deck card,
where there is room for it and for the attribution.

---

## The gallery card

One `<a>` per animal, **no nested buttons**, so Tab stops once per animal.
Surface white, radius 24, padding 12, inner `gap: 16`; text block `gap: 12`, padding `0 8 8`.

- Photo 4:5, radius 16.
- Name — display-s 24/28/700/−0.02em, one line, ellipsis.
- Meta — body 15/22 `#45484B`: age · size · housing + city.
- Freshness — pips + "оновлено N днів тому" at body 15, `gap: 10`.
- Shelter — caption 13/18 `#63676B`, "· перевірений" (no colour; verification is stated, not tinted).

**Three variants:**
1. **Standard** — as above.
2. **Reserved** — an `#FFFFFF` pill, min-height 32, padding `0 14`, radius 999, 13/500, reading
   «Уже домовляються», bottom-left **inside the photo** at 12px inset. White because shelter photos
   are unpredictable — it reads on dark and on blown-out alike. The animal stays in the deck; the
   primary button relabels to «Стати другим у черзі».
3. **Resolved** — card fill becomes `#DCDCD9`, photo placeholder darkens to its own hatch —
   `repeating-linear-gradient(135deg, #CFCFCB 0 10px, #E0E0DD 10px 20px)`, distinct from the
   standard placeholder's `#DCDCD9 0 10px, #EFEFED 10px 20px` (exact value only in the mock,
   `Opika Registry System.dc.html`; added here per V1 intake, `intake-report.md` §C) — and the
   pips are replaced by the sentence «Притулок каже: Бім уже вдома.» **Different fill and different
   text — never dimming.**

---

## Screens

Everything below is layout that already exists and is verified. Only the visual values change.

### Gallery — the primary surface
| Range | Layout |
|---|---|
| 0–599 | 1 column, vertical card · filters in a sheet · sticky bottom bar «Фільтри · N / Гортати» |
| 600–1023 | 2 columns, **horizontal** card (96–120px photo left, text right) · filters in a sheet |
| 1024–1439 | 3 columns · 280px rail always open · content **960** |
| 1440+ | 4 columns · 280px rail · content **max 1320** — at 1920 the margins grow, the content does not |

Header: surface white, no bottom border, min-height 88 desktop / 64 mobile. Left to right: mark +
wordmark, city chip (999, fill, 48), spacer, «Мої запити · N», «UA / EN», «Гортати по одній»
(fill `#F2F2F0`, radius 16, 48). Page padding `40 32 56` desktop, `20 16` mobile; grid gap 24
desktop / 16 mobile; rail↔grid gap 32.

Above the grid: «34 тварини поруч» at display-m left, sort control right (48, radius 16) —
**Спочатку найсвіжіші** (default) or **Найдовше чекають**. Both show everyone.

**Rail** (≥1024): white, radius 24, padding 24, `gap: 28`. Title 19/700 with «Скинути» underlined
right, then four label + chip-row groups (МІСТО / ВИД / РОЗМІР / ВІК). Chips: 48 min-height,
padding `0 20`, radius 999; selected = `#101112` fill + white 500; unselected = `#F2F2F0` fill +
ink 400. **No «Показати» button** — changes apply immediately and write to the URL. Closes with a
`#F2F2F0` block: "Підходить 34 тварини у 7 притулках." and "Фільтра свіжості немає. Тварина, про
яку давно не писали, все одно чекає."

**Sheet** (<1024): the same groups in a bottom sheet, radius `24 24 0 0`, padding `16 20 24`,
`gap: 28`, the one shadow. 48×5 grabber pill `#DCDCD9` centred, title 24/700, and a footer pair —
«Скинути» (fill) + «Показати 34» (`#101112`, `flex: 1`), both 56.

**Pagination — not infinite scroll.** 24 per page, numbered, prev/next, all 56 tall, radius 16;
active page `#101112` filled. Chosen because this is the indexed, shareable surface: every page has
an address (`?stor=2`), the back button works, and it degrades without JS. **«з N» renders only when
the number list is truncated with an ellipsis** (1 2 3 … 9, з 12) — while every number is on screen
the counter just restates what you can count.

### Gallery states
- **Loading** — skeleton cards, count equal to the page size so height never jumps. Photo block
  `#DCDCD9`, text bars `#F2F2F0`, radius 8. **No shimmer, no pulse** — an opacity pulse would read
  as a data state. Grid gets `aria-busy="true"`; a polite live region says "Завантажуємо тварин".
- **No match** — white card, radius 24, padding `48 32`, `gap: 32`:
  «Під ці фільтри зараз нікого немає.» (display-m) /
  «У Броварах 7 притулків, і сьогодні серед середніх собак вільних немає. Це не помилка пошуку.»
  (body-l) / two 56px actions that **name their yield** — «Прибрати «розмір» (+11 тварин)» (`#101112`)
  and «Додати сусідні міста (+34)» (fill). No suggestion without a number.
- **Error, whole list** — «Список не відкрився.» / «Це не ваша помилка і не помилка притулку.
  Фільтри збережені — адреса сторінки не змінилася.» / «Спробувати ще раз».
- **Error, next page** — «Сторінка 2 не прийшла.» / «Ті, кого вже видно, залишаються на місці. Ми
  нічого не приховали.» / «Завантажити сторінку 2». A grid error never removes visible cards, and is
  never red.
- **Exhausted** belongs to the **deck**, not the gallery — the gallery has pages, not an end.

### Detail (04)
Content max 1200, padding `40 32 56`, two columns, `gap: 40`.
- Left 560, **sticky**: main photo 4:5 radius 24, then three 88px thumbnails radius 16, active one
  `outline: 3px #101112, offset 3`.
- Right, scrolling: name display-l; meta; **freshness block** (`#F2F2F0`, radius 16, padding 16 —
  pips + label, sentence at 17/26, attribution at 13); then the action pair; then a nested row —
  **Медичний стан** fluid, **Де живе** 260 fixed; then the shelter row and donate link.
- **No sticky footer on desktop**: the action pair sits under the freshness block so the shelter's
  words are read before the button. «Не зараз» padding-sized, «Написати притулку» `flex: 1`.
- 1024–1439: same grid, photo 480, «Де живе» moves below «Медичний стан».
- Mobile: single column, sticky footer returns — «Не зараз» `flex: 1` + «Написати притулку» `flex: 2`.

**Медичний стан** rows carry a 4×16 bar plus a written source:
`#1B3A6B` = state registry · `#63676B` = the shelter's word · `#DCDCD9` = not recorded.
The bar is never the only carrier — the source is always spelled out, and «Не записано» is an empty
field, not a "no". Documents render as 28px fill pills («Чип є», «Сказ є») and the **whole block is
omitted** when there are none — never "немає документів".

**Де живе** — two treatments, never mixed:
- Shelter with premises → an **approximate circle only**: 76px, `rgba(27,58,107,0.16)` fill, no
  stroke, 8px `#1B3A6B` centre dot, deliberately offset ~1 km at the shelters' request. The circle
  *is* the answer: "somewhere here."
- **Fostered → no map at all.** A `#DCDCD9` block with the city name at 15/500 and the explanation
  that coordinates are not known, so no pin is drawn.

### Contact reveal (05)
Desktop: a **640-wide modal** over the detail page, white, radius 24, padding 24, `gap: 24`, the one
shadow, backdrop `#B9B9B5`. Title block left with a 48px ✕ right; contacts (`#F2F2F0`, radius 16) and
the three-things card side by side, `gap: 16`; then «Написати в Telegram» (`#101112`, `flex: 1`) +
«Повернутися до галереї» (text, underlined).

Modal, not a page, so the animal's URL stays in the address bar and stays shareable. Focus moves to
the heading and is trapped, Esc closes, the page behind does not scroll. Below 768 it is a full
screen with the two cards stacked.

The reassurance is load-bearing and must not be cut: «Притулок не знає про цей запит, поки ви не
напишете самі. Нічого не сталося автоматично.» The reveal is a lookup, not a submission.

### The other screens
- **01 First run** — the first visit to the gallery, not a separate screen: promise and city choice
  in a 760 centred band above the grid, gone once a city is chosen. Nothing blocks browsing.
- **02 Deck** — see below.
- **03 Filters** — the rail from 1024 up, the sheet below.
- **06 My reveals** — single 720 centred column. «Зберігається лише на цьому пристрої. Ми не знаємо,
  хто ви.» sits directly under the title — it matters more on a shared laptop.
- **07 Exhausted** — a 560 centred card in the deck's place; its buttons lead back to the gallery.
- **08 Errors** — one card in the place of the content that failed, max 560, never full-screen; the
  header and rail stay usable. No error state is red; every one names whose fault it isn't.

---

## The deck

Card **358×720** inside a 390 viewport: photo 400px tall, radius 16; below it name display-m, meta,
and the freshness block (`#F2F2F0`, radius 16, padding 16, min-height 88) with the shortened
sentence. Stack: three layers, **no scaling** — back inset 12/top 10, mid inset 6/top 5, both
220px tall with radius 24; top card `inset: 0` with the one shadow.

Buttons below, `gap: 8`, all 56, radius 16: «Не зараз» (`flex: 1`, white) · «↓» (56 wide, white) ·
«Написати» (`flex: 1`, `#101112`).

**Gesture:**
- Drag written **directly to the node's `transform`, not through React state**:
  `translate3d(x, 0, 0) rotate(x · 0.03deg)`, capped at **6°**. `touch-action: pan-y`,
  `setPointerCapture`, `will-change: transform`.
- Commit at **88px (24% of width) OR velocity 0.45 px/ms**, whichever first.
- Exit 280ms; return is the spring 280/30, no overshoot.
- Prefetch the next page when **5 cards remain**.
- During drag exactly one affordance appears: the word «Не зараз» left or «Запитати» right, opacity
  0→1 over the first 40px. **No stamps, no badges, no scores, no haptics.**
- Every gesture has a button. Swipe is an accelerator, never the only path.

---

## Gallery ↔ deck
- **Entry**: «Гортати по одній» in the desktop header / the sticky bar on mobile. The deck inherits
  the current filters and sort — exactly those animals, in that order.
- **URLs**: `/tvaryny?misto=brovary&stor=1` is the gallery and is indexed.
  `/tvaryny/gortaty` is the deck and is `noindex` — a viewing state, not a page.
- **Exit**: «До списку» in the deck header, or Esc. The gallery reopens on the same page and scrolls
  to the animal you stopped on, which receives the focus ring.
- **«Не зараз» hides an animal for the rest of the deck session but NOT in the gallery** — the
  gallery is the full record, and a mood filter must not thin it.
- **Default is the gallery at every width, phone included.** The deck is never the front door: it
  isn't indexable, and a shared link must always open the list.
- **Memory**: last mode in `sessionStorage`, not permanently.

---

## Keyboard and accessibility
| Key | Behaviour |
|---|---|
| Tab | header → rail → sort → cards in reading order → pagination |
| ← ↑ → ↓ | 2D movement across the grid while focus is inside it; edges do not wrap |
| Home / End | first / last card on the page |
| Enter | open the animal · Backspace returns to the grid at the same card |
| Esc | close the sheet, the contact modal, or leave the deck |
| In the deck | ← не зараз · → написати · ↓ далі · Esc до списку |

- 48px minimum target everywhere; 56 for primary actions.
- Nothing appears on hover — pips, days, shelter and the reserved badge are always rendered; hover
  does not exist on a phone.
- Screen readers get name, age, city, then "оновлено 41 день тому" via `aria-label`; pips are
  `aria-hidden`. Medical sources are labelled, not merely coloured.
- Resolved and closed states use a different fill and different text — never dimming.
- `prefers-reduced-motion`: opacity only, 120ms.

---

## Deliberately absent
- **No map with pins.** The grid never becomes a map; a fostered animal gets no point even at 1920.
- **No freshness filter**, and no "verified first" sort. Sorting is Найсвіжіші or Найдовше чекають —
  both show everyone.
- **No attention counters** — no views, no "5 people are looking", no urgency.
- **No phantom tiles.** Three results render three cards; the last row is not padded.
- **No infinite scroll** as the only path.
- **No red and no amber anywhere in the token set.**

---

## Assets
No production assets here. Image areas are
`repeating-linear-gradient(135deg, #DCDCD9 0 10px, #EFEFED 10px 20px)`. Real 4:5 shelter photography
cropped `cover` is needed; shelter avatars are monogram circles from initials, so no logo files are
required. Fonts: e-Ukraine 400/500/700, self-hosted woff2.

Data per animal: name, species, size, age band, breed note, photos[], medical fields each with a
source enum (`registry` | `shelter` | `unrecorded`), housing type (`shelter` | `fostered`), city,
optional offset coordinates, shelter ref, `lastConfirmedAt`, reserved flag, documents[].
Per shelter: name, monogram, verified-at, years on Opika, contacts, donate URL, and the freshness
sentence template.

State: `city` and `filters` persisted and URL-bound; `deck` array + cursor with prefetch at 5;
`dragState` held outside React state; `reveals` **device-local only** (no account, no server copy);
`locale` `uk` default, drives `Intl.RelativeTimeFormat`.

## Files
- `Opika Registry System.dc.html` — the design reference. Open in a browser; scroll horizontally.
- `support.js` — prototyping runtime, needed only to open the HTML. Not part of the design.
