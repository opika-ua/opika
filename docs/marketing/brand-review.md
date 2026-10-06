# Brand review — live Ukrainian copy against the voice guide

**Date:** 2026-10-06 · **Reviewed:** `packages/i18n/src/messages/uk.ts` (175 keys, comments
stripped), plus Ukrainian strings hardcoded outside it in `apps/web/src` · **Against:**
`docs/marketing/brand-voice.md` and the commitments register in `docs/standing-constraints.md`
**Severity scale (handoff §6):** **Critical** = false or unprovable claim · **Major** =
cuteness/diminutives · **Minor** = register drift.
**Read-only.** Nothing here edits `uk.ts`. Ukrainian rewrites are *proposals* for Oleksii to
write or approve. Findings already in `docs/copy-and-ia-critique.md` are marked *(prior)* and not
counted as new.

Every "is it true?" call below was checked against the code that renders the string, not
against the string's own comment.

---

## Summary

**Overall:** the catalogue is unusually close to its own voice. `forShelters.*`, the reveal
dialog and the error states already do what the guide asks — mechanism, one speaker, no
exclamation, no cuteness. **Zero diminutives or cuteness in live copy** (no *major* findings at
all), and the `/prytulkam` commitments read consistently with the register's own
"falsified by" analysis (not re-audited line by line in code for this review).

**What needs fixing** is a handful of sentences that state something the code doesn't
guarantee — five **critical** findings (one, C5, already queued in the engineering handoff), all
on screens adopters can reach on the demo deploy. All are one-line rewrites. Second, a scattering of system-voice «ми» where the guide
says either «я» or impersonal.

| Severity | Live | Dormant (key exists, nothing renders it yet) |
|---|---|---|
| Critical | 5 | 2 |
| Major | 0 | 0 |
| Minor | 8 | 2 |

---

## Critical — false or unprovable

| # | Key | Live text | Why it's critical | Proposal |
|---|---|---|---|---|
| C1 | `reveal.reflection1` | «Це 10–15 років разом, а не вихідні.» | Rendered **unconditionally** in `ContactRevealDialog.tsx` — including for animals in the `senior` bucket (8 yr+). For a ten-year-old dog the sentence is false. | «Це роки разом, а не вихідні.» — true for every age, same weight. |
| C2 | `location.lineFostered` · `cardMeta.fosteredHousing` | «м. {city} · у домі волонтерки» / «живе у волонтерки, м. {city}» | Asserts the foster carer is a woman. The data model stores city-precision location, not the carer's gender; for a male carer it's false. Rendered on gallery cards and the detail page. | «м. {city} · на перетримці» / «на перетримці, м. {city}» — *перетримка* is the standard volunteer term and carries no gender. (Alternative: «у тимчасовій родині».) |
| C3 | `exhausted.newAnimals` | «Нові тварини з'являються, коли притулки оновлюють картки. Зазвичай раз на кілька тижнів.» | The first sentence is mechanism; the second is a frequency claim nothing measures — and with zero real shelters, nothing can. Rendered in the deck's exhausted state. | Drop the second sentence: «Нові тварини з'являються, коли притулки оновлюють картки.» |
| C4 | `about.free` (`/pro`) | «Реєстр безкоштовний для притулків сьогодні і лишиться безкоштовним. … якщо це колись зміниться…» | «лишиться безкоштовним» is an unconditional future promise — the "free forever" handoff §3 rules out — and then the same paragraph concedes it might change. The sentence contradicts itself. **Note:** `prytulkam-argument.md` §2 praised this string and said "do not hedge it"; the commitments register (#3) and handoff §3 are newer and narrower. Oleksii's call — this review follows the register. | Align with `forShelters.cost`, which already says it right: «Реєстр безкоштовний для притулків — сьогодні і далі. Жодних платних тарифів… Якщо це колись зміниться, кожен притулок дізнається про це заздалегідь, а не постфактум.» |
| C5 *(already tracked: `handoff-2026-10-04.md` row 1, copy ask → inbox)* | `errors.rateLimited` | «Ви відкрили контакти багатьох притулків сьогодні. Наступні — завтра.» | The limit (`reveal-rate-limit.ts`) is **30 distinct shelters over a rolling 24 h window**, not a calendar day. "Today" and "tomorrow" are wrong at the edges (a budget spent 23:00–00:30 frees at 23:00 the same day). Low exposure, but it describes a mechanism inaccurately — exactly the class of claim the voice exists to avoid. | «Ви відкрили контакти багатьох притулків за останню добу. Наступні стануть доступні протягом доби.» |

### Dormant critical — fix before anything wires these keys

| # | Key | Text | Problem |
|---|---|---|---|
| D1 | `reserved.action` | «Стати другим у черзі» | No queue exists anywhere in the data model. Wiring this button would promise a mechanism that doesn't exist. Delete the key or design the queue first. |
| D2 | `exhausted.footnote` | «…напишіть нам, і ми з ним поговоримо.» | «нам / ми» doing human work — commitment #6 says «я». Proposal: «…напишіть мені, і я з ним поговорю.» |

---

## Major — cuteness, diminutives

**None in live copy.** Searched for пухнаст-, хвостик, котик/песик, лапочк-, малятк-,
чотирилап-, улюблен- and exclamation marks: zero hits in `uk.ts`. «Малюк» (age band) is a neutral
category label and stays.

Outside scope but worth knowing: the **demo seed** (`packages/db/src/seed.ts`) has descriptions
like «Ідеально підходить для квартирного утримання» and «Ідеальна для людей похилого віку».
These are fictional demo shelters' words, so not Opika's voice — but per `whatToPrepare` («ви
розкажете, а я внесу все сам») Oleksii will write real descriptions, and "ideal for" is a matching
claim. Brand-voice §7 covers it.

---

## Minor — register drift

| # | Key | Text | Issue | Proposal |
|---|---|---|---|---|
| M1 | `errors.loadFailed` | «Щось не спрацювало на нашому боці.» | System «ми». | «Щось не спрацювало на боці реєстру.» |
| M2 | `location.noMapExplanation` | «Карти тут немає: ми не знаємо точної адреси і не вигадуємо її.» | System «ми»; also strictly the registry *does* hold a shelter's exact address (it just never shows it) — for a fostered animal it holds only the city. The sentence is right for fostered animals, slightly loose otherwise. | «Карти тут немає: реєстр не показує точних адрес і не вигадує їх. Місце зустрічі узгодите з притулком.» |
| M3 | `errors.sessionExpired` | «Ми почали стрічку заново.» / «До стрічки» | System «ми», and «стрічка» (feed) is vocabulary the product otherwise rejects — the deck is «по одній», the gallery is «список». | «Добірку по одній почато заново.» / «До перегляду по одній» — or simply «Почати знову». |
| M4 | `outOfRangePage.showingLast` | «Показуємо сторінку {total} — останню. Нічого не загубилось.» | 1st-person-plural verb. Mild. | «Це сторінка {total} — остання. Нічого не загубилось.» |
| M5 | `detail.shelterVerifiedYears` (suppressed while demo flag is on) | «Перевірений вручну · {years} на Opika» | Will read **«0 років на Opika»** for every shelter for the first year after launch — true, but it advertises newness as a deficit on the one line meant to build trust. Also bakes the working name into a string. | «Перевірений вручну · у реєстрі з {month year}» via `Intl.DateTimeFormat` — e.g. «з жовтня 2026». **Fix before the flag flips.** |
| M6 | `noMatch.suggestionExplainer` | «Кожна пропозиція називає, скільки тварин вона додасть…» | *(prior — D1 in copy critique)* still live; the UI explaining its own design. Not counted as new. | — |
| M7 | `about.intro` | «…не повинно залежати від того, чи вміє притулок вести застарілий Excel-файл.» | A small dig at the very people being courted; the only sentence in the catalogue with an edge. | «…не повинно залежати від того, чи є в притулку свій сайт.» — names the real gap (see competitive brief: small groups have no site). |
| M8 | `firstRun.promise` (og:description) | «…подивіться, кого шукає дім.» | Reads literally as "see whom a home is looking for". If the inversion is intended, fine; if «хто шукає дім» was meant, it's a slip. Flagging for intent, not correcting. | Oleksii to confirm. |

### Dormant minor

| Key | Note |
|---|---|
| `myReveals.deviceOnly` — «Ми не знаємо, хто ви.» | System «ми» → «Реєстр не знає, хто ви.» |
| `location.fostered` | Same gender assumption as C2; unused, so fix or delete with C2. |

### Terminology watch (not a finding today)

- **«реєстр» means two things.** Opika calls itself «реєстр» (`about.*`, `forShelters.*`), while
  `medical.registry` labels the *state* register «Реєстр тварин» and the dormant
  `medical.registryConfirmed` says «Підтверджено реєстром тварин». A reader can't tell which
  register confirmed what. Not false today; a confusion risk the moment registry-sourced medical
  data appears. Handled in `brand-improvements.md` (§ naming and the blue).
- **`about.analytics` — «…без реклами.»** True today (Vercel Analytics, no ad trackers). Phase 2
  plans rewarded-video ads beside listings; when that ships this sentence must change in the same
  release. Suggest adding it to the commitments register's "falsified by" column.

---

## Strings outside the catalogue

| Where | Text | Note |
|---|---|---|
| `app/layout.tsx` title | «Opika — тварини з притулків Київщини» | The de facto descriptor (browser tab, link previews). Good; but it's hardcoded outside `uk.ts` — move into the catalogue so a rename touches one file. |
| `seo-flags.ts` | «· перевірений» | Card suffix; fine, belongs in `uk.ts`. |
| `FilterSheet.tsx` | `aria-label="Закрити"` | Fine; belongs in `uk.ts`. |
| `AnimalDetailScreen.tsx` | рік/роки/років | Fine; belongs in `uk.ts` (and disappears if M5 is accepted). |

---

## Revised sections — top five, before → after (*proposals*)

1. **C1** — «Це 10–15 років разом, а не вихідні.» → «Це роки разом, а не вихідні.»
2. **C2** — «м. Бровари · у домі волонтерки» → «м. Бровари · на перетримці»
3. **C4** — «…сьогодні і лишиться безкоштовним.» → «…сьогодні і далі.»
4. **C3** — «…оновлюють картки. Зазвичай раз на кілька тижнів.» → «…оновлюють картки.»
5. **C5** — «…сьогодні. Наступні — завтра.» → «…за останню добу. Наступні стануть доступні
   протягом доби.»

---

## Legal / compliance flags

- **No unsubstantiated superlatives, testimonials, counts or comparative claims** anywhere in the
  catalogue. Nothing names a competitor.
- **Font licence attribution** (`footer.fontCredit`) present and specific — CC BY 4.0 satisfied.
- **Privacy statements** (`about.data`, `myReveals.deviceOnly`) match the design spec
  (device-local reveals, no public exact address).
- **Money** (`about.money`, `forShelters.money`) names monobank as an *example* of a shelter's own
  page — fine, not an endorsement.
- **Watch:** `about.analytics` vs Phase 2 ads (above).

---

## What was checked and is clear

All eight commitments on `/prytulkam` (`forShelters.*`) against the register's description of
current behaviour, including #8's
temporary narrowing (the show-everyone half is correctly absent); the swipe vocabulary («Не
зараз», «Запитати», `notAJudgementNotice`); freshness copy («Оновлено…», «Слова притулку · дата
автоматична» — never "confirmed"); the demo disclosure; ви-register throughout (agrees with
critique D2); no Russian.
