# Handoff: Opika — Keeper's Voice (direction 1b)

## Overview
Opika is a mobile animal-adoption app for the Kyiv region (Київщина). Users browse
animals from manually verified shelters in a responsive gallery — the primary, indexed surface —
or enter a one-at-a-time swipe deck from it and, when interested, reveal the shelter's contact
details and write to the shelter themselves. Opika never brokers the conversation, takes no
money, and requires no account.

The design problem this direction answers: the underlying data is **honestly uncertain**.
Shelters update cards irregularly, some fields are simply not recorded, animals may already be
home. A swipe deck normally implies confidence. "Keeper's Voice" resolves this by having the
**shelter speak in first person** about how current its own information is, paired with a
non-colour freshness marker so staleness stays scannable without ever reading as an alarm.

Two rules run through everything:
1. An unknown field is rendered as **«Не записано» / "Not recorded"** — never as "no", never as an error.
2. Staleness is **never signalled with red or amber**, and never by opacity. Colour hue appears
   only for the single "verified by the state registry" case (leaf green).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended
look and behaviour, not production code to copy directly. `Opika - Keeper's Voice.dc.html` is a
flat canvas: the gallery work sits in the **upper section (badge 2A)** — gallery at 1440/768/360,
its loading, no-match and error states, the desktop detail and the contact-reveal modal, and the
rule cards — and the original eight phone screens plus the system documentation cards sit below it; it is
not an app shell and has no routing or interaction wired up.

The task is to **recreate these designs in the target codebase's own environment** (React Native,
React web, SwiftUI, native Android — whatever the repository at `D:/Startup/Opika` uses), using
its established components, styling approach, and i18n layer. If no UI environment exists yet,
choose the framework appropriate for the project and implement the designs there. Do not ship the
HTML.

The HTML uses inline styles only, and a wrapping `<x-dc>` element from the prototyping runtime —
ignore both; take the values, not the markup.

## Fidelity
**High-fidelity.** Colours, type scale, spacing, radii, motion timings, contrast ratios and all
copy are final and specified below to exact values. Recreate the UI pixel-accurately using the
codebase's existing libraries. The only placeholder content is photography: every image area is a
diagonal hatch pattern standing in for a real shelter photo (4:5, `object-fit: cover`).

## Design Tokens

### Colour — light (default)
| Token | Hex | Use |
|---|---|---|
| paper | `#FBF7F0` | card and screen surface |
| paper-alt | `#F4ECDF` | sunken blocks, secondary screen background |
| sunken-deep | `#EFE6D6` | resolved/closed rows, image hatch base |
| line | `#E8DECB` | hairline dividers |
| line-strong | `#E0D4BF` | card borders, chip borders |
| line-heavy | `#C9BCA2` | empty freshness pip border, secondary button border |
| ink | `#2A2118` | primary text (14.8:1 on paper) |
| ink-2 | `#4A3D2C` | body text |
| ink-3 | `#6E5C44` | secondary/meta text (5.6:1 on paper) |
| ink-4 | `#85735A` | filled freshness pip (mid) |
| leaf | `#4F6B3A` | primary action, verified-only accent (5.4:1; white on it 4.9:1) |
| leaf-press | `#3E5529` / `#445B32` | primary button hover/press |
| avatar-bg | `#E3D6C0` | shelter monogram circle, reserved badge |

`#85735A` is used **only** as a filled pip. Do not use it for text — secondary text is `#6E5C44`
(this was raised specifically to clear 4.5:1).

### Colour — dark ("lamplight, not black")
| Token | Hex |
|---|---|
| paper | `#1B1712` |
| sunken | `#241F18` |
| line | `#3A3227` |
| ink-3 | `#A2937D` |
| ink | `#F2EDE3` |
| leaf | `#8FA96F` (lightened to hold 4.5:1 on `#1B1712`) |

Dark mode is specified at token level only; no dark screens were mocked.

### Typography
Three families, from Google Fonts:
- **Literata** (opsz 7..72, weights 400/500/600) — serif. Restricted to: animal names, screen
  titles, shelter speech, empty states. Nowhere else.
- **Commissioner** (300/400/500/600) — sans. All UI: headings, body, meta, buttons, chips.
  Chosen for full Cyrillic coverage.
- **IBM Plex Mono** (400/500) — quantities and labels only (day counts, IDs, section eyebrows).

| Role | Spec |
|---|---|
| display | Literata 500 · 30/34.5 (1.15) · `-0.01em` · names, screen titles |
| speech | Literata 400 · 19/28 (1.5) · shelter words, empty states |
| speech-sm | Literata 400 · 13/19.5 or 15/23 · shelter quote inside cards |
| heading | Commissioner 500 · 16/22 (1.4) |
| body | Commissioner 400 · 14/21.7 (1.55) |
| body-sm | Commissioner 400 · 13/19.5 (1.5) |
| meta | Commissioner 400 · 12/16.8 (1.4) |
| micro | Commissioner 400 · 11/14.3 (1.3) |
| measure | IBM Plex Mono 500 · 11/11 · `letter-spacing: 0.12em` · uppercase · quantities only |
| eyebrow | IBM Plex Mono 500 · 11/11 · `0.12em` · uppercase · section labels |

Card name on feed card is Literata 500 · 26/30.

**Ukrainian text runs 10–15% longer than English.** Rules, in priority order:
- Names truncate to one line with ellipsis (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`).
- Shelter speech blocks reserve a **minimum height of 84px** (3 lines) and clamp at 4 lines.
- Metadata rows wrap rather than shrink.
- **Nothing shrinks type to fit.** No auto-fit, no font-size clamping.
- `text-wrap: pretty` on all multi-line prose.

### Spacing — exactly five steps
`4` label→value · `8` rows within a group · `16` group→group and card padding ·
`24` section→section · `40` screen top and above the primary action.

Every vertical distance in the design is one of these five. Implement all of them as
flex-column `gap`, never margins and never empty paragraphs. (The only margins in the HTML are
`margin-top: 8px` on the error-card buttons — treat those as `gap: 8` too.)

### Radius
`4` pips and small tags · `8` rows, thumbnails · `12` photos, buttons, controls, inner blocks ·
`20` cards and sheets · `32` phone frame (prototype only) · `999` chips.

### Elevation — two steps only
- `sm`: `0 1px 0 #F1EADE` — the deck's lower cards.
- `lg`: `0 18px 40px -24px rgba(60,44,24,0.45)` — the deck's top card and bottom sheets.

Nothing else has a shadow.

### Motion
- quick `160ms`, settle `300ms`, reveal `340ms` — all `cubic-bezier(0.16, 1, 0.3, 1)`.
- Spring-back: stiffness `260`, damping `28`, **no overshoot past target**.
- `prefers-reduced-motion`: opacity only, `120ms`. Card fades out; the stack does not move.

## The Freshness Marker
The core component. **Three pips, always all three, always in the same position**, immediately
followed by the words "оновлено N днів тому". Filled pips count how far the last confirmation
has travelled.

| State | Age | Pips (filled → empty) | Label |
|---|---|---|---|
| `fresh` | ≤ 7 days | 1 filled `#4F6B3A`, 2 empty (1px `#C9BCA2` border) | Оновлено 3 дні тому |
| `aging` | 8–30 days | 2 filled `#85735A`, 1 empty | Оновлено 19 днів тому |
| `stale` | 30+ days | 2 filled `#85735A` + 3rd filled `#2A2118` | Оновлено 41 день тому |

Pip geometry: `7×7px`, `border-radius: 50%`, `gap: 4px` between pips, `gap: 8px` to the label.
In the compact list variant (screen 06) pips are `6×6` with `gap: 3`.

These three states map **1:1 to the `Freshness` discriminated union in `packages/domain`** — do not
introduce a fourth bucket or reinterpret the thresholds in the UI layer.

Constraints:
- The pips are **never the only carrier of meaning**. The day count in words always sits beside
  them, and `aria-label` repeats the same sentence.
- Day counts come from `Intl.RelativeTimeFormat('uk')`, which gives correct Ukrainian plurals
  ("1 день / 2 дні / 5 днів / 21 день / 22 дні") with no hand-written rules.
- **No dates or numbers are stored in the string JSON.** Strings are templates; values are
  interpolated at render.

## The Shelter's Sentence
Below the marker, in Literata, in quotation marks («…» in Ukrainian, curly quotes in English):

> «Ми оновлювали цю картку 25 червня. З того часу не заходили — напишіть, і ми скажемо, чи Ластівка ще з нами.»

Authoring model, decided deliberately:
- The sentence is **written once by the shelter during verification, in their own words**, and
  stored per shelter (not per animal).
- Opika substitutes **only the date and the animal's name**. Nothing else is generated.
- The attribution line underneath reads **«Слова притулку · дата автоматична»** so a reader can
  never mistake the quote for a message sent today. This line is required wherever the full
  sentence appears with a templated date.

Do not write these sentences on the shelter's behalf, and do not paraphrase or auto-generate them.
A shelter with no sentence on file falls back to the marker plus day count alone.

## Screens

### 01 · Перший запуск (First run)
390×844. `#FBF7F0`, padding `40 24 24`.
- Wordmark "Opika" — display.
- Promise, speech 19/28: "Тварини з перевірених притулків Київщини. Гортайте, щоб подивитися, кого шукає дім."
- Disclaimer, body `#6E5C44`: "Без реєстрації. Ми не беремо і не переказуємо грошей. «Не зараз» — це просто фільтр, а не оцінка тварини."
- `gap: 40` to a "Ваше місто" heading and a wrapping chip row (`gap: 8`): Бровари (selected),
  Київ, Ірпінь, Буча, Вишгород, Бориспіль, Уся Київщина. Chips `min-height: 44`, padding `0 16`,
  radius 999. Selected = `#4F6B3A` fill + `#FBF7F0` text, weight 500. Unselected = 1px `#E0D4BF`
  border, `#4A3D2C` text, weight 400.
- Footer, pinned: primary button `min-height: 52`, radius 12, leaf, "Дивитися тварин";
  below it a language toggle (Українська / English), meta, centred, `gap: 16`.

### 02 · Стрічка (Feed / deck)
390×844. Screen background `#F4ECDF`, padding `16`.
- Header row, `min-height: 44`: city name (heading) left; "Фільтри · 2" pill right — 1px
  `#E0D4BF`, `#FBF7F0` fill, `min-height: 44`, padding `0 14`, radius 999.
- The stack, `flex: 1`, `margin-top: 16`. Three layers, **no scaling**:
  - back: `inset` left/right `12`, `top: 10`, height 200, `#F7F0E4`, 1px `#E8DECB`, radius 20.
  - mid: left/right `6`, `top: 5`, height 200, `#F9F3E9`, 1px `#E8DECB`, radius 20.
  - top: `inset: 0`, `#FBF7F0`, radius 20, padding 12, shadow `lg`.
- Top card contents: photo area height 396, radius 12; then a `gap: 16` column with padding
  `16 4 4`:
  - Name (Literata 500 26/30, ellipsis) + meta "2 роки · середня · живе у волонтерки, м. Бровари".
  - **Freshness block**: `#F4ECDF`, radius 12, padding 12, `gap: 8`, `min-height: 84` — pips +
    label, then the shelter's sentence (Literata 400 13/19.5, `#4A3D2C`). On the card the
    sentence is the shortened variant ("Ми оновлювали цю картку 25 червня. Напишіть — скажемо,
    чи Ластівка ще з нами."); the detail screen carries the full one plus attribution.
  - Shelter line: 20px monogram circle (`#E3D6C0`, 9px/500 initials `#6E5C44`), shelter name,
    then "· перевірений" in `#4F6B3A`.
- Action row, `gap: 8`, `margin-top: 16`, all `min-height: 52`, radius 12:
  "Не зараз" (`flex: 1`, outlined) · "Далі" (fixed `52` wide, outlined) · "Написати"
  (`flex: 1`, leaf fill).

### 03 · Фільтри (Filters)
Bottom sheet over a dimmed `#EDE3D2` backdrop. Sheet `#FBF7F0`, radius `20 20 0 0`,
padding `16 24 24`, `gap: 24`.
- Grabber `40×4`, radius 999, `#E0D4BF`, centred; "Фільтри" heading left-aligned below.
- Four groups, each an eyebrow + chip row (`gap: 8` inside group):
  МІСТО (Бровари ✓ / Київ / Уся Київщина) · ВИД (Собаки ✓ / Коти) ·
  РОЗМІР (Малий / Середній ✓ / Великий) · ВІК (Малюк / Молодий / Дорослий / Літній).
- Result count, meta `#6E5C44`: "Підходить 12 тварин. Притулків у цьому місті — 3."
  Always state the shelter count — it explains a short list.
- "Скинути" (outlined, padding `0 20`) + "Показати 12" (`flex: 1`, leaf), both `min-height: 52`.

### 04 · Деталі (Detail)
390 wide, `min-height: 844` — **this screen scrolls**; it must be allowed to grow past the
viewport. Body padding 16, `gap: 24`.
- Photo header height 300, with "1 / 3" dot indicator bottom-right (`6×6`, active `#2A2118`,
  inactive `#C9BCA2`).
- Name (display) + meta: "Метис · 2 роки · середня · стерилізація не записана".
- **Freshness block** — `#F4ECDF`, radius 12, padding 12, `gap: 8`: pips + "Оновлено 41 день тому";
  full shelter sentence at Literata 400 15/23 `#2A2118`; attribution "Слова притулку · дата
  автоматична" at micro `#6E5C44`.
- **Медичний стан** — label/value rows, `justify-content: space-between`, body-sm:
  | Сказ | Реєстр тварин | value `#4F6B3A` weight 500 |
  | Комплексне щеплення | Слова притулку | value `#4A3D2C` |
  | Стерилізація | Не записано | value `#6E5C44` |
- **Де живе** — `#F4ECDF` block: "м. Бровари · у домі волонтерки", then
  "Карти тут немає: ми не знаємо точної адреси і не вигадуємо її. Місце зустрічі узгодите з
  притулком." **No map is rendered for fostered animals.**
- Shelter card: 36px monogram, name, "Перевірений вручну · 2 роки на Opika" (`#445B32`).
- Donate link: outlined row, `min-height: 44`, radius 12, label "Підтримати притулок" with
  "dobro.ua ↗" in mono `#6E5C44` right. Opens externally — Opika handles no money.
- Sticky footer: 1px `#E8DECB` top border, padding 16, `gap: 8`:
  "Не зараз" (`flex: 1`, outlined) + "Написати притулку" (`flex: 2`, leaf).

### 05 · Контакти відкрито (Contact reveal)
`#F4ECDF`, padding `40 24 24`, `gap: 24`.
- "Ви запитали про Ластівку." (speech, `#6E5C44`) → "Ось як зв'язатися з притулком." (display
  30/36) → "Притулок не знає про цей запит, поки ви не напишете самі. Нічого не сталося
  автоматично." (body `#4A3D2C`). This reassurance is load-bearing: the reveal is a lookup, not
  a submission.
- Contact card `#FBF7F0`, radius 20, padding 16: shelter name, then three rows at
  `min-height: 44`, radius 12, `#F4ECDF` — phone, Telegram handle, and a non-tappable
  "м. Бровари · місце узгодите в листуванні". Footnote: "Контакти збережено такими, якими вони
  є сьогодні · 5 серпня 2026".
- Reflection card, outlined, radius 20: "Перед тим як писати — три речі, про які варто подумати
  спокійно:" then three body-sm lines — "Це 10–15 років разом, а не вихідні." /
  "Корм, ветеринар, перевезення — щомісячні витрати." / "Чи згодні всі, хто живе з вами."
- Footer: "Написати в Telegram" (leaf, 52) + "Повернутися до стрічки" (text button, 44).

### 06 · Мої запити (My reveals)
`#FBF7F0`, padding `40 16 16`. Title (display) + "Зберігається лише на цьому пристрої. Ми не
знаємо, хто ви." List rows: 56px thumbnail (radius 8), name (Literata 500 15/18), shelter +
request date (micro), then compact pips + "оновлено N днів тому".
Third row is the **resolved** state — background `#EFE6D6` (not opacity), pips replaced by
"Притулок каже: Бім уже вдома." **Opacity is never a carrier of meaning.**

### 07 · Ви подивилися всіх (Exhausted)
Centred, `gap: 24`. Display: "Це всі, хто зараз підходить." Speech: "Ви подивилися 12 тварин у
Броварах. Притулків тут небагато, тому список короткий — це нормально." Body `#6E5C44`: "Нові
тварини з'являються, коли притулки оновлюють картки. Зазвичай раз на кілька тижнів."
Three stacked 52px buttons: "Додати сусідні міста (+34)" (leaf) · "Змінити фільтри" (outlined) ·
"Переглянути ще раз спокійно" (outlined). Footnote pinned bottom: "Якщо ви знаєте притулок на
Київщині, якого тут немає — напишіть нам, і ми з ним поговоримо."

### 08 · Помилки (Error states)
Four cards, `#FBF7F0` on `#F4ECDF`, radius 20, padding 16, `gap: 8`; each is eyebrow +
Literata 400 17/24.65 headline + body-sm explanation + a 44px action.
- БЕЗ ЗВ'ЯЗКУ — "Зараз немає інтернету." / cached cards still readable, contacts unlock on
  reconnect / "Спробувати ще раз".
- НЕ ЗАВАНТАЖИЛОСЯ — "Щось не спрацювало на нашому боці." / "Це не ваша помилка і не помилка
  притулку." / "Оновити".
- СЕСІЯ ЗАВЕРШИЛАСЯ — "Ми почали стрічку заново." / reveals and filters preserved / "До стрічки" (leaf).
- ФОТО НЕ ВІДКРИЛОСЯ — a 96px `#F4ECDF` placeholder reading "Фото немає — притулок ще не
  надіслав". No retry, no broken-image icon.

No error state uses red. Every one names whose fault it isn't.

## Location — two treatments, never mixed
- **Shelter with premises** → map with an **approximate circle only**: 76px circle,
  `rgba(79,107,58,0.16)` fill, 1px `#4F6B3A` border, 8px `#3E5529` centre dot. The point is
  deliberately offset by roughly a kilometre at the shelters' request. The circle *is* the answer:
  "somewhere here."
- **Fostered animal** → **no map at all**. A `#EFE6D6` block with the city name in Literata 500
  15px, and the explanation that coordinates aren't known so no pin is drawn — a pin would lie
  about precision.

## Source of medical data
Each medical row carries a `4×16px` bar plus a written source:
leaf `#4F6B3A` = state registry · `#A2917A` = shelter's word · `#E0D4BF` = not recorded.
The bar is never the only carrier — the source is always spelled out. Green appears only where
the state confirmed it. "Не записано" is an empty field, not a "no".

## Reserved animals
A reserved animal **stays in the deck** with a badge: `#E3D6C0` pill, `min-height: 28`,
padding `0 10`, Commissioner 500 11px `#3D3226`, "Уже домовляються". The primary button relabels
to "Стати другим у черзі". Arrangements fall through, and the user is already there when they do.

## Documents
Show only documents that actually exist, as outlined 28px pills ("Чип є", "Сказ є"). If there are
none, **the whole block is omitted** — never render "немає документів".

## Interactions & Behaviour

### The deck gesture
- Card `358×720` inside a 390 viewport: photo 4:5, 168px of text beneath.
- Drag is written **directly to the node's `transform`, not through React state**:
  `translate3d(x, 0, 0) rotate(x · 0.03deg)`, capped at **6°**.
  `touch-action: pan-y`, `setPointerCapture` on the pointer.
- Commit threshold: **88px (24% of width) OR velocity 0.45 px/ms**, whichever first.
- Exit `300ms`; return is the spring `260/28` with no overshoot.
- The next page prefetches when **5 cards remain** in the stack.
- During drag, exactly one affordance appears: the word "Не зараз" on the left or "Запитати" on
  the right, opacity 0→1 over the first 40px. **No stamps, no badges, no scores, no haptics.**

### Navigation
01 → 02 (city chosen) · 02 header pill → 03 · 03 "Показати 12" → 02 · card tap → 04 ·
04/02 primary → 05 · 05 "Повернутися до стрічки" → 02 · deck exhausted → 07 · 06 reachable
from the feed. Left swipe / "Не зараз" advances without recording a judgement.

## State Management
- `city` — chosen on 01, editable in 03. Persisted.
- `filters` — { city, species, size[], age[] }. Persisted. Drives the "Підходить N тварин" count,
  which needs a live count endpoint (plus the shelter count for that city).
- `deck` — array of animal cards + cursor; prefetch at 5 remaining.
- `dragState` — transient, held outside React state (see gesture spec).
- `reveals` — **device-local only** (`AsyncStorage`/`localStorage`, no account, no server copy).
  Each entry: animal, shelter, requested-at date, last-known freshness, and an optional resolved
  flag ("уже вдома"). Screen 06 renders from this and says so in copy.
- `locale` — `uk` default, `en` available. Drives `Intl.RelativeTimeFormat`.

Data requirements per animal: name, species, size, age band, breed note, photos[], medical
fields each with a source enum (`registry` | `shelter` | `unrecorded`), housing type
(`shelter` | `fostered`), city, optional offset coordinates, shelter ref, `lastConfirmedAt`,
reserved flag, documents[].
Per shelter: name, monogram, verified-at, years on Opika, contacts, donate URL, and the
**freshness sentence template**.

## Accessibility
- Every gesture has a button. "Не зараз" / "Далі" / "Написати" are 52px tall; **44px is the
  minimum touch target anywhere in the app**. Swipe is an accelerator, never the only path.
- Contrast: primary `#2A2118` on `#FBF7F0` = 14.8:1; secondary `#6E5C44` = 5.6:1; leaf
  `#4F6B3A` = 5.4:1; white on leaf = 4.9:1. **Nothing below 4.5:1, including 11px labels.**
- Freshness pips always accompanied by the words, and `aria-label` repeats the sentence.
  Same for medical sources: labelled, not merely coloured.
- Resolved/closed states use a different background and different text — never dimming.
- `prefers-reduced-motion`: card leaves by opacity in 120ms; the stack does not move.

## Assets
No production assets in this bundle. All image areas are placeholders:
`repeating-linear-gradient(135deg, #EFE6D6 0 10px, #F6EFE3 10px 20px)` (8/16px in thumbnails).
Real 4:5 shelter photography, cropped `cover` with a safe-area crop, is needed. Shelter avatars
are monogram circles from initials — no logo files required.
Fonts: Literata, Commissioner, IBM Plex Mono — all Google Fonts, all with full Cyrillic coverage.
Use the codebase's existing font-loading mechanism.

## Breakpoints & Surfaces

The system was originally phone-only. The **gallery is now the primary surface** — it is what
search engines index, what gets pasted into Telegram groups, and what a grant reviewer or shelter
director opens on a laptop. The swipe deck is a **mode entered from the gallery**, not the front
door.

| Range | Gallery layout |
|---|---|
| 0–599 | 1 column, vertical card · filters in the existing sheet (03) · sticky bottom bar "Фільтри / Гортати" |
| 600–1023 | 2 columns, **horizontal** card (120px photo left, text right) · filters in the sheet · both buttons in the header |
| 1024–1439 | 3 columns · 280px filter rail always open · content 960 |
| 1440+ | 4 columns · 280px rail · content **max 1320**, does not stretch further |

**The gallery is the default at every width, phone included.** A 5-column layout is deliberately
skipped: below ~210px a card can't hold "оновлено N днів тому" on one line, and that line does not
wrap.

Shell: header `#FBF7F0` with a 1px `#E8DECB` bottom border, `min-height: 68` desktop / `64`
tablet / `56` phone; page background `#F4ECDF`; grid gap `24` desktop, `16` tablet/phone;
rail↔grid gap `32`; page padding `40 60 56` desktop, `24` tablet, `16` phone.

## The Gallery

### Card
One `<a>` per animal — **no nested buttons**, so Tab stops once per animal. Paper `#FBF7F0`,
1px `#E0D4BF`, radius 20, padding 12, inner `gap: 12`; text block `gap: 8`, padding `0 4 4`.
- Photo 4:5, radius 12, hatch placeholder.
- Name — Literata 500, `19/1.2` desktop, `18` tablet, `20` phone; one line, ellipsis.
- Meta — Commissioner 400 12/1.4 `#6E5C44`: age · size · housing + city.
- **Freshness**: the three pips (7px, `gap: 4`) + "оновлено N днів тому" at 12/1.4 `#4A3D2C`,
  `gap: 8`. Same thresholds and colours as everywhere else.
- Shelter — 11/1.3 `#6E5C44`, with "перевірений" in `#4F6B3A`.
- Reserved: the `#E3D6C0` "Уже домовляються" pill sits bottom-left **inside the photo**, 8px inset
  (6px on the tablet card, labelled "Домовляються").

**The shelter's sentence is NOT on gallery cards.** Pips + the day count in words always are. The
sentence needs 3–4 lines to read as speech rather than a status string, so it stays on the detail
page with its «дата автоматична» attribution. No freshness information is behind hover.

### Hover / focus
- Hover: border `#E0D4BF → #C9BCA2` and the name underlines (`text-underline-offset: 3px`), 160ms.
  **No lift, no shadow** — the system still has exactly two elevation steps.
- Focus-visible: `outline: 2px solid #4F6B3A; outline-offset: 2px` on the whole card. Never removed.
- **Nothing appears on hover.** Pips, days, shelter, reserved badge are always rendered — hover
  doesn't exist on a phone.

### Rail, count, sort
Rail is the 03 filter groups (МІСТО / ВИД / РОЗМІР / ВІК) in a paper card, radius 20, padding 16,
`gap: 24`, with "Скинути" top-right and no "Показати" button — changes apply immediately and write
to the URL. Below 1024 it collapses into the **existing 03 sheet**, extended with sort.

Above the grid: "Знайдено 34 тварини у 7 притулках" left; a sort control right (44px, radius 12) —
**Спочатку найсвіжіші картки** (default) or **Найдовше чекають**. Both show everyone.

The rail closes with: "Немає фільтра «тільки свіжі картки». Тварина, про яку давно не писали, все
одно чекає."

### Pagination — not infinite scroll
24 per page, numbered pages with prev/next, all targets 44px, active page leaf-filled. Chosen
because this is the shareable indexed surface: every page has its own address (`?stor=2`), the back
button works, and it degrades to a plain list without JS. Footnote in the UI: "Сторінки, а не
безкінечна стрічка: у кожної сторінки своя адреса, кнопка «назад» працює, і посилання можна
надіслати в Telegram."

### Gallery states
- **Loading** — skeleton cards, count equal to the page size so height doesn't jump. Photo block
  `#EFE6D6`, text bars `#F1EADE`/`#EFE6D6`, radius 4. **No shimmer and no pulse** — an opacity
  pulse would read as a data state. Grid gets `aria-busy="true"`; an `aria-live="polite"` region
  says "Завантажуємо тварин".
- **No match** — paper card, padding `40 24`, `gap: 24`: "Під ці фільтри зараз нікого немає." /
  "У Броварах 7 притулків, і сьогодні серед середніх собак вільних немає. Це не помилка пошуку."
  Then two 52px actions that **name their yield**: "Прибрати «розмір» (+11 тварин)" (leaf) and
  "Додати сусідні міста (+34)". No suggestion without a number.
- **Error (whole list)** — "Список не відкрився." / "Це не ваша помилка і не помилка притулку.
  Фільтри збережені — адреса сторінки не змінилася." / "Спробувати ще раз".
- **Error (next page)** — "Сторінка 2 не прийшла." / "Ті, кого вже видно, залишаються на місці. Ми
  нічого не приховали." / "Завантажити сторінку 2". A grid error never removes already-visible
  cards, and is never red.
- **Exhausted (07)** belongs to the **deck, not the gallery** — the gallery has pages, not an end.
  Its buttons lead back into the gallery.

### Keyboard
| Key | Behaviour |
|---|---|
| Tab | header → rail → sort → cards in reading order → pagination |
| ← ↑ → ↓ | 2D movement across the grid while focus is inside it; edges do not wrap |
| Home / End | first / last card on the page |
| Enter | open the animal · Backspace returns to the grid at the same card |
| Esc | close the filter sheet, the contact modal, or leave the deck |
| In the deck | ← не зараз · → написати · ↓ далі · Esc до списку |

Screen readers get name, age, city, then the sentence "оновлено 41 день тому" via `aria-label`;
the pips are `aria-hidden`.

### Deliberately absent
No map with pins — the grid never becomes a map, and a fostered animal gets no point even at 1440
where there is room. No freshness filter and no "verified first" sort. No view counts, no "5 people
are looking", no urgency. No phantom tiles — 3 results render 3 cards, the last row is not padded.
No infinite scroll as the only path.

## Desktop Breakpoints for the Eight Screens

### 04 Detail — 1440
Content max 1200, padding `40 60 56`, two columns with `gap: 40`.
- Left, 560 fixed and **sticky** on scroll: main photo 4:5 radius 20, then three 88px thumbnails
  (radius 8, active one `outline: 2px #2A2118, offset 2`).
- Right, fluid and scrolling: name Literata 500 `34/1.15`; meta; **freshness block** (`#F4ECDF`,
  radius 12, padding 16 — pips + "Оновлено 41 день тому", sentence at Literata 400 17/1.55,
  attribution 11px); then the action pair; then a nested two-column row — **Медичний стан** (with
  the 4×16 source bars and the document pills) fluid, **Де живе** 260 fixed; hairline; shelter row
  with the 36px monogram and the `dobro.ua ↗` donate button.
- **The sticky footer disappears on desktop**: the action pair moves up under the freshness block
  so the shelter's words are read before the button. "Не зараз" is padding-sized, "Написати
  притулку" takes `flex: 1`.
- 1024–1439: same grid, photo 480, "Де живе" moves below "Медичний стан".
- Fostered animals still render the `#EFE6D6` place-name block and **no map**.

### 05 Contact reveal — desktop modal
A 640-wide dialog over the detail page (backdrop `#EDE3D2`), paper, radius 20, `lg` shadow,
padding 24, `gap: 24`. Title block left with a 44px ✕ right; then contacts (`#F4ECDF`, radius 12)
and the three-things card (outlined) **side by side**, `gap: 16`; then "Написати в Telegram"
(leaf, `flex: 1`) + "Повернутися до галереї" (text, underlined).
Modal, not a page, so the animal's URL stays in the address bar and remains shareable. Focus moves
to the heading and is trapped; Esc closes; the page behind does not scroll. Below 768 it is the
existing full screen 05 with the two cards stacked.

### The other six
- **01 First run** — becomes the first visit to the gallery, not a separate screen: the promise and
  city choice sit in a 760-wide centred band above the grid and disappear once a city is chosen.
  Nothing blocks browsing.
- **02 Deck** — stays 390–420 centred on `#F4ECDF`; keyboard hints sit left and right, not extra
  cards. Mouse drag works but is never required — the three buttons and arrow keys do the same.
- **03 Filters** — the rail from 1024 up, always open, no "Показати" button; the existing sheet
  below that, plus sort.
- **06 My reveals** — single 720 centred column, same rows. "Зберігається лише на цьому пристрої"
  moves directly under the title — it matters more on a shared laptop.
- **07 Exhausted** — a 560 centred card in the deck's place.
- **08 Errors** — one card in the place of the content that failed, max 560, never full-screen; the
  header and rail stay usable.

## Gallery ↔ Deck
- **Entry**: "Гортати по одній" in the desktop header / the sticky bar on mobile. The deck inherits
  the current filters and sort — exactly those 34 animals, in that order.
- **URLs**: `/tvaryny?misto=brovary&stor=1` is the gallery and is indexed.
  `/tvaryny/gortaty` is the deck and is `noindex` — it's a viewing state, not a page.
- **Exit**: "До списку" in the deck header, or Esc. The gallery reopens on the same page and scrolls
  to the animal you stopped on, which receives the focus ring.
- **"Не зараз" hides an animal for the rest of the deck session but NOT in the gallery** — the
  gallery is the full record, and a mood filter must not thin it.
- **Memory**: the last mode lives in `sessionStorage`, not permanently — a link shared into Telegram
  always opens the gallery.

## Files
- `Opika - Keeper's Voice.dc.html` — section 2A (gallery + desktop breakpoints) above, then the eight phone screens plus the system cards (colour, type,
  spacing, freshness, location, source, deck gesture, and the uk/en string table). Open in a
  browser; it is a wide canvas, so scroll horizontally.
- `Opika Directions.dc.html` — the earlier three-way comparison (1a The Record, 1b Keeper's
  Voice, 1c Confidence Surface). Context only; **1b is the chosen direction.**
- `support.js` — prototyping runtime. Needed to open the HTML files locally. Not part of the design.
