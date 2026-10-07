# Opika — Kabinet (shelter & operator admin) · developer handoff

## What this is
The internal admin panel for Opika, under `/kabinet`. It extends the shipped **«Реєстр»** visual
system (see `README.md` in this folder): the same tokens, radii, type scale, single shadow,
no borders, and one blue reserved for registry confirmation and focus. **It is new screens in the same
system, not a new visual language.**

The design reference is `Opika Kabinet.dc.html`, a flat canvas of mock frames, not an app. Open it
in a browser and scroll. Every screen is shown at **1440** (desktop; this is office work, so it doesn't
need the gallery's 1920) and **360** (phone; volunteers will do this mid-walk). Recreate the values in
the repo's stack (Next.js 16 / React 19 / Tailwind). Don't ship the HTML; take the numbers.

**Fidelity: high.** Every value below is final unless it is listed under *Open questions* — all four of
which were resolved 2026-10-07; see that section and `docs/kabinet-contract-decisions.md`.

### How to read decided vs extrapolated
Each frame name carries black tags **N1–N23** (N18–N23 added 2026-10-07, alongside the corrections in
§1–§5 of `docs/kabinet-contract-decisions.md`). These mark patterns the core «Реєстр» system did **not**
specify, which this pass had to invent. They are listed in the *New patterns* section with exact values.
Anything untagged was already decided and is only being applied.

---

## Actors and routes
- **shelter_admin**: a volunteer at one shelter. Manages that shelter's animals, contacts, donation
  link and the shelter's own first-person sentence. Often on a phone.
- **super_admin**: the single registry operator. Provisions shelters, runs verification, can view and
  edit everything, and can enter a read-only support view of any shelter.
- Auth is Better Auth with **magic link only**. There is no password field, no "forgot password" and no sign-up.

| Route | Actor | Frame |
|---|---|---|
| `/kabinet/vkhid` | both | K1 |
| `/kabinet/tvaryny` | shelter_admin | K2 (+ empty, loading) |
| `/kabinet/tvaryny/nova`, `/kabinet/tvaryny/[id]` | shelter_admin | K3 |
| `/kabinet/profil` | shelter_admin | K4 |
| `/kabinet` (rejected shelter home) | shelter_admin | K5 |
| `/kabinet/prytulky` | super_admin | S1 |
| `/kabinet/prytulky/novyi` | super_admin | S2 |
| `/kabinet/prytulky/[id]/perevirka` | super_admin | S3 (+ reason dialog) |
| `/kabinet/prytulky/[id]` | super_admin | S4 (+ suspended) |
| `/kabinet/pidtrymka/[id]` | super_admin | S5 support mode |

Route slugs are suggestions in the same transliteration style as `/tvaryny`; adjust them to the codebase.

---

## Hard product constraints (trust commitments)
1. **No engagement numbers anywhere.** No reveal counts, no views, no "N people looked", no trends,
   no badges. This applies to shelter screens *and* operator screens. No operator screen needed this
   data, so there is no "operator only" panel either. Don't add one.
2. **No adopter↔shelter messaging**, and no adopter contact details shown to shelters.
3. **No CSV import UI.** Bulk import is an operator script.
4. **No ranking, featuring, boosting or manual ordering.** K2 says this to the user in plain words:
   «Порядок у публічній галереї — дата й повнота картки. Тут його не можна змінити, і просування немає.»
5. **No money UI.** A donation is a single URL field, shown back as `dobro.ua ↗` before saving.
6. **No alarm colours.** No red and no amber in the token set. Rejection and suspension are decisions,
   not alerts.
7. **Fostered animals never get a map, pin or address**, only a city name.
8. **Unknown = «Не записано»**, never a dash, never "no", never an error.
9. **The shelter speaks in the first person.** The freshness sentence is the shelter's own words. Opika
   substitutes only `{дата}` and `{імʼя}`.

---

## Tokens (unchanged from «Реєстр»)
| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| page | `#ECECEA` | | ink | `#101112` |
| surface | `#FFFFFF` | | ink-2 | `#45484B` |
| fill | `#F2F2F0` | | ink-3 | `#63676B` |
| fill-strong | `#DCDCD9` | | registry / focus | `#1B3A6B` |
| modal backdrop | `#B9B9B5` | | | |

- Type: e-Ukraine 400/500/700. Scale: 44/46·700·−0.035em · 34/38·700·−0.03em · 24/28·700·−0.02em ·
  19/24·700 (section titles in kabinet) · 17/26 · 15/22 · 13/18 · label 12/16·500·0.08em uppercase.
- Radii: 8 (pips, small tags) · 16 (buttons, fields, inner blocks, thumbnails) · 24 (cards, dialogs, sheet) · 999 (chips).
- Spacing: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48. All vertical rhythm uses `gap`.
- Targets: 48 minimum, 56 primary actions.
- One shadow, for dialogs and the bottom sheet only: `0 24px 48px -32px rgba(16,17,18,0.4)`.
- Focus: `outline: 3px solid #1B3A6B; outline-offset: 3px`.
- Motion: 120 / 220 / 280ms, `cubic-bezier(0.3, 0, 0, 1)`. Dialogs enter by opacity 220ms with no scale.
  `prefers-reduced-motion`: opacity only, 120ms.

### Buttons
| Kind | Spec |
|---|---|
| primary | fill `#101112`, white 15/500, 56 (48 in rows), radius 16, padding `0 24` |
| secondary | fill `#F2F2F0`, ink 15/500 |
| ghost | fill `#FFFFFF`, ink 15/500 (used on fill backgrounds) |
| text | transparent, ink 15, underline, padding `0 8` |
| disabled | fill `#F2F2F0`, ink-3 (5.6:1), `aria-disabled="true"`, **stays focusable** and the reason is written next to it, not in a tooltip |

### Freshness marker (unchanged)
Three 10px pips, `gap: 6`, and the day count in words, `gap: 10`.
fresh = `#1B3A6B` + 2 outlined · aging = 2 × `#63676B` + 1 outlined · stale = 2 × `#63676B` + `#101112`.
**The empty pip is outlined**: transparent fill, `border: 2px solid #63676B`, `box-sizing: border-box`.
Pips are `aria-hidden`, and `aria-label` repeats the sentence.

---

## Layout shell (N2)
**Desktop:** header 72, white: mark 28 + «Opika» 24/28·700·−0.03em + «кабінет» 15 ink-3, a 1px × 28
`#ECECEA` separator, the shelter name 15/500, then spacer, user and role 15 ink-3, «Вийти» text button.
Below it, a 220px nav column on the page background. Items are 48 tall, radius 16, padding `0 16`. The active
item has a white fill and 500 weight; inactive items are ink-2. Content sits to the right, max 1080, `gap: 24`.
Page padding `32 32 56`, nav↔content gap 32.

**Phone:** header 64, white. It holds either the mark 24 + section title 19/24·700, or a back button
(fill, 48, radius 16, «← Розділ»). Bottom tabs: white, padding `8 12 16`, each tab `flex: 1`, 56 tall,
radius 16, **text only** at 13/18. The active tab has a `#F2F2F0` fill and 500 weight. There are no section
icons: the system has seven glyphs and none of them is a section icon.

Nav items: shelter_admin «Тварини» · «Профіль притулку»; super_admin «Притулки» · «Новий притулок».

---

## Screens

### K1 · Sign-in (N1)
Centred white card, 480 wide, radius 24, padding 32 (phone: full width, padding 20).
- **Enter email:** title 34 «Вхід до кабінету»; body 17/26 «Для притулків і оператора реєстру. Пароля
  немає — ми надішлемо посилання на пошту.»; email field (focus ring shown); primary «Надіслати
  посилання», full width; caption explaining that the address is added by the operator and that the
  form doesn't reveal who is registered.
- **Sent:** «Перевірте пошту»; the address in 500 weight; «Воно діє 15 хвилин…»; caption about spam;
  «Надіслати ще раз · 0:42» **disabled for 60s**, with the countdown in the label; «Інша адреса» text button.
- **The response is identical for known and unknown addresses** (no account enumeration).

### K2 · Animal list (N3, N4, N5, N18)
Header: title 44 «Тварини» + caption «Притулок «Домівка» · 14 тварин», primary «Додати тварину» on the right.
Filter chips with **inventory counts** (these are not engagement numbers): Усі · Чернетки · Опубліковано ·
Домовляються · Удома · Знято. Chips are 48 tall with padding `0 20`; the active chip is ink-filled.

**Paused banner (N18)**, shown above everything when the shelter is currently «На паузі»: `#F2F2F0`,
radius 16, padding `16 20`, «Прийом тварин на паузі · {причина}» (15/500) + «Відновити» (secondary 48). A
shelter managing its animals while paused must never be left wondering why — see K4 for where pausing
itself happens; this is the reminder, not the control.

**Desktop row:** white, radius 24, padding 16,
`grid-template-columns: 72px minmax(0,1fr) 150px 280px minmax(300px, auto)`, `gap: 20`.
The columns are: thumbnail 72 (radius 16) · name 19/24·700 + meta 13/18 ink-3 · status chip · freshness + still-looking ·
forward action + «Ще ▾» menu (text button).

**Forward action and still-looking button by state:**
| State | Chip | Freshness cell | Forward action |
|---|---|---|---|
| draft | Чернетка | «Ще не опубліковано · бракує фото» | «Опублікувати», disabled until there is at least one photo (reason written in the row) |
| published | Опубліковано | pips + days + **«✓ Ще шукає»** | «Домовляються» |
| reserved | Домовляються | pips + days + **«✓ Ще домовляються»** | «Уже вдома» |
| adopted | Удома (row fill `#DCDCD9`) | «Удома з 12 вересня» | none |
| withdrawn | Знято | «Знято 2 жовтня · «причина»» | «Повернути в чернетки» |

Actions that remove an animal from the gallery (→ Удома, → Знято) confirm in the reason dialog (N15).

**Still-looking (N4)** is a separate action, not an edit. It is a secondary 48 button under the freshness marker.
On tap: `lastConfirmedAt = now`, the pips switch to fresh, and for **8 seconds** the cell reads
«✓ Підтверджено сьогодні» (15/500) + «Скасувати · 8 с» (13, underlined). After that it settles. It is one
animal per tap. **There is deliberately no "confirm all"**, because a bulk confirm becomes a rubber stamp
and the freshness marker stops being true.

**Stale strip (N5)**, shown above the list only when there are any: white, radius 16, padding `16 20`. It contains stale
pips, «3 картки ви не підтверджували понад 30 днів.» (15/500), the caption «Адоптери бачать на них
«оновлено 41 день тому». Якщо нічого не змінилось — достатньо «Ще шукає».», and secondary «Показати ці 3».
No streaks, no counter of days, no colour.

**Phone card:** white, radius 24, padding 12, `gap: 12`. Rows are: thumbnail 64 + name/meta · chip + freshness ·
full-width still-looking (48) · forward action `flex: 1` + «Ще ▾» (88 wide). Filter chips form one
horizontally scrolling row, clipped on purpose.

**Empty:** white card, max 560, padding 48 (24 on the phone): «Тут поки немає тварин.» + what happens next +
primary «Додати першу тварину» + caption saying a name and a photo are enough for a draft.
**Loading:** skeleton rows with the same grid. Placeholders are `#DCDCD9` / `#F2F2F0`, radius 8, row count = page
size, `aria-busy`. **No shimmer and no pulse.** Rows are replaced by an opacity change over 120ms.

### K3 · Add / edit animal (N6, N7, N8, N9, N19)
One page, **not a wizard**. Desktop has two equal columns of white section cards (radius 24, padding 24, `gap: 16`);
the phone has one column (card padding 16). Drafts autosave every 10s and on blur. The footer reads
«Чернетку збережено 14:32 · бачите лише ви» + «Зберегти чернетку» + «Опублікувати».

Sections:
- **Хто це:** name (hint: one name, no quotes) · species seg [Собака | Кіт] · sex seg
  [Хлопчик | Дівчинка | Не записано] (phone labels «Хлопч.» / «Дівч.»; the public card shows the full words) ·
  size seg [Малий | Середній | Великий] with the caption «Ваги немає свідомо…». **There is no weight field.**
- **Вік:** mode seg [Знаємо дату народження | Знаємо вік на певну дату] (phone: [Дата народження |
  Вік на дату]). Both inputs are equally valid. **The stored value is what the user actually knows.** In
  bucket mode, a `#F2F2F0` block (radius 16, padding 16) holds bucket chips (Малюк до 1 · Молодий 1–3 ·
  Дорослий 3–8 · Літній 8+) and a «Станом на» date (defaults to today; hint: usually the intake day). A live
  line shows what the adopter will read: «Адоптери побачать: «Молода, близько 2 років».»
- **Опис:** plain-text textarea (160 desktop / 200 phone), with a character count in the hint, max 1,500.
- **Фото (N9):** 4:5 tiles, radius 16 (148 desktop / 94 phone), `gap: 12`, in these states:
  - add tile: dashed 2px `#63676B`, «+ Фото», caption with formats and the 10 MB limit;
  - uploading: `#DCDCD9` + a 6px progress bar (white track, ink fill), with percent and MB in words;
  - failed: `#F2F2F0` + an inset 2px ink outline, «Не завантажилось» and the link «Спробувати ще раз» (**no red**);
  - done: the first photo carries a white «Обкладинка» pill (28 tall).
  Drag to reorder. At least one photo is required to publish. **Compress on the device to 2000px before upload**
  (carrier networks).
- **Здоров'я (N19)**, corrected 2026-10-07 against `packages/domain/src/animals/attestation.ts` and the
  already-shipped public rendering (`apps/web/src/features/animal-detail/medical-labels.ts`'s
  `vaccinationRow`/`spayNeuterRow`), neither of which the first pass consulted. `VaccinationStatus` and
  `SpayNeuterStatus` are each a 3-state fact (`uk.medical.unknown` «Не записано» / `uk.medical.inProgress`
  «У процесі» / confirmed), not the 2-option [Зроблено | Не зроблено] this section originally showed — the
  first two options **reuse those exact public keys**, not parallel strings. The third option is a new
  kabinet-only action label (name tbd, e.g. `uk.medical.confirm`) distinct from the *display* badge
  («Слова притулку») that same choice renders as afterward — the control is an action, the badge is a
  provenance label, and they are allowed to read differently. Selecting it writes a `shelter_declared`
  attestation. **A `source: "registry"` value (not reachable yet — no registry adapter exists) renders
  read-only**, reusing `vaccinationRow`'s own existing rabies-badge treatment unchanged — never editable
  here, regardless of whether it can actually occur today.
  **Documents are not edited here.** `documentReadiness` stays `{kind: "unknown"}` for every animal this
  screen creates — its own documented default — with no checkbox UI at all: the earlier 3-item checkbox
  list (Чип · Ветпаспорт · Довідка про сказ) undercounted the real shape (four independently-tracked items,
  each itself 4-state, for the not-yet-live cross-border phase) and is cut rather than built mismatched.
  `uk.documents.chipPresent`/`.rabiesPresent`'s existing public display is unaffected — it already renders
  correctly against the `{kind: "unknown"}` default (nothing to show), same as today.
- **Де живе (N8):** toggle «Тварина живе у волонтерки». When on, a `#F2F2F0` block shows a city select and the
  sentence «На картці буде лише «м. Бровари · у домі волонтерки». Без адреси, без району і без
  мапи — навіть приблизної…». **There is no address input on fostered animals.**

### K4 · Shelter profile (N10, N11, N20, N21)
Editable: phone, Telegram, another contact method (optional), donation URL, and the shelter's sentence.
**Contacts and the voice sentence save and go live immediately** — each edit is recorded in an audit
entry visible to the operator (S1/S4's history, same entry shape as the verification history log, N14).
**Donation does not** — see below.

- **Donation (N20), corrected 2026-10-07 — proposed, not immediately live.** https only, same hint as
  before (Opika doesn't take or pass money). Saving does **not** change the live adopter-facing link —
  it records a *proposed* URL awaiting the operator's approval, because a swapped donation link on a
  compromised account is this product's realistic fraud vector, and it is the one field adopters trust
  specifically because it was verified. The field shows three states: **no change pending** — the live
  URL plus its preview row, as before; **pending** — the live URL unchanged above, plus a `#F2F2F0` block
  below: «Очікує підтвердження оператора» + the proposed domain + «Скасувати пропозицію» (text button);
  **the operator's own approve/reject actions live on S4**, not here — K4 only ever proposes or cancels
  its own proposal, never approves it.
- **Voice (N11):** textarea 120 with `{дата}` and `{імʼя}` tokens. Below it, a live preview of the real
  freshness block with «Слова притулку · дата автоматична».
- **Pause / resume (N21).** A secondary 48 button, «Призупинити прийом тварин» (verified, not paused) or
  «Відновити прийом тварин» (paused). Self-service — `packages/domain`'s own `pause`/`resume` FSM events
  are explicitly shelter-initiated, distinct from the operator's `suspend`/`reinstate`. Pausing opens a
  reason dialog (N15's template) with `PauseCodeSchema`'s five codes (Сезонна перерва · Переїзд · Немає
  місця · Брак людей · Інше) as a select, plus the optional note. No confirmation beyond the dialog itself
  — this is reversible by the shelter at any time, unlike suspension.
- **Locked block (N10), corrected 2026-10-07 — consistent register, real address.** Dashed 2px `#63676B`
  border, radius 24, padding 24/16, no fill. Title «Встановлено під час перевірки» + verified chip, then:
  «…щоб змінити, напишіть оператору реєстру: hello@opika.org.ua. Зміна юридичних даних не змінює статус
  автоматично.» (`ops@` was a placeholder — `hello@opika.org.ua` is the already-shipped real address,
  `/pro`'s own contact row; the "may return to review" line is corrected to match §5 of
  `docs/kabinet-contract-decisions.md` — no FSM transition does that today, so the copy no longer claims
  one). Rows are plain «label — value» pairs, not disabled inputs: legal entity, EDRPOU, registration
  status, premises address. There is **no lock icon**; the reason is given in words. **Naming register:**
  this block says «оператору реєстру» (role), matching S2/S4's own convention — K5 is corrected to match
  rather than mixing «Олексію» and «оператор реєстру» on the same screen (see K5 below and
  `docs/kabinet-contract-decisions.md` §5). Both the name and the email are a single app-level config
  value referenced everywhere the kabinet needs them, never a hardcoded literal at each call site.

### K5 · Rejected shelter, shelter's view (N17)
A card, max 720: rejected chip · «Перевірку не пройдено» · «Ваші тварини поки не в галереї. Ось що
написав оператор реєстру:» · the **reason verbatim in quotation marks** with the operator's name and date ·
what's preserved (drafts) · primary «Написати оператору реєстру» · secondary **«Подати ще раз», added
2026-10-07** — `transition.ts`'s FSM already handles `rejected` + `resubmit` → `pending`, so this screen's
earlier "there is no resubmit button, see Open questions" was answered by code the first pass didn't
check, not by a product decision still owed. **Naming register corrected to match K4:** «Написати
Олексію» → «Написати оператору реєстру», consistent within this screen and with K4's own choice — the
previous version mixed the role («оператор реєстру», one sentence earlier) with the name in the same
card. Both the name/email and the resubmit entry point are the only two things this card's primary and
secondary actions do; nothing else changes.

### S1 · Shelter list (N12)
Search field (420) + status filter chips with counts. Order: things awaiting the operator first, then by name.
Desktop row: white, radius 24, padding `16 20`,
`grid-template-columns: 44px minmax(0,1.3fr) 160px minmax(0,1.6fr) 200px`. The columns are: monogram 44 ·
name 17/26·500 + city/date · status chip · a one-sentence state line · action. Actions: On review → «Розглянути»
(primary), Pending → «Взяти на розгляд», anything else → «Відкрити». The line for a suspended shelter **names the
prior state**: «Призупинено 3 жовтня · до того був «На паузі»». The animal count is inventory, which is allowed.

### S2 · Create shelter + invite (not a wizard, N22)
Fields: shelter name · city · a divider · «Перший адміністратор»: name · email. Primary «Створити й надіслати
запрошення». A side panel (fill) explains what happens: the shelter appears as **Очікує**, the invite link
lasts 72h and can be resent, and animals stay hidden until **Перевірено**. Success state: chip + «Притулок створено.
Запрошення надіслано на …» + expiry + «Надіслати ще раз» / «Відкрити притулок». No celebration.

**Evidence step (N22), added 2026-10-07.** The first pass had no screen showing how verification
evidence enters the system at all — S3 was review-only. This step sits between the shelter/admin fields
above and the primary action: a repeatable list of evidence cards, same five types and same per-type
fields as S3's corrected table below, added one at a time via a secondary «+ Додати доказ» button that
opens a type picker (the five type labels, no icons). Each added card shows inline in the same list
style S3 uses for review, with its own «Прибрати» (text button). Validates against the shared schema the
operator script (`onboard-shelter.ts`) already uses — `OnboardEvidenceItemSchema`, extracted so both
validate identically — so an evidence set assembled here and one assembled by hand for the script are
interchangeable. `site_visit`'s «хто відвідав» is **not a field here** — it is filled automatically with
whichever operator is completing this screen, never typed or picked. A shelter created through S2 with
evidence attached and «Створити й надіслати запрошення» pressed goes straight to **pending**, ready for
S3's existing review — this screen does not itself decide verified/rejected.

### S3 · Verification review (N13, N14, N15)
Two columns: the evidence list (fluid) and a **sticky** decision panel (340).

**Evidence is a list of different kinds of cards, not a fixed form (N13).** Card: white, radius 24, padding 24
(16 on the phone). Order inside a card: type label 12/16 uppercase + date added · title 19/24·700 · `key 180 — value 500` rows ·
an optional document row. Empty fields are not shown. Types and their fields, **corrected 2026-10-07
against `EvidenceItemSchema` field by field** (the first pass showed two fields per card that the schema
doesn't carry, and dropped one it does):
| Type | Fields | Document |
|---|---|---|
| Реєстрація · ЄДРПОУ | code, **registered name** (shown beside the shelter's own name/holder name — the same identity check the bank evidence performs) | optional |
| Банківський рахунок | holder name **only** | optional |
| Рекомендація | who, how to reach them, relationship (vet clinic / local authority / partner org / other) | none |
| Візит на місце | **the recording operator's own name** (not typed — resolved from `visitedBy`, a moderator id), when, free-text note | none |
| Документ | label | required |

**Removed:** «ЄДР status» (a point-in-time registry status goes stale the moment it's recorded — storing
it would read as current when it may not be) and «bank, masked IBAN» (the holder-name check is the
actual check this evidence performs; storing account numbers adds risk without adding rigour — Oleksii's
own reasoning, `docs/kabinet-contract-decisions.md` §2). **Added:** registered name on the EDRPOU card,
a real `EvidenceItemSchema` field the first pass omitted.

Document row: `#F2F2F0`, radius 16, padding `12 12 12 16`. It holds the filename 15/500, type and size 13, and two ghost 48 buttons: «Переглянути»
and «↓». On the phone the buttons sit on their own row.

**Decision panel (N14):** status chip + time in state · «Рішення» 24 · caption «Притулок побачить рішення і
причину» · full-width actions · history log (13/18 ink-2, «дата · хто · що»). On the phone the actions move to the bottom bar.

**Actions by state:**
| From | Actions | Result |
|---|---|---|
| pending | «Взяти на розгляд» | under_review |
| under_review | «Схвалити → Перевірено» · «Відхилити…» | verified · rejected (reason required) |
| verified | «Призупинити…» | suspended (reason required; remembers prior state) |
| suspended | «Відновити → {prior}» | **exactly the state that was interrupted**: paused if it was paused, verified if it was verified |

**Reason dialog (N15):** the same template as reveal modal 05: 640, radius 24, padding 24, the one shadow, backdrop
`#B9B9B5`, ✕ 48. Title «Відхилити «…»?» + «Притулок побачить цю причину дослівно…». The reason textarea is
required and the primary button is disabled while it's empty. The primary action stays **black**: irreversibility is
stated in words, not in colour. On the phone it is a bottom sheet with radius `24 24 0 0`. Suspend uses the same dialog with different copy.

### S4 · Shelter detail, operator view (N20, N23)
The same sections as K4, but the locked fields are ordinary editable fields (with a caption saying the shelter sees them
read-only and that legal changes don't change state automatically). Also: an admin list (invite, remove) and the status history.
Header actions: «Переглянути як притулок · лише читання» and «Призупинити…».

**Donation approval (N20), added 2026-10-07.** When K4 has a proposed donation URL pending, this screen
shows both side by side — the live URL and the proposed one — with «Схвалити» (primary) and «Відхилити»
(secondary) actions. Approving replaces the live URL and clears the proposal; rejecting clears the
proposal and leaves the live URL untouched. Neither action needs the reason dialog (N15) — this isn't a
state-machine transition, just a value swap, and the shelter already sees which outcome happened from
K4's own state the next time they open it.

**Audit log (N23), added 2026-10-07.** Contact and voice-sentence edits made on K4 go live immediately
(`docs/kabinet-contract-decisions.md` §5) but are recorded here, in the same history-log style N14
already uses for verification events: «дата · хто · що змінив» per entry, read-only, newest first.

**Suspended variant:** a card, max 720, with the suspended chip, «Притулок призупинено», the reason verbatim in a `#F2F2F0`
block, «До притулок був» + **the prior state's own chip** + since when, a sentence explaining that Відновити returns
*that* state, and primary «Відновити → На паузі». No confirmation, because the action hides nothing.

### S5 · Support (impersonation) mode (N16)
Three simultaneous signals, because any one alone can be missed:
1. **Black bar, 64 tall** (on the phone it grows to two lines), above everything and not scrolling: «РЕЖИМ ПІДТРИМКИ · ЛИШЕ ПЕРЕГЛЯД»
   (12/16·700 white) + «Ви бачите кабінет притулку «Домівка» так, як його бачить Олена. Тут нічого
   не можна змінити.» + a **white** button «Вийти з режиму». This is the only white-on-black button in the system.
2. **A 4px `#101112` frame around the whole viewport** (`box-shadow: inset 0 0 0 4px #101112` on the root).
   This is **the only solid border in «Реєстр»**, introduced on purpose for this.
3. **Every action is in the disabled state.** It stays visible so the operator sees exactly what the shelter sees.
The header's «Вийти» becomes «Вихід вимкнено». The session ends after 30 minutes of inactivity or when the tab closes. Tab
title: «[Підтримка] {Shelter} — Opika». No write endpoint may accept a request from an impersonation session; enforce this on
the server, not only in the UI.

---

## New patterns (N1–N23) — exact values
| ID | Pattern | Values |
|---|---|---|
| N1 | Magic-link sign-in | 2 states; 60s resend lockout with countdown; identical response for any address; card 480 / padding 32 / radius 24 |
| N2 | Kabinet shell | header 72/64; nav 220, items 48 r16; text-only bottom tabs 56; content max 1080 |
| N3 | Listing status chip | 32 tall, padding `0 12`, r999, 13/18·500. Чернетка: dashed 2px `#63676B`, ink-2 · Опубліковано: ink fill, white · Домовляються: 2px ink outline · Удома: `#DCDCD9`, ink · Знято: `#F2F2F0`, ink-2 |
| N4 | «Ще шукає» | secondary 48; sets lastConfirmedAt; 8s undo; per animal only; «Ще домовляються» for reserved |
| N5 | Stale strip | white r16 padding `16 20`; stale pips + fact + «Показати ці N»; only when N > 0 |
| N6 | Text field | 56, r16, fill `#F2F2F0`, no border, text 17/26; label 15/22·500; hint 13/18 ink-3; «· необов'язково» ink-3; focus 3px `#1B3A6B` offset 3; **error = inset 2px `#101112` + 15/22·500 ink text below, no red** |
| N7 | Segmented control | track `#F2F2F0` r20 padding 4 gap 4; segment 48 r16, `flex: 1 1 auto; min-width: 0` (sizes to its label), padding `0 16` desktop / `0 8` phone; active = white + inset 2px ink + 500 |
| N8 | Toggle | 52×32 r999. Off: 2px `#63676B` outline track, 20px `#63676B` knob (5.9:1). On: ink track, 24px white knob. **No light-fill off state** (same 1.4.11 reasoning as the outlined pip) |
| N9 | Photo tile | 4:5 r16; add = dashed 2px `#63676B`; uploading = `#DCDCD9` + 6px bar; failed = `#F2F2F0` + inset 2px ink + words; cover pill white 28 |
| N10 | Locked block | dashed 2px `#63676B` border, r24, no fill (5.4:1 on page); label–value rows; reason in words; no lock icon. In this system dashed means "not yours / not yet real" |
| N11 | Voice editor | textarea 120, `{дата}` `{імʼя}` tokens, live freshness-block preview |
| N12 | Verification chip | N3 geometry. Очікує: dashed · На розгляді: ink outline · Перевірено: ink fill · Відхилено: `#DCDCD9` · На паузі: `#F2F2F0` ink-2 · Призупинено: `#DCDCD9` + 2px ink outline |
| N13 | Evidence card + doc row | see S3, corrected 2026-10-07 — EDRPOU gains registered name, bank account loses bank/IBAN, see that table |
| N14 | Decision panel + history | sticky 340 r24; reinstate button names the prior state |
| N15 | Reason dialog | modal 05 template; reason required; black primary |
| N16 | Support mode | black bar 64 + 4px ink viewport frame + all actions disabled; 30 min timeout |
| N17 | Rejected notice (shelter view) | card 720; verbatim reason; **resubmit added 2026-10-07** — `transition.ts` already supports `rejected` + `resubmit` → `pending` |
| N18 | Paused banner (K2) | `#F2F2F0` r16 padding `16 20`; reason + «Відновити»; shown only while paused |
| N19 | Health control | 3-option `MedicalState` control reusing `uk.medical.unknown`/`.inProgress` directly; third option is a new action label, display stays on the unchanged `vaccinationRow`/`spayNeuterRow` functions; `source: "registry"` renders read-only |
| N20 | Donation pending-approval | K4: live URL unchanged + `#F2F2F0` pending block + «Скасувати пропозицію»; S4: live vs. proposed side by side + «Схвалити»/«Відхилити», no reason dialog, not an FSM transition |
| N21 | Pause/resume control (K4) | secondary 48; opens N15's reason-dialog template with `PauseCodeSchema`'s 5 codes; self-service, distinct from suspend |
| N22 | Evidence step (S2) | repeatable list, same 5 types as N13; «+ Додати доказ» opens a type picker; `site_visit`'s visitor is never a field, always the acting operator |
| N23 | Audit log (S4) | N14's own history-log style; contact/voice edits only, read-only, newest first |

In every chip, the **word** carries the meaning (all text pairs ≥ 9:1). The shape is redundant and never
required to be read on its own.

---

## Contrast — pairs under 7:1
- ink-3 `#63676B` on white: **5.9:1** (captions, outlined pip, dashed chip borders, toggle-off knob)
- ink-3 on `#F2F2F0`: **5.6:1** (field hints, disabled button text)
- ink-3 on page `#ECECEA`: **5.4:1** (N10 dashed border)
Everything else is ≥ 9.0:1. White on ink and ink on white are 18.7:1, and `#1B3A6B` is 11.3:1.

---

## Deliberately not designed
- Any engagement numbers, for shelter or operator.
- Messaging, or adopter contact details.
- CSV import.
- Featured, boost or manual ordering.
- Any payment UI.
- A separate re-verification state.
- Bulk «Ще шукає».

## Open questions — resolved 2026-10-07 (`docs/kabinet-contract-decisions.md` has the full reasoning)
1. ~~Who sets «На паузі»?~~ **Resolved: the shelter, self-service.** Already true of the domain model
   (`pause`/`resume` are distinct, shelter-initiated FSM events) — not a decision still owed, a fact the
   first pass didn't check. K4 gains the control (N21), K2 the banner (N18).
2. ~~Is there a rejected → pending transition?~~ **Resolved: yes**, already built (`transition.ts`).
   K5 gains «Подати ще раз».
3. **Resolved: split, not uniform.** `donateUrl` → pending the operator's approval (N20) — the realistic
   fraud vector is a swapped donation link on a compromised account, and it's the field adopters trust
   because it was verified. Contacts and the voice sentence → live immediately, recorded in an audit log
   (N23). Legal/verification data, edited only by the operator (S4), needs no approval step (there's no
   third party above the operator to seek it from) and no FSM transition exists for "flag for re-check,
   stay visible" today — checked, not assumed (`transition.ts` closes `verified -> under_review` on
   purpose). Building that properly is the not-yet-built `re_review` state, future work, not H2's.
4. **Resolved: `hello@opika.org.ua`** (the already-shipped real address, not a new `ops@` inbox). The
   name «Олексій» is fine to use inside the kabinet — one register per screen, never mixed with
   «оператор реєстру» on the same screen (K4, K5 corrected) — and both the name and the email come from
   one app-level config value, never a literal at each call site.

## Files
- `Opika Kabinet.dc.html`: this pass, with all kabinet frames at 1440 and 360, the N1–N17 table, contrast notes,
  exclusions and open questions. **Not yet re-exported against the 2026-10-07 corrections above** — this
  markdown file is the current source of truth until a re-export happens; treat any conflict between the
  two in that direction.
- `README.md`: the «Реєстр» core handoff (tokens, public gallery, detail, reveal, deck).
- `Opika Registry System.dc.html` / `Opika Registry Frames.dc.html`: the core visual references.
- `support.js`: the prototyping runtime, needed only to open the HTML.
- `docs/kabinet-contract-decisions.md`: the reconciliation this file's 2026-10-07 corrections are drawn
  from — read it for the domain-code citations and the reasoning behind each one.
