/**
 * English UI strings — mirrors uk.ts key-for-key.
 *
 * Machine-translated in the design's established voice (plain, warm, never
 * alarming), not a native-speaker pass. Eleven keys use the literal English
 * the design canvas gives directly (`Opika - Keeper's Voice.dc.html`,
 * "КОПІЯ · UK / EN"): freshness.attribution, swipe.left/right,
 * medical.unknown/registryConfirmed, location.fostered, reveal.title,
 * exhausted.title/body, reserved.badge/action. Everything else is new
 * content in that register, not literally specified anywhere — flag any
 * mistranslation rather than trusting it silently; this hasn't had a
 * native-speaker read yet, and next-intl isn't wired until H3, so nothing
 * here is user-visible in production today.
 */
export const en = {
  // --- Screen 01 · First run ---
  firstRun: {
    promise:
      "Animals from verified shelters across Kyiv oblast. Swipe through to see who's looking for a home.",
    disclaimer:
      'No registration. We never handle or transfer money. "Not right now" is just a filter, not a judgement of the animal.',
    cityHeading: "Your city",
    allRegion: "All of Kyiv oblast",
    viewAnimals: "View animals",
  },

  // --- Screen 02 · Feed / deck ---
  feed: {
    filtersLabel: "Filters",
    enterDeck: "Swipe one at a time",
    enterDeckShort: "Swipe",
  },

  // --- Screen 03 · Filters ---
  filters: {
    title: "Filters",
    city: "CITY",
    species: "SPECIES",
    speciesDogs: "Dogs",
    speciesCats: "Cats",
    size: "SIZE",
    sizeSmall: "Small",
    sizeMedium: "Medium",
    sizeLarge: "Large",
    age: "AGE",
    ageBaby: "Baby",
    ageYoung: "Young",
    ageAdult: "Adult",
    ageSenior: "Senior",
    /** Template: "{count} {animalWord} match. Shelters in this city — {shelterCount}." */
    resultCount: "{count} {animalWord} match. Shelters in this city — {shelterCount}.",
    /** Template: "{count} {animalWord} match, across {shelterCount} {shelterWord}." — used when no city is selected, see uk.ts's note. */
    resultCountAnyCity: "{count} {animalWord} match, across {shelterCount} {shelterWord}.",
    reset: "Reset",
    /** Template: "Show {count}" */
    showCount: "Show {count}",
    /** Template: "Found {count} {animalWord} across {shelterCount} {shelterWord}" */
    resultCountRail: "Found {count} {animalWord} across {shelterCount} {shelterWord}",
    animalWord: { one: "animal", few: "animals", many: "animals" },
    /** English has no case system, so this is `animalWord` again — it exists for key-shape parity with uk.ts, where the rail's "Знайдено" governs a different form than the sheet's "Підходить". */
    animalWordAccusative: { one: "animal", few: "animals", many: "animals" },
    shelterWordLocative: { one: "shelter", few: "shelters", many: "shelters" },
    sortLabel: "Sort",
    sortFreshest: "Freshest cards first",
    sortLongestWaiting: "Longest waiting",
    allCities: "All of Kyiv oblast",
    railFooter:
      "There's no \"only fresh cards\" filter. An animal nobody's written about in a while is still waiting.",
  },

  // --- Swipe affordances ---
  swipe: {
    left: "Not right now",
    right: "Ask about them",
  },

  // --- Action buttons ---
  actions: {
    notNow: "Not right now",
    next: "Next",
    write: "Message",
    writeShelter: "Message the shelter",
  },

  // --- Freshness ---
  freshness: {
    /** Rendered by Intl.RelativeTimeFormat('en'), not this string. */
    updatedAgo: "Updated {days}",
    attribution: "The shelter's own words · date filled in automatically",
  },

  // --- Medical ---
  medical: {
    heading: "Medical",
    unknown: "Not recorded",
    registryConfirmed: "Confirmed by the national pet registry",
    shelterDeclared: "The shelter's own words",
    rabies: "Rabies",
    vaccination: "Core vaccination",
    spayNeuter: "Spay/neuter",
    registry: "The national pet registry",
  },

  // --- Location ---
  location: {
    heading: "Where they live",
    /** Template: "Living with a volunteer in {city}..." */
    fostered:
      "Living with a volunteer in {city}. We don't know the exact address and won't invent one.",
    noMapExplanation:
      "There's no map here: we don't know the exact address, and we won't make one up. You'll agree on a meeting place with the shelter.",
  },

  // --- Detail screen (04) ---
  detail: {
    /** Template: "Manually verified · {years} on Opika" — brand string lives here, not in domain */
    shelterVerifiedYears: "Manually verified · {years} on Opika",
    donateShelter: "Support the shelter",
  },

  // --- Contact reveal (05) ---
  reveal: {
    /** Template: "You asked about {name}." */
    youAskedAbout: "You asked about {name}.",
    title: "Here's how to reach the shelter.",
    subtitle:
      "They won't know you asked until you write to them yourself. Nothing happened automatically.",
    /** Template: "Contact details saved as they are today · {date}" */
    contactsFootnote: "Contact details saved as they are today · {date}",
    meetingPlace: "you'll agree on a place when you message",
    reflectionHeading: "Before you write — three things worth thinking through calmly:",
    reflection1: "This is 10–15 years together, not a weekend.",
    reflection2: "Food, the vet, transport — monthly costs.",
    reflection3: "Whether everyone you live with agrees.",
    writeTelegram: "Message on Telegram",
    backToFeed: "Back to the feed",
  },

  // --- My reveals (06) ---
  myReveals: {
    title: "My requests",
    deviceOnly: "Saved on this device only. We don't know who you are.",
    /** Template: "The shelter says: {name} has found a home." */
    resolved: "The shelter says: {name} has found a home.",
  },

  // --- Exhausted (07) ---
  exhausted: {
    title: "That's everyone who fits right now.",
    body: "There aren't many shelters here, so the list is short — that's normal.",
    newAnimals: "New animals appear when shelters update their cards. Usually every few weeks.",
    /**
     * Template: "All of Kyiv oblast (+{count})"
     * See the note on the uk key: deviation from the original "add
     * neighbouring cities" handoff. docs/gallery-contract-decisions.md §4.
     */
    addNearbyCities: "All of Kyiv oblast (+{count})",
    changeFilters: "Change filters",
    reviewAgain: "Look through them again, no rush",
    footnote:
      "If you know a shelter in Kyiv oblast that isn't here — tell us, and we'll reach out to them.",
  },

  // --- Error states (08) ---
  errors: {
    offline: {
      eyebrow: "OFFLINE",
      title: "No internet connection right now.",
      action: "Try again",
    },
    loadFailed: {
      eyebrow: "DIDN'T LOAD",
      title: "Something went wrong on our end.",
      body: "This isn't your fault, and it isn't the shelter's.",
      action: "Refresh",
    },
    sessionExpired: {
      eyebrow: "SESSION ENDED",
      title: "We've started the feed over.",
      action: "To the feed",
    },
    photoMissing: {
      placeholder: "No photo yet — the shelter hasn't sent one",
    },
  },

  // --- Reserved badge ---
  reserved: {
    badge: "Already in conversation",
    badgeShort: "In talks",
    action: "Ask to be second in line",
  },

  // --- Resolved card variant — see the uk key's own note ---
  resolved: {
    sentence: "The shelter says: {name} is already home.",
  },

  // --- Documents ---
  documents: {
    chipPresent: "Microchipped",
    rabiesPresent: "Rabies vaccinated",
  },

  // --- Animal card meta line ---
  // See the note on the uk key: English adjectives don't inflect for
  // gender, so the mismatch that motivates that note doesn't reproduce
  // here — this set exists only for key-shape parity with uk.ts.
  cardMeta: {
    ageBaby: "baby",
    ageYoung: "young",
    ageAdult: "adult",
    ageSenior: "senior",
    sizeSmall: "small",
    sizeMedium: "medium",
    sizeLarge: "large",
    atShelter: "{city}",
    fosteredHousing: "with a volunteer foster in {city}",
  },

  // --- Pagination footer (E3) ---
  pagination: {
    navLabel: "Pages",
    prev: "← Back",
    next: "Next →",
    pageLabel: "Page {page}",
    current: "current",
    ofTotal: "of {total}",
    skipLink: "Skip to pages",
    footnote:
      "Pages, not an endless feed: every page has its own address, the back button works, " +
      "and the link can be sent on Telegram.",
  },

  // --- Gallery no-match (B4) — see the uk key's own note ---
  noMatch: {
    heading: "Nobody matches these filters right now.",
    reassurance: "This isn't a search error.",
    removeDimension: "Remove “{dimension}” ({animalWord})",
    showAllCities: "Show every city ({animalWord})",
    additionalAnimals: "+{count} {animalWord}",
    suggestionExplainer:
      "Each suggestion names how many animals it would add. An empty screen never says " +
      '"try something else" without a number.',
  },

  // --- Gallery error — see the uk key's own note ---
  galleryError: {
    eyebrow: "DIDN'T LOAD",
    title: "The page couldn't be loaded.",
    body: "This isn't your fault or the shelter's. Your filters are saved.",
    action: "Try again",
  },

  // --- Gallery out-of-range page notice — see the uk key's own note ---
  outOfRangePage: {
    notFound: "Page {requested} doesn't exist — there are only {total}.",
    showingLast: "Showing page {total} — the last one. Nothing was lost.",
    backToFirst: "Back to the first page",
  },

  // --- Footer — see the uk key's own note ---
  footer: {
    fontCredit:
      "e-Ukraine typeface — Ukraine's Ministry of Digital Transformation (thedigital.gov.ua/fonts), Dmytro Rastvortsev / Fedoriv, CC BY 4.0.",
  },

  // --- Language toggle ---
  // Language names stay in their own language regardless of locale — this
  // matches uk.ts's own `en: "English"` (never "Англійська").
  locale: {
    uk: "Українська",
    en: "English",
  },
} as const;
