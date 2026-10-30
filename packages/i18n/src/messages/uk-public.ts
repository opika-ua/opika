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
 * R4-2, Oleksii's own Ukrainian - held here rather than appended to
 * `uk.about.analytics` yet, because it can't go live while the pre-launch
 * gate still gives a real visitor a second, undisclosed cookie
 * (`docs/observations.md`'s "/pro sentence" section has the full gating
 * decision). The text has moved since his original 2026-10-06 draft
 * (`docs/decisions-inbox/docs-r4-decisions-2026-10-06.md`): PR #186 (S8)
 * appended the saved-list sentence; the global rename in copy audit #19
 * (2026-10-22, PR #183) made the right-swipe word «Написати» everywhere at
 * the time - «Запитати» no longer named anything in the product. Pet card
 * PR 5 (2026-10-27) renamed this constant (dropping the `PENDING_` prefix -
 * it was never about *his* approval being pending, only about the gate
 * above; the text itself has been his approved words since 2026-10-06) and
 * swapped «Написати» for «Дати сімʼю», the pet card's own reveal-trigger
 * label, which the deck's own button no longer shares now that the two
 * surfaces have different words for the same action. **This constant, not
 * the 2026-10-06 file, is what lands** when R4-2 actually ships. Still held:
 * the pre-launch cookie-disclosure gate this sentence waits on is unrelated
 * to PR 5 and remains unresolved. `apps/web/src/seo-flags.ts`'s
 * `assertAnalyticsCopyMatchesGateState` checks for this exact string, not a
 * loose substring, so that a reworded or partial version of the sentence
 * still trips the tripwire. When this lands, append this constant to
 * `uk.about.analytics` directly - `+ " " + R4_2_ANALYTICS_SENTENCE` or
 * equivalent - rather than retyping the text, so the landed sentence and
 * this constant can never drift apart.
 */
export const R4_2_ANALYTICS_SENTENCE =
  "Людині, яка шукає тварину, сайт ставить одне кукі – і тільки після першої дії: " +
  "«Не зараз» чи «Дати сімʼю». У ньому немає імені чи номера телефону, лише " +
  "випадковий ідентифікатор: щоб режим «по одній» памʼятав, кого ви вже бачили, а сайт – " +
  "чиї контакти ви вже відкрили. Він перестає діяти через 7 днів без візитів або через 30 " +
  "днів у будь-якому разі. Окремо від кукі, якщо ви зберігаєте тварин, їхній список лежить " +
  "у цьому браузері.";

/**
 * GDPR erasure, option A (`docs/gdpr-analysis.md` §5 item 4). Oleksii's own
 * Ukrainian, dictated directly and checked word for word against the code
 * (2026-10-24) - earlier rounds found two real gaps (the "no live invite
 * elsewhere" guard wasn't in the sentence; the scrub itself missed a
 * second shelter entirely once it was), both fixed in code rather than in
 * the sentence. This round of the check found nothing left to differ.
 * Landed directly in `uk.about.data` below, not held: unlike
 * `PENDING_R4_2_ANALYTICS_SENTENCE`, nothing gates this one off `/pro`.
 * Recorded in the inbox as row GDPR-F1.
 */
export const ADMIN_ERASURE_SENTENCE =
  "Коли адміністратора притулку прибирають із кабінету, скасовують його запрошення або " +
  "запрошення так і не прийняли, обліковий запис і адреса пошти видаляються, якщо ця " +
  "адреса не має доступу до іншого притулку і не запрошена до нього. Тоді ж адресу " +
  "прибирають з історії притулку: там лишається лише запис про те, що адміністратора " +
  "запрошено, додано чи прибрано.";

export const ukPublic = {
  // --- 01 First run - docs/design/README.md:427. Was a band above the
  // gallery grid (FirstRunBand.tsx); removed in Phase D (O-3,
  // docs/observations.md) as redundant with the filter rail and result
  // count. `promise` survives as the root layout's og:description only -
  // see that section's amendment note ---
  firstRun: {
    /**
     * Rewritten for the gallery-first course correction - "Гортайте, щоб
     * подивитися" (swipe to see) named the deck as the way to look at
     * animals, which stopped being true the moment the gallery became the
     * primary surface. "Перегляньте список" (browse the list) named what
     * was, at the time, right below the band: the gallery grid itself. Now
     * link-preview copy only, but still an accurate invitation to the page
     * it describes.
     */
    promise: "Собаки й коти з перевірених притулків України шукають дім. Перегляньте список.",
  },

  /**
   * Phase D (`docs/build-plan.md`'s D-2) - relevant only while
   * `REGISTRY_HAS_NO_REAL_SHELTERS` (`apps/web/src/seo-flags.ts`) is true,
   * i.e. today, on production. Both keys confirmed empty of `COPY_PENDING`
   * by `copy-status.test.ts`, same pattern as `forShelters` below.
   *
   * Provenance: drafted by Claude from an English sense; Oleksii selected
   * these from offered options on 2026-09-05.
   *
   * Renamed 2026-09-06 - the two keys previously named `promise` and
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
     * `firstRun.promise` (`app/layout.tsx`) - the link-preview text anyone
     * sharing a URL from this deploy actually sees, while the registry
     * holds no real shelters. As metadata, a link preview is free-flowing
     * text, not a fixed-width UI slot, so there was no truncation budget to
     * fit like `deckLabel` below has. **That stopped being the whole story
     * 2026-09-10** - see the correction below: the two visible render sites
     * this string gained *do* sit inside a real container width, and do
     * have a budget, just not a single-line one. They wrap instead of
     * truncating; `site-header.harness.ts` asserts `scrollWidth <=
     * clientWidth` at 320px specifically so a future `truncate` (which
     * would clip most of the sentence) fails loudly rather than silently.
     *
     * Scoped, Option B (2026-09-06, see `docs/observations.md`): `/prytulkam`
     * and `/pro` override this root default with their own existing opening
     * sentences instead of inheriting it - this disclosure was never meant
     * to reach those two specifically, only the surfaces that actually show
     * fabricated animals/shelters (the gallery, the deck, and the detail
     * page inherit or set this).
     *
     * **Correction, 2026-09-10 (Oleksii, then the reviewer) - also renders
     * visibly, not only as metadata.** Until this date, this string only
     * ever reached `<meta>` tags - invisible to a visitor who simply opens
     * the page rather than sharing its link. `tvaryny/page.tsx` (the
     * gallery) and `AnimalDetailScreen.tsx` (the detail page - the one
     * `/prytulkam` itself tells a shelter to expect shared into Telegram)
     * now both render this same sentence visibly in the page body too,
     * gated on the same `REGISTRY_HAS_NO_REAL_SHELTERS` flag. One string,
     * two independent render sites plus the metadata swap above - not a
     * new sentence for the visible case.
     */
    bannerNotice: "На сайті поки немає справжніх притулків – усі картки тут демонстраційні.",
    /**
     * The deck header's compact label (`DeckScreen.tsx`) - replaces only
     * `filtersLabel`. The position count stays (Oleksii, D-1: demo mode is
     * the whole testing period, a deck missing the count for weeks is not
     * the deck being tested); the progress bar is hidden unconditionally
     * whenever this label shows, to give it the room the bar would
     * otherwise take (D-1's degrade order - the count alone already
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
    /**
     * gallery-v3 (Figma `58:1617`): singular, builder-prompt-approved -
     * was "Фільтри" (plural) until this PR. Read by both
     * `FilterSheet.tsx`'s own trigger button and, since this PR,
     * `GalleryControlBlock.tsx`'s desktop «Фільтр» toggle - the same label
     * on both of this page's two filter-disclosure controls.
     */
    filtersLabel: "Фільтр",
    /** Desktop gallery header, full phrase - docs/design/README.md "Screens" > "Gallery." */
    enterDeck: "Гортати по одній",
    /** Mobile sticky-bar short form, same destination - "sticky bottom bar «Фільтри · N / Гортати»." */
    enterDeckShort: "Гортати",
    /** The deck's own header, exit control - docs/design/README.md "Deck chrome and the mode switch." */
    backToList: "← До списку",
    /** Screen-reader announcement on entering the deck, template: "Тварина {position} з {total}." */
    /** QA 2026-10-29, owner text: the deck's visually hidden page heading. */
    deckHeading: "Тварини по одній",
    deckEntryAnnouncement: "Режим по одній. Тварина {position} з {total}.",
    /**
     * gallery-v3 (Figma `58:1617`): the card's pill. Was "Усиновити" until
     * Oleksii's direct replacement, mid-build - owner-approved final copy,
     * not [COPY PENDING]. A non-interactive `<span>` inside the card's one
     * link (owner decision #2, 2026-10-25) - the link's own `aria-label`
     * (`cardAccessibleName`) already fixes the accessible name, so this
     * text never reaches it either way; decorative in practice, not just
     * in intent.
     */
    adoptPill: "Познайомитися",
    /**
     * The gallery page's own `<h1>`. Was "Каталог" (the Figma frame's own
     * placeholder text, 58:1617) until Oleksii's direct replacement,
     * mid-build - owner-approved final copy, not [COPY PENDING].
     */
    galleryTitle: "Шукають дім",
  },

  // --- Screen 03 · Filters ---
  filters: {
    title: "Фільтри",
    /**
     * Sentence case (filter selectors PR): the same approved words as the
     * kabinet's own field labels («Місто», «Вид», «Розмір», «Вік»), their own
     * keys here (PC1b-T2: the gallery reads no kabinet.* string).
     */
    city: "Місто",
    species: "Вид",
    speciesDogs: "Собаки",
    speciesCats: "Коти",
    /**
     * The species toggle's third segment (gallery filter restructure):
     * confirmed in chat, his answer: "«Усі» (Recommended)". The kabinet
     * has the same word for an analogous "all" filter state
     * (`kabinet.animalList.filter.all`), but PC1b-T2's rule ("the public
     * gallery must not read kabinet.* strings") means this is its own,
     * separate public-namespace string, not a cross-namespace reuse.
     */
    speciesAny: "Усі",
    size: "Розмір",
    sizeSmall: "Малий",
    sizeMedium: "Середній",
    sizeLarge: "Великий",
    age: "Вік",
    ageBaby: "Малюк",
    ageYoung: "Молодий",
    ageAdult: "Дорослий",
    ageSenior: "Літній",
    /**
     * No longer a filter's own values (the gallery filter restructure
     * removed `coat` - the dropdown's own legend - with the fur dimension
     * itself), but kept under this key: pet card PR 5 already made the
     * detail page's «Про мене» coat-length chip reuse these two words
     * rather than carrying its own copy of "short-haired"/"long-haired",
     * and that chip (now a plain, non-filterable one, same restructure)
     * still needs them. Designer round 1 (S3), his text (2026-10-20).
     */
    coatShort: "Короткошерсті",
    coatLong: "Довгошерсті",
    /**
     * The eighth dimension - all 4 strings duplicate already-approved words
     * (SF-Q2, `copy-status.test.ts`): `sex` is his K3 field label
     * `who.sexLabel`; `sexMale`/`sexFemale` duplicate `cardMeta.sexMale/
     * sexFemale`; `sexUnknown` duplicates the standing rule's «Не записано».
     * No dedicated no-match sentence needed - sex has no "unrecorded" case
     * the way fur/temperament/colour do, so `NoMatch.tsx`'s generic
     * «Прибрати «{dimension}»» template covers it.
     */
    sex: "Стать",
    sexMale: "Хлопчик",
    sexFemale: "Дівчинка",
    sexUnknown: "Не записано",
    /**
     * Template: "Знайдено {count} {animalWord}. Притулків у цьому місті:
     * {shelterCount}." `{animalWord}` is pre-pluralized by the caller
     * (`pluralizeUk(count, uk.filters.animalWordAccusative)`) - the template
     * cannot pick the right Ukrainian noun form itself, only compose around
     * it. The impersonal «Знайдено» governs the accusative, so it agrees for
     * every count (1, 2, 5, 11, 21, 22: «1 тварину», «2 тварини», «5 тварин»);
     * the earlier «Підходить {count}» did not, for 2-4 (audit 2026-10-22, #29).
     * "Притулків" is a fixed label form here (a count-value pair, "Тварин: 12"
     * in sentence form), not an embedded count-noun phrase, so it never
     * varies with `shelterCount`.
     */
    resultCount: "Знайдено {count} {animalWord}. Притулків у цьому місті: {shelterCount}.",
    /**
     * The sheet's `resultCount` above names "цьому місті", which only means
     * something when a city is selected. With no city selected - "Усі
     * міста" is the sheet's own default - `shelterCount` spans every
     * city shown, and the sentence would claim a specific city that isn't
     * selected. This is that case: the same sentence as the rail's
     * `resultCountRail` below (one wording for it, `gallery-copy.ts` fills
     * both the same way), closed with a full stop for the sheet.
     */
    resultCountAnyCity: "Знайдено {count} {animalWord} у {shelterCount} {shelterWord}.",
    reset: "Скинути",
    /** Template: "Показати {count}" */
    showCount: "Показати {count}",
    /**
     * docs/design/README.md, "Rail, count, sort": "Знайдено 34 тварини у 7
     * притулках" - a different sentence from `resultCount` above, not the
     * same one reused, matching the design's own distinct copy for the
     * rail (≥1024) versus the sheet (<1024). `{shelterWord}` varies only
     * between "притулку" (1) and "притулках" (2+) - Ukrainian locative
     * plural doesn't distinguish few/many the way the nominative animal
     * count does.
     *
     * `{animalWord}` here is `animalWordAccusative`: the impersonal
     * "Знайдено" governs the accusative, so one result reads "Знайдено 1
     * тварину". Since the audit of 2026-10-22 (#29) the sheet's sentences
     * open with the same «Знайдено» and use the same list, so the nominative
     * `animalWord` below is no longer used by either.
     */
    resultCountRail: "Знайдено {count} {animalWord} у {shelterCount} {shelterWord}",
    animalWord: { one: "тварина", few: "тварини", many: "тварин" },
    animalWordAccusative: { one: "тварину", few: "тварини", many: "тварин" },
    shelterWordLocative: { one: "притулку", few: "притулках", many: "притулках" },
    sortLabel: "Сортування",
    sortFreshest: "Спочатку найсвіжіші картки",
    sortLongestWaiting: "Найдовше чекають",
    /**
     * gallery-v3 (Figma `58:1617`): the control block's own short visible
     * labels, builder-prompt-approved. The long sentences above stay as
     * each link's `aria-label` (`GallerySortToggle.tsx`) - WCAG 2.5.3 is
     * satisfied because the short label is a literal prefix a voice-control
     * user would say, not a different wording.
     */
    sortFreshestShort: "Нові",
    sortLongestWaitingShort: "Зачекались",
    /** The city group's «any» chip. Owner-approved nationwide copy table, row 5. */
    allCities: "Усі міста",
    /** The oblast filter's label and its «any» chip (rows 17 and 18 of the same table). */
    region: "Область",
    allRegions: "Усі області",
    /**
     * The long city list (nationwide table, rows 19 and 20): the button that reveals the cities
     * past the first dozen, and the label of the small field narrowing the loaded ones.
     * Template: "Показати всі ({count})".
     */
    showAllOptions: "Показати всі ({count})",
    findCity: "Знайти місто",
    /** The same wordings as the table's rows 34 and 28 (picker), reused for the field's result line. Template: "Знайдено: {count}". */
    cityFound: "Знайдено: {count}",
    cityNoMatch: "Нічого не знайдено",
    railFooter: "Фільтра за датою немає: тварина, про яку давно не писали, теж шукає дім.",
    /**
     * gallery-v3 (Figma `58:1617`): the dropdown row's own clear-all ✕,
     * Oleksii mid-build ("replacing chevron icon with X to clear all
     * filters [in] 1 click"). Template: "{dimension}" -> the dropdown's own
     * legend (e.g. "Скинути Місто").
     *
     * Shipped as the builder's own draft (not `[COPY PENDING]` - that
     * sentinel wasn't an option here: `open-writes-copy-gate.test.ts`'s
     * "nothing in the entire uk catalogue is pending" CI gate, Oleksii Q-B,
     * turns production sign-in off for ANY pending string, this namespace
     * included, not only `kabinet.*`), flagged in the decisions batch
     * (GV3-Q2) pending his confirm-or-replace. **Confirmed, 2026-10-26,
     * Oleksii, verbatim: "Скинути is fine."** Reused `reset`'s own verb
     * above rather than inventing a second word for the same action, same
     * reasoning the draft comment originally gave.
     */
    clearDimension: "Скинути {dimension}",
    /**
     * Template: an option pill's accessible name in the filter selectors,
     * the handoff's own example «Київ, 34 тварини». `{animalWord}` is
     * `animalWord` (nominative), pluralised by the caller.
     */
    optionCount: "{option}, {count} {animalWord}",
    /**
     * Filters v2 (owner-approved copy table, 2026-10-30): the searchable Область and Місто fields on
     * desktop and the full-screen filter sheet below 1024px. Template where it has `{…}`.
     */
    findCityField: "Пошук міста",
    findRegionField: "Пошук області",
    clearSelection: "Очистити",
    /** Template: "Вибрано: {count}"; also the accessible name of the count badge on a filled field. */
    selectedCount: "Вибрано: {count}",
    groupHasAnimals: "Є тварини",
    groupNoAnimals: "Поки без тварин",
    cityNoMatchHint: "Тут лише міста, де зараз є тварини.",
    /** Template: "Показати {count} {animalWord}"; `{animalWord}` is `animalWordAccusative`. */
    showAnimals: "Показати {count} {animalWord}",
    done: "Готово",
    /** The sheet button when the count for unapplied choices cannot be stood behind (owner-approved, 2026-10-30). */
    showResults: "Показати результати",
    anyValue: "Усі",
    back: "Назад",
    /** Template: "Прибрати фільтр {name}", `{name}` in the nominative as the chip shows it. */
    removeFilter: "Прибрати фільтр {name}",
    close: "Закрити",
    /** Template: "Активних фільтрів: {count}", the accessible name of the badge on the «Фільтри» pill. */
    activeCount: "Активних фільтрів: {count}",
  },

  // --- Swipe affordances ---
  swipe: {
    left: "Не зараз",
    right: "Написати",
  },

  // --- Saved animals (designer round 1, S7). "Save," never "like" (DR1-Q3, his text,
  // verbatim): the button, the saved state, and the bookmark icon (no heart). Storage stays
  // `likes.v1`/`likes*` internally (DR1-D14) - nothing user-facing says "like." ---
  likes: {
    /** The save toggle's accessible name while an animal is not saved. */
    save: "Зберегти",
    /** The save toggle's accessible name once an animal is saved. */
    saved: "Збережено",
    /** `{name}` is the animal's name. Announced (aria-live) the moment a save succeeds. */
    added: "{name}: додано до збережених",
    /** `{name}` is the animal's name. Announced (aria-live) the moment a save is undone. */
    removed: "{name}: прибрано зі збережених",
    /** `{max}` is `MAX_LIKES` (200). Announced in place of `added` when the list is full. */
    full: "Список повний – у ньому може бути не більше {max} тварин. Щоб додати нову, приберіть когось зі списку.",
    /** S8: the saved page (`/zberezheni`). His exact text, given directly. */
    title: "Збережені тварини",
    /** Shown on the saved page itself: the device-only reach of the list. */
    deviceOnly:
      "Список зберігається лише в цьому браузері: на іншому пристрої чи в іншому браузері його не буде.",
    /** The empty-list state. */
    empty: "Тут поки нічого немає. Збережіть тварин у галереї, щоб повернутися до них пізніше.",
    /** The empty state's link back to the gallery. */
    emptyLink: "До галереї",
    /**
     * `{name}` is the animal's name. Only ever rendered when `unavailable.name` is non-null
     * (S8-D2, revised: Q-B forbids `[COPY PENDING]` anywhere live in this catalogue - production
     * sign-in checks the whole thing, not just kabinet - and a builder can't invent his
     * Ukrainian, so a saved id with no name left to show is dropped from the page instead of
     * given a sentence; `SavedPageScreen.tsx` never reaches this key for a `null` name).
     */
    unavailable: "{name} більше не показується на сайті.",
    /** The remove control on each saved-page card. */
    remove: "Прибрати зі списку",
    /** `localStorage` threw (private mode, blocked storage) - the saved page's own notice. */
    storageBlocked: "Цей браузер не дає сайту зберегти ваш список.",
    /** Designer feedback batch C, his own text: aria-live while the saved page is reading ids/fetching cards, never shown as visible body text. */
    loading: "Завантаження списку…",
  },

  // --- Action buttons ---
  actions: {
    notNow: "Не зараз",
    write: "Написати",
    writeShelter: "Написати притулку",
    /**
     * Oleksii's Phase D decisions (the not-a-judgement notice - not
     * build-plan.md's D-3 row, an unrelated robots-metadata task):
     * `docs/standing-constraints.md`'s "The swipe is filtering, not
     * judging" is a standing product rule, and
     * the only place it was ever stated - the sentence used to close
     * `firstRun.disclaimer`, deleted with `FirstRunBand` - was gone with no
     * replacement. Phase D's interim home was the detail page, directly
     * under the `notNow`/`writeShelter` pair - R2 (Phase R,
     * `docs/build-plan.md`) moves it to its permanent one, the deck
     * itself (`SwipeDeck.tsx`), and removes it from the detail page. Not
     * a duplication: the rule this sentence states is about what a
     * *swipe* decision means, and the detail page's own «Не зараз» never
     * was a swipe - it's a plain link back to the gallery
     * (`AnimalDetailScreen.tsx`'s own comment on that button), recording
     * no exclusion and needing no reassurance about one.
     *
     * Recovered verbatim, not newly written - the original disclaimer's own
     * closing sentence, «просто» included. An earlier pass here dropped
     * «просто» as an unapproved edit; restored because this sentence is
     * Oleksii's existing shipped copy and needs no fresh approval at all
     * once it's reproduced exactly, which is the whole point of recovering
     * it rather than redrafting it.
     */
    notAJudgementNotice: "«Не зараз» – це просто фільтр, а не оцінка тварини.",
  },

  // --- Freshness ---
  freshness: {
    /** Rendered by Intl.RelativeTimeFormat('uk'), not this string. */
    updatedAgo: "Оновлено {days}",
    /**
     * «· дата автоматична» deleted 2026-10-15 (VH-Q2, Oleksii): nothing fills a
     * date into the shelter's sentence, and the design drops `{date}` (VH-Q1).
     */
    /**
     * Since designer round 1 (S6), the heading of the shelter page's section
     * holding the shelter's description and its sentence, and nowhere else
     * (Oleksii's DR1-Q1: «Слова притулку» only on the shelter page).
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
    /**
     * DR1-Q1 (option (c)), his text: «Слова притулку» names the shelter's
     * own words on the shelter page only, so the medical rows' source label
     * is a word of its own.
     */
    shelterDeclared: "Дані притулку",
    /**
     * Copy audit 2026-10-22 #16: the vaccination and sterilisation rows' status line.
     * «Дані притулку» names the source and never says the thing was done; this says both.
     * A key of its own so `shelterDeclared` stays the reusable source label.
     */
    doneShelterDeclared: "Зроблено, за даними притулку",
    rabies: "Щеплення від сказу",
    vaccination: "Комплексне щеплення",
    spayNeuter: "Стерилізація",
    registry: "Зроблено, за даними державного реєстру тварин",
  },

  // --- Location ---
  location: {
    /** Template: "{place} · у домі волонтерки"; `{place}` is the kind-aware text from `placeText`. */
    fostered: "Живе у волонтерки, {place}. Точної адреси ми не знаємо і не показуємо.",
    /**
     * Pet card PR 5 dropped the detail screen's own "Де живе" explanatory
     * block (`heading`/`noMapExplanation`, used only there): the new panel
     * header shows just the bare city name as text beside a decorative
     * location icon (owner decision 6 - "the location icon is decoration,
     * the city is text"; the reference screenshot shows "Київ", not "м.
     * Київ" - no template, the resolved `cityName` prop printed as-is), no
     * heading, no map-absence sentence. `lineAtShelter` stays in use,
     * unchanged, by `ContactRevealDialog.tsx`'s own meeting-place line;
     * `lineFostered` is kept for symmetry even though nothing calls it
     * today - the gallery card's own meta line uses
     * `cardMeta.fosteredHousing`/`atShelter` instead.
     */
    lineFostered: "{place} · на перетримці",
    lineAtShelter: "{place}",
  },

  // --- Shelter page (designer round 1, S6) ---
  /**
   * His text (`docs/designer-round-1.md` §11 item 4). The page's title is the
   * shelter's name alone, its «Слова притулку» heading is
   * `freshness.attribution`, and its city line is `cardMeta.atShelter`: three
   * reuses he confirmed, so no key of their own here.
   */
  shelterPage: {
    /** `{count}` is the number of the shelter's animals adopters can see. */
    animalsHeading: "Шукають дім: {count}",
    noAnimals: "Зараз тут немає тварин, які шукають дім.",
  },

  // --- Detail screen (04) ---
  detail: {
    /** Template: "Перевірено вручну · на сайті з {year} року" - `{year}` is the year the shelter's record was created. */
    shelterVerifiedYears: "Перевірено вручну · на сайті з {year} року",
    donateShelter: "Підтримати притулок",
    /**
     * Designer round 1 (S6), his text: the animal page's shelter row is a
     * link to the shelter page, and this is its accessible name. `{name}` is
     * the shelter's display name.
     */
    shelterRowLink: "Сторінка притулку «{name}»",
    /**
     * The subtitle line's species word - "Метис · 2 роки · середня" in the
     * mock, but "Метис" (mixed breed) has no domain field at all (`Animal`
     * has `species`, not `breed`); no filter-chip label works either,
     * those are plural ("Собаки"/"Коти" for the rail). Singular, common
     * gender regardless of `sex` - same simplification `cardMeta`'s own
     * age words already make (documented there as a flagged, not fixed,
     * gap), not a new one introduced here. Used by `detail-text.ts`'s
     * `speciesLabel`, sex-neutral at both its callers: the card/page
     * subtitle line (`animalSubtitle`) and the animal page's own `<title>`
     * (PR B, the SEO review). These two string values are also read
     * directly, bypassing `speciesLabel`, by the kabinet form
     * (`FormSections.tsx`) - its own `t.who.speciesLabel` is an unrelated
     * i18n key, not this function. The gallery's filter chips are a
     * different pair entirely (`uk.filters.speciesDogs`/`speciesCats`,
     * plural, for the rail - see the comment above).
     * `animal-labels.ts`'s `speciesWordFor` (PR B's animal meta description,
     * owner's exact wording) is a separate, sex-*aware* function for that
     * one surface only; it reuses `speciesDog` as its *feminine* form
     * specifically ("собака" is Ukrainian's generic, grammatically feminine
     * word for a dog of either sex, correct both as the neutral noun here
     * and as the female-specific word there), alongside two new entries
     * below for the masculine/other-feminine forms that function needs and
     * this sex-neutral pair doesn't cover.
     */
    speciesDog: "Собака",
    speciesCat: "Кіт",
    /** Sex-specific, for `speciesWordFor` only - never the sex-neutral subtitle line above. */
    speciesDogMale: "Пес",
    speciesCatFemale: "Кішка",
    notFound: {
      eyebrow: "НЕ ЗНАЙДЕНО",
      title: "Цієї картки більше немає.",
      body: "Цієї тварини вже немає на сайті, або посилання застаріло.",
      action: "Усі тварини",
    },
    /**
     * RL-F1: the animal page (and the gallery's overlay of it) when the
     * visitor's request was refused for rate, not answered. Oleksii's text,
     * verbatim (2026-10-20): "using the existing «Забагато запитів. Спробуйте
     * ще раз пізніше.»", the same words as `kabinet.password.forgot.throttled`,
     * given a public key so a public page doesn't read a kabinet string. It
     * says nothing about the card, which may well still be there.
     */
    rateLimited: "Забагато запитів. Спробуйте ще раз пізніше.",
    /**
     * O-10 (`docs/observations.md`) + critique C6 - accessibility copy for the
     * photo gallery. His Ukrainian since PR 6 (Q-A, 2026-10-19). Pet card PR 5
     * replaced the dot/thumbnail controls this once also labelled with a
     * native scroll-snap slider (`photoGalleryDot`/`photoGalleryThumbnail`
     * retired with that UI, `copy-status.test.ts` has the full account);
     * this one survives as the slider's own scroll-container label, since it
     * names "the photo list," not any particular control for moving through it.
     */
    photoGalleryLabel: "Фотографії тварини",
    /**
     * Owner-approved 2026-10-30 (pet card on phones). The slider's own
     * prev/next buttons' accessible names.
     */
    photoNext: "Наступне фото",
    photoPrev: "Попереднє фото",
    /** The phone photo counter's accessible name; the visible text is «1/4». Owner-approved with photoPrev/photoNext (2026-10-30). */
    photoCounter: "Фото {n} з {total}",
    /**
     * Pet card PR 5 (Figma `75:425`/`88:1929`). The prev/next labels above
     * the panel, the two header pills, the three section headings and the
     * share-copied confirmation are the design's own owner-approved words
     * (handoff, 2026-10-26); the chip-link template and species words are
     * his own text, given directly, 2026-10-27 (full provenance recorded in
     * `copy-status.test.ts`'s `PET_CARD_PR5_COPY` round).
     */
    prev: "Попередній",
    next: "Наступний",
    giveHome: "Дати сімʼю",
    share: "Поділитись",
    shareCopied: "Посилання скопійовано.",
    aboutMeHeading: "Про мене",
    myStoryHeading: "Моя історія",
    medicalHeading: "Медичний стан",
    /**
     * Template: "Показати схожих {species}: {value}" - a filterable chip
     * link's accessible name. `{species}` is `chipSpeciesCat`/`chipSpeciesDog`
     * below; `{value}` is the dimension's own existing label text,
     * lowercased, with no quotes around it (his exact wording, 2026-10-27:
     * "«Показати схожих {котів|собак}: {значення}», with no quotes around
     * the value. The value is lowercase and uses the filter form"). Built by
     * `similarAnimalsLabel` (`apps/web/src/features/gallery/filter-url.ts`).
     */
    chipLinkName: "Показати схожих {species}: {value}",
    chipSpeciesCat: "котів",
    chipSpeciesDog: "собак",
  },

  // --- The gallery's animal overlay (designer round 1, §2 of docs/designer-round-1.md) ---
  /**
   * Oleksii's Ukrainian, verbatim (docs/designer-round-1.md §11, item 3).
   * `close` is his «Закрити», the same word as the kabinet dialogs' own
   * `close`, given its own key here so a public surface doesn't read a
   * kabinet dialog's string. The overlay's accessible name is the animal's
   * name, so it has no label key of its own. `openFull` («Відкрити повну
   * сторінку») went with the drawer: the overlay is the full page (his
   * 2026-10-21 decision, Q2: "remove «Відкрити повну сторінку» and
   * preview.openFull").
   */
  preview: {
    close: "Закрити",
  },

  // --- Contact reveal (05) ---
  reveal: {
    title: "Як звʼязатися з притулком",
    subtitle:
      "Притулок не знає про цей запит, поки ви не напишете самі. Нічого не сталося автоматично.",
    /**
     * Template: "Контакти такі, якими були {date}, коли ви їх відкрили."
     * ({date} is the first reveal's; «є сьогодні» next to a past date said
     * two opposite things, audit 2026-10-22 #5). Shown only under the first-reveal
     * record's contacts, never under the shelter's current ones (K4-B5,
     * `contactsFootnoteOf` in `ContactRevealDialog.tsx`; inbox K4-Q11).
     */
    contactsFootnote: "Контакти такі, якими були {date}, коли ви їх відкрили.",
    meetingPlace: "місце узгодите в листуванні",
    reflectionHeading: "Перед тим як писати – три речі",
    reflection1: "Це роки разом, а не вихідні.",
    reflection2: "Корм, ветеринар, перевезення – щомісячні витрати.",
    reflection3: "Чи згодні всі, хто живе з вами.",
    writeTelegram: "Написати в Telegram",
    /**
     * Not every shelter's primary contact channel is Telegram - real seed
     * data has phone-only shelters, and the mock's own R1/R2 frames only
     * ever show the Telegram example. Found by looking at a real rendered
     * reveal, not assumed: a phone-only shelter left this dialog with no
     * primary action at all, only "Повернутися до галереї".
     */
    call: "Подзвонити",
    writeEmail: "Написати листа",
    /** Viber and website rows (reveal redesign, owner-approved wording). */
    writeViber: "Написати у Viber",
    openWebsite: "Відкрити сайт",
    /** Desktop only: the visible label of each row's copy button; the aria-labels name the channel (WCAG 2.5.3). */
    copy: "Копіювати",
    copied: "Скопійовано.",
    copyPhoneLabel: "Копіювати номер телефону",
    copyTelegramLabel: "Копіювати нікнейм у Telegram",
    copyViberLabel: "Копіювати номер у Viber",
    copyEmailLabel: "Копіювати адресу пошти",
    /**
     * The mock (R1/R2) says «Повернутися до галереї», but on the animal page
     * and in the gallery's overlay this button only closes the dialog
     * (`RevealFlow.tsx`, `secondaryAction: { onClick: close }`): the person
     * stays on the animal. Oleksii renamed it «Повернутися до картки»
     * (audit 2026-10-22, #8), behaviour unchanged. The key keeps its old name.
     */
    backToFeed: "Повернутися до картки",
  },

  // --- My reveals (06) ---
  myReveals: {
    title: "Мої запити",
    deviceOnly: "Зберігається лише на цьому пристрої. Ми не знаємо, хто ви.",
    /** Template: "Притулок каже: {name} уже вдома." */
    resolved: "Притулок каже: {name} уже вдома.",
  },

  /**
   * Nationwide table, row 38 (owner: ship the attribution whatever the licence version). The
   * dataset page on data.gov.ua says «Creative Commons Attribution» with no version (unverified).
   */
  footer: {
    dataCredit:
      "Перелік населених пунктів: Кодифікатор адміністративно-територіальних одиниць (Мінрозвитку), Creative Commons Attribution.",
  },

  // --- Exhausted (07) ---
  exhausted: {
    title: "Це всі, хто зараз підходить.",
    body: "Тих, кого ви пропустили через «Не зараз», режим «по одній» покаже знову через 30 днів. У списку видно всіх.",
    newAnimals: "Нові тварини зʼявляються, щойно притулки публікують картки.",
    changeFilters: "Змінити фільтри",
    /** G5 (audit 2026-10-22): the deck's end state, linking to `/tvaryny` with the deck's own filters. */
    toList: "Переглянути список",
    reviewAgain: "Переглянути ще раз спокійно",
  },

  // --- Error states (08) ---
  errors: {
    offline: {
      eyebrow: "БЕЗ ЗВʼЯЗКУ",
      title: "Немає звʼязку із сайтом. Перевірте інтернет і спробуйте ще раз.",
      action: "Спробувати ще раз",
    },
    loadFailed: {
      eyebrow: "НЕ ЗАВАНТАЖИЛОСЯ",
      title: "Збій на боці сайту.",
      body: "Це не ваша помилка і не помилка притулку.",
      action: "Оновити",
    },
    sessionExpired: {
      eyebrow: "НЕ ВДАЛОСЯ ПРОДОВЖИТИ",
      title: "Режим «по одній» почнеться спочатку.",
      action: "Почати спочатку",
    },
    /**
     * `animals.reveal`'s own `RATE_LIMITED` (`apps/web/src/api/reveal-rate-limit.ts`)
     * - 30 distinct shelters revealed in 24h. Oleksii's own words, 2026-09-13,
     * given as the reveal dialog's honest replacement for the generic
     * `loadFailed` copy it rendered for every error including this one
     * (`docs/decisions-pending-review.md` has the fuller R3 history - this
     * was the one remaining blocker on PR #55). No `eyebrow` or `action`:
     * neither was given, and inventing either would be exactly the
     * "honest copy for it isn't mine to write" line this row was blocked
     * on in the first place. No retry action by design, not omission -
     * `ContactRevealDialog.tsx`'s `RevealError` renders no retry button for
     * this reason specifically, since retrying before the window passes
     * cannot succeed. The window is a rolling 24 h (`reveal-rate-limit.ts`),
     * not a calendar day, and re-opening a shelter already opened stays free;
     * the 2026-10-22 audit (#6) rewrote both lines to say so.
     */
    rateLimited: {
      title: "За останню добу ви відкрили контакти багатьох притулків.",
      body: "Притулки, чиї контакти ви вже відкривали, можна відкрити знову. Нові – пізніше, коли мине доба від перших.",
    },
    photoMissing: {
      placeholder: "Фото немає – притулок ще не надіслав",
    },
  },

  // --- Reserved badge ---
  reserved: {
    badge: "Уже домовляються",
    /** The gallery card's tablet (600-1023) layout, shown instead of `badge` when the compact horizontal card has less room - docs/design/README.md, "The Gallery" > "Card". */
    badgeShort: "Домовляються",
    action: "Стати другим у черзі",
  },

  // --- Resolved card variant (docs/design/README.md, "The gallery card" > "Resolved") ---
  // Template: "Притулок каже: {name} уже вдома." Replaces the freshness row
  // entirely on a resolved card - never rendered by any live query today,
  // see AnimalCardProps["resolved"]'s own comment for why.
  resolved: {
    sentence: "Притулок каже: {name} уже вдома.",
  },

  // --- Documents ---
  documents: {
    chipPresent: "Є чип",
    rabiesPresent: "Є щеплення від сказу",
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
  // introduces. Flagged, not fixed - fixing it is a copy decision, not a
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
    atShelter: "{place}",
    fosteredHousing: "на перетримці, {place}",
    /**
     * gallery-v3 (Figma `euz4JGfpToY31VJY7ppVj9`, node `58:1617`): the
     * redesigned card's meta line names sex as its own word instead of
     * folding it into the age word's grammatical gender (`ageYoungFemale`
     * etc. above, unchanged - the deck and the old card still use those).
     * Builder-prompt-approved exact strings, same words already used for
     * the kabinet animal form's `who.sexMale`/`who.sexFemale`
     * (`messages/uk.ts`'s kabinet block) - not re-derived, reused verbatim
     * because the owner's own design names them by these words. An
     * `"unknown"` sex has no word here (`sexWordFor`,
     * `packages/i18n/src/animal-labels.ts`, returns `null`) rather than
     * guessing - the pre-existing `ageWordFor` defaults an unknown sex to
     * the masculine age word, but that is a fallback for a word that must
     * exist either way; a sex word has a true third option (omit it) that
     * the age word does not.
     */
    sexMale: "Хлопчик",
    sexFemale: "Дівчинка",
  },

  // --- The pet card's temperament: chips, kabinet checkboxes, filter options ---
  /**
   * His words and his table. Oleksii, 2026-10-26, in the coordinating
   * session, verbatim as that session relayed it to this branch, except that
   * his nine-row table is shortened to the bracket, since the keys below are
   * it, form for form: "PC-Q2, temperament labels (owner rewrite): no «вдача»
   * phrasing. Use adjectives that agree with the animal's sex. Each trait
   * gets male / female / plural forms in packages/i18n (domain keys
   * unchanged): [his table: each trait's male / female / plural forms, as
   * below] The apostrophe in «Сором'язливий» is ʼ (U+02BC), not '. Chips on
   * the pet card use the animal's sex: male → male form, female → female
   * form, sex not recorded → male form. Kabinet checkboxes use the form for
   * the sex currently selected in the form, and update live if the sex
   * changes. The gallery filter dropdown (and the chip link's accessible
   * name) uses the plural. Add a unit test: the label picks the right form
   * for male, female, unknown and the filter context."
   *
   * The forms follow `grammaticalGenderOf`, the age word's rule (his "sex not
   * recorded → male form" is its masculine for «Не записано»). The three
   * «Ладнає з …» traits have no gender, only a number.
   */
  temperament: {
    playful: { masculine: "Грайливий", feminine: "Грайлива", plural: "Грайливі" },
    calm: { masculine: "Спокійний", feminine: "Спокійна", plural: "Спокійні" },
    affectionate: { masculine: "Ласкавий", feminine: "Ласкава", plural: "Ласкаві" },
    energetic: { masculine: "Енергійний", feminine: "Енергійна", plural: "Енергійні" },
    independent: { masculine: "Самостійний", feminine: "Самостійна", plural: "Самостійні" },
    shy: { masculine: "Соромʼязливий", feminine: "Соромʼязлива", plural: "Соромʼязливі" },
    good_with_kids: {
      masculine: "Ладнає з дітьми",
      feminine: "Ладнає з дітьми",
      plural: "Ладнають з дітьми",
    },
    good_with_cats: {
      masculine: "Ладнає з котами",
      feminine: "Ладнає з котами",
      plural: "Ладнають з котами",
    },
    good_with_dogs: {
      masculine: "Ладнає з собаками",
      feminine: "Ладнає з собаками",
      plural: "Ладнають з собаками",
    },
  },

  // --- The pet card's coat colour: the chip and the filter option ---
  /**
   * Proposed to him, then confirmed by him. The coordinating session put this
   * table to him in its Phase 0 proposal, on a research agent's
   * recommendation: a pattern such as «смугастий» doesn't read as a colour,
   * and a bare masculine colour word on a female animal's chip reads wrong.
   * Oleksii confirmed it, 2026-10-26, in the coordinating session, verbatim:
   * "Colour stays as approved: neuter forms agreeing with «забарвлення».
   * Everything else from my previous message stands." He approved the
   * proposed forms; he didn't write the words himself.
   *
   * One form per colour, the neuter, which agrees with «забарвлення» in the
   * chip and stands alone as a filter option; the animal's sex never changes
   * it.
   */
  coatColour: {
    names: {
      black: "Чорне",
      white: "Біле",
      grey: "Сіре",
      ginger: "Руде",
      brown: "Коричневе",
      cream: "Кремове",
      black_white: "Чорно-біле",
      tricolour: "Триколірне",
      tabby: "Смугасте",
      spotted: "Плямисте",
    },
    /** Template: "{label}" is one of `names`. */
    chip: "{label} забарвлення",
  },

  // --- Pagination footer (E3, re-skinned V2) ---
  // `docs/design/Opika Registry System.dc.html`'s pagination row (lines
  // 189-195) has the literal values: prev/next are visible-text buttons
  // ("← Назад" / "Далі →"), not glyph-only controls, and the number group
  // ends with a "з N" count. `prev`/`next` below are the VISIBLE button
  // text, not a separate aria-label - an aria-label that didn't contain
  // that text would be a WCAG 2.5.3 accessible-name mismatch, an earlier
  // draft of this component had exactly that bug. Unlike the V1 mock this
  // superseded, V2's own pagination row carries no monospace styling on
  // the numbers at all - they render in the same face as the rest of
  // the row, no IBM-Plex-Mono exception to reason about.
  pagination: {
    navLabel: "Сторінки",
    prev: "← Назад",
    next: "Далі →",
    /** Template: "Сторінка {page}" - each numbered link's accessible name. */
    pageLabel: "Сторінка {page}",
    current: "поточна",
    /** Template: "з {total}" - docs/design's own count label, after the numbers. */
    ofTotal: "з {total}",
    /**
     * Above the grid, visible only on keyboard focus. Dropping E2.5's
     * roving tabindex means every card is a real Tab stop - 24 of them -
     * so this is the shortcut past them, not decoration.
     */
    skipLink: "Перейти до сторінок",
  },

  // --- Gallery no-match (B4), docs/design/README.md, "Gallery states" > "No match" ---
  // The heading and reassurance are the mock's own literal, filter-value-
  // independent copy. The mock's middle sentence ("У Броварах 7 притулків,
  // і сьогодні серед середніх собак вільних немає.") names one specific
  // filter combination as an example - generalising it to arbitrary filter
  // combinations is real sentence-grammar work with no existing groundwork
  // (unlike the relaxation counts themselves, `gallery.relaxationCounts`
  // already built and tested in E2), so it's not reproduced here; the two
  // suggestion buttons below carry the actual per-filter numbers instead.
  /**
   * A settlement named on a card or a page (nationwide table, rows 9 to 12). `{place}` is the kind
   * prefix plus the name; the region and raion follow only when the name alone is ambiguous
   * (`placeText`, `packages/i18n/src/place.ts`). «м.» for a city, «с-ще» for a selyshche, «с.» for
   * a village.
   */
  place: {
    prefixCity: "м.",
    prefixSelyshche: "с-ще",
    prefixVillage: "с.",
    /** Template: "{place}, {region}", e.g. «с. Миколаївка, Одеська обл.» */
    withRegion: "{place}, {region}",
    /** Template: "{place}, {district}, {region}", for a name shared inside its oblast. */
    withDistrictAndRegion: "{place}, {district}, {region}",
    /** Template: «Броварський район» -> «Броварський р-н». */
    districtShort: "{name} р-н",
    /** Nationwide table, row 13. Template: «Броварська міська територіальна громада» -> «Броварська громада». */
    hromadaShort: "{name} громада",
  },

  noMatch: {
    heading: "Під ці фільтри зараз нікого немає.",
    reassurance: "Це не помилка пошуку.",
    /** Template: "Прибрати «{dimension}» ({animalWord})" - one button per
     * `GalleryRelaxation` the caller returns, `{dimension}` already
     * resolved to a group label, `{animalWord}` pre-composed with
     * `pluralizeUk` the same way `filters.resultCount` is. */
    removeDimension: "Прибрати «{dimension}» ({animalWord})",
    /** Cities relaxation is "drop the city filter entirely" (packages/domain's
     * `relaxDimension`), not literally "add neighbouring cities" - the
     * mock's own flavour text for its one example, kept generic to describe
     * what the button actually does for any city selection. */
    showAllCities: "Показати всі міста ({animalWord})",
    /** Template: the oblast relaxation, same shape as `showAllCities` (nationwide table, row 25). */
    showAllRegions: "Показати всі області ({animalWord})",
    /** Nationwide table, row 23: shown when the chosen oblasts hold no animals under the other filters. */
    regionEmpty: "У вибраних областях поки немає тварин.",
    /** Nationwide table, row 24. Template: "Сусідня область: {region} ({animalWord})", no declension needed. */
    neighbourRegion: "Сусідня область: {region} ({animalWord})",
    /** Template: "+{count} тварин" - the number every suggestion names,
     * never a suggestion with none (docs/design/README.md: "no suggestion
     * without a number"). */
    additionalAnimals: "+{count} {animalWord}",
    /** Static, filter-value-independent - the mock's own closing caption
     * below the two suggestion buttons (`Opika Registry System.dc.html`'s
     * B4 frame), unlike the middle sentence above which names one specific
     * example combination. */
    suggestionExplainer: "Біля кожної пропозиції – скільки тварин вона додасть.",
  },

  // --- Gallery error (E4, V2 mock frames E1/E2 - copy adapted, see
  // docs/design/README.md's note at that section for why) ---
  galleryError: {
    eyebrow: "НЕ ЗАВАНТАЖИЛОСЯ",
    /** Neutral on purpose: this same component renders both a cold first
     * visit to /tvaryny AND a failed next-page navigation from deep in the
     * result set (this architecture has no separate "next-page error" -
     * see docs/design/README.md's note). The mock's own heading, "Список
     * не відкрився" ("the list didn't open"), presumes nothing has loaded
     * yet - wrong the moment page 3 was showing a second ago. */
    title: "Сторінку не вдалося завантажити.",
    /** Also neutral: the mock's body claims "адреса сторінки не
     * змінилася" ("the page address hasn't changed"), true only for a
     * first-load failure - a failed next-page click already changed the
     * address to the page that failed to load. Dropped rather than
     * asserted uncertainly. */
    body: "Це не ваша помилка і не помилка притулку. Ваші фільтри збережені.",
    action: "Спробувати ще раз",
    /**
     * E5: not the mock's own frame - a real escape hatch, added after
     * finding the mock's filter rail wouldn't be one (see this key's own
     * doc comment in error.tsx). A bare `/tvaryny` link, no params, is the
     * cheapest request this app can make - the one query most likely to
     * succeed when a filtered one just failed for a backend reason a
     * different filter combination wouldn't fix anyway.
     */
    showAll: "Показати всіх тварин",
  },

  // --- Gallery out-of-range page notice (E4, V2 mock frames P1/P2) ---
  outOfRangePage: {
    /** Template: "Сторінки {requested} не існує - тут лише {total}." */
    notFound: "Сторінки {requested} не існує – тут лише {total}.",
    /** Template: "Показуємо сторінку {total} - останню. Нічого не
     * загубилось." Numerals, not the mock's spelled ordinal ("десяту") -
     * Ukrainian ordinal declension for an arbitrary N is real grammar work
     * with no groundwork in this codebase (same class of gap as
     * `noMatch`'s own dropped middle sentence, docs/design/README.md
     * records this one too), so a numeral phrasing avoids asserting an
     * ordinal form that might be wrong. */
    showingLast: "Це сторінка {total}, остання. Нічого не загубилося.",
    backToFirst: "На першу сторінку",
  },

  /**
   * Phase T. The site-wide header's own links, shared with the gallery
   * footer - `footer.about` used to hold this same string separately, which
   * meant one concept in two keys the moment the header started rendering
   * it too.
   *
   * Not in `docs/design/README.md`'s own header content list (line 337 gives
   * mark + wordmark, city chip, «Мої запити · N», «UA / EN», «Гортати по
   * одній») - composed for Phase T to close the critique's E5/E1/E3, and
   * recorded as composition rather than specification.
   */
  nav: {
    about: "Про проєкт",
    forShelters: "Для притулків",
    /** S8: the site header's link to the saved page (`/zberezheni`). §11, his text. */
    saved: "Збережені",
    /** Designer feedback batch D, his own text: the signed-in shelter admin/operator's header link, replacing `saved`. */
    kabinet: "Кабінет",
    /** Proposed, not yet owner-approved - see the PR's copy table. The mobile nav drawer
     * toggle's accessible name, below `tablet:` - the standard Ukrainian word for a site's
     * navigation menu, same register as this file's other short UI labels. */
    menu: "Меню",
    /** QA 2026-10-29, owner text: the first Tab stop on every page, visible on focus only. */
    skipToContent: "Перейти до вмісту",
  },

  /** QA 2026-10-29, owner text: the root 404 for any address that is not a page. The eyebrow is stored in sentence case; CSS uppercases it. */
  siteNotFound: {
    eyebrow: "Не знайдено",
    title: "Такої сторінки немає.",
    body: "Можливо, посилання застаріло або в адресі помилка.",
    action: "На головну",
  },

  /**
   * "«Про проєкт» page, no mock - a volunteer deciding whether Opika is
   * legitimate looks for exactly this and finds nothing without it.
   * Four required subjects, each its own paragraph: who's behind this,
   * that it's free now and stays free, that the platform never touches
   * money, what happens to a shelter's data, how to get in touch.
   */
  about: {
    title: "Про проєкт",
    intro:
      "{site} – сайт, де тварини з притулків України шукають дім. Його робить одна людина – я, у вільний від роботи час. Немає команди й інвестора.",
    free: "Сайт безкоштовний для притулків, без платних тарифів. Якщо це колись зміниться, кожен притулок дізнається про це заздалегідь, а не постфактум.",
    money:
      "Opika ніколи не бере участі в грошах: немає прийому платежів, немає комісії, немає збору донатів через платформу. Кнопка «Підтримати притулок» веде на власну сторінку притулку в іншому сервісі (наприклад, monobank) – сайт лише показує посилання, гроші йдуть напряму, і видно, куди саме.",
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
    data:
      "Дані, які вносить притулок – адреса, контакти, картки тварин, – належать притулку. Точна адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише місто. Притулок може попросити видалити свій запис у будь-який момент.\n\n" +
      "Для притулків із доступом до кабінету сайт зберігає імʼя та адресу пошти адміністратора, щоб надсилати запрошення, посилання для входу чи нового пароля і повідомлення про зміну пароля, а також технічний запис про браузер і пристрій, з якого виконано вхід. Для адміністраторів кабінетів притулків зберігається лише незворотний хеш пароля, а не сам пароль. IP-адреси не зберігаються. Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90 днів, після чого треба увійти знову. Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом доби.\n\n" +
      `${ADMIN_ERASURE_SENTENCE}\n\n` +
      "Кожна зміна в кабінеті записується в історію притулку: коли її зроблено і хто – адміністратор притулку чи я. Натискання «Ще шукає» чи «Ще домовляються» в історію не потрапляють – їх видно з дати на картці. Для профілю зберігаються попереднє й нове значення, для карток тварин – лише те, які поля змінено. Про людей, які шукають тварину, в історії нічого немає. Історія видаляється разом із записом притулку.\n\n" +
      "Фото, завантажені в кабінеті, зберігаються без даних про місце зйомки, за адресами, які неможливо вгадати. Фото, прибране з картки, більше не показується, а сам файл я видаляю на прохання притулку.\n\n" +
      // DR1-Q4, his sentence, verbatim: landed with S8 (the saved page). Distinct from the
      // held R4-2 amendment above - that one is gated off /pro until the pre-launch cookie
      // conflict clears; this standalone sentence has no such gate and ships now.
      "Список збережених тварин зберігається лише в цьому браузері. Щоб показати його актуальним, сайт запитує дані про цих тварин без кукі й не зберігає, яких саме.",
    analytics:
      "Сайт збирає базову статистику відвідувань – скільки людей заходить і наскільки швидко працюють сторінки – без реклами.",
    contact: "Написати мені: {contact}",
  },
} as const;
