/**
 * Ukrainian UI strings for the discovery flow.
 *
 * Every user-facing string lives here so M9 (i18n) can swap the source
 * to next-intl message files without touching components. Keys mirror
 * the design string table in docs/design/.
 */

/**
 * Marks a string whose real Ukrainian has not been written yet.
 *
 * A distinctive, greppable sentinel rather than an empty string or a bare
 * "TODO": an empty value renders as a silently missing paragraph, and a
 * "TODO" is indistinguishable from the several hundred legitimate ones in a
 * codebase. This one cannot be mistaken for copy by a reader, a reviewer, or
 * a grep, and `forSheltersPlaceholdersRemaining()` counts it.
 */
export const COPY_PENDING = "[COPY PENDING]";

/**
 * R4-2 (`docs/decisions-inbox/docs-r4-decisions-2026-10-06.md`), Oleksii's
 * own Ukrainian, verbatim — held here rather than appended to
 * `uk.about.analytics` yet, because it can't go live while the pre-launch
 * gate still gives a real visitor a second, undisclosed cookie
 * (`docs/observations.md`'s "/pro sentence" section has the full gating
 * decision). `apps/web/src/seo-flags.ts`'s `assertAnalyticsCopyMatchesGateState`
 * checks for this exact string, not a loose substring, so that a reworded or
 * partial version of the sentence still trips the tripwire. When this lands,
 * append this constant to `uk.about.analytics` directly — `+ " " +
 * PENDING_R4_2_ANALYTICS_SENTENCE` or equivalent — rather than retyping the
 * text, so the landed sentence and this constant can never drift apart.
 */
export const PENDING_R4_2_ANALYTICS_SENTENCE =
  "Людині, яка шукає тварину, сайт ставить одне кукі — і тільки після першої дії: " +
  "«Не зараз», «Запитати» чи «Написати». У ньому немає імені чи номера телефону, лише " +
  "випадковий ідентифікатор: щоб режим «по одній» пам'ятав, кого ви вже бачили, а сайт — " +
  "чиї контакти ви вже відкрили. Він перестає діяти через 7 днів без візитів або через 30 " +
  "днів у будь-якому разі.";

export const uk = {
  // --- 01 First run — docs/design/README.md:427. Was a band above the
  // gallery grid (FirstRunBand.tsx); removed in Phase D (O-3,
  // docs/observations.md) as redundant with the filter rail and result
  // count. `promise` survives as the root layout's og:description only —
  // see that section's amendment note ---
  firstRun: {
    /**
     * Rewritten for the gallery-first course correction — "Гортайте, щоб
     * подивитися" (swipe to see) named the deck as the way to look at
     * animals, which stopped being true the moment the gallery became the
     * primary surface. "Перегляньте список" (browse the list) named what
     * was, at the time, right below the band: the gallery grid itself. Now
     * link-preview copy only, but still an accurate invitation to the page
     * it describes.
     */
    promise:
      "Тварини з перевірених притулків Київщини. Перегляньте список і подивіться, кого шукає дім.",
  },

  /**
   * Phase D (`docs/build-plan.md`'s D-2) — relevant only while
   * `REGISTRY_HAS_NO_REAL_SHELTERS` (`apps/web/src/seo-flags.ts`) is true,
   * i.e. today, on production. Both keys confirmed empty of `COPY_PENDING`
   * by `copy-status.test.ts`, same pattern as `forShelters` below.
   *
   * Provenance: drafted by Claude from an English sense; Oleksii selected
   * these from offered options on 2026-09-05.
   *
   * Renamed 2026-09-06 — the two keys previously named `promise` and
   * `bannerNotice` described each other's contents, not their own: the long
   * sentence below (a notice shown in the link-preview banner a shared URL
   * produces) was called `promise`, mirroring `firstRun.promise` above by
   * habit rather than by what it actually is; the short deck string (a
   * plain label, not a notice) was called `bannerNotice`. `bannerNotice`
   * now names the actual banner notice; `deckLabel` names the actual deck
   * label.
   */
  demo: {
    /**
     * Root layout's `description`/`og:description` default in place of
     * `firstRun.promise` (`app/layout.tsx`) — the link-preview text anyone
     * sharing a URL from this deploy actually sees, while the registry
     * holds no real shelters. As metadata, a link preview is free-flowing
     * text, not a fixed-width UI slot, so there was no truncation budget to
     * fit like `deckLabel` below has. **That stopped being the whole story
     * 2026-09-10** — see the correction below: the two visible render sites
     * this string gained *do* sit inside a real container width, and do
     * have a budget, just not a single-line one. They wrap instead of
     * truncating; `site-header.harness.ts` asserts `scrollWidth <=
     * clientWidth` at 320px specifically so a future `truncate` (which
     * would clip most of the sentence) fails loudly rather than silently.
     *
     * Scoped, Option B (2026-09-06, see `docs/observations.md`): `/prytulkam`
     * and `/pro` override this root default with their own existing opening
     * sentences instead of inheriting it — this disclosure was never meant
     * to reach those two specifically, only the surfaces that actually show
     * fabricated animals/shelters (the gallery, the deck, and the detail
     * page inherit or set this).
     *
     * **Correction, 2026-09-10 (Oleksii, then the reviewer) — also renders
     * visibly, not only as metadata.** Until this date, this string only
     * ever reached `<meta>` tags — invisible to a visitor who simply opens
     * the page rather than sharing its link. `tvaryny/page.tsx` (the
     * gallery) and `AnimalDetailScreen.tsx` (the detail page — the one
     * `/prytulkam` itself tells a shelter to expect shared into Telegram)
     * now both render this same sentence visibly in the page body too,
     * gated on the same `REGISTRY_HAS_NO_REAL_SHELTERS` flag. One string,
     * two independent render sites plus the metadata swap above — not a
     * new sentence for the visible case.
     */
    bannerNotice: "На сайті поки немає справжніх притулків — усі картки тут демонстраційні.",
    /**
     * The deck header's compact label (`DeckScreen.tsx`) — replaces only
     * `filtersLabel`. The position count stays (Oleksii, D-1: demo mode is
     * the whole testing period, a deck missing the count for weeks is not
     * the deck being tested); the progress bar is hidden unconditionally
     * whenever this label shows, to give it the room the bar would
     * otherwise take (D-1's degrade order — the count alone already
     * answers README.md:597-600's "otherwise invisible" argument).
     *
     * Real width budget was measured before this landed: tightest at 320px,
     * ~107px available, safely fits up to ~12 Cyrillic characters. «Демо»
     * (4 characters) is nowhere near that ceiling at any asserted viewport.
     */
    deckLabel: "Демо",
  },

  // --- Screen 02 · Feed / deck ---
  feed: {
    filtersLabel: "Фільтри",
    /** Desktop gallery header, full phrase — docs/design/README.md "Screens" > "Gallery." */
    enterDeck: "Гортати по одній",
    /** Mobile sticky-bar short form, same destination — "sticky bottom bar «Фільтри · N / Гортати»." */
    enterDeckShort: "Гортати",
    /** The deck's own header, exit control — docs/design/README.md "Deck chrome and the mode switch." */
    backToList: "← До списку",
    /** Screen-reader announcement on entering the deck, template: "Тварина {position} з {total}." */
    deckEntryAnnouncement: "Режим по одній. Тварина {position} з {total}.",
  },

  // --- Screen 03 · Filters ---
  filters: {
    title: "Фільтри",
    city: "МІСТО",
    species: "ВИД",
    speciesDogs: "Собаки",
    speciesCats: "Коти",
    size: "РОЗМІР",
    sizeSmall: "Малий",
    sizeMedium: "Середній",
    sizeLarge: "Великий",
    age: "ВІК",
    ageBaby: "Малюк",
    ageYoung: "Молодий",
    ageAdult: "Дорослий",
    ageSenior: "Літній",
    /** Designer round 1 (S3): the fur group, his text (2026-10-20). */
    coat: "Шерсть",
    coatShort: "Короткошерсті",
    coatLong: "Довгошерсті",
    /**
     * Template: "Підходить {count} {animalWord}. Притулків у цьому місті —
     * {shelterCount}." `{animalWord}` is pre-pluralized by the caller
     * (`pluralizeUk(count, uk.filters.animalWord)`) — the template cannot
     * pick the right Ukrainian noun form itself, only compose around it.
     * "Притулків" is a fixed label form here (a count-value pair, "Тварин: 12"
     * in sentence form), not an embedded count-noun phrase, so it never
     * varies with `shelterCount`.
     */
    resultCount: "Підходить {count} {animalWord}. Притулків у цьому місті — {shelterCount}.",
    /**
     * The sheet's `resultCount` above is docs/design/README.md's own screen
     * 03 copy, written for its own example (МІСТО constrained to one city —
     * "Притулків у цьому місті" only means something when there is a
     * "цьому місті"). With no city selected — "Уся Київщина" is the sheet's
     * own default — `shelterCount` spans the whole oblast, and the sentence
     * would claim a specific city that isn't selected. This is that case:
     * same verb and register as `resultCount`, the rail's locative shelter
     * phrasing instead of the false claim.
     */
    resultCountAnyCity: "Підходить {count} {animalWord} у {shelterCount} {shelterWord}.",
    reset: "Скинути",
    /** Template: "Показати {count}" */
    showCount: "Показати {count}",
    /**
     * docs/design/README.md, "Rail, count, sort": "Знайдено 34 тварини у 7
     * притулках" — a different sentence from `resultCount` above, not the
     * same one reused, matching the design's own distinct copy for the
     * rail (≥1024) versus the sheet (<1024). `{shelterWord}` varies only
     * between "притулку" (1) and "притулках" (2+) — Ukrainian locative
     * plural doesn't distinguish few/many the way the nominative animal
     * count does.
     *
     * `{animalWord}` here is `animalWordAccusative`, not `animalWord`: the
     * impersonal "Знайдено" governs the accusative, so one result reads
     * "Знайдено 1 тварину", while the sheet's "Підходить 1 тварина" is
     * nominative. The two sentences differ only at the `one` form (1, 21,
     * 31…) — which is exactly why one shared list would look right in the
     * design's own 34-result example and be wrong on the day a filter
     * matches a single animal.
     */
    resultCountRail: "Знайдено {count} {animalWord} у {shelterCount} {shelterWord}",
    animalWord: { one: "тварина", few: "тварини", many: "тварин" },
    animalWordAccusative: { one: "тварину", few: "тварини", many: "тварин" },
    shelterWordLocative: { one: "притулку", few: "притулках", many: "притулках" },
    sortLabel: "Сортування",
    sortFreshest: "Спочатку найсвіжіші картки",
    sortLongestWaiting: "Найдовше чекають",
    allCities: "Уся Київщина",
    railFooter:
      "Немає фільтра «тільки свіжі картки». Тварина, про яку давно не писали, все одно чекає.",
  },

  // --- Swipe affordances ---
  swipe: {
    left: "Не зараз",
    right: "Запитати",
  },

  // --- Action buttons ---
  actions: {
    notNow: "Не зараз",
    write: "Написати",
    writeShelter: "Написати притулку",
    /**
     * Oleksii's Phase D decisions (the not-a-judgement notice — not
     * build-plan.md's D-3 row, an unrelated robots-metadata task):
     * `docs/standing-constraints.md`'s "The swipe is filtering, not
     * judging" is a standing product rule, and
     * the only place it was ever stated — the sentence used to close
     * `firstRun.disclaimer`, deleted with `FirstRunBand` — was gone with no
     * replacement. Phase D's interim home was the detail page, directly
     * under the `notNow`/`writeShelter` pair — R2 (Phase R,
     * `docs/build-plan.md`) moves it to its permanent one, the deck
     * itself (`SwipeDeck.tsx`), and removes it from the detail page. Not
     * a duplication: the rule this sentence states is about what a
     * *swipe* decision means, and the detail page's own «Не зараз» never
     * was a swipe — it's a plain link back to the gallery
     * (`AnimalDetailScreen.tsx`'s own comment on that button), recording
     * no exclusion and needing no reassurance about one.
     *
     * Recovered verbatim, not newly written — the original disclaimer's own
     * closing sentence, «просто» included. An earlier pass here dropped
     * «просто» as an unapproved edit; restored because this sentence is
     * Oleksii's existing shipped copy and needs no fresh approval at all
     * once it's reproduced exactly, which is the whole point of recovering
     * it rather than redrafting it.
     */
    notAJudgementNotice: "«Не зараз» — це просто фільтр, а не оцінка тварини.",
  },

  // --- Freshness ---
  freshness: {
    /** Rendered by Intl.RelativeTimeFormat('uk'), not this string. */
    updatedAgo: "Оновлено {days}",
    /**
     * «· дата автоматична» deleted 2026-10-15 (VH-Q2, Oleksii): nothing fills a
     * date into the shelter's sentence, and the design drops `{date}` (VH-Q1).
     */
    attribution: "Слова притулку",
  },

  // --- Medical ---
  medical: {
    heading: "Медичний стан",
    unknown: "Не записано",
    inProgress: "У процесі",
    /**
     * Q5 of the K3 sheet (Oleksii, 2026-10-17, verbatim: "«реєстр» is allowed
     * ONLY as the explicit name of the state register: «державний реєстр
     * тварин». Update the public keys too"). Both name the state animal
     * registry, which really is a state service.
     */
    registryConfirmed: "Підтверджено державним реєстром тварин",
    shelterDeclared: "Слова притулку",
    rabies: "Сказ",
    vaccination: "Комплексне щеплення",
    spayNeuter: "Стерилізація",
    registry: "Державний реєстр тварин",
  },

  // --- Location ---
  location: {
    heading: "Де живе",
    /** Template: "м. {city} · у домі волонтерки" */
    fostered: "Живе у волонтерки, м. {city}. Точної адреси ми не знаємо і не показуємо.",
    noMapExplanation:
      "Карти тут немає: ми не знаємо точної адреси і не вигадуємо її. Місце зустрічі узгодите з притулком.",
    /**
     * The detail screen's own "Де живе" block (D1/D2) — a short first line,
     * `noMapExplanation` above as the second. Distinct from `fostered`
     * above, which is one longer combined sentence for a different slot
     * (the gallery card's meta line uses `cardMeta.fosteredHousing`/
     * `atShelter` instead, also separate from both of these).
     */
    lineFostered: "м. {city} · у домі волонтерки",
    lineAtShelter: "м. {city}",
  },

  // --- Detail screen (04) ---
  detail: {
    /** Template: "Перевірений вручну · {years} на Opika" — brand string lives here, not in domain */
    shelterVerifiedYears: "Перевірений вручну · {years} на Opika",
    donateShelter: "Підтримати притулок",
    /** Template: "← Усі тварини у {city}" — the mock's D1 desktop back link (frame D1). */
    backToListIn: "← Усі тварини у {city}",
    /**
     * The subtitle line's species word — "Метис · 2 роки · середня" in the
     * mock, but "Метис" (mixed breed) has no domain field at all (`Animal`
     * has `species`, not `breed`); no filter-chip label works either,
     * those are plural ("Собаки"/"Коти" for the rail). Singular, common
     * gender regardless of `sex` — same simplification `cardMeta`'s own
     * age words already make (documented there as a flagged, not fixed,
     * gap), not a new one introduced here.
     */
    speciesDog: "Собака",
    speciesCat: "Кіт",
    /** DR1 (S3), his text: the fact's own words, not the filter labels («Короткошерсті»);
     * the value matches the kabinet form's. No row at all when fur isn't recorded. */
    coatLabel: "Шерсть",
    coatShort: "Коротка",
    coatLong: "Довга",
    notFound: {
      eyebrow: "НЕ ЗНАЙДЕНО",
      title: "Цієї картки більше немає.",
      body: "Тварини вже немає на сайті або посилання застаріле. Це не помилка — просто картки тут більше немає.",
      action: "Усі тварини",
    },
    /**
     * O-10 (`docs/observations.md`) + critique C6 — accessibility copy for the
     * photo gallery's dot indicator (mobile) and thumbnail strip (desktop).
     * Placeholders since D6-3; his Ukrainian since PR 6 (Q-A, 2026-10-19).
     * `{n}` is the photo's 1-based position.
     */
    photoGalleryLabel: "Фотографії тварини",
    photoGalleryDot: "Фото {n}",
    photoGalleryThumbnail: "Переглянути фото {n}",
  },

  // --- Contact reveal (05) ---
  reveal: {
    /** Template: "Ви запитали про {name}." */
    youAskedAbout: "Ви запитали про {name}.",
    title: "Ось як зв'язатися з притулком.",
    subtitle:
      "Притулок не знає про цей запит, поки ви не напишете самі. Нічого не сталося автоматично.",
    /**
     * Template: "Контакти збережено такими, якими вони є сьогодні · {date}"
     * ({date} is the first reveal's). Shown only under the first-reveal
     * record's contacts, never under the shelter's current ones (K4-B5,
     * `contactsFootnoteOf` in `ContactRevealDialog.tsx`; inbox K4-Q11).
     */
    contactsFootnote: "Контакти збережено такими, якими вони є сьогодні · {date}",
    meetingPlace: "місце узгодите в листуванні",
    reflectionHeading: "Перед тим як писати — три речі, про які варто подумати спокійно:",
    reflection1: "Це 10–15 років разом, а не вихідні.",
    reflection2: "Корм, ветеринар, перевезення — щомісячні витрати.",
    reflection3: "Чи згодні всі, хто живе з вами.",
    writeTelegram: "Написати в Telegram",
    /**
     * Not every shelter's primary contact channel is Telegram — real seed
     * data has phone-only shelters, and the mock's own R1/R2 frames only
     * ever show the Telegram example. Found by looking at a real rendered
     * reveal, not assumed: a phone-only shelter left this dialog with no
     * primary action at all, only "Повернутися до галереї".
     */
    call: "Подзвонити",
    writeEmail: "Написати листа",
    /**
     * "Опика Registry Frames.dc.html" (R1/R2) says «Повернутися до
     * галереї» verbatim — corrected from an earlier "до стрічки" here,
     * which predates the gallery-first course correction and never
     * matched the mock. `docs/standing-constraints.md`: "when a mock
     * exists, open the mock file."
     */
    backToFeed: "Повернутися до галереї",
  },

  // --- My reveals (06) ---
  myReveals: {
    title: "Мої запити",
    deviceOnly: "Зберігається лише на цьому пристрої. Ми не знаємо, хто ви.",
    /** Template: "Притулок каже: {name} уже вдома." */
    resolved: "Притулок каже: {name} уже вдома.",
  },

  // --- Exhausted (07) ---
  exhausted: {
    title: "Це всі, хто зараз підходить.",
    body: "Притулків тут небагато, тому список короткий — це нормально.",
    newAnimals:
      "Нові тварини з'являються, коли притулки оновлюють картки. Зазвичай раз на кілька тижнів.",
    /**
     * Template: "Уся Київщина (+{count})"
     * Deviation from the original handoff's "Додати сусідні міста" (add
     * neighbouring cities) — that promised real geographic adjacency the
     * schema doesn't have. Reasoning: docs/gallery-contract-decisions.md §4.
     */
    addNearbyCities: "Уся Київщина (+{count})",
    changeFilters: "Змінити фільтри",
    reviewAgain: "Переглянути ще раз спокійно",
    footnote:
      "Якщо ви знаєте притулок на Київщині, якого тут немає — напишіть нам, і ми з ним поговоримо.",
  },

  // --- Error states (08) ---
  errors: {
    offline: {
      eyebrow: "БЕЗ ЗВ'ЯЗКУ",
      title: "Зараз немає інтернету.",
      action: "Спробувати ще раз",
    },
    loadFailed: {
      eyebrow: "НЕ ЗАВАНТАЖИЛОСЯ",
      title: "Щось не спрацювало на нашому боці.",
      body: "Це не ваша помилка і не помилка притулку.",
      action: "Оновити",
    },
    sessionExpired: {
      eyebrow: "СЕСІЯ ЗАВЕРШИЛАСЯ",
      title: "Ми почали стрічку заново.",
      action: "До стрічки",
    },
    /**
     * `animals.reveal`'s own `RATE_LIMITED` (`apps/web/src/api/reveal-rate-limit.ts`)
     * — 30 distinct shelters revealed in 24h. Oleksii's own words, 2026-09-13,
     * given as the reveal dialog's honest replacement for the generic
     * `loadFailed` copy it rendered for every error including this one
     * (`docs/decisions-pending-review.md` has the fuller R3 history — this
     * was the one remaining blocker on PR #55). No `eyebrow` or `action`:
     * neither was given, and inventing either would be exactly the
     * "honest copy for it isn't mine to write" line this row was blocked
     * on in the first place. No retry action by design, not omission —
     * `ContactRevealDialog.tsx`'s `RevealError` renders no retry button for
     * this reason specifically, since retrying before tomorrow cannot
     * succeed.
     */
    rateLimited: {
      title: "Ви відкрили контакти багатьох притулків сьогодні.",
      body: "Наступні — завтра.",
    },
    photoMissing: {
      placeholder: "Фото немає — притулок ще не надіслав",
    },
  },

  // --- Reserved badge ---
  reserved: {
    badge: "Уже домовляються",
    /** The gallery card's tablet (600-1023) layout, shown instead of `badge` when the compact horizontal card has less room — docs/design/README.md, "The Gallery" > "Card". */
    badgeShort: "Домовляються",
    action: "Стати другим у черзі",
  },

  // --- Resolved card variant (docs/design/README.md, "The gallery card" > "Resolved") ---
  // Template: "Притулок каже: {name} уже вдома." Replaces the freshness row
  // entirely on a resolved card — never rendered by any live query today,
  // see AnimalCardProps["resolved"]'s own comment for why.
  resolved: {
    sentence: "Притулок каже: {name} уже вдома.",
  },

  // --- Documents ---
  documents: {
    chipPresent: "Чип є",
    rabiesPresent: "Сказ є",
  },

  // --- Animal card meta line ("молодий · мала · живе у волонтерки, м. Бровари") ---
  // A separate set from filters.age*/size*, which label standalone filter
  // chips rather than sit inline in a sentence, and so aren't held to
  // agreeing with anything around them.
  //
  // Carried over unchanged from the pre-gallery SwipeCard implementation:
  // each bucket has one fixed word form, not one per Animal.sex, so a
  // grammatical-gender mismatch with the size word (feminine) or with a
  // female animal (every age word here is masculine: "молодий," not
  // "молода") is a pre-existing gap this relocation preserves rather than
  // introduces. Flagged, not fixed — fixing it is a copy decision, not a
  // relocation one.
  cardMeta: {
    ageBaby: "малюк",
    ageYoung: "молодий",
    ageAdult: "дорослий",
    ageSenior: "літній",
    /**
     * The age word for a female animal (Q9, Oleksii 2026-10-18, verbatim: "female: «малючка» /
     * «молода» / «доросла» / «літня»"). A male animal and one whose sex is «Не записано» keep the
     * words above. Filter chips (`filters.age*`) stay as they are: "they name categories, not one
     * animal".
     */
    ageBabyFemale: "малючка",
    ageYoungFemale: "молода",
    ageAdultFemale: "доросла",
    ageSeniorFemale: "літня",
    sizeSmall: "мала",
    sizeMedium: "середня",
    sizeLarge: "велика",
    /**
     * Templates: "{city}" -> "м. {city}". The gallery card's terse
     * housing+city fragment (docs/design/README.md, "The Gallery" > "Card"),
     * not the fuller sentence in location.fostered, which carries the
     * detail page's own address disclaimer the card has no room for.
     */
    atShelter: "м. {city}",
    fosteredHousing: "живе у волонтерки, м. {city}",
  },

  // --- Pagination footer (E3, re-skinned V2) ---
  // `docs/design/Opika Registry System.dc.html`'s pagination row (lines
  // 189-195) has the literal values: prev/next are visible-text buttons
  // ("← Назад" / "Далі →"), not glyph-only controls, and the number group
  // ends with a "з N" count. `prev`/`next` below are the VISIBLE button
  // text, not a separate aria-label — an aria-label that didn't contain
  // that text would be a WCAG 2.5.3 accessible-name mismatch, an earlier
  // draft of this component had exactly that bug. Unlike the V1 mock this
  // superseded, V2's own pagination row carries no monospace styling on
  // the numbers at all — they render in the same e-Ukraine (`font-rg`)
  // as the rest of the row, no IBM-Plex-Mono exception to reason about.
  pagination: {
    navLabel: "Сторінки",
    prev: "← Назад",
    next: "Далі →",
    /** Template: "Сторінка {page}" — each numbered link's accessible name. */
    pageLabel: "Сторінка {page}",
    current: "поточна",
    /** Template: "з {total}" — docs/design's own count label, after the numbers. */
    ofTotal: "з {total}",
    /**
     * Above the grid, visible only on keyboard focus. Dropping E2.5's
     * roving tabindex means every card is a real Tab stop — 24 of them —
     * so this is the shortcut past them, not decoration.
     */
    skipLink: "Перейти до сторінок",
  },

  // --- Gallery no-match (B4), docs/design/README.md, "Gallery states" > "No match" ---
  // The heading and reassurance are the mock's own literal, filter-value-
  // independent copy. The mock's middle sentence ("У Броварах 7 притулків,
  // і сьогодні серед середніх собак вільних немає.") names one specific
  // filter combination as an example — generalising it to arbitrary filter
  // combinations is real sentence-grammar work with no existing groundwork
  // (unlike the relaxation counts themselves, `gallery.relaxationCounts`
  // already built and tested in E2), so it's not reproduced here; the two
  // suggestion buttons below carry the actual per-filter numbers instead.
  noMatch: {
    heading: "Під ці фільтри зараз нікого немає.",
    reassurance: "Це не помилка пошуку.",
    /** Template: "Прибрати «{dimension}» ({animalWord})" — one button per
     * `GalleryRelaxation` the caller returns, `{dimension}` already
     * resolved to a group label, `{animalWord}` pre-composed with
     * `pluralizeUk` the same way `filters.resultCount` is. */
    removeDimension: "Прибрати «{dimension}» ({animalWord})",
    /** Cities relaxation is "drop the city filter entirely" (packages/domain's
     * `relaxDimension`), not literally "add neighbouring cities" — the
     * mock's own flavour text for its one example, kept generic to describe
     * what the button actually does for any city selection. */
    showAllCities: "Показати всі міста ({animalWord})",
    /** Template: "+{count} тварин" — the number every suggestion names,
     * never a suggestion with none (docs/design/README.md: "no suggestion
     * without a number"). */
    additionalAnimals: "+{count} {animalWord}",
    /** The fur dimension's own suggestion, his text (DR1, 2026-10-20): a
     * whole template of its own, not `removeDimension` with a fur label. */
    relaxCoat: "Будь-яка шерсть: +{count}",
    /** Static, filter-value-independent — the mock's own closing caption
     * below the two suggestion buttons (`Opika Registry System.dc.html`'s
     * B4 frame), unlike the middle sentence above which names one specific
     * example combination. */
    suggestionExplainer:
      "Кожна пропозиція називає, скільки тварин вона додасть. Порожній екран не питає " +
      "«спробуйте інше» без числа.",
  },

  // --- Gallery error (E4, V2 mock frames E1/E2 — copy adapted, see
  // docs/design/README.md's note at that section for why) ---
  galleryError: {
    eyebrow: "НЕ ЗАВАНТАЖИЛОСЯ",
    /** Neutral on purpose: this same component renders both a cold first
     * visit to /tvaryny AND a failed next-page navigation from deep in the
     * result set (this architecture has no separate "next-page error" —
     * see docs/design/README.md's note). The mock's own heading, "Список
     * не відкрився" ("the list didn't open"), presumes nothing has loaded
     * yet — wrong the moment page 3 was showing a second ago. */
    title: "Сторінку не вдалося завантажити.",
    /** Also neutral: the mock's body claims "адреса сторінки не
     * змінилася" ("the page address hasn't changed"), true only for a
     * first-load failure — a failed next-page click already changed the
     * address to the page that failed to load. Dropped rather than
     * asserted uncertainly. */
    body: "Це не ваша помилка і не помилка притулку. Ваші фільтри збережені.",
    action: "Спробувати ще раз",
    /**
     * E5: not the mock's own frame — a real escape hatch, added after
     * finding the mock's filter rail wouldn't be one (see this key's own
     * doc comment in error.tsx). A bare `/tvaryny` link, no params, is the
     * cheapest request this app can make — the one query most likely to
     * succeed when a filtered one just failed for a backend reason a
     * different filter combination wouldn't fix anyway.
     */
    showAll: "Показати всіх тварин",
  },

  // --- Gallery out-of-range page notice (E4, V2 mock frames P1/P2) ---
  outOfRangePage: {
    /** Template: "Сторінки {requested} не існує — тут лише {total}." */
    notFound: "Сторінки {requested} не існує — тут лише {total}.",
    /** Template: "Показуємо сторінку {total} — останню. Нічого не
     * загубилось." Numerals, not the mock's spelled ordinal ("десяту") —
     * Ukrainian ordinal declension for an arbitrary N is real grammar work
     * with no groundwork in this codebase (same class of gap as
     * `noMatch`'s own dropped middle sentence, docs/design/README.md
     * records this one too), so a numeral phrasing avoids asserting an
     * ordinal form that might be wrong. */
    showingLast: "Показуємо сторінку {total} — останню. Нічого не загубилось.",
    backToFirst: "На першу сторінку",
  },

  // --- Footer ---
  footer: {
    /** e-Ukraine's CC BY 4.0 attribution requirement — the user-reachable
     * credit `apps/web/src/app/fonts/e-ukraine/LICENSE.txt` and
     * `docs/design/README.md`'s V2 definition-of-done both call for.
     * Verbatim text from the licence file; do not paraphrase. */
    fontCredit:
      "Шрифт e-Ukraine — Міністерство цифрової трансформації України (thedigital.gov.ua/fonts), Дмитро Растворцев / Fedoriv, CC BY 4.0.",
  },

  /**
   * Phase T. The site-wide header's own links, shared with the gallery
   * footer — `footer.about` used to hold this same string separately, which
   * meant one concept in two keys the moment the header started rendering
   * it too.
   *
   * Not in `docs/design/README.md`'s own header content list (line 337 gives
   * mark + wordmark, city chip, «Мої запити · N», «UA / EN», «Гортати по
   * одній») — composed for Phase T to close the critique's E5/E1/E3, and
   * recorded as composition rather than specification.
   */
  nav: {
    about: "Про проєкт",
    forShelters: "Для притулків",
  },

  /**
   * "«Про проєкт» page, no mock — a volunteer deciding whether Opika is
   * legitimate looks for exactly this and finds nothing without it.
   * Four required subjects, each its own paragraph: who's behind this,
   * that it's free now and stays free, that the platform never touches
   * money, what happens to a shelter's data, how to get in touch.
   */
  about: {
    title: "Про проєкт",
    intro:
      "Opika — сайт, де тварини з притулків Київщини шукають дім. Я роблю його сам, поза роботою. Немає команди, немає інвестора — є одна людина, яка вважає, що знайти дім для тварини не повинно залежати від того, чи вміє притулок вести застарілий Excel-файл.",
    free: "Сайт безкоштовний для притулків сьогодні і лишиться безкоштовним. Жодних платних тарифів, жодного «спробуйте безкоштовно перші три місяці» — якщо це колись зміниться, кожен притулок дізнається про це заздалегідь, а не постфактум.",
    money:
      "Opika ніколи не бере участі в грошах: немає прийому платежів, немає комісії, немає збору донатів через платформу. Кнопка «Підтримати притулок» веде на власну сторінку притулку в іншому сервісі (наприклад, monobank) — сайт лише показує посилання, гроші йдуть напряму, і видно, куди саме.",
    /**
     * His PR 6 text (pr6-copy-uk.md §1.5), every claim checked against code:
     * - «бачить лише місто»: every adopter-facing view carries the city only
     *   (`PublicCityLocationViewSchema`, EM-Q10/EM-D1,
     *   `pre-reveal-location.test.ts`);
     * - the kabinet sentences (KH-C1, row 90): the invite's `auth_user` row
     *   (name, email), Better Auth's `user_agent` with `disableIpTracking` plus
     *   HMAC-only rate-limiter keys (`apps/web/src/api/rate-limit-key.ts`,
     *   EM-Q11), and the `auth-cleanup` cron, every 6 hours on Pro (KH-Q12,
     *   his VP-T1 answer): a link's 15 minutes plus two gaps, should one run
     *   be skipped, is 12 h 15 min, inside «протягом доби». The schedule is
     *   read from `apps/web/vercel.json` and tied to this sentence by
     *   `apps/web/src/kabinet/auth-cleanup.test.ts`, so neither changes
     *   alone; Vercel's own request logs are outside the sentence, by his
     *   scoping (EM-L1);
     * - history (his Q6): every kabinet write appends a `ShelterHistoryEntry`
     *   with its actor; profile entries keep previous and next, animal edits
     *   field names only (K-Q7), never adopter data
     *   (`history-no-engagement.test.ts`); deleted only with the shelter's
     *   record (`demo:remove --shelter`); «Ще шукає» / «Ще домовляються» and
     *   their undo write no history line (S1, `handlers.test.ts` "confirm and
     *   undo record nothing") and show as the card's date (his Q1 sentence);
     * - photos: kabinet uploads are re-encoded with no metadata (PR 3, the GPS
     *   canary test) at random keys (K-Q2, his Q7); a removed photo stops
     *   showing and its file is deleted by hand in Cloudflare (P8, his Q5).
     * `copy-status.test.ts` pins it.
     */
    data: "Дані, які вносить притулок — адреса, контакти, картки тварин, — належать притулку. Точна адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише місто. Притулок може попросити видалити свій запис у будь-який момент. Для притулків із доступом до кабінету сайт зберігає імʼя та адресу пошти адміністратора — щоб надсилати посилання для входу, — а також технічний запис про браузер і пристрій, з якого виконано вхід. Для адміністраторів кабінетів притулків зберігається лише незворотний хеш пароля, а не сам пароль. IP-адреси не зберігаються. Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90 днів, після чого треба увійти знову. Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом доби. Кожна зміна в кабінеті записується в історію притулку: коли її зроблено і хто — адміністратор притулку чи я. Натискання «Ще шукає» чи «Ще домовляються» в історію не потрапляють — їх видно з дати на картці. Для профілю зберігаються попереднє й нове значення, для карток тварин — лише те, які поля змінено. Про людей, які шукають тварину, в історії нічого немає. Історія видаляється разом із записом притулку. Фото, завантажені в кабінеті, зберігаються без даних про місце зйомки, за адресами, які неможливо вгадати. Фото, прибране з картки, більше не показується, а сам файл я видаляю на прохання притулку.",
    analytics:
      "Сайт збирає базову статистику відвідувань — скільки людей заходить і наскільки швидко працюють сторінки — без реклами.",
    contact: "Зв'язатися з розробником: {contact}",
  },

  /**
   * «Для притулків» (Phase T) — the first surface in this project written
   * for shelters rather than adopters, and the page an outreach message
   * links to.
   *
   * ⚠ EVERY VALUE BELOW IS A PLACEHOLDER AND MUST NOT SHIP. The Ukrainian is
   * written by the maintainer, from `docs/prytulkam-argument.md`'s structure
   * — *from* it, not translated from the English hints here. Translating
   * sentence-by-sentence is how calques get in, and the copy critique (D3)
   * already found one construction in this catalogue that reads translated.
   *
   * `forSheltersPlaceholdersRemaining()` (packages/i18n) counts what is left
   * and `messages.test.ts` reports it, so the number is visible rather than
   * discovered later. The argument document is the spec for what each key
   * has to establish and — for `whyThatSentence`, the hardest one — what it
   * must not sound like.
   */
  forShelters: {
    title: "Для притулків",
    /**
     * Real copy, not placeholders — promoted from the section names in
     * `docs/prytulkam-argument.md`, which were already phrased as the
     * reader's own questions rather than as labels. That phrasing is the
     * point: «Вартість» / «Контакти» / «Верифікація» would turn a letter
     * into a marketing page, which is the one thing this page is carefully
     * not being.
     *
     * They exist because linear reading is not the only use case. Someone
     * comes back a week later to re-check what was said about money before
     * committing, and without headings they re-read eleven sections or give
     * up.
     *
     * Two were adjusted from the draft's own labels to keep the question
     * form consistent: §5 was «Гроші» and §8 was «Навіщо те речення».
     */
    headings: {
      whatThisIs: "Що це",
      cost: "Скільки це коштує",
      whatHappensToAnimals: "Що буде з вашими тваринами",
      whoContactsWhom: "Хто кому пише",
      money: "Що з грошима",
      verification: "Що означає «перевірений»",
      whatToPrepare: "Що підготувати",
      whyThatSentence: "Навіщо те речення про оновлення",
      whenAnimalFindsHome: "Коли тварина знайшла дім",
      howToLeave: "Якщо ви захочете піти",
      whoIsBehindThis: "Хто це робить",
      howToStart: "Як почати",
    },
    /** §1 — one sentence. What this is. Nothing else. */
    whatThisIs:
      "Opika — сайт, де тварини з перевірених притулків Київщини шукають дім, а кожен ваш підопічний отримує власну сторінку.",
    /** §2 — free now and later. Early, because it is what they are bracing for. */
    cost:
      "Це безкоштовно. Не «безкоштовно перші три місяці» і не «безкоштовно, поки ми не виростемо» — " +
      "просто безкоштовно, сьогодні і далі. Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не з рахунку.",
    /**
     * §3 — a page each, shareable, and the ordering rule.
     *
     * The third paragraph is a description of mechanism, not a promise about
     * the future, and that is the point: a promise fails silently, a
     * description fails loudly the moment someone reading the ordering code
     * sees the page contradicting it. See `docs/standing-constraints.md`,
     * "Commitments the «Для притулків» page makes", commitment 1.
     *
     * R4-1 (`docs/decisions-inbox.md`), 2026-10-06: the second paragraph is
     * commitment 8's restored, fuller sentence, replacing the narrowed
     * version R1 shipped on 2026-09-09 — both «Не зараз» (`pass`, expires
     * after `DEFAULT_SEEN_SET_POLICY.reshowAfterDays`, 30) and «Запитати»
     * (`interested`, excluded permanently) are named, per
     * `packages/domain/src/discovery/seen-set.ts`'s own `stillExcludes`,
     * rather than only the weaker "doesn't re-serve what you skipped" the
     * English sense in `docs/observations.md` originally drafted. Oleksii's
     * own Ukrainian, verbatim — not drafted or polished here.
     */
    whatHappensToAnimals:
      "Кожна тварина отримує власну сторінку з фотографіями і власною адресою — її можна надіслати " +
      "в Telegram, показати знайомим, залишити під дописом.\n\n" +
      "Тварин можна дивитися списком або по одній.\n\n" +
      "Список завжди показує всіх. У режимі «по одній» людина більше не бачить тих, на кого вже " +
      "натиснула «Не зараз» чи «Запитати», — це пам'ять лише її пристрою, і після «Не зараз» " +
      "тварина згодом з'являється знову. Від людини не ховається нічого, крім того, що вона " +
      "сховала сама.\n\n" +
      // ¶4: his PR 6 text (pr6-copy-uk.md §1.6), «оновлено» meaning the
      // confirmation date, as K-Q14 (a) keeps it on the cards.
      "Порядок у списку — за датою: спочатку ті, чиї картки оновлено найновіше, або ті, хто чекає найдовше; людина обирає сама. У режимі «по одній» до дати додається повнота картки — та, де є фотографії, опис і відмітка про щеплення, показується раніше. Це все, що впливає на порядок.\n\n" +
      "Якщо тварину вже комусь пообіцяли, картка лишається на місці з позначкою: домовленості " +
      "зриваються, і тоді краще, щоб її було видно, ніж щоб вона зникла і повернулася.",
    /** §4 — the trust section. The actor is the system, so «Opika», never «я». */
    whoContactsWhom:
      "Людина, яка хоче взяти тварину, пише вам напряму — на той контакт, який ви вкажете. " +
      "Opika не пише за вас, не пише від вашого імені і не спілкується з нею замість вас.",
    /** §4b — no lead queue. Commitment 2; H2 is where this breaks by accident. */
    noObligation:
      "Ви не дізнаєтеся, що хтось дивився картку, поки ця людина сама вам не напише. Немає списку " +
      "заявок, немає непрочитаних, немає нічого, на що треба відповідати. Якщо вам ніхто не " +
      "написав — значить, справді ніхто не написав, і ви нічого не пропустили.",
    /**
     * §5 — the actor is the registry, not a person. The visibility claim is
     * verified: `AnimalDetailScreen` renders `donationHost()` as visible text
     * beside the label, so it holds on a phone with no hover and no status bar.
     */
    money:
      "Сайт не бере і не переказує грошей: ні комісії, ні оплати, ні збору донатів через сайт. " +
      "Якщо у вас є власна сторінка для донатів — банка в monobank, наприклад — на сторінці тварини " +
      "буде посилання на неї, і людина побачить, куди воно веде, ще до того як натисне.",
    /** §6 — checked against DEFAULT_VERIFICATION_POLICY, not against prose. */
    verification:
      "«Перевірений» означає, що вас перевіряла людина. Ось що це означає конкретно.\n\n" +
      "Зареєстрована організація показує ЄДРПОУ, банківські реквізити на ту саму організацію і одну " +
      "незалежну рекомендацію.\n\n" +
      "Незареєстрована ініціатива — а це більшість волонтерських груп — показує візит і дві " +
      "незалежні рекомендації.",
    /**
     * §6b — ends on «Ваш другий номер телефону — не рекомендація», the only
     * sentence that anticipates someone gaming the process. It proves the
     * verification is enforced rather than described; a general version («ми
     * перевіряємо рекомендації на справжність») would read as suspicious where
     * this reads as experienced. It means §6 closes on fraud, which is why §7
     * opening on «потрібно небагато» must stay adjacent to it.
     */
    verificationOpenToVolunteers:
      "«Візит» не означає, що хтось обов'язково приїде. Справжня телефонна розмова, після якої я " +
      "можу переказати, що почув, теж рахується. Рекомендація має бути від когось іншого, ніж ви: " +
      "сусідній притулок, ветклініка, з якою ви працюєте, будь-хто, хто може підтвердити, що ви " +
      "існуєте і робите те, що кажете. Ваш другий номер телефону — не рекомендація.",
    /**
     * §7 — practical, answerable in ten seconds. Not a form. Commitment 6.
     * The last paragraph is his PR 6 text (pr6-copy-uk.md §1.1): from PR 6 a
     * shelter keeps its own animals and profile in the kabinet, and a card it
     * publishes shows at once (K-Q3). The offer to enter the first cards is
     * an `onboard:shelter` run, which adds new animals only (his Q3).
     */
    whatToPrepare:
      "Щоб почати, потрібно небагато:\n\n" +
      "фотографії тварин — справжні файли, а не скріншоти;\n" +
      "кілька речень про кожну: ім'я, приблизний вік, розмір, вдача;\n" +
      "контакт, на який ви справді відповідаєте;\n" +
      "посилання на донати, якщо воно у вас є;\n" +
      "і одне речення про те, як часто ви оновлюєте інформацію — про нього нижче.\n\n" +
      "Фотографії використовуються тільки для сторінок ваших тварин.\n\n" +
      // A1 (row 91, final, Oleksii 2026-10-14): directly before the last
      // paragraph, shipped with the commit that turns production sign-in on.
      "Доступ до кабінету я надсилаю сам — листом на адресу, яку ви мені вкажете.\n\n" +
      "Тварин і профіль притулку ви ведете самі в кабінеті: додаєте картку, публікуєте — і її одразу видно. Якщо тварин багато, на старті можу внести перші картки сам — надішліть список і фото.",
    /**
     * §8 — the section needing the most care. Says what the date IS, never
     * what the feature isn't: pre-empting the objection is what plants it.
     *
     * B1, his PR 6 text (pr6-copy-uk.md §1.3), live with the switch that
     * opens shelter writes: the date is `listing.confirmedAt`
     * (`last_confirmed_at`), set on publish, by «Ще шукає» / «Ще
     * домовляються» (one animal per tap, no bulk) and by a photo change on a
     * card people can see (RH-B7); a text edit never moves it. Each of those
     * is named here, so the sentence can be read literally. See commitment 7.
     */
    whyThatSentence:
      "Людина, яка обирає між двома собаками, ніяк не дізнається, про кого з них писали минулого тижня, а про кого — позаторік. Тому на картці видно, коли ви востаннє підтвердили, що тварина ще шукає дім, а на сторінці тварини — ваше речення про те, як часто ви це робите, вашими словами.\n\n" +
      "Дату ніхто не вписує вручну: вона оновлюється, коли ви публікуєте картку, натискаєте «Ще шукає» чи «Ще домовляються» або змінюєте фото. Правки в тексті дату не змінюють — так вона показує саме те, що обіцяє. Речення пишете ви, коли вам зручно, і можете змінити його будь-коли: «оновлюємо щосуботи», «дзвоніть, ми скажемо точно», «влітку рідше».\n\n" +
      "Саме це робить решту карток вартими довіри. Коли видно, що ви підтверджуєте картки щосуботи, ваше «ця тварина ще шукає дім» означає рівно те, що написано.",
    /**
     * §9 — what a shelter does when an animal finds a home. Commitment 6.
     * ¶1 and ¶3 are his PR 6 text (pr6-copy-uk.md §1.2, ¶3's first sentence
     * from his Q2 answer): the shelter marks it itself with K2's «Уже вдома»
     * (published and reserved cards), the card leaves the gallery and the
     * deck at once, and the kabinet list keeps it as «Удома». ¶2 says «на
     * сайті» since his Q3 answer, so it can't be read as that kabinet list.
     */
    whenAnimalFindsHome:
      "Найважливіше, що ви можете зробити, — позначити, що тварина знайшла дім.\n\n" +
      "Тварина, яка вже вдома, але досі на сайті, — це єдине, що робить усі інші картки " +
      "недостовірними: людина дзвонить, чує «її забрали три місяці тому», і далі не вірить жодній " +
      "картці — ні вашій, ні чужій.\n\n" +
      "Кожна опублікована картка в кабінеті має кнопку «Уже вдома». Після неї картка одразу зникає з галереї та стрічки, а у вашому списку лишається з позначкою «Удома».",
    /**
     * §9b — how to leave. The largest unspoken objection on the page: the
     * first question anyone asks before handing their data to a stranger with
     * a website, and previously unanswered anywhere in eleven sections.
     */
    howToLeave:
      "І якщо ви колись захочете піти — напишіть, і я приберу все: тварин, фотографії, ваш запис. " +
      "Без питань і без умов. Ви нічого не підписували і нічого не втрачаєте.",
    /** §10 — one person. `about.intro`'s framing; the smallness is the credential. */
    whoIsBehindThis:
      "Opika робить одна людина — я, поза основною роботою. Немає команди, немає інвестора, немає " +
      "відділу підтримки: коли ви пишете на цю адресу, відповідаю я.",
    /** §11 — one instruction, and what happens next. `{contact}` filled by the page. */
    howToStart:
      "Напишіть на {contact}. Достатньо розказати, хто ви і скільки у вас тварин. Далі — розмова, " +
      "перевірка, про яку йшлося вище, і ваші тварини з'являються на сайті.",
    /** PW-2: the link to the kabinet's sign-in, `/kabinet/vkhid` (his scope item 1, verbatim). */
    signInLink: "Увійти в кабінет",
  },
  kabinet: {
    /**
     * The operator's name when `KABINET_OPERATOR_DISPLAY_NAME` is unset
     * (RS-Q2), nominative, in two forms (`kabinet/operator.ts` picks). Oleksii's
     * R-UI answer 9, verbatim: "Role label «адміністратор сайту» (also replaces
     * the «Оператор реєстру» fallback)." Then round 2, answer 6, verbatim:
     * "Email signature fallback: capitalise it → «— Адміністратор сайту»."
     *
     * `operatorFallbackName` stands alone, so it is capitalised: both emails'
     * «— {operator}» signature, the shelter-facing history actor, the
     * operator's header. `operatorFallbackNameInSentence` sits mid-sentence
     * (`profile.lockedNote`'s «встановлює {operator}»), in lower case as he
     * wrote the role, where a capital would read as a proper name.
     */
    operatorFallbackName: "Адміністратор сайту",
    operatorFallbackNameInSentence: "адміністратор сайту",
    /**
     * Every kabinet string below is Oleksii's final Ukrainian (2026-10-14,
     * answering the 91-row copy export for PR #94), applied verbatim. The designer's
     * drafts in `docs/design/KABINET.md` were drafts only. `copy-status.test.ts`
     * pins the load-bearing strings against his text, transcribed.
     */
    shell: {
      /** Next to the wordmark in the header (K1, N2). */
      label: "кабінет",
    },
    /**
     * K1 · sign-in (N1), both states. Since the passwords build (PW-1,
     * `docs/shelter-passwords-copy-uk.md` §A, his Ukrainian, 2026-10-19,
     * verbatim): the password form first, «Надіслати посилання для входу» (the
     * magic link, his scope item 3) second, and «Забули пароль?». `intro` is his
     * replacement for «…Пароля немає: посилання для входу приходить на пошту.»,
     * which the passwords made false; it stays true for the operator, who has no
     * password («або за посиланням»). `wrongCredentials` is the one answer to
     * every failed sign-in (§5): it suggests the link, which honestly covers an
     * admin with no password yet and the operator without hinting at either.
     * `throttled` is his §9 answer 5, the same for every address; «хв.» avoids a
     * plural, and `copy-plural-pins.test.ts` pins it for several values anyway.
     */
    signIn: {
      pageTitle: "Вхід до кабінету",
      title: "Вхід до кабінету",
      intro:
        "Для притулків і адміністратора сайту. Увійти можна з паролем або за посиланням, що приходить на пошту.",
      emailLabel: "Електронна пошта",
      passwordLabel: "Пароль",
      showPassword: "Показати пароль",
      hidePassword: "Сховати пароль",
      submitPassword: "Увійти",
      useLink: "Надіслати посилання для входу",
      forgot: "Забули пароль?",
      wrongCredentials:
        "Не вдалося увійти. Перевірте адресу й пароль або надішліть собі посилання для входу.",
      /** `{minutes}` is the wait, whole minutes rounded up. */
      throttled: "Забагато спроб входу. Спробуйте ще раз через {minutes} хв.",
      addressNote:
        "Адресу додаю я, коли запрошую притулок. Якщо адреси немає в списку, лист не прийде — і ця сторінка про це не повідомляє, щоб не розкривати, хто зареєстрований.",
      sendFailed: "Не вдалося надіслати посилання. Перевірте з'єднання і спробуйте ще раз.",
      sentTitle: "Перевірте пошту",
      /** `{email}` is the address, shown in 500 weight. */
      sentBody:
        "Якщо ця адреса є в списку, на {email} прийде посилання для входу. Воно діє 15 хвилин і відкривається на будь-якому пристрої.",
      spamNote:
        "Листа немає? Перевірте «Спам» і «Промоакції». Надіслати ще раз можна через 60 секунд.",
      resend: "Надіслати ще раз",
      /** `{time}` is the countdown, m:ss. Shown while the 60s resend lockout runs. */
      resendIn: "Надіслати ще раз · {time}",
      otherAddress: "Інша адреса",
    },
    /**
     * The password fields every password form shares (`docs/shelter-passwords-copy-uk.md` §B,
     * his Ukrainian, 2026-10-19, verbatim). PW-1 renders these three on the reset page and in
     * «Змінити пароль»; the invitation's «Створіть пароль» (PW-2) adds its title, intro and
     * button. `hint` is the live hint under the field: «Символів: {count} з {min}», the length so
     * far against the minimum, worded to avoid a plural.
     */
    setPassword: {
      /** PW-2: the invitation link's page (his scope item 2, verbatim). */
      title: "Створіть пароль",
      /** `{shelter}` is the invitation's shelter; `{email}` its address, masked (o•••@gmail.com). */
      intro: "Пароль для кабінету притулку «{shelter}». Адреса для входу: {email}.",
      newLabel: "Пароль",
      repeatLabel: "Повторіть пароль",
      hint: "Символів: {count} з {min}",
      submit: "Зберегти й увійти",
    },
    /**
     * The policy's refusals and the mismatch (§B, his Ukrainian, verbatim), shared by every
     * password form. `personal` is his changed text (2026-10-19, verbatim), naming the part before
     * the @ outright. `{min}` and `{max}` are 10 and 128, filled from the policy's constants.
     */
    password: {
      tooShort: "Пароль закороткий. Мінімум символів: {min}.",
      tooLong: "Пароль задовгий. Максимум символів: {max}.",
      common: "Цей пароль надто легко вгадати. Оберіть інший.",
      personal:
        "Пароль не може містити вашу адресу пошти (навіть частину до @), назву притулку чи назву сайту.",
      mismatch: "Паролі не збігаються.",
    },
    /**
     * «Забули пароль?» (`/kabinet/vkhid/zabuly`, §C, his Ukrainian, verbatim). `sent` is the one
     * answer for every address, the operator's included (his note: «Якщо це адреса…» keeps it
     * true for every address); `{minutes}` is the link's lifetime, 60.
     */
    forgot: {
      title: "Забули пароль?",
      intro: "Вкажіть адресу пошти, з якою ви входите в кабінет.",
      submit: "Надіслати посилання",
      sent: "Якщо це адреса адміністратора кабінету притулку, на неї надіслано посилання для нового пароля. Воно діє {minutes} хв.",
      throttled: "Забагато запитів. Спробуйте ще раз пізніше.",
    },
    /**
     * The new password from a reset link (`/kabinet/vkhid/novyi-parol`, §D, his Ukrainian,
     * verbatim). `invalidLink`'s `{link}` is `invalidLinkText`, a link to «Забули пароль?»; his key
     * `reset.invalidLink.linkText` can't sit beside the string in this nested catalogue, so it is a
     * sibling (the copy sheet's own note), his wording unchanged.
     */
    reset: {
      title: "Новий пароль",
      submit: "Зберегти пароль",
      done: "Пароль змінено, на всіх пристроях виконано вихід. Увійдіть з новим паролем.",
      invalidLink: "Посилання застаріло або вже використане. {link}",
      invalidLinkText: "Отримати нове посилання",
    },
    /**
     * «Змінити пароль» on `/kabinet` (§E, his Ukrainian, verbatim; `title` is his scope item 7).
     * `noPasswordYet` is for an admin who signs in by link and has never set a password (his scope
     * item 9: existing admins use «Забули пароль?»).
     */
    changePassword: {
      title: "Змінити пароль",
      currentLabel: "Поточний пароль",
      newLabel: "Новий пароль",
      submit: "Змінити пароль",
      done: "Пароль змінено. На інших пристроях виконано вихід, тут ви залишаєтеся в кабінеті.",
      wrongCurrent: "Поточний пароль неправильний.",
      noPasswordYet:
        "Пароля ще немає. Створити його можна через «Забули пароль?» на сторінці входу.",
    },
    /**
     * KS-Q1 (Oleksii: "A"): the read-only "your shelter" page at `/kabinet`,
     * K4's sections with every value as a label-value row (N10's pattern).
     */
    profile: {
      pageTitle: "Профіль притулку",
      title: "Профіль притулку",
      /** The phone header's short page name (K4 360: «Профіль»). */
      phoneTitle: "Профіль",
      intro: "Те, що бачать про вас на кожній картці ті, хто шукає тварину.",
      role: "адміністратор притулку",
      signOut: "Вийти",
      signOutFailed:
        "Вийти не вдалося — ви досі в кабінеті. Перевірте з'єднання і спробуйте ще раз.",
      contactsTitle: "Контакти",
      /**
       * CB-B1 (Oleksii, 2026-10-17): no «реєстр» in user-facing copy, since it
       * implies a state service. Applies to this note, `donationNote` and
       * `profileEdit.voice.hint`; the other strings are his separate call.
       */
      contactsNote:
        "Ці контакти бачить людина, коли натискає «Написати притулку», — і пише вам сама. Листування йде напряму, без посередників.",
      donationTitle: "Збір коштів",
      donationLink: "Посилання на збір",
      donationNote: "Лише https. Через сайт гроші не проходять — це зовнішнє посилання.",
      /**
       * A proposed link the operator hasn't approved yet (N20). Rewritten in the
       * operator's «я» (K4 sheet, answer 8, Oleksii, 2026-10-17).
       */
      donationPending: "Запропоноване посилання чекає, поки я його перевірю.",
      voiceTitle: "Голос притулку",
      voiceLabel: "Ваші слова на картках",
      /**
       * The second sentence (that the registry fills in {date} and {name})
       * was deleted 2026-10-15 as false: nothing substitutes anything, the
       * sentence renders verbatim (`textIn`). A fuller replacement, if K2
       * ever builds substitution, is new copy and goes through the gate.
       */
      voiceNote: "Одне речення від першої особи, написане вами.",
      lockedTitle: "Встановлено під час перевірки",
      /** `{operator}` is the operator's display name (RS-Q2). */
      lockedNote:
        "Ці дані встановлює {operator} під час перевірки притулку. Тут вони лише для перегляду.",
      legalName: "Юридична особа",
      edrpou: "Код ЄДРПОУ",
      /** An unregistered initiative has a contact person, not a legal name. No mock frame. */
      contactPerson: "Контактна особа",
      registrationStatus: "Статус реєстрації",
      /** `{status}` is the chip's label, `{date}` the date it took effect. */
      statusSince: "{status} · з {date}",
      address: "Адреса приміщення",
      /**
       * Row 57, Oleksii's replacement (2026-10-14), applied once adopters
       * receive the city only before a reveal (EM-Q10, answer (a)). True of
       * the pages and of the data: no pre-reveal response carries the
       * district or coordinates (`pre-reveal-location.test.ts`, twice).
       */
      addressNote: "Ті, хто шукає тварину, не бачать точної адреси — лише місто.",
    },
    /** N12's verification chip labels, as KABINET.md drafts them. */
    profileStatus: {
      pending: "Очікує",
      under_review: "На розгляді",
      verified: "Перевірено",
      rejected: "Відхилено",
      paused: "На паузі",
      suspended: "Призупинено",
    },
    /** Contact channel row labels on the profile. */
    profileChannel: {
      phone: "Телефон",
      telegram: "Telegram",
      viber: "Viber",
      email: "Ел. пошта",
      website: "Сайт",
    },
    /**
     * Shown for any value the record doesn't hold. The standing constraints
     * fix this wording for an unknown field («Не записано», "never as 'no'"),
     * so it is not pending.
     */
    profileNotRecorded: "Не записано",
    /**
     * K4 · editing the shelter profile (`docs/k4-copy-sheet.md`). Oleksii's
     * final Ukrainian (`k4-copy-uk.md`, 2026-10-17) with his later fixes
     * (2026-10-17, "K4 copy fixes": `actions.liveOnSave` split per section,
     * `state.saved`, `pause.noteHint`, `voice.emptyMeans`/`previewEmpty`),
     * applied verbatim, with U+02BC as the apostrophe in every one of them
     * (K4-B4, answer 3, verbatim: "ʼ (U+02BC) in all my strings, incl.
     * contacts.atLeastOne «звʼязку». User input keeps accepting ' and [U+2019]
     * (token normalisation unchanged)."), his second apostrophe written as
     * [U+2019] because this file may not contain that character
     * (`apostrophes.test.ts`). Older catalogue strings keep U+0027. `errors.phoneRequired` is not here:
     * his answer 3 needs no required phone.
     *
     * **Literal braces.** `{імʼя}` and `{дата}` below are text the shelter
     * types, not slots. Slots are filled by `fillTemplate` (`../template.ts`),
     * whose slot names are ASCII letters only (`{time}`, `{max}`, `{token}`…),
     * so a Cyrillic name in braces can never match one, and a filled value is
     * never scanned again (a `{token}` value of «{max}» stays as typed).
     */
    profileEdit: {
      actions: {
        save: "Зберегти",
        cancel: "Скасувати зміни",
        /** Per section (answer 1). */
        liveOnSave: {
          /**
           * True since K4-B4, answer 1: reveal views and «Мої запити» carry the
           * shelter's current contacts while it is visible (`shelterContact`,
           * `source: "current"`, K4-B5, chosen in
           * `apps/web/src/api/handlers/reveal.ts`), so a person who asked
           * before the change gets the new ones too.
           */
          contacts:
            "Нові контакти побачать одразу після збереження — коли натиснуть «Написати притулку».",
          voice: "Нове речення зʼявиться в стрічці та на сторінках тварин одразу після збереження.",
        },
        unsavedLeave: "Зміни не збережено. Все одно вийти?",
      },
      state: {
        saving: "Збереження…",
        saved: "Збережено.",
        /** `{time}` is HH:mm, Kyiv. */
        savedAt: "Збережено о {time}",
        failed:
          "Не збереглося — на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
        retry: "Спробувати ще раз",
      },
      errors: {
        conflict:
          "Профіль змінили після того, як ви його відкрили. Ваші зміни не збережено. Ось поточна версія — внесіть зміни ще раз.",
        conflictReload: "Показати поточну версію",
        illegalTransitionPause:
          "Зараз не вийде поставити прийом на паузу: статус притулку змінився. Оновіть сторінку.",
        illegalTransitionResume:
          "Звідси прийом зараз не відновити: статус притулку змінився. Напишіть мені.",
        phoneFormat: "Вкажіть номер із кодом країни, наприклад +380 67 123 45 67.",
        telegramFormat:
          "Імʼя користувача в Telegram: 5–32 латинські літери, цифри або підкреслення. @ можна не писати.",
        viberFormat: "Вкажіть номер Viber із кодом країни, наприклад +380 67 123 45 67.",
        emailFormat: "Схоже, це не адреса пошти.",
        httpsOnly: "Лише посилання, що починаються з https://.",
        notAUrl: "Це не схоже на посилання.",
        /** `{max}` is 280. */
        sentenceTooLong: "Речення довше за {max} символів.",
        /** `{token}` is the braced text the shelter typed. `{імʼя}` is literal. */
        unknownToken:
          "Підставляється лише {імʼя}. Приберіть «{token}» або напишіть без фігурних дужок.",
        /** Answer 5. `{дата}` is literal. */
        dateTokenGone: "Дата й так показується над вашим реченням, тому {дата} писати не потрібно.",
        strayBrace: "Є дужка без пари. Фігурні дужки потрібні лише для {імʼя}.",
      },
      contacts: {
        otherLabel: "Інший спосіб звʼязку",
        otherKind: "Тип",
        phonePlaceholder: "+380 …",
        telegramPlaceholder: "@username",
        removeOther: "Прибрати",
        /** Answer 3. */
        addOther: "Додати ще один спосіб звʼязку",
        /** Answer 3: no required phone, at least one channel. */
        atLeastOne: "Залиште хоча б один спосіб звʼязку.",
      },
      voice: {
        /** CB-B1: the second sentence is his replacement; `{імʼя}` is literal. */
        hint: "Одне речення від першої особи, вашими словами. На картці підставляється лише імʼя тварини — там, де ви напишете {імʼя}. Більше нічого не змінюється.",
        nameStaysHint:
          "Імʼя стоїть як є: Рекс, Мурка. Його не відмінюють, тож пишіть так, щоб воно звучало природно, — наприклад, «{імʼя} досі шукає дім».",
        /** Answer 7: inserts the token at the cursor. */
        insertName: "Вставити {імʼя}",
        counter: "{count} / {max}",
        counterOver: "Зайвих символів: {over}",
        emptyMeans: "Якщо залишити порожнім, на картках буде лише «Оновлено … тому».",
        /** `{name}` is the preview animal's name (nominative, by his note). */
        previewLabel: "Так це виглядає на сторінці тварини: {name}",
        previewNoAnimals:
          "Попередній перегляд зʼявиться, щойно у вас буде тварина: тут буде видно, як речення виглядатиме на її сторінці.",
        previewEmpty: "Речення немає — на картці буде лише «Оновлено … тому».",
      },
      donation: {
        optional: "· необовʼязково",
        previewLabel: "Так це побачать люди:",
        previewHost: "{host} ↗",
        propose: "Надіслати на перевірку",
        proposeNote:
          "Нове посилання зʼявиться на картках після того, як я його перевірю. До того люди бачать поточне.",
        /** Answer 8. */
        pendingTitle: "Чекає на перевірку",
        pendingHost: "Запропоновано: {host}",
        pendingSince: "Надіслано {date}",
        cancelProposal: "Скасувати пропозицію",
        proposed: "Надіслано. Я перевірю посилання.",
        cancelled: "Пропозицію скасовано. Поточне посилання лишається.",
        replaceNote: "Якщо надіслати інше посилання, воно замінить те, що чекає на перевірку.",
        failed: "Не надіслано. Перевірте зʼєднання і спробуйте ще раз.",
        /** Answer 12: shown while the newest donation line is the operator declining. */
        declined:
          "Останнє запропоноване посилання не підтверджено. Якщо незрозуміло чому — напишіть мені.",
      },
      pause: {
        button: "Призупинити прийом тварин",
        resumeButton: "Відновити прийом тварин",
        /** `{date}` the pause's date, `{reason}` the code's label only, never the note (fix 5). */
        pausedLine: "Прийом на паузі з {date} · {reason}",
        dialogTitle: "Призупинити прийом тварин?",
        dialogBody:
          "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає. Відновити можна тут будь-коли.",
        reasonLabel: "Причина",
        reasonPlaceholder: "Оберіть причину",
        reason: {
          seasonal_closure: "Сезонна перерва",
          relocation: "Переїзд",
          capacity_reached: "Немає місця",
          staff_shortage: "Брак людей",
          other: "Інше",
        },
        noteLabel: "Коментар",
        /**
         * Fix 2. True since K4-B4, answer 2: the note shows under the paused
         * line, labelled «Коментар», on the shelter's kabinet page, which only
         * its admins and the operator's support view reach; no public view
         * carries it.
         */
        noteHint:
          "Коментар бачите ви, інші адміністратори притулку і я. Людям, які шукають тварину, він не показується.",
        confirm: "Призупинити прийом",
        cancel: "Скасувати",
        close: "Закрити",
        paused: "Прийом на паузі.",
        resumed: "Прийом відновлено. Ваших тварин знову видно.",
      },
    },
    /**
     * The five listing states as K3's header chip and K2's rows name them
     * (N3). Oleksii's final Ukrainian (k3-copy-uk.md §2; answer 15, verbatim:
     * "Yes, all five below.").
     */
    listingStatus: {
      draft: "Чернетка",
      published: "Опубліковано",
      reserved: "Домовляються",
      adopted: "Удома",
      withdrawn: "Знято з показу",
    },
    /**
     * K3 · the animal form (`docs/k3-copy-sheet.md`): Oleksii's final
     * Ukrainian (`k3-copy-uk.md`, 2026-10-17), verbatim, U+02BC as the
     * apostrophe. His rules for it, verbatim: "Pronoun-free wording
     * everywhere. No sex-keyed variants."; "«ті, хто шукає тварину» (or
     * «люди» where shorter). Never «адоптери»."; "the site is the subject
     * («сайт»), or impersonal / passive forms". Keys his answers reuse from
     * elsewhere (sex «Не записано», «Комплексне щеплення», «Спробувати ще
     * раз», «Зберегти») are read from their own homes, not copied here.
     */
    animalForm: {
      pageTitleNew: "Нова тварина",
      pageTitleEdit: "{name}",
      titleNew: "Нова тварина",
      backToList: "← Тварини",
      header: {
        createdNotPublished: "Створено {when} · ще не в галереї",
      },
      who: {
        title: "Хто це",
        nameLabel: "Імʼя",
        nameHint: "Як тварину кличуть у притулку. Лише імʼя — пояснення краще написати в описі.",
        namePlaceholder: "Наприклад, Ластівка",
        speciesLabel: "Вид",
        sexLabel: "Стать",
        sexMale: "Хлопчик",
        sexFemale: "Дівчинка",
        sizeLabel: "Розмір",
        sizeNote: "Ваги немає навмисно: розмір на око точніший, ніж торішня цифра.",
        sizeHintUpTo: "до {max} кг",
        sizeHintRange: "{min}–{max} кг",
        sizeHintFrom: "від {min} кг",
      },
      /** DR1 (S3), his text (2026-10-20). Optional, and clearable back to «Не вказано». */
      coat: {
        label: "Шерсть",
        short: "Коротка",
        long: "Довга",
        unknown: "Не вказано",
      },
      age: {
        title: "Вік",
        modeLabel: "Що відомо про вік",
        modeBirthDate: "Відома дата народження",
        modeBucket: "Відомий вік на певну дату",
        modeBirthDateShort: "Дата народження",
        modeBucketShort: "Вік на дату",
        modeNote:
          "Обидва способи рівноцінні. Сайт зберігає саме те, що ви вказали, і далі рахує вік сам.",
        birthDateLabel: "Дата народження",
        bucketLabel: "Вік на ту дату",
        bucketRangeUnder: "до {max}",
        bucketRange: "{min}–{max}",
        bucketRangeFrom: "{min}+",
        asOfLabel: "Станом на",
        /** True with D3 (Oleksii: "keep the chosen «Станом на» date"): the server stores it. */
        asOfHint: "Коли ви це оцінили. Зазвичай — день, коли тварина потрапила до притулку.",
        /** `{label}` is the card's own word (`ageWordFor`, the form's sex); his answer 9: quoted as it is. */
        adopterSees: "Ті, хто шукає тварину, побачать: «{label}».",
        uncertain:
          "Вік указано станом на {when}. Тепер на картці — «{label}». Якщо тварина вже старша, оновіть вік.",
      },
      description: {
        title: "Опис",
        prompt: "Що б ви сказали людині біля вольєра.",
        label: "Про тварину",
        hint: "Простий текст, без форматування.",
        /** «символів» is the form for 1,500 (pinned in `copy-plural-pins.test.ts`). */
        counter: "{count} з {max} символів",
        counterOver: "Зайвих символів: {over}",
      },
      health: {
        title: "Медичний стан",
        confirm: "Зроблено",
        unknownNote:
          "«Не записано» — чесна відповідь. Ті, хто шукає тварину, так і побачать «Не записано», а не «ні».",
        registryReadOnly: "Підтверджено державним реєстром тварин. Тут цей рядок змінити не можна.",
      },
      photos: {
        title: "Фото",
        ratioNote: "Формат 4:5, перше фото — обкладинка.",
        add: "+ Фото",
        addHint: "Будь-яке фото, яке відкриває цей телефон чи браузер.",
        /** `{px}` is `PHOTO_MAX_EDGE_PX`; true because `compressPhoto` scales every photo to it on the device. */
        howItWorks:
          "Перше фото — обкладинка; щоб змінити порядок, перетягніть фото. Для публікації потрібне хоча б одне. Великі фото зменшуються на пристрої до {px} пікселів перед відправкою — так менше мобільного трафіку.",
        /** Answer 11 ("Both are true"): the device re-encodes every photo, and the server strips all metadata. */
        privacyNote: "З фото прибираються дані про місце зйомки та інші приховані дані.",
        preparing: "Фото готується…",
        uploading: "Фото завантажується…",
        uploadingProgress: "Завантаження · {percent} · {sent} з {total} МБ",
        done: "Готово",
        cover: "Обкладинка",
        failed: "Не завантажилось",
        dismissFailed: "Прибрати",
        /** The accessible name for `dismissFailed`, his answer: «Прибрати фото, яке не завантажилось». */
        dismissFailedName: "Прибрати фото, яке не завантажилось",
        tileLabel: "Фото {n} з {total}",
        makeCover: "Зробити обкладинкою",
        moveEarlier: "Перемістити вперед",
        moveLater: "Перемістити назад",
        remove: "Прибрати фото {n}",
        capReached: "Це максимум — {max} фото.",
        /**
         * Also `PHOTOS_REQUIRED_WHILE_VISIBLE`'s message (his answer: "same
         * key/text"). Only while the shelter's cards are shown (verified, not
         * paused); otherwise `lastPhotoKeptNotShown`.
         */
        lastPhotoKept: "Цю картку бачать люди, тож одне фото має лишитися.",
        /**
         * In place of `lastPhotoKept` while the shelter's cards are on no
         * public surface (paused, suspended or not verified,
         * `FEED_VISIBLE_VERIFICATION_STATUSES`), where «бачать люди» would be
         * false. One line for every hidden cause: «поки її ще не бачать»
         * claims nothing about verification. The rule holds either way: the
         * server keeps the last photo of any published or reserved card
         * (P-Q8). His final text (round 2b, answer 3).
         */
        lastPhotoKeptNotShown:
          "Картка опублікована, тож одне фото має лишитися — навіть поки її ще не бачать.",
        added: "Фото додано.",
        removed: "Фото прибрано.",
        reordered: "Порядок змінено.",
        conflict: "Фото змінилися в іншому вікні. Тут — поточний набір, спробуйте ще раз.",
        removedStillReachable:
          "Фото зникло з картки. Сам файл не видаляється одразу — якщо його треба прибрати зовсім, напишіть мені.",
        /** True with RH-B7 (D4 option (i)), which ships in this PR. Published and reserved only. */
        dateMoves: "На картці, яку бачать люди, будь-яка зміна фото оновлює дату «Оновлено».",
      },
      photoErrors: {
        heicUnsupported:
          "Цей телефон чи браузер не відкриває фото у форматі HEIC. Виберіть, будь ласка, JPG або PNG.",
        unreadable: "Цей файл не вдалося відкрити як фото.",
        tooLarge: "Навіть після зменшення це фото завелике. Спробуйте інше.",
        rejected: "Сайт не може використати цей файл як фото.",
        limitReached: "У цієї тварини вже {max} фото.",
        rateLimited: "Забагато фото за короткий час. Спробуйте трохи пізніше.",
        uploadsUnavailable: "На цій версії сайту фото завантажити не можна.",
      },
      draft: {
        savedAt: "Чернетку збережено о {time}",
        /** F-B2, his, verbatim; backed by `incomplete-draft-invisible.test.ts`. */
        notVisible: "Ті, хто шукає тварину, цю чернетку не бачать.",
        notSavedYet: "Щоб зберегти чернетку, потрібні імʼя та вид.",
        saveFailed: "Чернетку не збережено. Перевірте зʼєднання — усе, що ви ввели, лишається тут.",
        save: "Зберегти чернетку",
        saveShort: "Зберегти",
      },
      listed: {
        liveOnSave: "Зміни зʼявляться на картці одразу після збереження.",
        notShownNow: "Цю картку зараз ніхто не бачить.",
        /**
         * His final text (k3-copy-uk.md §10). It waited under
         * `testShelterOnly` by his own note ("If K2's confirmation buttons
         * aren't shipped yet when PR 4 merges, this line waits under
         * testShelterOnly until PR 5.") and is true since K2 (PR 5): an edit
         * never moves `confirmedAt`; «Ще шукає» / «Ще домовляються» in the
         * list and a photo change (RH-B7) do. Published and reserved cards only.
         */
        dateUnchanged:
          "Правки тексту не змінюють дату «Оновлено». Її змінює ваше підтвердження в списку тварин і будь-яка зміна фото.",
      },
      publish: {
        button: "Опублікувати",
        missing: "Щоб опублікувати, ще потрібно: {list}.",
        gap: {
          size: "розмір",
          age: "вік",
          description: "опис",
          photo: "фото",
        },
        /**
         * Shown only while the shelter is publicly visible (verified, not
         * paused): a paused or unverified shelter's cards are on no public
         * surface, and «Тепер картку бачать…» would be false. Which line
         * replaces it depends on why (`publishedAnnouncementOf` in the
         * form's `labels.ts`).
         */
        done: "Опубліковано. Тепер картку бачать ті, хто шукає тварину.",
        /**
         * In place of `done` while the shelter has not passed verification
         * (pending, under review, or rejected and free to resubmit), the one
         * state where «щойно притулок пройде перевірку» is true. Never for a
         * paused or suspended shelter, which has passed: that one gets
         * `listingStatus.published` and `listed.notShownNow`, composed
         * (K3-T15). His final text (round 2b, answer 3).
         */
        publishedNotShown:
          "Опубліковано. Ті, хто шукає тварину, побачать картку, щойно притулок пройде перевірку.",
        viewPublic: "Відкрити сторінку тварини",
        stateChanged:
          "Картка змінилася в іншому вікні. Оновіть сторінку, щоб побачити поточну версію.",
      },
      errors: {
        conflict:
          "Хтось змінив цю картку після того, як ви її відкрили. Ваші останні зміни не збережено. Ось поточна версія — внесіть їх ще раз.",
        registryConfirmed: "Це підтверджено державним реєстром тварин, тут змінити не можна.",
        requiredOnceListed: "Картку вже публікували, тож опис не може бути порожнім.",
        notFound: "Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.",
        loadFailed: "Картка не завантажилась. Перевірте зʼєднання і спробуйте ще раз.",
      },
      validation: {
        nameRequired: "Щоб зберегти чернетку, потрібне імʼя.",
        speciesRequired: "Виберіть, собака це чи кіт, щоб зберегти чернетку.",
        nameBrace: "В імені не може бути фігурних дужок.",
        /** «символів» is the form for 60 (pinned). */
        nameTooLong: "Імʼя довше за {max} символів.",
        /** «символів» is the form for 1,500 (pinned). */
        descriptionTooLong: "Опис довший за {max} символів.",
        birthDateFuture: "Дата народження не може бути в майбутньому.",
        asOfFuture: "Дата «Станом на» не може бути в майбутньому.",
        /** «років» is the form for 30, `AGE_DATE_MAX_YEARS_BACK` (his note: "pin the plural for 30"). */
        dateTooOld: "Ця дата надто давня — понад {years} років тому.",
      },
    },
    /**
     * K2 · the animal list at `/kabinet/tvaryny` (`docs/k2-copy-sheet.md`):
     * Oleksii's final Ukrainian (`k2-copy-uk.md`, 2026-10-18), verbatim, U+02BC
     * as the apostrophe. His rules there, verbatim: "No «ми», no «адоптери», no
     * «реєстр», pronoun-free for the animal." Keys his answers reuse from
     * elsewhere (the draft line `animalForm.draft.notVisible`, a row publish's
     * `animalForm.publish.*`, the suspended and rejected lines
     * `verificationDecision.*Effect`, the dialog fields `profileEdit.pause.*`)
     * are read from their own homes, not copied here.
     *
     * - `captionCards` / `stale.countCards` are the three forms his `{cards}`
     *   takes (nominative for the header, accusative for the strip), picked by
     *   `pluralizeUk`.
     * - `stale.count` types «днів» for `{days}` = `agingMaxDays` (30), pinned in
     *   `copy-plural-pins.test.ts`.
     * - `stale.caption` and `empty.body` say people see the cards, so they show
     *   only while the shelter is verified (his answer 5); otherwise one line
     *   says why (`paused.hidden`, `notVisible.pending`, or R-UI's lines).
     * - `withdrawReason.adopted_elsewhere` is a label only: the dialog offers
     *   the other four codes (`KABINET_WITHDRAWAL_CODES`, his answer 10).
     */
    animalList: {
      pageTitle: "Тварини",
      title: "Тварини",
      caption: "{shelter} · {cards}",
      captionCards: {
        one: "{count} картка",
        few: "{count} картки",
        many: "{count} карток",
      },
      add: "Додати тварину",
      addShort: "Додати",
      filter: {
        label: "Показати",
        all: "Усі",
        draft: "Чернетки",
        published: "Опубліковано",
        reserved: "Домовляються",
        adopted: "Удома",
        withdrawn: "Знято з показу",
        withCount: "{label} · {count}",
      },
      row: {
        adoptedSince: "Удома з {date}",
        withdrawnOn: "Знято з показу {date} · {reason}",
        more: "Ще",
      },
      actions: {
        edit: "Редагувати",
        reserve: "Почали домовлятися",
        release: "Не домовилися — знову шукає",
        adopt: "Уже вдома",
        withdraw: "Зняти з показу",
        restore: "Повернути в чернетки",
        deleteDraft: "Видалити чернетку",
      },
      confirm: {
        stillLooking: "Ще шукає",
        stillArranging: "Ще домовляються",
        done: "Підтверджено сьогодні",
        undo: "Скасувати · {seconds} с",
        undone: "Скасовано: на картці знову попередня дата.",
        undoExpired:
          "Скасувати вже не можна: час минув або картку змінено. На картці — сьогоднішня дата.",
        failed:
          "Не підтверджено: дата на картці не змінилася. Перевірте зʼєднання і спробуйте ще раз.",
      },
      adoptDialog: {
        title: "{name} уже вдома?",
        body: "Картка зникне з галереї та стрічки, а її сторінка повідомлятиме, що тварини там уже немає. У вашому списку картка лишиться з позначкою «Удома». Скасувати це не можна: якщо тварина повернеться, додайте її як нову картку.",
        confirm: "Так, уже вдома",
      },
      withdrawDialog: {
        title: "Зняти з показу: {name}?",
        body: "Ті, хто шукає тварину, більше не бачитимуть картку, а її сторінка повідомлятиме, що тварини там уже немає. У вашому списку картка лишиться, її можна повернути в чернетки. Якщо опублікувати її знову, дата й час очікування почнуться з того дня.",
        adoptedHint: "Якщо тварина знайшла дім, позначте краще «Уже вдома».",
        confirm: "Зняти з показу",
      },
      withdrawReason: {
        adopted_elsewhere: "знайшла дім іншим шляхом",
        transferred: "переїхала до іншого притулку",
        deceased: "тварини не стало",
        listing_error: "додано помилково",
        other: "інша причина",
      },
      moved: {
        reserved: "{name}: почали домовлятися.",
        released: "{name}: знову шукає дім.",
        adopted: "{name}: уже вдома.",
        withdrawn: "{name}: знято з показу.",
        restored: "{name}: повернуто в чернетки.",
      },
      deleteDialog: {
        title: "Видалити чернетку «{name}»?",
        body: "Вона назавжди зникне з вашого списку.",
        photosStay:
          "Файли фото не видаляються одразу — якщо їх треба прибрати зовсім, напишіть мені.",
        confirm: "Видалити",
      },
      deleted: "Чернетку «{name}» видалено.",
      stale: {
        count: "{cards} ви не підтверджували понад {days} днів.",
        countCards: {
          one: "{count} картку",
          few: "{count} картки",
          many: "{count} карток",
        },
        caption:
          "Ті, хто шукає тварину, бачать на них давню дату. Якщо нічого не змінилося, достатньо натиснути «Ще шукає» чи «Ще домовляються».",
        show: "Показати ці {count}",
        showAll: "Показати всі",
      },
      paused: {
        hidden: "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає.",
      },
      notVisible: {
        pending: "Ваші тварини зʼявляться в галереї, щойно притулок пройде перевірку.",
      },
      orderNote:
        "Порядок у галереї — за датою: людина сама обирає, спочатку найсвіжіші картки чи ті, хто чекає найдовше. Повнота картки впливає лише на порядок у стрічці. Тут порядок змінити не можна, і просування немає.",
      empty: {
        title: "Тут поки немає тварин.",
        body: "Додайте першу. Ті, хто шукає тварину, побачать картку після публікації.",
        add: "Додати першу тварину",
        caption: "Щоб зберегти чернетку, потрібні імʼя та вид — решту можна дописати пізніше.",
      },
      loading: "Завантаження",
      loadMore: "Показати ще",
      filterEmpty: "У цій групі поки немає карток.",
      loadFailed: "Список не завантажився. Перевірте зʼєднання і спробуйте ще раз.",
      errors: {
        rateLimited: "Забагато дій за короткий час. Зачекайте хвилину й спробуйте ще раз.",
        actionFailed: "Не вдалося. Перевірте зʼєднання і спробуйте ще раз.",
      },
    },
    /** The kabinet's section nav (N2): «Тварини» · «Профіль притулку» (`profile.title`). */
    nav: {
      label: "Розділи кабінету",
      animals: "Тварини",
    },
    /**
     * `WAS_PUBLISHED`, the one answer for both causes (K-Q9). His Q2: the first
     * clause kept, «лише зняти з показу» dropped. Nothing in it may vary with
     * whether anyone swiped or asked about the animal (commitment #2).
     */
    deleteDraft: {
      refused: {
        wasPublished:
          "Цю картку вже публікували, тож видалити її не можна. Вона лишається у вашому списку як чернетка, і ті, хто шукає тварину, її не бачать.",
      },
    },
    /** S5 · support mode (N16): the operator's read-only view of this page. */
    support: {
      /**
       * Renamed per Oleksii's answer 3 (2026-10-14), in place of changing the
       * /prytulkam A3 sentence. EM-Q2 (Oleksii, 2026-10-14, verbatim: "the
       * banner addresses the operator; no name hard-coded"): the banner is on
       * the operator's own screen, so it speaks to them. Final as his draft
       * stood (2026-10-14). `{shelter}` is the shelter's name, filled by
       * `SupportBanner`.
       */
      title:
        "Ви переглядаєте кабінет притулку «{shelter}» — лише перегляд, змінити нічого не можна.",
      /**
       * Row 70, final (2026-10-14). It deliberately leaves out `{shelter}`: the
       * title already names the shelter and says read-only. Oleksii's note,
       * verbatim: "70: deliberately short. Row 69 already names the shelter
       * and says read-only; no person's name."
       */
      body: "Так кабінет бачить адміністратор притулку.",
      exit: "Вийти з режиму перегляду",
      exitFailed: "Не вдалося вийти з режиму перегляду. Спробуйте ще раз.",
      viewingAs: "як адміністратор притулку",
      signOutDisabled: "Вихід вимкнено",
    },
    /**
     * The two kabinet emails (`docs/h2-invite-copy-sheet.md` E1/E2), Oleksii's
     * final Ukrainian (2026-10-14). The invite email is a personal note in his
     * «я» voice (IN-E14), signed `— {operator}` on its last line (`notYou`):
     * the display name, nominative, from the same config as the history
     * actor. The sign-in email took the same personal shape on 2026-10-14
     * (his delivery test 2: the invite reached Gmail's Primary tab, the short
     * impersonal sign-in email Promotions): «Добрий день.» opens it and the
     * same `— {operator}` signs its `notYou`. The plural nouns in `signIn.expiry` («хвилин», 15) and
     * `invite.expiry` («години», 72) are typed for those exact values;
     * `copy-plural-pins.test.ts` fails if a TTL changes under them. `action`
     * is the link's label in the HTML part: a label, never the URL itself
     * (IN-E8: link text naming one domain over an href naming another is a
     * phishing signal). Values in `{braces}` are filled by the builder.
     * `invite.what` is his PR 6 text (pr6-copy-uk.md §1.4): what a shelter
     * changes itself once its writes are open, and what still goes through
     * him. `invite.intro`'s «у реєстрі» is #123's to change (CB-B2), not
     * PR 6's.
     */
    email: {
      signIn: {
        subject: "Посилання для входу до кабінету притулку",
        intro: "Добрий день. На цю адресу запитали посилання для входу до кабінету притулку.",
        action: "Відкрити сторінку входу",
        expiry: "Посилання спрацює один раз і діє {minutes} хвилин.",
        notYou:
          "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.\n— {operator}",
      },
      invite: {
        subject: "Ваш доступ до кабінету притулку",
        intro:
          "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» на сайті.",
        /**
         * Q-C (Oleksii, 2026-10-19): the invite's second sentence depends on the
         * shelter's verification status at send time. `what` for a verified or
         * paused shelter; `whatBeforeVerification` for pending, under review,
         * suspended and rejected (PC-T10), which includes the first invite, sent
         * at create. The rest of the paragraph is
         * the same in both.
         */
        what: "У кабінеті ви бачите дані притулку — і те, що бачать люди, і дані з перевірки. Контакти, речення на картках і картки тварин ви змінюєте самі, і зміни зʼявляються одразу після збереження. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки — юридичну особу, ЄДРПОУ чи адресу, — напишіть мені.",
        whatBeforeVerification:
          "У кабінеті ви бачите дані притулку — і те, що бачать люди, і дані з перевірки. Контакти, речення на картках і картки тварин ви змінюєте самі. Ті, хто шукає тварину, побачать їх, щойно притулок пройде перевірку. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки — юридичну особу, ЄДРПОУ чи адресу, — напишіть мені.",
        action: "Відкрити запрошення",
        expiry: "Запрошення діє {hours} години. Якщо не встигнете — я надішлю нове.",
        /**
         * PW-2 (Oleksii, 2026-10-20, Q2, verbatim): the link sets a password, so whoever holds it
         * can; the paragraph says so, and not to forward it. Signed `— {operator}` as before.
         */
        notYou:
          "Якщо ви не чекали цього листа, просто проігноруйте його і нікому не пересилайте: це посилання один раз дає змогу створити пароль для цієї адреси, поки запрошення діє.\n— {operator}",
      },
      /**
       * F1, the reset link (`docs/shelter-passwords-copy-uk.md`, his Ukrainian, 2026-10-19,
       * verbatim), sent only to a shelter admin's address. `{minutes}` is the link's lifetime,
       * 60; «хв.» needs no plural. `action` is the link's label in the HTML part (IN-E8). Signed
       * `— {operator}` like the other emails.
       */
      reset: {
        subject: "Новий пароль до кабінету притулку",
        intro: "Надійшов запит на новий пароль до кабінету притулку для цієї адреси.",
        action: "Створити новий пароль",
        expiry: "Посилання спрацює один раз і діє {minutes} хв.",
        notYou:
          "Якщо запит надіслали не ви, просто не зважайте на цей лист: пароль залишиться тим самим.\n— {operator}",
      },
      /**
       * F2, the notice after a reset and after a change (his §9 answer 4, verbatim: "Yes:
       * «пароль змінено» after a change too."), his Ukrainian, verbatim. No link. `{contact}` is
       * the Reply-To address (`EMAIL_REPLY_TO`), filled from config.
       */
      passwordChanged: {
        subject: "Кабінет притулку: пароль змінено",
        body: "Пароль до кабінету притулку для цієї адреси щойно змінено. На інших пристроях виконано вихід.",
        notYou: "Якщо це не ви — напишіть мені: {contact}\n— {operator}",
      },
    },
    /**
     * Under the sign-in card's «check your email» (IN-E7's resolution): the
     * same card for every address, so the fallback names a person to write
     * to instead of saying which addresses failed. `{contact}` is filled by
     * the page from config, never typed here. Rendered on the K1 card in this
     * PR (IN-T9).
     */
    signInCard: {
      notArrived: "Якщо лист не прийшов за кілька хвилин, напишіть мені на {contact}.",
    },
    /**
     * The invitation link's page (`/kabinet/vkhid?zaproshennia=<token>`) when the link can't be
     * used: unknown, expired, used or withdrawn all read the same (PW-2 Q1). His strings from
     * `docs/h2-invite-copy-sheet.md` L; the form itself is `setPassword` (PW-2). `pageTitle` is the
     * page's `<title>` in every state. The magic-link landing's own strings (`ready`, `send`,
     * `sent`, `title`, `alreadyAccepted`, `rateLimited`) went with it (his copy sheet, B:
     * "removed when PW-2 ships").
     */
    inviteLanding: {
      pageTitle: "Запрошення до кабінету",
      /** Heading of the one page every link that can't be used gets (PW-2 Q1). */
      unusableTitle: "Цим запрошенням не можна скористатися",
      /**
       * His 2026-10-21 revision (PW-2 review, Q2 (b)): one text for every broken link, whether
       * the password was already set with it or not (`docs/h2-invite-copy-sheet.md` L).
       */
      expired:
        "Посилання вже не діє. Якщо пароль уже створено — увійдіть. Якщо ні — напишіть мені, і я надішлю нове запрошення.",
      signIn: "Перейти до входу",
    },
    /**
     * What the operator's side shows after an invite (IN-E13). The sending
     * address is `{sender}`, filled from config (the From address), never
     * typed here: the name is not final. Oleksii's final text (2026-10-14) is
     * a reminder to the operator, impersonal, with no gendered past.
     */
    registry: {
      inviteSent: {
        tellPersonally:
          "Повідомте притулок особисто: запрошення надіслано з {sender}. Якщо листа не видно — хай перевірить вкладку «Промоакції».",
      },
    },
    /**
     * The page an emailed sign-in link opens (IN-Q11): one button, and only
     * its POST signs in, so a mail scanner opening the link burns nothing.
     * Keys and English sense: `docs/h2-invite-copy-sheet.md` P.
     */
    confirm: {
      title: "Вхід до кабінету притулку",
      intro: "Натисніть кнопку, щоб завершити вхід.",
      submit: "Увійти",
      invalid: "Це посилання вже використане або втратило силу.",
      requestNew: "Отримати нове посилання",
      /**
       * IN-Q12: signed in, but the invitation's accept failed. Shown on the
       * «Увійти» response and on `/kabinet`; the person stays signed in.
       */
      joinFailed:
        "Нічого не збережено наполовину. Спробуйте ще раз — а якщо не вийде, спроба повториться автоматично під час наступного входу.",
      /**
       * The failure answer's heading, on the «Увійти» response and on
       * `/kabinet`'s `JoinFailedCard` (IN-T12 item 7, Oleksii 2026-10-14:
       * "reuse K1's card (approved), with its own heading key"). Final as his
       * draft stood (2026-10-14).
       */
      joinFailedTitle: "Ви увійшли, але приєднати вас до притулку не вдалося",
      joinRetry: "Спробувати ще раз",
      /**
       * The over-limit card (IN-T15, Oleksii: "the over-limit card ships
       * before production sign-in is turned on"): «Увійти» refused by the
       * kabinet's per-IP limit (300 a minute, `hooks.before`) before Better
       * Auth read the token, so the link is still good and the card offers
       * the same button again. Oleksii's text, 2026-10-15 (inbox WI-Q3), with
       * «Увійти» in «» since CB-Q1 (2026-10-17),
       * shipped after both of its claims were checked: the per-IP window is
       * 60 s, so «хвилину» holds, and a refused press never reaches the
       * token, so «Посилання ще дійсне» holds until the 15-minute expiry
       * (`auth.test.ts`, "a press refused at t goes through … 60 s later").
       * A longer window would make «хвилину» false: then it reads «трохи».
       */
      rateLimited:
        "Забагато спроб входу за короткий час. Посилання ще дійсне — зачекайте хвилину й знову натисніть «Увійти».",
    },
    /**
     * History lines (IN-Q14). Only `admin_joined` has a key so far; no
     * history renderer exists yet. Ukrainian past tense is gendered, so the
     * line avoids «приєднався/приєдналася» (final, 2026-10-14). Keys:
     * `docs/h2-invite-copy-sheet.md` H.
     */
    history: {
      adminJoined: "{email} отримує доступ до кабінету",
    },
    /**
     * R-UI · the operator's own screens (`docs/r-ui-copy-sheet.md`, keys and
     * English sense; `docs/r-ui-plan.md`, the screens). Every string is
     * Oleksii's final Ukrainian (`rui-copy-uk.md`, 2026-10-17), applied
     * verbatim for all three R-UI PRs at once, U+02BC as the apostrophe. His
     * answer 1, verbatim: "Copy gate: no exemption. Copy for all three PRs is
     * final in D:\opika-worktrees\rui-copy-uk.md." These screens address the
     * operator as «ви»; history lines are impersonal, the actor shown apart
     * («{line} · {actor}»).
     *
     * Two strings were checked against the code at his request ("verify
     * blocked.unknown.provider_suppresses and create.descriptionHint against
     * code; if my wording is wrong, use the true wording and log it"), found
     * untrue as drafted, and replaced by his round-2 answer 5; each says why
     * at its key. Reused, no key here:
     * `profile.donationTitle`, `profile.addressNote`, `profile.legalName`,
     * `profile.edrpou`, `profile.contactPerson`, `profileEdit.state.retry`.
     */
    operator: {
      shell: {
        role: "адміністратор сайту",
        nav: {
          shelters: "Притулки",
          newShelter: "Новий притулок",
        },
        pageTitle: {
          list: "Притулки",
          create: "Новий притулок",
          shelter: "{name}",
        },
      },
      list: {
        title: "Притулки",
        total: "Усього: {count}",
        create: "Новий притулок",
        createShort: "Новий",
        search: "Пошук за назвою",
        orderNote: "Спочатку ті, що чекають на ваше рішення.",
        filterAll: "Усі · {count}",
        filterStatus: "{status} · {count}",
        admins: "Адміністраторів: {count}",
        adminsInvited: "Запрошено: {count}",
        noAdmins: "Немає ні адміністраторів, ні запрошень",
        donationPending: "Посилання на збір чекає на рішення",
        open: "Відкрити",
        empty: "Притулків ще немає. Перший можна додати через «Новий притулок».",
        noMatch: "Нічого не знайдено. Змініть пошук або фільтр.",
        loadMore: "Показати ще",
        loadFailed: "Список не завантажився.",
      },
      shelter: {
        back: "← Притулки",
        meta: "{city} · {admins}",
        /** `{date}`, the day the current status began (Kyiv), not a day count: no plural, no drift. */
        timeInState: "з {date}",
        legalNote:
          "Ці поля притулок бачить лише для читання. Зміна юридичної особи чи ЄДРПОУ не змінює статус автоматично — рішення за вами.",
        descriptionTitle: "Опис притулку",
      },
      donation: {
        live: "Чинне посилання",
        none: "Посилання немає",
        proposed: "Притулок запропонував {host} {date}. Чекає на ваше рішення.",
        approve: "Схвалити",
        reject: "Відхилити",
        approved: "Посилання схвалено.",
        rejected: "Посилання відхилено.",
        conflict: "Пропозиція змінилася, поки сторінка була відкрита. Тут — поточна.",
      },
      admins: {
        title: "Адміністратори",
        joined: "Має доступ",
        invitedUntil: "Запрошено · посилання діє до {date}",
        invitedExpired: "Запрошено · посилання вже не діє",
        none: "Адміністраторів немає",
        remove: "Прибрати",
        removeConfirm: {
          title: "Закрити доступ? {name} більше не зможе входити в кабінет.",
          body: "Доступ до кабінету закриється одразу, усі сеанси завершаться.",
        },
        inviteAnother: "Запросити ще одного",
        /** The invite button while the shelter has no admin and no invitation (N7). */
        inviteFirst: "Запросити адміністратора",
        resend: "Надіслати ще раз",
        gone: "Цей доступ уже закрито.",
      },
      evidence: {
        title: "Докази для перевірки",
        empty: "Доказів поки немає.",
        kind: {
          edrpou_registration: "Реєстрація · ЄДРПОУ",
          bank_account_holder: "Власник банківського рахунку",
          reference_contact: "Рекомендація",
          site_visit: "Візит на місце",
          supporting_document: "Документ",
        },
        added: "додано {date}",
        field: {
          registeredName: "Назва в ЄДР",
          holderName: "Власник рахунку",
          who: "Хто",
          channel: "Як звʼязатися",
          relationship: "Ким доводиться притулку",
          visitedOn: "Дата візиту",
          notes: "Нотатка",
          label: "Підпис",
        },
        relationship: {
          veterinary_clinic: "Ветклініка",
          local_authority: "Місцева влада",
          partner_organisation: "Партнерська організація",
          other: "Інше",
        },
        noDocument: "Документ не додано — для цього типу доказу це дозволено.",
        gaps: "Для схвалення бракує: {kind} — {provided} з {minimum}.",
        add: "+ Додати доказ",
        remove: "Прибрати",
        typePicker: "Тип доказу",
        siteVisitDateHint: "Дата візиту не може бути в майбутньому.",
      },
      blocked: {
        title: "Адреси, на які поштовий сервіс не доставляє листи",
        none: "Перевірено: жодна адреса цього притулку не заблокована.",
        line: "{email} — {reason}",
        incomplete: "Список заблокованих адрес вдалося отримати лише частково.",
        unknown: {
          provider_error: "Поштовий сервіс відповів помилкою.",
          timed_out: "Поштовий сервіс не відповів вчасно.",
          unsupported_provider: "Цей поштовий сервіс не дає перевірити блокування.",
          /**
           * His round-2 replacement (answer 5), verbatim. His first draft
           * («Поштовий сервіс не показує список заблокованих адрес.») said the
           * provider shows no list. What the code means (`email-provider.ts`,
           * `BlockedStatus`): Resend keeps its own suppression list, and this
           * site doesn't read it (follow-up EM-F1). This wording says exactly
           * that.
           */
          provider_suppresses:
            "Поштовий сервіс має власний список заблокованих адрес; сайт його не перевіряє.",
        },
        asOf: "Станом на {time}",
        manualUnblock: "Розблокувати адресу можна лише в кабінеті поштового сервісу, не тут.",
      },
      history: {
        title: "Історія",
        note: "Зміни статусу, даних, адміністраторів, збору коштів і тварин. Підтвердження «Ще шукає» тут не записуються.",
        empty: "Записів ще немає.",
        more: "Показати ще",
        actor: {
          you: "ви",
          formerAdmin: "колишній адміністратор",
          operator: "адміністратор сайту",
        },
        shelter_created: "Притулок створено",
        shelter_created_script: "Притулок додано з файлу",
        verification: {
          start_review: "Взято на розгляд",
          approve: "Схвалено → «Перевірено»",
          reject: "Відхилено: {code}. {note}",
          suspend: "Призупинено: {code}. {note}",
          reinstate: "Відновлено → «{status}»",
          resubmit: "Повернуто на перевірку",
          pause: "Прийом тварин призупинено",
          resume: "Паузу знято",
        },
        admin_invited: "Надіслано запрошення: {name}, {email}",
        admin_invitation_resent: "Запрошення надіслано ще раз: {name}",
        admin_removed: "Доступ закрито: {name}",
        admin_removed_pending: "Запрошення скасовано: {name}",
        contact_changed: "Змінено контакти",
        freshness_sentence_changed: "Змінено речення на картках",
        description_changed: "Змінено опис притулку",
        donation_proposed: "Запропоновано посилання на збір: {host}",
        donation_proposal_cancelled: "Пропозицію посилання скасовано",
        donation_approved: "Посилання на збір схвалено",
        donation_rejected: "Посилання на збір відхилено",
        verified_data_changed: {
          legal_entity: "Змінено юридичні дані",
          exact_address: "Змінено адресу приміщення",
        },
        animals_imported: "Додано тварин з файлу: {count}",
        animal_created: "Створено картку: {name}",
        animal_edited: "Змінено картку {name}: {fields}",
        animal_listing_changed: "{name}: «{from}» → «{to}»",
        animal_deleted: "Видалено чернетку: {name}",
      },
      create: {
        title: "Новий притулок",
        intro:
          "Тут ви вносите все про притулок: назву, адресу, юридичні дані й докази. Перший адміністратор отримає запрошення на пошту.",
        name: "Назва притулку",
        /**
         * His sentence, narrowed. R-UI 4 lets the operator rename a shelter
         * on S4, which made his second sentence («Після створення назву поки
         * змінити не можна — перевірте написання.») false; his answer 8,
         * verbatim: "Update create.nameHint when it ships." The false sentence
         * is deleted and nothing is added (a deletion needs no new copy); a
         * fuller hint, if he wants one, is his to write.
         */
        nameHint: "Як притулок називає себе.",
        description: "Опис притулку",
        /**
         * His round-2 replacement (answer 5), verbatim. His first draft said
         * people looking for an animal see it on the shelter's animal pages,
         * which no page does: the animal page reads the shelter's
         * `freshnessSentence` instead (`AnimalDetailScreen.tsx`), and only the
         * operator's own S4 renders the description. It can be public all the
         * same: the public `shelters.byId` returns it for a verified shelter.
         * «Може бути публічним» claims exactly that much.
         */
        descriptionHint:
          "Короткий опис притулку. Він може бути публічним, тож не пишіть тут нічого приватного.",
        city: "Місто",
        address: {
          line1: "Вулиця, будинок",
          line2: "Корпус, приміщення · необовʼязково",
          postalCode: "Індекс · необовʼязково",
        },
        coordinates: "Координати",
        coordinatesHint:
          "Скопіюйте з карти у форматі «широта, довгота». Ніде не показуються: люди бачать лише місто.",
        legalTitle: "Юридичні дані",
        legalKind: {
          registered_ngo: "Громадська організація чи фонд",
          sole_proprietor: "ФОП",
          unregistered_initiative: "Ініціатива без реєстрації",
        },
        registeredAt: "Дата реєстрації",
        firstAdminTitle: "Перший адміністратор",
        firstAdminHint:
          "Отримає лист із посиланням для входу. Інших адміністраторів можна запросити зі сторінки притулку.",
        adminName: "Імʼя",
        submit: "Створити й надіслати запрошення",
        submitShort: "Створити",
        cancel: "Скасувати",
        whatHappens: {
          title: "Що буде далі",
          step1: "Притулок зʼявиться у списку зі статусом «Очікує».",
          /** «72 години» is typed for INVITATION_TTL_MS; `copy-plural-pins.test.ts` pins it. */
          step2:
            "{name} отримає лист для входу. Посилання діє 72 години, його можна надіслати ще раз.",
          step3: "Тварин притулку не буде в галереї, доки ви не схвалите перевірку.",
        },
        created: "Притулок створено.",
        createdNoInvite:
          "Притулок створено, але без адміністратора. Запросіть його зі сторінки притулку.",
        inviteValidUntil: "Посилання діє до {date}, {time}.",
        resend: "Надіслати ще раз",
        openShelter: "Відкрити притулок",
        errors: {
          addressHasARole: {
            shelter_admin: "Ця адреса вже має доступ до іншого притулку.",
            operator: "Це адреса адміністратора сайту. Для притулку потрібна інша.",
            invited_elsewhere: "На цю адресу вже надіслано чинне запрошення до іншого притулку.",
          },
          siteVisitInFuture: "Дата візиту не може бути в майбутньому.",
          unknownCity: "Такого міста немає у списку.",
          lostAnswer:
            "Відповідь не надійшла. Притулок міг створитися — перевірте список, перш ніж пробувати знову.",
          failed: "Не вдалося створити притулок. Спробуйте ще раз.",
          required: "Це поле потрібне.",
          /**
           * RUI4-F2 (his answer, 2026-10-18, verbatim: "Error copy: «Назва довша
           * за {max} символів.» (plural pin for 100)"). The display name, on S2
           * and on S4's rename; `{max}` is `SHELTER_DISPLAY_NAME_MAX_CHARACTERS`,
           * and «символів» is the form for 100 (`copy-plural-pins.test.ts`).
           */
          nameTooLong: "Назва довша за {max} символів.",
          edrpouFormat: "Код ЄДРПОУ — 8 цифр.",
          coordinatesFormat:
            "Вкажіть координати як «широта, довгота», наприклад «50.4501, 30.5234».",
        },
      },
      email: {
        sent: "Запрошення надіслано на {email}.",
        sentUnchecked: "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
        blocked: {
          unsubscribed: "Запрошення не надіслано: людина з цієї адреси відписалася від листів.",
          hard_bounce: "Запрошення не надіслано: адреса не існує або не приймає пошту.",
          spam_complaint:
            "Запрошення не надіслано: на попередній лист з цієї адреси поскаржилися як на спам.",
          admin_blocked: "Запрошення не надіслано: адресу заблоковано вручну в поштовому сервісі.",
        },
        failed: {
          provider_error:
            "Запрошення не надіслано: поштовий сервіс відповів помилкою. Спробуйте надіслати ще раз.",
          copy_pending: "Запрошення не надіслано: текст листа ще не готовий.",
        },
      },
      verification: {
        decisionTitle: "Рішення",
        /** His note: true once Q7's shelter-side view (`verificationDecision`) ships, in R-UI 3. */
        decisionCaption: "Притулок побачить рішення і пояснення дослівно у своєму кабінеті.",
        startReview: "Взяти на розгляд",
        approve: "Схвалити → «Перевірено»",
        approveShort: "Схвалити",
        approveNote:
          "Після схвалення тварини притулку одразу зʼявляються в галереї. Для відхилення потрібне пояснення.",
        approveBlocked: "Схвалити поки не можна — бракує доказів:",
        reject: "Відхилити…",
        suspend: "Призупинити…",
        reinstate: "Відновити → «{status}»",
        resubmit: "Повернути на перевірку",
        suspended: {
          title: "Притулок призупинено",
          reasonLabel: "Пояснення, яке бачить притулок",
          priorLabel: "До призупинення статус був",
          priorPausedSince: "з {date} притулок сам поставив паузу",
          reinstateExplainPaused:
            "Кнопка «Відновити» поверне притулок на паузу, а не в «Перевірено». Тварини лишаться прихованими, доки притулок сам не зніме паузу.",
          reinstateExplainVerified:
            "Кнопка «Відновити» поверне статус «Перевірено», і тварини знову зʼявляться в галереї.",
        },
        noConfirm: "Підтвердження не потрібне: ця дія нічого не приховує.",
        rejected: {
          title: "Відхилено",
          reason: "{code}. {note}",
        },
      },
      reasonDialog: {
        rejectTitle: "Відхилити «{shelter}»?",
        suspendTitle: "Призупинити «{shelter}»?",
        rejectBody:
          "Притулок побачить це пояснення дослівно у своєму кабінеті. Його тварин не буде в галереї.",
        suspendBody:
          "Тварини притулку одразу зникнуть із галереї. Притулок побачить це пояснення у своєму кабінеті. Відновити можна будь-коли.",
        codeLabel: "Причина",
        reasonLabel: "Пояснення",
        reasonHint: "Обовʼязково. Пишіть так, щоб людина знала, що робити далі.",
        confirmReject: "Відхилити",
        confirmSuspend: "Призупинити",
      },
      codes: {
        rejection: {
          insufficient_evidence: "Недостатньо доказів",
          identity_unverifiable: "Не вдалося підтвердити, хто стоїть за притулком",
          duplicate_submission: "Повторна заявка",
          out_of_service_area: "Поза областю, де працює сайт",
          spam: "Спам",
          other: "Інше",
        },
        suspension: {
          unresponsive: "Немає звʼязку з притулком",
          complaint_upheld: "Скарга підтвердилася",
          listing_quality: "Картки не відповідають дійсності",
          suspected_fraud: "Підозра на шахрайство",
          other: "Інше",
        },
      },
      errors: {
        illegalTransition: "З поточного статусу так не можна. Сторінку оновлено.",
        conflictReload: "Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.",
        failed: "Не вдалося. Спробуйте ще раз.",
        lostAnswer: "Відповідь не надійшла. Сторінка перевіряє, чи дію виконано.",
      },
      support: {
        enter: "Переглянути як притулок · лише читання",
      },
    },
    /**
     * R-UI 3 · the shelter's side of a rejection or suspension (RU-Q7, his
     * answer 7, verbatim: "Yes: a minimal shelter-side view in R-UI 3 showing
     * the code and my note verbatim (keys in rui-copy-uk.md §3.4)."), his
     * final Ukrainian. The note follows `noteLabel` verbatim, as a quote,
     * then `signature`.
     */
    verificationDecision: {
      rejectedTitle: "Перевірку не пройдено",
      suspendedTitle: "Притулок тимчасово призупинено",
      reason: "Причина: {code}.",
      /**
       * His round-2 answer 2, verbatim: "Reason view on the shelter side:
       * «Пояснення:», then my note verbatim, then a signature line «— {operator}»
       * (nominative, as in the emails). No new env var." It replaces his §3.4
       * «Пояснення від {operator}:», whose «від» needed a genitive name that
       * isn't configured (RS-Q2 holds the nominative only).
       */
      noteLabel: "Пояснення:",
      /**
       * The line under the note (round-2 answer 2, above). `{operator}` is the
       * name standing alone, as both emails sign: `standaloneOperatorName`, the
       * configured name, else «Адміністратор сайту».
       */
      signature: "— {operator}",
      contact: "Якщо маєте питання, напишіть мені.",
      suspendedEffect: "Поки притулок призупинено, його тварин немає в галереї.",
      rejectedEffect: "Тварин притулку не буде в галереї, доки перевірку не пройдено.",
    },
    /**
     * The words `operator.history.animal_listing_changed` («{name}: «{from}» →
     * «{to}»») and `animal_edited` («Змінено картку {name}: {fields}») fill in.
     * His R-UI file gives those lines but not the words, so these are his own
     * K3 words, verbatim from his K3 answers (`k3-copy-uk.md`, 2026-10-17):
     * `kabinet.listingStatus.*` for a listing's state, and the K3 form's field
     * labels (`who.nameLabel`, `who.speciesLabel`, `who.sexLabel`,
     * `who.sizeLabel`, `age.title`, `description.title`, `photos.title`). The
     * two medical fields reuse `medical.vaccination` and `medical.spayNeuter`,
     * which his K3 answer 6 makes the form's own labels too. Held here, not
     * under the K3 keys, because PR 4 adds those keys itself; once both have
     * merged, one copy of each word is enough (follow-up).
     */
    animalHistoryLabels: {
      listing: {
        draft: "Чернетка",
        published: "Опубліковано",
        reserved: "Домовляються",
        adopted: "Удома",
        withdrawn: "Знято з показу",
      },
      field: {
        name: "Імʼя",
        species: "Вид",
        sex: "Стать",
        size: "Розмір",
        age: "Вік",
        description: "Опис",
        photos: "Фото",
        /** DR1 (S3), his text (2026-10-20). */
        coatLength: "Шерсть",
      },
    },
  },
} as const;
