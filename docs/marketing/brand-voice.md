# Brand voice guide

**Date:** 2026-10-06 · **Status:** first written guide (there was none) · internal, English
**Derived from:** `packages/i18n/src/messages/uk.ts` (live strings — `forShelters.*` above all),
`docs/prytulkam-argument.md`, `docs/design/README.md`, `docs/standing-constraints.md`
(commitments register), `docs/copy-and-ia-critique.md`.
**Binding over this guide:** the commitments register and handoff §3. If this guide and the
register ever disagree, the register wins and this guide is wrong.

Ukrainian lines below are either **quoted from `uk.ts`** (marked *live*) or **proposals** (marked
*proposal*) — proposals are Oleksii's to accept, rewrite or reject. Nothing here edits `uk.ts`.

---

## 1. The voice in one sentence

**Say what the thing does, in plain words, as one person — and say nothing that would stop being
true if someone read the code.**

Everything else in this guide is a consequence of that. The voice is not a tone choice layered
on top of the product; it is the product's honesty mechanism, written down.

> *live* — «Ви не дізнаєтеся, що хтось дивився картку, поки ця людина сама вам не напише. Немає
> списку заявок, немає непрочитаних, немає нічого, на що треба відповідати.»

That paragraph is the voice at its best: a mechanism, stated flatly, that removes a worry
without promising anything.

---

## 2. Who is speaking

| Speaker | When | Form | Example |
|---|---|---|---|
| **Oleksii, in first person singular** | Any human action: verification, entering data, removing an animal, replying, deleting a shelter's record, talking to a shelter someone recommended | **я** | *live* «ви розкажете, а я внесу все сам» · «напишіть, і я приберу» · «коли ви пишете на цю адресу, відповідаю я» |
| **The registry, as a mechanism** | What the system does or doesn't do; errors; empty states | impersonal, or «реєстр» as subject | *live* «Реєстр не бере і не переказує грошей» · «Дата ставиться сама.» |
| **The shelter, in its own words** | The freshness sentence, animal descriptions the shelter supplied | quoted «…», attributed | *live* «Слова притулку · дата автоматична» |

**Never «ми», «наша команда», «ми з'єднуємо».** There is no "we". Until self-serve shelter
accounts ship (commitment #6), a «ми» in a sentence about a human action is a false claim of a
team. A system «ми» («ми не знаємо точної адреси») is softer drift, but still drift: prefer
«реєстр» or an impersonal construction.

**When self-serve ships**, this section is rewritten in the same change as the copy — not after.

**Addressing the reader:** always **ви**, lowercase. Never ти. Never «шановний користувачу».

---

## 3. The seven traits

### 3.1 First person singular, one named human

A volunteer is being asked to trust a person, not a platform. The «я» is load-bearing.

- **Do:** «я внесу», «я приберу», «відповідаю я».
- **Don't:** «наша команда перевіряє», «ми зв'яжемося з притулком», «служба підтримки».

### 3.2 Plain, short declaratives

One idea per sentence. Subject, verb, fact. The full stop is the strongest punctuation mark
in the catalogue.

- **Do:** *live* «Це безкоштовно.» · «Дата ставиться сама.» · «Це не помилка пошуку.»
- **Don't:** stacked clauses, «який … що … тому що …» chains, parenthetical hedges.

### 3.3 Mechanism, not outcome

Describe what happens, never what will result. Opika cannot promise an adoption, a number of
adopters, a timeline, or a happy ending — so it never does.

- **Do:** *live* «Порядок у списку — за датою… Це все, що впливає на порядок.»
- **Don't:** «Знайдіть друга на все життя», «ваші тварини швидше знайдуть дім», «сотні людей
  побачать вашу тварину».

### 3.4 Never exclaims, never urges

No exclamation marks. No urgency. No "last chance", no countdowns, no "before it's too late".
Freshness is information, not alarm — a long-waiting animal is still waiting, not "running out
of time".

- **Do:** *live* «Тварина, про яку давно не писали, все одно чекає.»
- **Don't:** «Терміново шукає дім!», «Не проґавте!», «Залишилось мало часу».

### 3.5 Respectful of the reader's time

Answer the question the reader is actually bracing for, early. For a shelter that's "what does it
cost / what will this demand of me"; for an adopter it's "is this real and still available".
Errors say what happened, whose fault it isn't, and what to do (the copy critique's D4 already
names this as a strength — keep it).

- **Do:** *live* «Це не ваша помилка і не помилка притулку. Ваші фільтри збережені.»
- **Don't:** apologetic padding («На жаль, сталася непередбачувана ситуація…»).

### 3.6 No diminutives, no cuteness

Animals are «тварина», «собака», «кіт». The animal's name is enough warmth. Cuteness reads as
consumer-brand marketing and undercuts the register a shelter director or a grant reviewer
expects.

- **Off-voice (flag as *major* in review):** пухнастик, хвостик, котик/песик (as generic nouns),
  лапочка, чотирилапий друг, улюбленець, малятко, «знайди свою половинку».
- **Allowed:** an animal's actual name, even if it is a diminutive (Мурчик is a name, not copy).
  The age band «Малюк» is a neutral category label, not cuteness — keep it.

### 3.7 State-app register, without bureaucratic coldness

Borrow from Diia: directness, verbs on buttons, labels as labels, eyebrows in caps, one idea
per screen. Do not borrow officialese.

| Borrow | Don't borrow |
|---|---|
| «Написати притулку», «Спробувати ще раз» — verb + object | «Здійснити звернення», «Подати заявку» |
| Eyebrow labels: «НЕ ЗНАЙДЕНО», «БЕЗ ЗВ'ЯЗКУ» | «Помилка 404», error codes |
| «Не записано» for unknown | «Дані відсутні», «Інформація не надана» |
| «якщо», «коли», «щоб» | «у разі», «з метою», «відповідно до» |

And one thing **never borrowed: the authority.** Opika looks like a state service; it is not
one. See §6.

---

## 4. Vocabulary

### Use

| Word | Meaning on this site |
|---|---|
| **притулок** | any verified lister — registered NGO, sole proprietor or volunteer group |
| **тварина / собака / кіт** | always |
| **картка** | an animal's listing |
| **перевірений** / **перевірений вручну** | a human checked registration + bank details + references, or a visit/real call + two references. Nothing more. |
| **оновлено N днів тому** | when the information was last updated. Not confirmed. Not checked. |
| **Запитати / Написати** | the right-swipe / reveal action — an inquiry, not a choice |
| **Не зараз** | the left-swipe — a filter, not a judgement |
| **Слова притулку** | marks text the shelter wrote |
| **Уже домовляються** | reserved — the animal stays visible |
| **реєстр** (lowercase, as a common noun) | Opika itself, when a subject is needed |

### Never use

| Never | Why |
|---|---|
| метч, пара, «це метч», ідеальний друг, «твій ідеальний улюбленець» | the swipe is filtering, not judging |
| свайпніть вліво на…, «ні», «nope» | same |
| рекомендовано, у топі, популярне, вибір редакції, featured | commitment #1 — order is date (+ completeness in the deck) only |
| «N людей дивляться», переглядів, «хтось цікавився» | commitment #2 — and "no attention counters" in the design spec |
| безкоштовно назавжди | commitment #3 says *free, with notice before change* |
| ми з'єднуємо, ми зв'яжемося з притулком, ми передамо | commitment #4 — Opika never speaks for a shelter |
| донат через нас, оплата, комісія (as something Opika does) | commitment #5 |
| наша команда, ми (for human work) | commitment #6 |
| підтверджено, актуально, перевірено сьогодні (about freshness) | commitment #7 — the date says only when it was last updated |
| сертифікований, акредитований, партнер, «перевірені партнери», «постійний контроль» | verification is a one-time manual check, not an audit |
| терміново, останній шанс, поспішіть | no alarm |
| поруч з вами, на карті | exact locations are never public |
| платформа, екосистема, партнерство, сервіс №1 | sounds like a product pitching itself (`prytulkam-argument.md`) |
| сотні тварин, тисячі людей, «нам довіряють» | no fabricated social proof — there is none yet |
| державний, офіційний, «Реєстр тварин» (as Opika's name) | Opika is not a state service; «реєстр тварин» is the state register's term |

---

## 5. Language hygiene

- **Ukrainian only**, never Russian, on every public surface.
- Write Ukrainian from an English *argument*, never translate English sentences — that's how
  calques get in (`prytulkam-argument.md`).
- Watch-list of calques editors flag: «приймати участь» → **брати участь**; «на протязі» →
  **протягом**; «слідуючий» → **наступний**; «співпадати» → **збігатися**; «являється» → **є**;
  «у випадку, якщо» → **якщо**; «міроприємство» → **захід**; «вибачте за незручності» → say what
  happened instead.
- Plurals, dates and relative time go through `Intl` / `pluralizeUk`, never hand-built — four
  plural forms, and the accusative after «Знайдено».
- Quotes are «ялинки». Dashes are em dashes with spaces. No exclamation marks.

---

## 6. The state-app look carries a duty

The «Реєстр» skin, the e-Ukraine typeface and the Diia-adjacent layout make Opika *look*
institutional. The city of Kyiv runs a real municipal adoption service in the «Київ Цифровий»
app (see `competitive-brief.md`). So the voice carries one extra obligation the look creates:

- Never imply state, municipal or official status.
- When the reader could reasonably wonder, say who runs it — one person, independently.
- *proposal* (footer or «Про проєкт»): «Незалежний проєкт однієї людини. Не є державним чи міським
  сервісом.»

---

## 7. Writing for each audience

**Shelters** (`/prytulkam`, outreach, the future leaflet). Write to one volunteer you can
picture — a woman in Brovary in her fifties who runs everything off Instagram and has been let
down by a startup before (`prytulkam-argument.md`'s method). Answer cost first, then what happens
to her animals, then who writes to whom. Never promise a number of adopters.

**Adopters** (gallery, detail, reveal). The question is "is this real, still available, and is
this a real shelter?" Answer it with mechanism: the date, what «перевірений» means, who you'll be
writing to. Don't cast the adopter as a hero or rescuer; describe the tool.

**Journalists / grant reviewers** (future). Same voice, more context. "A regional registry of
animals from manually verified shelters" — not "Tinder for pets", even if they write it that way.

**When I write an animal description from what a shelter told me** (`whatToPrepare`: «ви
розкажете, а я внесу»): describe, don't sell. «Спокійний, не любить гучних звуків» — yes.
«Ідеально підходить для…» — no; that's a matching claim Opika can't stand behind.

---

## 8. Pre-publish checklist

Run every new string, caption, post or tagline through this:

1. Would it still be true if someone read the code that renders it? (If it describes behaviour,
   name the commitment row it touches.)
2. Does it promise an outcome, a number, or a future? → rewrite as mechanism.
3. Is there a «ми» doing human work? → «я».
4. Any word from §4 "Never use"? → replace.
5. Any exclamation mark, urgency, diminutive? → remove.
6. Could it make a reader think this is a state or city service? → add who runs it.
7. Does it mention a real shelter, real animal or real number? → only with the shelter's consent,
   and never in the public repo.
8. Was it written in Ukrainian, or translated into it? → if translated, rewrite from the argument.

---

## 9. Reference lines (live, worth imitating)

- «Це безкоштовно. Не «безкоштовно перші три місяці» і не «безкоштовно, поки ми не виростемо» —
  просто безкоштовно, сьогодні і далі. Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не
  з рахунку.» — the model for commitment #3. *(Note: «поки ми не виростемо» is a quoted
  hypothetical, not a team claim.)*
- «"Перевірений" означає, що вас перевіряла людина. Ось що це означає конкретно.»
- «Притулок не знає про цей запит, поки ви не напишете самі. Нічого не сталося автоматично.»
- «Карти тут немає: … не вигадуємо її.» (mechanism + reason in one line — though see the review
  on its «ми»)
- «Поки що це просто: напишіть, і я приберу. Окремої кнопки ще немає — не хочу обіцяти кабінет,
  якого не існує.» — the clearest single example of the voice refusing to over-promise.
