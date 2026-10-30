/**
 * English UI strings - mirrors uk.ts key-for-key.
 *
 * Machine-translated in the design's established voice (plain, warm, never
 * alarming), not a native-speaker pass. Eleven keys use the literal English
 * the design canvas gives directly (`Opika - Keeper's Voice.dc.html`,
 * "КОПІЯ · UK / EN"): freshness.attribution, swipe.left/right,
 * medical.unknown/registryConfirmed, location.fostered, reveal.title,
 * exhausted.title/body, reserved.badge/action. Everything else is new
 * content in that register, not literally specified anywhere - flag any
 * mistranslation rather than trusting it silently; this hasn't had a
 * native-speaker read yet, and next-intl isn't wired until H3, so nothing
 * here is user-visible in production today.
 */
import { COPY_PENDING } from "./uk";

export const en = {
  // --- 01 First run - was a band above the gallery grid, removed in
  // Phase D (see uk.ts's own comment); promise survives as og:description ---
  firstRun: {
    promise:
      "Animals from verified shelters across Ukraine. Browse the list and see who's looking for a home.",
  },

  demo: {
    bannerNotice: "The site doesn't hold any real shelters yet – every card here is a demo.",
    deckLabel: "Demo",
  },

  // --- Screen 02 · Feed / deck ---
  feed: {
    filtersLabel: "Filter",
    enterDeck: "Swipe one at a time",
    enterDeckShort: "Swipe",
    backToList: "← Back to the list",
    deckHeading: "Animals one at a time",
    deckEntryAnnouncement: "One-at-a-time mode. Animal {position} of {total}.",
    adoptPill: "Adopt",
    galleryTitle: "Catalogue",
  },

  // --- Screen 03 · Filters ---
  filters: {
    title: "Filters",
    city: "City",
    species: "Species",
    speciesDogs: "Dogs",
    speciesCats: "Cats",
    speciesAny: "All",
    size: "Size",
    sizeSmall: "Small",
    sizeMedium: "Medium",
    sizeLarge: "Large",
    age: "Age",
    ageBaby: "Baby",
    ageYoung: "Young",
    ageAdult: "Adult",
    ageSenior: "Senior",
    coatShort: "Short-haired",
    coatLong: "Long-haired",
    sex: "Sex",
    sexMale: "Boy",
    sexFemale: "Girl",
    sexUnknown: "Not recorded",
    /** Template: "{count} {animalWord} match. Shelters in this city - {shelterCount}." */
    resultCount: "{count} {animalWord} match. Shelters in this city – {shelterCount}.",
    /** Template: "{count} {animalWord} match, across {shelterCount} {shelterWord}." - used when no city is selected, see uk.ts's note. */
    resultCountAnyCity: "{count} {animalWord} match, across {shelterCount} {shelterWord}.",
    reset: "Reset",
    /** Template: "Show {count}" */
    showCount: "Show {count}",
    /** Template: "Found {count} {animalWord} across {shelterCount} {shelterWord}" */
    resultCountRail: "Found {count} {animalWord} across {shelterCount} {shelterWord}",
    animalWord: { one: "animal", few: "animals", many: "animals" },
    /** English has no case system, so this is `animalWord` again - it exists for key-shape parity with uk.ts, where the rail's "Знайдено" governs a different form than the sheet's "Підходить". */
    animalWordAccusative: { one: "animal", few: "animals", many: "animals" },
    shelterWordLocative: { one: "shelter", few: "shelters", many: "shelters" },
    sortLabel: "Sort",
    sortFreshest: "Freshest cards first",
    sortLongestWaiting: "Longest waiting",
    sortFreshestShort: "New",
    sortLongestWaitingShort: "Waiting",
    allCities: "All cities",
    region: "Region",
    allRegions: "All regions",
    showAllOptions: "Show all ({count})",
    findCity: "Find a city",
    cityFound: "Found: {count}",
    cityNoMatch: "Nothing found",
    railFooter:
      "There's no \"only fresh cards\" filter. An animal nobody's written about in a while is still waiting.",
    clearDimension: "Clear {dimension}",
    /** Template: "{option}, {count} {animalWord}" - an option pill's accessible name. */
    optionCount: "{option}, {count} {animalWord}",
  },

  // --- Swipe affordances ---
  swipe: {
    left: "Not right now",
    right: "Ask about them",
  },

  // --- Saved animals (designer round 1, S7/S8) ---
  likes: {
    save: "Save",
    saved: "Saved",
    added: "{name}: added to saved",
    removed: "{name}: removed from saved",
    full: "The list is full – it can hold at most {max} animals. To add a new one, remove one first.",
    title: "Saved animals",
    deviceOnly:
      "The list is kept only in this browser: it won't be there on another device or browser.",
    empty: "Nothing here yet. Save animals from the gallery to come back to them later.",
    emptyLink: "To the gallery",
    unavailable: "{name} is no longer shown on the site.",
    remove: "Remove from the list",
    storageBlocked: "This browser won't let the site keep your list.",
    loading: "Loading the list…",
  },

  // --- Action buttons ---
  actions: {
    notNow: "Not right now",
    write: "Message",
    writeShelter: "Message the shelter",
    notAJudgementNotice: '"Not right now" is just a filter, not a judgement of the animal.',
  },

  // --- Freshness ---
  freshness: {
    /** Rendered by Intl.RelativeTimeFormat('en'), not this string. */
    updatedAgo: "Updated {days}",
    attribution: "The shelter's own words",
  },

  // --- Medical ---
  medical: {
    heading: "Medical",
    unknown: "Not recorded",
    inProgress: "In progress",
    registryConfirmed: "Confirmed by the national pet registry",
    shelterDeclared: "The shelter's data",
    doneShelterDeclared: "Done, according to the shelter's data",
    rabies: "Rabies",
    vaccination: "Core vaccination",
    spayNeuter: "Spay/neuter",
    registry: "The national pet registry",
  },

  // --- Location ---
  location: {
    /** Template: "Living with a volunteer in {place}..." */
    fostered:
      "Living with a volunteer in {place}. We don't know the exact address and won't invent one.",
    lineFostered: "{place} · living with a volunteer",
    lineAtShelter: "{place}",
  },

  // --- Shelter page (designer round 1, S6) ---
  shelterPage: {
    animalsHeading: "Looking for a home: {count}",
    noAnimals: "No animals here are looking for a home right now.",
  },

  // --- Detail screen (04) ---
  detail: {
    /** Template: "Manually verified · on the site since {year}" - `{year}` is the year the shelter's record was created. */
    shelterVerifiedYears: "Manually verified · on the site since {year}",
    donateShelter: "Support the shelter",
    shelterRowLink: "The shelter's page: «{name}»",
    speciesDog: "Dog",
    speciesCat: "Cat",
    /** English has no sex-specific noun the way `speciesWordFor` needs for Ukrainian - both reuse the plain word. */
    speciesDogMale: "Dog",
    speciesCatFemale: "Cat",
    notFound: {
      eyebrow: "NOT FOUND",
      title: "This listing is gone.",
      body: "The animal is no longer on the site or the link is out of date. This isn't an error – the listing is simply no longer here.",
      action: "All animals",
    },
    rateLimited: "Too many requests. Please try again later.",
    photoGalleryLabel: "Animal photos",
    photoNext: "Next photo",
    photoPrev: "Previous photo",
    photoCounter: "Photo {n} of {total}",
    prev: "Previous",
    next: "Next",
    giveHome: "Give a home",
    share: "Share",
    shareCopied: "Link copied.",
    aboutMeHeading: "About me",
    myStoryHeading: "My story",
    medicalHeading: "Medical",
    chipLinkName: "Show similar {species}: {value}",
    chipSpeciesCat: "cats",
    chipSpeciesDog: "dogs",
  },

  // --- The gallery's animal overlay ---
  preview: {
    close: "Close",
  },

  // --- Contact reveal (05) ---
  reveal: {
    title: "How to reach the shelter",
    subtitle:
      "They won't know you asked until you write to them yourself. Nothing happened automatically.",
    /** Template: "Contact details saved as they are today · {date}" */
    contactsFootnote: "Contact details saved as they are today · {date}",
    meetingPlace: "you'll agree on a place when you message",
    reflectionHeading: "Before you write – three things",
    reflection1: "This is 10-15 years together, not a weekend.",
    reflection2: "Food, the vet, transport – monthly costs.",
    reflection3: "Whether everyone you live with agrees.",
    writeTelegram: "Message on Telegram",
    call: "Call",
    writeEmail: "Send an email",
    writeViber: "Message on Viber",
    openWebsite: "Open the website",
    copy: "Copy",
    copied: "Copied.",
    copyPhoneLabel: "Copy the phone number",
    copyTelegramLabel: "Copy the Telegram username",
    copyViberLabel: "Copy the Viber number",
    copyEmailLabel: "Copy the email address",
    backToFeed: "Back to the gallery",
  },

  // --- My reveals (06) ---
  myReveals: {
    title: "My requests",
    deviceOnly: "Saved on this device only. We don't know who you are.",
    /** Template: "The shelter says: {name} has found a home." */
    resolved: "The shelter says: {name} has found a home.",
  },

  footer: {
    dataCredit:
      "List of settlements: Codifier of administrative-territorial units (Ministry of Development), Creative Commons Attribution.",
  },

  // --- Exhausted (07) ---
  exhausted: {
    title: "That's everyone who fits right now.",
    body: "There aren't many shelters here, so the list is short – that's normal.",
    newAnimals: "New animals appear when shelters update their cards. Usually every few weeks.",
    changeFilters: "Change filters",
    toList: "Browse the list",
    reviewAgain: "Look through them again, no rush",
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
    /** Mirrors uk.ts's rateLimited key-for-key - machine-translated like the rest of this file, not a native pass; see this file's own top comment. */
    rateLimited: {
      title: "You've revealed the contacts of many shelters today.",
      body: "The next ones – tomorrow.",
    },
    photoMissing: {
      placeholder: "No photo yet – the shelter hasn't sent one",
    },
  },

  // --- Reserved badge ---
  reserved: {
    badge: "Already in conversation",
    badgeShort: "In talks",
    action: "Ask to be second in line",
  },

  // --- Resolved card variant - see the uk key's own note ---
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
  // here - this set exists only for key-shape parity with uk.ts.
  cardMeta: {
    ageBaby: "baby",
    ageYoung: "young",
    ageAdult: "adult",
    ageSenior: "senior",
    ageBabyFemale: "baby",
    ageYoungFemale: "young",
    ageAdultFemale: "adult",
    ageSeniorFemale: "senior",
    sizeSmall: "small",
    sizeMedium: "medium",
    sizeLarge: "large",
    atShelter: "{place}",
    fosteredHousing: "with a volunteer foster in {place}",
    sexMale: "boy",
    sexFemale: "girl",
  },

  // --- The pet card's temperament (English drafts; see the uk keys) ---
  // English adjectives don't inflect, so the three forms only differ where
  // the verb does.
  temperament: {
    playful: { masculine: "Playful", feminine: "Playful", plural: "Playful" },
    calm: { masculine: "Calm", feminine: "Calm", plural: "Calm" },
    affectionate: { masculine: "Affectionate", feminine: "Affectionate", plural: "Affectionate" },
    energetic: { masculine: "Energetic", feminine: "Energetic", plural: "Energetic" },
    independent: { masculine: "Independent", feminine: "Independent", plural: "Independent" },
    shy: { masculine: "Shy", feminine: "Shy", plural: "Shy" },
    good_with_kids: {
      masculine: "Gets on with children",
      feminine: "Gets on with children",
      plural: "Get on with children",
    },
    good_with_cats: {
      masculine: "Gets on with cats",
      feminine: "Gets on with cats",
      plural: "Get on with cats",
    },
    good_with_dogs: {
      masculine: "Gets on with dogs",
      feminine: "Gets on with dogs",
      plural: "Get on with dogs",
    },
  },

  // --- The pet card's coat colour (English drafts) ---
  coatColour: {
    names: {
      black: "Black",
      white: "White",
      grey: "Grey",
      ginger: "Ginger",
      brown: "Brown",
      cream: "Cream",
      black_white: "Black and white",
      tricolour: "Tricolour",
      tabby: "Tabby",
      spotted: "Spotted",
    },
    chip: "{label} coat",
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
  },

  // --- Gallery no-match (B4) - see the uk key's own note ---
  place: {
    prefixCity: "city",
    prefixSelyshche: "urban-type settlement",
    prefixVillage: "village",
    withRegion: "{place}, {region}",
    withDistrictAndRegion: "{place}, {district}, {region}",
    districtShort: "{name} district",
    hromadaShort: "{name} community",
  },

  noMatch: {
    heading: "Nobody matches these filters right now.",
    reassurance: "This isn't a search error.",
    removeDimension: "Remove “{dimension}” ({animalWord})",
    showAllCities: "Show every city ({animalWord})",
    showAllRegions: "Show every region ({animalWord})",
    regionEmpty: "No animals in the chosen regions yet.",
    neighbourRegion: "Neighbouring region: {region} ({animalWord})",
    additionalAnimals: "+{count} {animalWord}",
    suggestionExplainer:
      "Each suggestion names how many animals it would add. An empty screen never says " +
      '"try something else" without a number.',
  },

  // --- Gallery error - see the uk key's own note ---
  galleryError: {
    eyebrow: "DIDN'T LOAD",
    title: "The page couldn't be loaded.",
    body: "This isn't your fault or the shelter's. Your filters are saved.",
    action: "Try again",
    showAll: "Show all animals",
  },

  // --- Gallery out-of-range page notice - see the uk key's own note ---
  outOfRangePage: {
    notFound: "Page {requested} doesn't exist – there are only {total}.",
    showingLast: "Showing page {total} – the last one. Nothing was lost.",
    backToFirst: "Back to the first page",
  },

  // --- Site-wide header links (Phase T) - see the uk key's own note ---
  nav: {
    about: "About",
    forShelters: "For shelters",
    saved: "Saved",
    kabinet: "Cabinet",
    menu: "Menu",
    skipToContent: "Skip to content",
  },

  siteNotFound: {
    eyebrow: "Not found",
    title: "There is no such page.",
    body: "The link may be out of date, or there is a typo in the address.",
    action: "To the home page",
  },

  // --- About page - see the uk key's own note ---
  about: {
    title: "About this project",
    intro:
      "{site} is a site where animals from shelters across Ukraine look for a home. One person builds it – me, in my free time. There's no team and no investor.",
    free: "The site is free for shelters, with no paid tiers. If that ever changes, every shelter will know well in advance, not after the fact.",
    money:
      'Opika never touches money: no payment processing, no commission, no donations collected through the platform. The "Support the shelter" button links to the shelter\'s own page on another service (for example, monobank) – the site only shows the link; the money goes directly, and you can see exactly where.',
    data: "Data a shelter enters – address, contact details, animal listings – belongs to the shelter. The exact address is never shown publicly: someone looking for an animal sees only the city. A shelter can ask to have its record removed at any time. For shelters with cabinet access, the site keeps the administrator's name and email address (to send sign-in links), and a technical record of the browser and device used to sign in. For shelter cabinet administrators only an irreversible hash of the password is stored, never the password itself. IP addresses are not stored. A sign-in to a shelter's cabinet lasts 30 days from the last visit and no longer than 90 days, after which you sign in again. Addresses typed into the sign-in form, and records of sign-ins that have lost force, are deleted within a day. Every change in the cabinet is recorded in the shelter's history: when it was made and by whom, a shelter administrator or me. Taps on «Still looking» or «Still arranging» don't go into the history: they show as the date on the card. For the profile, the previous and the new value are kept; for animal cards, only which fields changed. The history holds nothing about the people looking for animals. It is deleted together with the shelter's record. Photos uploaded in the cabinet are stored without location data, at addresses that can't be guessed. A photo removed from a card is no longer shown, and I delete the file itself when the shelter asks.",
    analytics:
      "The site collects basic visit statistics – how many people visit and how fast the pages load – with no advertising.",
    /** Template: "Get in touch: {contact}" */
    contact: "Get in touch: {contact}",
  },

  /**
   * «Для притулків» (Phase T) - see the uk key's own note.
   *
   * ⚠ Pending in BOTH locales, deliberately. The Ukrainian is written first,
   * from `docs/prytulkam-argument.md`; the English is written from the
   * finished Ukrainian at H3's native-speaker pass, not the other way round.
   * Filling this side in first would make it the de-facto source and
   * reintroduce exactly the translated-from-English register D3 flagged.
   */
  forShelters: {
    title: "For shelters",
    /** Real copy in both locales - see the uk key's own note. */
    headings: {
      whatThisIs: "What this is",
      cost: "What it costs",
      whatHappensToAnimals: "What happens to your animals",
      whoContactsWhom: "Who contacts whom",
      money: "About money",
      verification: "What «verified» means",
      whatToPrepare: "What to prepare",
      whyThatSentence: "Why we ask for that sentence",
      whenAnimalFindsHome: "When an animal finds a home",
      howToLeave: "If you want to leave",
      whoIsBehindThis: "Who is behind this",
      howToStart: "How to start",
    },
    whatThisIs: `${COPY_PENDING} 1. What this is – one sentence.`,
    cost: `${COPY_PENDING} 2. What it costs – nothing, now and later.`,
    whatHappensToAnimals: `${COPY_PENDING} 3. What happens to their animals.`,
    whoContactsWhom: `${COPY_PENDING} 4. Who contacts whom.`,
    noObligation: `${COPY_PENDING} 4b. No lead queue, nothing to answer.`,
    money: `${COPY_PENDING} 5. Money – never touched.`,
    verification: `${COPY_PENDING} 6. What "verified" means.`,
    verificationOpenToVolunteers: `${COPY_PENDING} 6b. Open to unregistered volunteer groups.`,
    whatToPrepare: `${COPY_PENDING} 7. What to prepare.`,
    whyThatSentence: `${COPY_PENDING} 8. Why we ask for the freshness sentence.`,
    whenAnimalFindsHome: `${COPY_PENDING} 9. When an animal finds a home.`,
    howToLeave: `${COPY_PENDING} 9b. How to leave – write, and everything is removed, no conditions.`,
    whoIsBehindThis: `${COPY_PENDING} 10. Who is behind this.`,
    howToStart: `${COPY_PENDING} 11. How to start – write to {contact}.`,
    signInLink: `Sign in to the cabinet`,
  },
  kabinet: {
    cityPicker: {
      placeholder: "Start typing a name…",
      empty: "Nothing found",
      mustPick: "Choose a settlement from the list",
      tooShort: "Type at least two letters",
      loading: "Searching…",
      error: "The list did not load.",
      retry: "Try again",
      found: "Found: {count}",
      clear: "Clear",
      close: "Close",
    },
    /**
     * The operator's name when `KABINET_OPERATOR_DISPLAY_NAME` is unset
     * (RS-Q2): the English sense of the Ukrainian, standing alone (a signature
     * line, a header) and mid-sentence (the locked note).
     */
    operatorFallbackName: "Site administrator",
    operatorFallbackNameInSentence: "site administrator",
    shell: {
      label: "Cabinet",
      viewSite: "View site",
      newTab: "(opens in a new tab)",
    },
    signIn: {
      pageTitle: "Sign in to the cabinet",
      title: "Sign in to the cabinet",
      intro:
        "For shelters and the site administrator. Sign in with a password or with a link that arrives by email.",
      emailLabel: "Email address",
      passwordLabel: "Password",
      showPassword: "Show password",
      hidePassword: "Hide password",
      submitPassword: "Sign in",
      useLink: "Send a sign-in link",
      forgot: "Forgot your password?",
      wrongCredentials:
        "Couldn't sign in. Check the address and password, or send yourself a sign-in link.",
      throttled: "Too many sign-in attempts. Try again in {minutes} min.",
      addressNote:
        "I add your address when I invite your shelter. If the address is not on the list no email arrives, and this page does not say so, so that it never reveals who is registered.",
      failed: "Could not reach the site. Check your connection and try again.",
      sendFailed: "The link could not be sent. Check your connection and try again.",
      sentTitle: "Check your email",
      sentBody:
        "If this address is on the list, a sign-in link will arrive at {email}. It works for 15 minutes and opens on any device.",
      spamNote: "No email? Check «Spam» and «Promotions». You can send it again after 60 seconds.",
      resend: "Send again",
      resendIn: "Send again · {time}",
      otherAddress: "A different address",
    },
    setPassword: {
      title: "Create a password",
      intro: "The password for the cabinet of «{shelter}». You sign in as: {email}.",
      newLabel: "Password",
      repeatLabel: "Repeat the password",
      hint: "Characters: {count} of {min}",
      submit: "Save and sign in",
    },
    password: {
      tooShort: "The password is too short. Minimum characters: {min}.",
      tooLong: "The password is too long. Maximum characters: {max}.",
      common: "This password is too easy to guess. Choose another.",
      personal:
        "The password can't contain your email address (even the part before the @), the shelter's name or the site's name.",
      mismatch: "The passwords don't match.",
    },
    forgot: {
      title: "Forgot your password?",
      intro: "Enter the email address you sign in to the cabinet with.",
      submit: "Send the link",
      sent: "If this is a shelter cabinet administrator's address, a link for a new password has been sent to it. It works for {minutes} min.",
      throttled: "Too many requests. Try again later.",
    },
    reset: {
      title: "New password",
      submit: "Save the password",
      done: "Password changed, and you have been signed out on every device. Sign in with the new password.",
      invalidLink: "The link has expired or has already been used. {link}",
      invalidLinkText: "Get a new link",
    },
    changePassword: {
      title: "Change password",
      currentLabel: "Current password",
      newLabel: "New password",
      submit: "Change password",
      done: "Password changed. Other devices have been signed out; you stay in the cabinet here.",
      wrongCurrent: "The current password is wrong.",
      noPasswordYet:
        "There is no password yet. You can create one through «Forgot your password?» on the sign-in page.",
    },
    profile: {
      pageTitle: "Shelter · {shelter}",
      title: "Shelter",
      phoneTitle: "Shelter",
      intro: "What people looking for an animal see about you on every card.",
      role: "shelter administrator",
      signOut: "Sign out",
      viewOnSite: "Shelter page on the site",
      signOutFailed:
        "Sign-out didn't go through, so you are still signed in. Check the connection and try again.",
      contactsTitle: "Contacts",
      contactsNote:
        "A person sees these contacts when they tap «Write to the shelter», and writes to you themselves. Messages go directly, with no one in between.",
      donationTitle: "Fundraising",
      donationLink: "Fundraising link",
      donationNote: "https only. No money passes through the site: this is an external link.",
      donationPending: "The proposed link is waiting for me to check it.",
      voiceTitle: "The shelter's voice",
      voiceLabel: "Your words on the shelter page",
      voiceNote: "One sentence in the first person, written by you.",
      pendingNote:
        "I carry out the verification myself: I will write or call to arrange it. Until it is finished, only you can see your animals.",
      lockedTitle: "Set during verification",
      lockedNote:
        "{operator} sets these details while verifying the shelter. Here they are read-only.",
      legalName: "Legal entity",
      edrpou: "EDRPOU code",
      contactPerson: "Contact person",
      registrationStatus: "Registration status",
      statusSince: "{status} · since {date}",
      address: "Premises address",
      addressNote: "People looking for an animal don't see the exact address, only the city.",
    },
    profileStatus: {
      pending: "Waiting",
      under_review: "Under review",
      verified: "Verified",
      rejected: "Rejected",
      paused: "Paused",
      suspended: "Suspended",
    },
    profileChannel: {
      phone: "Phone",
      telegram: "Telegram",
      viber: "Viber",
      email: "Email",
      website: "Website",
    },
    profileNotRecorded: "Not recorded",
    profileTabs: {
      label: "Shelter sections",
      profile: "Profile",
      verification: "Verification",
      account: "Account",
      profileNote: "What people see on the shelter's page.",
      view: "View",
    },
    profileEdit: {
      saveBar: {
        unsaved: "You have unsaved changes",
        cancel: "Cancel",
      },
      actions: {
        save: "Save",
        cancel: "Discard changes",
        liveOnSave: {
          contacts:
            "People see the new contacts as soon as you save, when they tap «Write to the shelter».",
          voice: "The new sentence appears on the shelter page as soon as you save.",
        },
        unsavedLeave: "Your changes aren't saved. Leave anyway?",
      },
      state: {
        saving: "Saving…",
        saved: "Saved.",
        savedAt: "Saved at {time}",
        failed: "Didn't save, so nothing changed on the cards. Check the connection and try again.",
        retry: "Try again",
      },
      errors: {
        conflict:
          "Someone changed the profile after you opened it. Your changes aren't saved. Here is the current version: make your changes again.",
        conflictReload: "Show the current version",
        illegalTransitionPause:
          "Intake can't be paused right now: the shelter's status has changed. Reload the page.",
        illegalTransitionResume:
          "Intake can't be resumed from here right now: the shelter's status has changed. Write to me.",
        phoneFormat:
          "Enter a Ukrainian number: +380 and 9 more digits, for example +380 67 123 45 67.",
        telegramFormat:
          "A Telegram username: 5-32 Latin letters, digits or underscores. The @ is optional.",
        viberFormat:
          "Enter a Ukrainian number: +380 and 9 more digits, for example +380 67 123 45 67.",
        emailFormat: "That doesn't look like an email address.",
        httpsOnly: "Only links that start with https://.",
        notAUrl: "That doesn't look like a link.",
        sentenceTooLong: "The sentence is longer than {max} characters.",
        unknownToken: "Only {імʼя} is filled in. Remove «{token}», or write it without braces.",
        dateTokenGone:
          "Every card shows when it was updated, so {дата} isn't needed in the sentence.",
        nameTokenGone:
          "The sentence now shows on the shelter page, so {імʼя} isn't used in it. Remove it and save again.",
        strayBrace: "A brace without its pair. Braces are only for {імʼя}.",
      },
      contacts: {
        otherLabel: "Another way to reach you",
        otherKind: "Kind",
        phonePlaceholder: "+380 …",
        telegramPlaceholder: "@username",
        removeOther: "Remove",
        addOther: "Add another way to reach you",
        atLeastOne: "Keep at least one way to reach you.",
      },
      voice: {
        hint: "One sentence in the first person, in your own words, about how often you update your cards. It shows on the shelter page.",
        counter: "{count} / {max}",
        counterOver: "Characters over: {over}",
        emptyMeans:
          "Leave it empty and the shelter page has no sentence; the cards still show “Updated … ago”.",
        previewLabel: "This is how it looks on the shelter page:",
        previewEmpty: "No sentence: the shelter page won't show one.",
      },
      donation: {
        optional: "· optional",
        previewLabel: "This is how people will see it:",
        previewHost: "{host} ↗",
        propose: "Send for checking",
        proposeNote:
          "The new link appears on the cards after I check it. Until then people see the current one.",
        pendingTitle: "Waiting to be checked",
        pendingHost: "Proposed: {host}",
        pendingSince: "Sent {date}",
        cancelProposal: "Withdraw the proposal",
        proposed: "Sent. I'll check the link.",
        cancelled: "Proposal withdrawn. The current link stays.",
        replaceNote: "Sending another link replaces the one waiting to be checked.",
        failed: "Not sent. Check the connection and try again.",
        declined: "The last proposed link wasn't approved. If it isn't clear why, write to me.",
      },
      pause: {
        button: "Pause taking animals",
        resumeButton: "Resume taking animals",
        pausedLine: "Intake paused since {date} · {reason}",
        dialogTitle: "Pause taking animals?",
        dialogBody:
          "While intake is paused, people looking don't see your animals. You can resume here at any time.",
        reasonLabel: "Reason",
        reasonPlaceholder: "Choose a reason",
        reason: {
          seasonal_closure: "Seasonal break",
          relocation: "Moving",
          capacity_reached: "No room",
          staff_shortage: "Not enough people",
          other: "Other",
        },
        noteLabel: "Note",
        noteHint:
          "You, the shelter's other administrators and I see the note. People looking for an animal don't.",
        confirm: "Pause intake",
        cancel: "Cancel",
        close: "Close",
        paused: "Intake paused.",
        resumed: "Intake resumed. Your animals are shown again.",
      },
      logo: {
        title: "Shelter logo",
        add: "Add logo",
        change: "Change logo",
        remove: "Remove logo",
        uploading: "Uploading…",
        updated: "Logo updated.",
        removed: "Logo removed.",
        removeFailed: "Couldn't remove the logo. Check your connection and try again.",
        rejected: "This file doesn't work as a logo. Try a different image.",
        rateLimited: "Too many attempts in a short time. Try again shortly.",
        uploadsUnavailable: "Logo uploads aren't available on this version of the site.",
        failed: "The logo didn't upload. Check your connection and try again.",
      },
    },
    listingStatus: {
      draft: "Draft",
      published: "Published",
      reserved: "Being arranged",
      adopted: "Home",
      withdrawn: "Taken down",
    },
    animalForm: {
      pageTitleNew: "New animal",
      pageTitleEdit: "{name}",
      titleNew: "New animal",
      backToList: "← Animals",
      header: {
        createdNotPublished: "Created {when} · not in the gallery yet",
      },
      sections: {
        basics: "Basics",
        about: "About the animal",
        health: "Health",
        publication: "Publishing",
      },
      who: {
        title: "Who this is",
        nameLabel: "Name",
        nameHint:
          "What the animal is called at the shelter. Just the name; explanations belong in the description.",
        namePlaceholder: "For example, Lastivka",
        speciesLabel: "Species",
        sexLabel: "Sex",
        sexMale: "Boy",
        sexFemale: "Girl",
        sizeLabel: "Size",
        sizeNote:
          "There is no weight on purpose: a size judged by eye is more accurate than last year's number.",
        sizeHintUpTo: "up to {max} kg",
        sizeHintRange: "{min}-{max} kg",
        sizeHintFrom: "from {min} kg",
      },
      coat: {
        label: "Fur",
        short: "Short",
        long: "Long",
        unknown: "Not given",
      },
      colour: {
        title: "Coat colour",
        unknown: "Not given",
        other: "Other",
        customPlaceholder: "In your own words",
      },
      age: {
        title: "Age",
        modeLabel: "What is known about the age",
        modeBirthDate: "The birth date is known",
        modeBucket: "The age on a given date is known",
        modeBirthDateShort: "Birth date",
        modeBucketShort: "Age on a date",
        modeNote:
          "Both ways are equally good. The site keeps exactly what you entered and works the age out from there.",
        birthDateLabel: "Birth date",
        bucketLabel: "Age on that date",
        bucketRangeUnder: "under {max}",
        bucketRange: "{min}-{max}",
        bucketRangeFrom: "{min}+",
        asOfLabel: "As of",
        asOfHint: "When you made this estimate. Usually the day the animal came to the shelter.",
        adopterSees: "People looking for an animal will see: «{label}».",
        uncertain:
          "The age was given as of {when}. The card now says «{label}». If the animal is older than that, update the age.",
      },
      description: {
        title: "Description",
        prompt: "What you would tell someone standing by the enclosure.",
        label: "About the animal",
        hint: "Plain text, no formatting.",
        counter: "{count} of {max} characters",
        counterOver: "Characters over the limit: {over}",
      },
      temperament: {
        title: "Temperament",
        hint: "You can choose several. Optional.",
        other: "Other",
        customPlaceholder: "In your own words",
      },
      health: {
        title: "Medical",
        confirm: "Done",
        unknownNote:
          "«Not recorded» is an honest answer. People looking for an animal will see «Not recorded», not «no».",
        registryReadOnly:
          "Confirmed by the state animal registry. This line can't be changed here.",
      },
      medicalNotes: {
        title: "Anything else worth knowing about their health",
        hint: "Optional. People looking for an animal will see this text under «Medical».",
      },
      photos: {
        title: "Photos",
        ratioNote: "4:5 format; the first photo is the cover.",
        add: "+ Photo",
        addHint: "Any photo this phone or browser can open.",
        howItWorks:
          "The first photo is the cover; drag a photo to change the order. At least one is needed to publish. Large photos are shrunk on the device to {px} pixels before sending, which saves mobile data.",
        privacyNote: "Location data and other hidden data are removed from photos.",
        preparing: "Preparing the photo…",
        uploading: "Uploading the photo…",
        uploadingProgress: "Uploading · {percent} · {sent} of {total} MB",
        done: "Done",
        cover: "Cover",
        failed: "Didn't upload",
        dismissFailed: "Remove",
        dismissFailedName: "Remove the photo that didn't upload",
        tileLabel: "Photo {n} of {total}",
        makeCover: "Make it the cover",
        moveEarlier: "Move earlier",
        moveLater: "Move later",
        remove: "Remove photo {n}",
        capReached: "That's the maximum: {max} photos.",
        lastPhotoKept: "People can see this card, so one photo has to stay.",
        lastPhotoKeptNotShown:
          "The card is published, so one photo has to stay, even while nobody can see it yet.",
        added: "Photo added.",
        removed: "Photo removed.",
        reordered: "Order changed.",
        conflict: "The photos changed in another window. Here is the current set; try again.",
        removedStillReachable:
          "The photo is gone from the card. The file itself isn't deleted right away; if it needs to go completely, write to me.",
        dateMoves: "On a card people can see, any photo change updates the «Updated» date.",
      },
      photoErrors: {
        heicUnsupported:
          "This phone or browser can't open HEIC photos. Please choose a JPG or PNG.",
        unreadable: "This file couldn't be opened as a photo.",
        tooLarge: "Even after shrinking, this photo is too large. Try another one.",
        rejected: "The site can't use this file as a photo.",
        limitReached: "This animal already has {max} photos.",
        rateLimited: "Too many photos in a short time. Try again a little later.",
        uploadsUnavailable: "Photos can't be uploaded on this version of the site.",
      },
      draft: {
        savedAt: "Draft saved at {time}",
        notVisible: "People looking for an animal don't see this draft.",
        notSavedYet: "A name and a species are needed to save a draft.",
        saveFailed:
          "The draft wasn't saved. Check the connection; everything you typed stays here.",
        save: "Save draft",
        saveShort: "Save",
      },
      listed: {
        liveOnSave: "Changes appear on the card as soon as you save.",
        notShownNow: "Nobody can see this card right now.",
        dateUnchanged:
          "Editing the text doesn't change the «Updated» date. Your confirmation in the animal list does, and so does any photo change.",
      },
      publish: {
        button: "Publish",
        missing: "To publish, this still needs: {list}.",
        gap: {
          sex: "sex",
          size: "size",
          age: "age",
          description: "description",
          photo: "a photo",
        },
        done: "Published. People looking for an animal can see the card now.",
        publishedNotShown:
          "Published. People looking for an animal will see the card as soon as the shelter passes verification.",
        viewPublic: "Open the animal's page",
        stateChanged:
          "The card changed in another window. Reload the page to see the current version.",
      },
      errors: {
        conflict:
          "Someone changed this card after you opened it. Your latest changes weren't saved. Here is the current version; make them again.",
        registryConfirmed:
          "This is confirmed by the state animal registry and can't be changed here.",
        requiredOnceListed: "This card has been published, so its description can't be empty.",
        notFound: "This animal isn't in your list: the card was deleted, or the link is wrong.",
        loadFailed: "The card didn't load. Check the connection and try again.",
      },
      validation: {
        nameRequired: "A name is needed to save the draft.",
        speciesRequired: "Choose dog or cat to save the draft.",
        nameBrace: "A name can't contain curly braces.",
        nameTooLong: "The name is longer than {max} characters.",
        descriptionTooLong: "The description is longer than {max} characters.",
        medicalNotesTooLong: "The health note is longer than {max} characters.",
        birthDateFuture: "The birth date can't be in the future.",
        asOfFuture: "The «As of» date can't be in the future.",
        dateTooOld: "That date is too far back: more than {years} years ago.",
      },
    },
    animalList: {
      pageTitle: "Animals",
      title: "Animals",
      caption: "{shelter} · {cards}",
      captionCards: {
        one: "{count} card",
        few: "{count} cards",
        many: "{count} cards",
      },
      add: "Add an animal",
      addShort: "Add",
      filter: {
        label: "Show",
        all: "All",
        draft: "Drafts",
        published: "Published",
        reserved: "Arranging",
        adopted: "Home",
        withdrawn: "Withdrawn from display",
        withCount: "{label} · {count}",
      },
      row: {
        adoptedSince: "Home since {date}",
        withdrawnOn: "Withdrawn from display {date} · {reason}",
        more: "More",
        menuLabel: "Actions for the card {name}",
      },
      orderInfoLabel: "How the list is ordered",
      actions: {
        viewOnSite: "View on the site",
        edit: "Edit",
        reserve: "Started arranging",
        release: "Didn't work out: looking again",
        adopt: "Already home",
        withdraw: "Withdraw from display",
        restore: "Back to drafts",
        deleteDraft: "Delete draft",
      },
      confirm: {
        stillLooking: "Still looking",
        stillArranging: "Still arranging",
        done: "Confirmed today",
        undo: "Undo · {seconds} s",
        undone: "Undone: the card shows its previous date again.",
        undoExpired:
          "It can't be undone any more: the time ran out or the card changed. The card shows today's date.",
        failed:
          "Not confirmed: the card's date hasn't changed. Check the connection and try again.",
      },
      adoptDialog: {
        title: "Is {name} already home?",
        body: "The card leaves the gallery and the deck, and its page will say the animal is no longer there. In your list the card stays, marked «Home». This can't be undone: if the animal comes back, add it as a new card.",
        confirm: "Yes, already home",
      },
      withdrawDialog: {
        title: "Withdraw from display: {name}?",
        body: "People looking for an animal won't see the card any more, and its page will say the animal is no longer there. The card stays in your list and can be moved back to drafts. If it is published again, the date and the waiting time start from that day.",
        adoptedHint: "If the animal found a home, mark it «Already home» instead.",
        confirm: "Withdraw from display",
      },
      withdrawReason: {
        adopted_elsewhere: "found a home another way",
        transferred: "moved to another shelter",
        deceased: "the animal died",
        listing_error: "added by mistake",
        other: "another reason",
      },
      moved: {
        reserved: "{name}: started arranging.",
        released: "{name}: looking for a home again.",
        adopted: "{name}: already home.",
        withdrawn: "{name}: withdrawn from display.",
        restored: "{name}: back in drafts.",
      },
      deleteDialog: {
        title: "Delete the draft «{name}»?",
        body: "It disappears from your list for good.",
        photosStay:
          "The photo files aren't deleted at once; if they must go completely, write to me.",
        confirm: "Delete",
      },
      deleted: "Draft «{name}» deleted.",
      stale: {
        count: "You haven't confirmed {cards} for more than {days} days.",
        countCards: {
          one: "{count} card",
          few: "{count} cards",
          many: "{count} cards",
        },
        caption:
          "People looking for an animal see an old date on them. If nothing has changed, a tap on «Still looking» or «Still arranging» is enough.",
        show: "Show these {count}",
        showAll: "Show all",
      },
      paused: {
        hidden: "While intake is paused, people looking for an animal don't see your animals.",
      },
      notVisible: {
        pending: "Your animals appear in the gallery as soon as the shelter passes verification.",
      },
      orderNote:
        "Order in the gallery is by date: the person chooses the freshest cards first or those who have waited longest. Card completeness affects only the order in the deck. The order can't be changed here, and there is no promotion.",
      empty: {
        title: "No animals here yet.",
        body: "Add the first one. People looking for an animal see the card once it is published.",
        add: "Add the first animal",
        caption: "A name and a species are enough to save a draft; the rest can be added later.",
      },
      loading: "Loading",
      loadMore: "Show more",
      filterEmpty: "No cards in this group yet.",
      loadFailed: "The list didn't load. Check the connection and try again.",
      errors: {
        rateLimited: "Too many actions in a short time. Wait a minute and try again.",
        actionFailed: "That didn't work. Check the connection and try again.",
      },
    },
    nav: {
      label: "Cabinet sections",
      animals: "Animals",
    },
    deleteDraft: {
      refused: {
        wasPublished:
          "This card has been published before, so it can't be deleted. It stays in your list as a draft, and people looking for an animal don't see it.",
      },
    },
    support: {
      title: "You are viewing the cabinet of «{shelter}»: view only, nothing can be changed",
      body: "This is how the shelter's administrator sees the cabinet.",
      exit: "Leave support mode",
      exitFailed: "Could not leave support mode. Try again.",
      viewingAs: "as the shelter administrator",
      signOutDisabled: "Sign-out disabled",
    },
    /** The English sense of uk.ts's final Ukrainian (2026-10-14); both emails are signed `- {operator}`. */
    email: {
      signIn: {
        subject: `A sign-in link for the shelter's cabinet`,
        intro: `Hello. A sign-in link for the shelter's cabinet was requested for this address.`,
        action: `Open the sign-in page`,
        expiry: `The link works once and expires in {minutes} minutes.`,
        notYou: `If you didn't ask for this, just ignore the email: nothing happens without the link.\n- {operator}`,
      },
      invite: {
        subject: `Your access to the shelter's cabinet`,
        intro: `Hello. I am opening access to the cabinet of the shelter «{shelter}» on the site {site} for this address.`,
        what: `In the cabinet you see the shelter's details: both what people see and the verification details. You change your contacts, the sentence on the shelter page and your animal cards yourself, and the changes appear as soon as you save. A donation link goes live as soon as I've checked it. To change the verification details (the legal entity, EDRPOU or the address), write to me.`,
        whatBeforeVerification: `In the cabinet you see the shelter's details: both what people see and the verification details. You change your contacts, the sentence on the shelter page and your animal cards yourself. People looking for an animal will see them once the shelter has passed verification. A donation link goes live as soon as I've checked it. To change the verification details (the legal entity, EDRPOU or the address), write to me.`,
        action: `Open the invitation`,
        expiry: `The invitation is valid for {hours} hours. If you miss it, I will send a new one.`,
        notYou: `If you weren't expecting this email, just ignore it and don't forward it to anyone: while the invitation is valid, this link lets someone create a password for this address, once.\n- {operator}`,
      },
      reset: {
        subject: `A new password for the shelter's cabinet`,
        intro: `A new password for the shelter's cabinet was requested for this address.`,
        action: `Create a new password`,
        expiry: `The link works once and expires in {minutes} min.`,
        notYou: `If you didn't make this request, just ignore this email: your password stays the same.\n- {operator}`,
      },
      passwordChanged: {
        subject: `Shelter cabinet: password changed`,
        body: `The password to the shelter's cabinet for this address has just been changed. Other devices have been signed out.`,
        notYou: `If this wasn't you, write to me: {contact}\n- {operator}`,
      },
    },
    signInCard: {
      notArrived: `If the email hasn't arrived in a few minutes, write to me at {contact}.`,
    },
    /** The invite landing (IN-Q11, KS-Q2 A); see the Ukrainian catalogue. */
    inviteLanding: {
      pageTitle: `Invitation to the cabinet`,
      unusableTitle: `This invitation can't be used`,
      expired: `The link no longer works. If you've already created a password, sign in. If not, write to me and I'll send a new invitation.`,
      signIn: `Go to sign-in`,
    },
    /** The operator's reminder after an invite (IN-E13); see the Ukrainian catalogue. */
    registry: {
      inviteSent: {
        tellPersonally: `Tell the shelter personally: the invitation was sent from {sender}. If they can't see it, they should check the Promotions tab.`,
      },
    },
    /** The confirm page an emailed sign-in link opens (IN-Q11). */
    confirm: {
      title: `Sign in to the shelters' cabinet`,
      intro: `Press the button to finish signing in.`,
      submit: `Sign in`,
      invalid: `This link has already been used or has expired.`,
      requestNew: `Request a new link`,
      joinFailed: `Nothing was half-saved. Try again; if it still fails, it retries itself on your next sign-in.`,
      joinFailedTitle: `You are signed in, but adding you to the shelter didn't work`,
      joinRetry: `Try again`,
      rateLimited: `Too many sign-in attempts from this connection just now. Your link still works: wait a minute and press «Sign in» again.`,
    },
    /** History lines (IN-Q14); see the Ukrainian catalogue. */
    history: {
      adminJoined: `{email} now has access to the cabinet`,
    },
    /** R-UI, the operator's screens: the English sense of uk.ts's final Ukrainian (2026-10-17). */
    operator: {
      shell: {
        role: "site administrator",
        nav: {
          shelters: "Shelters",
          newShelter: "New shelter",
        },
        pageTitle: {
          list: "Shelters",
          create: "New shelter",
          shelter: "{name}",
        },
      },
      list: {
        title: "Shelters",
        total: "Total: {count}",
        create: "New shelter",
        createShort: "New",
        search: "Search by name",
        orderNote: "Those waiting on your decision come first.",
        filterAll: "All · {count}",
        filterStatus: "{status} · {count}",
        admins: "Administrators: {count}",
        adminsInvited: "Invited: {count}",
        noAdmins: "No administrators and no invitations",
        donationPending: "A fundraising link is waiting for a decision",
        open: "Open",
        empty: "No shelters yet. Add the first one with «New shelter».",
        noMatch: "Nothing found. Change the search or the filter.",
        loadMore: "Show more",
        loadFailed: "The list didn't load.",
      },
      shelter: {
        back: "← Shelters",
        meta: "{city} · {admins}",
        timeInState: "since {date}",
        legalNote:
          "The shelter sees these fields read-only. A change of legal entity or EDRPOU doesn't change the status by itself: the decision is yours.",
        descriptionTitle: "Shelter description",
      },
      donation: {
        live: "Live link",
        none: "No link",
        proposed: "The shelter proposed {host} on {date}. Waiting for your decision.",
        approve: "Approve",
        reject: "Reject",
        approved: "Link approved.",
        rejected: "Link rejected.",
        conflict: "The proposal changed while the page was open. This is the current one.",
      },
      admins: {
        title: "Administrators",
        joined: "Has access",
        invitedUntil: "Invited · the link is valid until {date}",
        invitedExpired: "Invited · the link has expired",
        none: "No administrators",
        remove: "Remove",
        removeConfirm: {
          title: "Close access? {name} will no longer be able to sign in to the cabinet.",
          body: "Access to the cabinet closes at once, and every session ends.",
        },
        inviteAnother: "Invite another",
        inviteFirst: "Invite an administrator",
        resend: "Send again",
        gone: "This access is already closed.",
      },
      evidence: {
        title: "Evidence for verification",
        empty: "No evidence yet.",
        kind: {
          edrpou_registration: "Registration · EDRPOU",
          bank_account_holder: "Bank account holder",
          reference_contact: "Reference",
          site_visit: "Site visit",
          supporting_document: "Document",
        },
        added: "added {date}",
        field: {
          registeredName: "Name in the EDR",
          holderName: "Account holder",
          who: "Who",
          channel: "How to reach them",
          relationship: "Relation to the shelter",
          visitedOn: "Visit date",
          notes: "Note",
          label: "Label",
        },
        relationship: {
          veterinary_clinic: "Veterinary clinic",
          local_authority: "Local authority",
          partner_organisation: "Partner organisation",
          other: "Other",
        },
        noDocument: "No document attached: allowed for this kind of evidence.",
        gaps: "Missing for approval: {kind}, {provided} of {minimum}.",
        add: "+ Add evidence",
        remove: "Remove",
        typePicker: "Kind of evidence",
        siteVisitDateHint: "The visit date can't be in the future.",
      },
      blocked: {
        title: "Addresses the email provider won't deliver to",
        none: "Checked: none of this shelter's addresses is blocked.",
        line: "{email}: {reason}",
        incomplete: "The list of blocked addresses could only be fetched in part.",
        unknown: {
          provider_error: "The email provider answered with an error.",
          timed_out: "The email provider didn't answer in time.",
          unsupported_provider: "This email provider doesn't allow checking blocks.",
          provider_suppresses:
            "The email provider keeps its own list of blocked addresses; the site doesn't check it.",
        },
        asOf: "As of {time}",
        manualUnblock:
          "An address can be unblocked only in the email provider's dashboard, not here.",
      },
      history: {
        title: "History",
        note: "Changes of status, data, administrators, fundraising and animals. «Still looking» confirmations are not recorded here.",
        empty: "No entries yet.",
        more: "Show more",
        actor: {
          you: "you",
          formerAdmin: "former administrator",
          operator: "site administrator",
        },
        shelter_created: "Shelter created",
        shelter_created_script: "Shelter added from a file",
        verification: {
          start_review: "Taken under review",
          approve: "Approved → «Verified»",
          reject: "Rejected: {code}. {note}",
          suspend: "Suspended: {code}. {note}",
          reinstate: "Reinstated → «{status}»",
          resubmit: "Returned for verification",
          pause: "Taking animals paused",
          resume: "Pause lifted",
        },
        admin_invited: "Invitation sent: {name}, {email}",
        admin_invitation_resent: "Invitation sent again: {name}",
        admin_removed: "Access closed: {name}",
        admin_removed_pending: "Invitation withdrawn: {name}",
        contact_changed: "Contacts changed",
        freshness_sentence_changed: "Shelter page sentence changed",
        description_changed: "Shelter description changed",
        logo_changed: "Shelter logo changed",
        donation_proposed: "Fundraising link proposed: {host}",
        donation_proposal_cancelled: "Link proposal withdrawn",
        donation_approved: "Fundraising link approved",
        donation_rejected: "Fundraising link rejected",
        verified_data_changed: {
          legal_entity: "Legal details changed",
          exact_address: "Premises address changed",
        },
        animals_imported: "Animals added from a file: {count}",
        animal_created: "Card created: {name}",
        animal_edited: "Card {name} changed: {fields}",
        animal_listing_changed: "{name}: «{from}» → «{to}»",
        animal_deleted: "Draft deleted: {name}",
      },
      create: {
        title: "New shelter",
        intro:
          "Here you enter everything about the shelter: name, address, legal details and evidence. The first administrator gets an invitation by email.",
        name: "Shelter name",
        nameHint: "What the shelter calls itself.",
        description: "Shelter description",
        descriptionHint:
          "A short description of the shelter. It may be public, so don't write anything private here.",
        city: "Settlement",
        address: {
          line1: "Street, building",
          line2: "Block, premises · optional",
          postalCode: "Postcode · optional",
        },
        coordinates: "Coordinates",
        coordinatesHint:
          "Copy them from a map as «latitude, longitude». Never shown: people see the city only.",
        legalTitle: "Legal details",
        legalKind: {
          registered_ngo: "NGO or foundation",
          sole_proprietor: "Sole proprietor",
          unregistered_initiative: "Unregistered initiative",
        },
        registeredAt: "Registration date",
        firstAdminTitle: "First administrator",
        firstAdminHint:
          "Gets an email with a sign-in link. Other administrators can be invited from the shelter's page.",
        adminName: "Name",
        submit: "Create and send the invitation",
        submitShort: "Create",
        cancel: "Cancel",
        whatHappens: {
          title: "What happens next",
          step1: "The shelter appears in the list with the status «Waiting».",
          step2:
            "{name} gets a sign-in email. The link is valid for 72 hours and can be sent again.",
          step3:
            "The shelter's animals won't be in the gallery until you approve the verification.",
        },
        created: "Shelter created.",
        createdNoInvite:
          "Shelter created, but without an administrator. Invite one from the shelter's page.",
        inviteValidUntil: "The link is valid until {date}, {time}.",
        resend: "Send again",
        openShelter: "Open the shelter",
        errors: {
          addressHasARole: {
            shelter_admin: "This address already has access to another shelter.",
            operator: "This is the site administrator's address. The shelter needs another one.",
            invited_elsewhere:
              "A live invitation to another shelter was already sent to this address.",
          },
          siteVisitInFuture: "The visit date can't be in the future.",
          unknownCity: "That settlement isn't in the list.",
          lostAnswer:
            "No answer came back. The shelter may have been created: check the list before trying again.",
          failed: "The shelter couldn't be created. Try again.",
          required: "This field is required.",
          nameTooLong: "The name is longer than {max} characters.",
          edrpouFormat: "An EDRPOU code is 8 digits.",
          coordinatesFormat:
            "Enter the coordinates as «latitude, longitude», for example «50.4501, 30.5234».",
        },
      },
      email: {
        sent: "Invitation sent to {email}.",
        sentUnchecked: "Invitation sent. Whether the address is blocked couldn't be checked.",
        blocked: {
          unsubscribed: "Invitation not sent: the person at this address unsubscribed from emails.",
          hard_bounce: "Invitation not sent: the address doesn't exist or doesn't accept mail.",
          spam_complaint:
            "Invitation not sent: an earlier email to this address was reported as spam.",
          admin_blocked:
            "Invitation not sent: the address was blocked by hand in the email provider.",
        },
        failed: {
          provider_error:
            "Invitation not sent: the email provider answered with an error. Try sending it again.",
          copy_pending: "Invitation not sent: the email's text isn't ready yet.",
        },
      },
      verification: {
        decisionTitle: "Decision",
        decisionCaption:
          "The shelter will see the decision and the explanation verbatim in its cabinet.",
        startReview: "Take under review",
        approve: "Approve → «Verified»",
        approveShort: "Approve",
        approveNote:
          "Once approved, the shelter's animals appear in the gallery at once. A rejection needs an explanation.",
        approveBlocked: "Can't approve yet: evidence is missing:",
        reject: "Reject…",
        suspend: "Suspend…",
        reinstate: "Reinstate → «{status}»",
        resubmit: "Return for verification",
        suspended: {
          title: "Shelter suspended",
          reasonLabel: "The explanation the shelter sees",
          priorLabel: "Before the suspension the status was",
          priorPausedSince: "the shelter paused itself on {date}",
          reinstateExplainPaused:
            "«Reinstate» returns the shelter to its pause, not to «Verified». The animals stay hidden until the shelter lifts the pause itself.",
          reinstateExplainVerified:
            "«Reinstate» returns the status «Verified», and the animals appear in the gallery again.",
        },
        noConfirm: "No confirmation needed: this action hides nothing.",
        rejected: {
          title: "Rejected",
          reason: "{code}. {note}",
        },
      },
      reasonDialog: {
        rejectTitle: "Reject «{shelter}»?",
        suspendTitle: "Suspend «{shelter}»?",
        rejectBody:
          "The shelter will see this explanation verbatim in its cabinet. Its animals won't be in the gallery.",
        suspendBody:
          "The shelter's animals leave the gallery at once. The shelter will see this explanation in its cabinet. It can be reinstated at any time.",
        codeLabel: "Reason",
        reasonLabel: "Explanation",
        reasonHint: "Required. Write it so the person knows what to do next.",
        confirmReject: "Reject",
        confirmSuspend: "Suspend",
      },
      codes: {
        rejection: {
          insufficient_evidence: "Not enough evidence",
          identity_unverifiable: "Who is behind the shelter couldn't be confirmed",
          duplicate_submission: "Repeat application",
          out_of_service_area: "Outside the area the site works in",
          spam: "Spam",
          other: "Other",
        },
        suspension: {
          unresponsive: "No contact with the shelter",
          complaint_upheld: "A complaint was upheld",
          listing_quality: "The cards don't match reality",
          suspected_fraud: "Suspected fraud",
          other: "Other",
        },
      },
      errors: {
        illegalTransition: "That isn't possible from the current status. The page was refreshed.",
        conflictReload: "The data changed while the page was open. The page was refreshed.",
        failed: "That didn't work. Try again.",
        lostAnswer: "No answer came back. The page is checking whether the action went through.",
      },
      support: {
        enter: "View as the shelter · read-only",
      },
    },
    /** R-UI 3, the shelter's side of a rejection or suspension; see the Ukrainian catalogue. */
    verificationDecision: {
      rejectedTitle: "Verification not passed",
      suspendedTitle: "The shelter is temporarily suspended",
      reason: "Reason: {code}.",
      noteLabel: "Explanation:",
      signature: "- {operator}",
      contact: "If you have questions, write to me.",
      suspendedEffect: "While the shelter is suspended, its animals aren't in the gallery.",
      rejectedEffect: "The shelter's animals won't be in the gallery until verification is passed.",
    },
    /** The words the operator's animal history lines fill in; see the Ukrainian catalogue. */
    animalHistoryLabels: {
      listing: {
        draft: "Draft",
        published: "Published",
        reserved: "Being arranged",
        adopted: "Home",
        withdrawn: "Withdrawn",
      },
      field: {
        name: "Name",
        species: "Species",
        sex: "Sex",
        size: "Size",
        age: "Age",
        description: "Description",
        photos: "Photos",
        coatLength: "Fur",
        temperament: "Temperament",
        colour: "Coat colour",
        medicalNotes: "Medical",
      },
    },
  },
} as const;
