/**
 * Ukrainian UI strings for the discovery flow.
 *
 * Every user-facing string lives here so M9 (i18n) can swap the source
 * to next-intl message files without touching components. Keys mirror
 * the design string table in docs/design/.
 */
export const uk = {
  // --- Home / first run ---
  firstRun: {
    /**
     * Rewritten for the gallery-first course correction — "Гортайте, щоб
     * подивитися" (swipe to see) named the deck as the way to look at
     * animals, which stopped being true the moment the gallery became the
     * primary surface. "Перегляньте список" (browse the list) names the
     * actual home page CTA's actual destination.
     */
    promise:
      "Тварини з перевірених притулків Київщини. Перегляньте список і подивіться, кого шукає дім.",
    disclaimer:
      "Без реєстрації. Ми не беремо і не переказуємо грошей. «Не зараз» — це просто фільтр, а не оцінка тварини.",
    cityHeading: "Ваше місто",
    allRegion: "Уся Київщина",
    viewAnimals: "Дивитися тварин",
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
    next: "Далі",
    write: "Написати",
    writeShelter: "Написати притулку",
  },

  // --- Freshness ---
  freshness: {
    /** Rendered by Intl.RelativeTimeFormat('uk'), not this string. */
    updatedAgo: "Оновлено {days}",
    attribution: "Слова притулку · дата автоматична",
  },

  // --- Medical ---
  medical: {
    heading: "Медичний стан",
    unknown: "Не записано",
    inProgress: "У процесі",
    registryConfirmed: "Підтверджено реєстром тварин",
    shelterDeclared: "Слова притулку",
    rabies: "Сказ",
    vaccination: "Комплексне щеплення",
    spayNeuter: "Стерилізація",
    registry: "Реєстр тварин",
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
    notFound: {
      eyebrow: "НЕ ЗНАЙДЕНО",
      title: "Цієї картки більше немає.",
      body: "Тварину вже забрали з реєстру, або посилання застаріле. Це не помилка — просто картки тут більше немає.",
      action: "Усі тварини",
    },
  },

  // --- Contact reveal (05) ---
  reveal: {
    /** Template: "Ви запитали про {name}." */
    youAskedAbout: "Ви запитали про {name}.",
    title: "Ось як зв'язатися з притулком.",
    subtitle:
      "Притулок не знає про цей запит, поки ви не напишете самі. Нічого не сталося автоматично.",
    /** Template: "Контакти збережено такими, якими вони є сьогодні · {date}" */
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
    footnote:
      "Сторінки, а не безкінечна стрічка: у кожної сторінки своя адреса, кнопка «назад» " +
      "працює, і посилання можна надіслати в Telegram.",
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
    about: "Про проєкт",
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
      "Opika — реєстр тварин притулків Київщини, який я роблю сам, поза роботою. Немає команди, немає інвестора — є одна людина, яка вважає, що знайти дім для тварини не повинно залежати від того, чи вміє притулок вести застарілий Excel-файл.",
    free: "Реєстр безкоштовний для притулків сьогодні і лишиться безкоштовним. Жодних платних тарифів, жодного «спробуйте безкоштовно перші три місяці» — якщо це колись зміниться, кожен притулок дізнається про це заздалегідь, а не постфактум.",
    money:
      "Opika ніколи не бере участі в грошах: немає прийому платежів, немає комісії, немає збору донатів через платформу. Кнопка «Підтримати притулок» веде на власну сторінку притулку в іншому сервісі (наприклад, monobank) — реєстр лише показує посилання, гроші йдуть напряму, і видно, куди саме.",
    data: "Дані, які вносить притулок — адреса, контакти, картки тварин — належать притулку. Точна адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише наближену локацію. Притулок може попросити видалити свій запис у будь-який момент.",
    contact: "Зв'язатися з розробником: {contact}",
  },

  // --- Language toggle ---
  locale: {
    uk: "Українська",
    en: "English",
  },
} as const;
