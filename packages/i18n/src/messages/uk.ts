/**
 * Ukrainian UI strings for the discovery flow.
 *
 * Every user-facing string lives here so M9 (i18n) can swap the source
 * to next-intl message files without touching components. Keys mirror
 * the design string table in docs/design/.
 */
export const uk = {
  // --- Screen 01 · First run ---
  firstRun: {
    promise: "Тварини з перевірених притулків Київщини. Гортайте, щоб подивитися, кого шукає дім.",
    disclaimer:
      "Без реєстрації. Ми не беремо і не переказуємо грошей. «Не зараз» — це просто фільтр, а не оцінка тварини.",
    cityHeading: "Ваше місто",
    allRegion: "Уся Київщина",
    viewAnimals: "Дивитися тварин",
  },

  // --- Screen 02 · Feed / deck ---
  feed: {
    filtersLabel: "Фільтри",
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
  },

  // --- Detail screen (04) ---
  detail: {
    /** Template: "Перевірений вручну · {years} на Opika" — brand string lives here, not in domain */
    shelterVerifiedYears: "Перевірений вручну · {years} на Opika",
    donateShelter: "Підтримати притулок",
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
    backToFeed: "Повернутися до стрічки",
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
    /** The gallery card's tablet (600-1023) layout, 6px inset vs 8px elsewhere — docs/design/README.md, "The Gallery" > "Card". */
    badgeShort: "Домовляються",
    action: "Стати другим у черзі",
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

  // --- Pagination footer (E3) ---
  // `docs/design/Opika - Keeper's Voice.dc.html`'s 1440 GALLERY block has
  // the literal pagination row: prev/next are visible-text buttons ("←
  // Назад" / "Далі →"), not glyph-only controls, and the number group ends
  // with a "з N" count. `prevLabel`/`nextLabel` below are the VISIBLE
  // button text now, not a separate aria-label — an aria-label that didn't
  // contain that text would be a WCAG 2.5.3 accessible-name mismatch, an
  // earlier draft of this component had exactly that bug. The design sets
  // the page numbers in IBM Plex Mono; this codebase deliberately dropped
  // that family (see apps/web/src/app/fonts.ts, "measured, then dropped" —
  // 11.2% of font payload for one rarely-seen label) and nothing since has
  // reintroduced it, so the numbers render in Commissioner (`font-sans`)
  // like the rest of this table's copy, not a new one-off exception.
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

  // --- Language toggle ---
  locale: {
    uk: "Українська",
    en: "English",
  },
} as const;
