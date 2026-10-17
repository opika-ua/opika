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
import { COPY_PENDING } from "./uk";

export const en = {
  // --- 01 First run — was a band above the gallery grid, removed in
  // Phase D (see uk.ts's own comment); promise survives as og:description ---
  firstRun: {
    promise:
      "Animals from verified shelters across Kyiv oblast. Browse the list and see who's looking for a home.",
  },

  demo: {
    bannerNotice: "The registry doesn't hold any real shelters yet — every card here is a demo.",
    deckLabel: "Demo",
  },

  // --- Screen 02 · Feed / deck ---
  feed: {
    filtersLabel: "Filters",
    enterDeck: "Swipe one at a time",
    enterDeckShort: "Swipe",
    backToList: "← Back to the list",
    deckEntryAnnouncement: "One-at-a-time mode. Animal {position} of {total}.",
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
    lineFostered: "{city} · living with a volunteer",
    lineAtShelter: "{city}",
  },

  // --- Detail screen (04) ---
  detail: {
    /** Template: "Manually verified · {years} on Opika" — brand string lives here, not in domain */
    shelterVerifiedYears: "Manually verified · {years} on Opika",
    donateShelter: "Support the shelter",
    /** Template: "← All animals in {city}" */
    backToListIn: "← All animals in {city}",
    speciesDog: "Dog",
    speciesCat: "Cat",
    notFound: {
      eyebrow: "NOT FOUND",
      title: "This listing is gone.",
      body: "The animal has already been removed from the registry, or the link is out of date. This isn't an error — the listing is simply no longer here.",
      action: "All animals",
    },
    photoGalleryLabel: `${COPY_PENDING} Photo gallery`,
    photoGalleryDot: `${COPY_PENDING} Photo {n}`,
    photoGalleryThumbnail: `${COPY_PENDING} View photo {n}`,
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
    call: "Call",
    writeEmail: "Send an email",
    backToFeed: "Back to the gallery",
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
    /** Mirrors uk.ts's rateLimited key-for-key — machine-translated like the rest of this file, not a native pass; see this file's own top comment. */
    rateLimited: {
      title: "You've revealed the contacts of many shelters today.",
      body: "The next ones — tomorrow.",
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
    showAll: "Show all animals",
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

  // --- Site-wide header links (Phase T) — see the uk key's own note ---
  nav: {
    about: "About",
    forShelters: "For shelters",
  },

  // --- About page — see the uk key's own note ---
  about: {
    title: "About this project",
    intro:
      "Opika is a registry of shelter animals in the Kyiv region, built by one person, outside of a day job. There's no team, no investor — just someone who believes finding an animal a home shouldn't depend on whether a shelter knows how to run an outdated spreadsheet.",
    free: 'The registry is free for shelters today and will stay free. No paid tiers, no "free for the first three months." If that were ever to change, every shelter would know well in advance, not after the fact.',
    money:
      'Opika never touches money: no payment processing, no commission, no donations collected through the platform. The "Support the shelter" button links to the shelter\'s own page on another service (for example, monobank) — the registry only shows the link; the money goes directly, and you can see exactly where.',
    data: "Data a shelter enters — address, contact details, animal listings — belongs to the shelter. The exact address is never shown publicly: an adopter only ever sees an approximate location. A shelter can ask to have its listing removed at any time. For shelters with cabinet access, the registry keeps the administrator's name and email address (to send sign-in links), and a technical record of the browser and device used to sign in. IP addresses are not stored. Addresses typed into the sign-in form, and records of sign-ins that have lost force, are deleted within two days.",
    analytics:
      "The registry collects basic visit statistics — how many people visit and how fast the pages load — with no advertising.",
    /** Template: "Get in touch: {contact}" */
    contact: "Get in touch: {contact}",
  },

  /**
   * «Для притулків» (Phase T) — see the uk key's own note.
   *
   * ⚠ Pending in BOTH locales, deliberately. The Ukrainian is written first,
   * from `docs/prytulkam-argument.md`; the English is written from the
   * finished Ukrainian at H3's native-speaker pass, not the other way round.
   * Filling this side in first would make it the de-facto source and
   * reintroduce exactly the translated-from-English register D3 flagged.
   */
  forShelters: {
    title: "For shelters",
    /** Real copy in both locales — see the uk key's own note. */
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
    whatThisIs: `${COPY_PENDING} 1. What this is — one sentence.`,
    cost: `${COPY_PENDING} 2. What it costs — nothing, now and later.`,
    whatHappensToAnimals: `${COPY_PENDING} 3. What happens to their animals.`,
    whoContactsWhom: `${COPY_PENDING} 4. Who contacts whom.`,
    noObligation: `${COPY_PENDING} 4b. No lead queue, nothing to answer.`,
    money: `${COPY_PENDING} 5. Money — never touched.`,
    verification: `${COPY_PENDING} 6. What "verified" means.`,
    verificationOpenToVolunteers: `${COPY_PENDING} 6b. Open to unregistered volunteer groups.`,
    whatToPrepare: `${COPY_PENDING} 7. What to prepare.`,
    whyThatSentence: `${COPY_PENDING} 8. Why we ask for the freshness sentence.`,
    whenAnimalFindsHome: `${COPY_PENDING} 9. When an animal finds a home.`,
    howToLeave: `${COPY_PENDING} 9b. How to leave — write, and everything is removed, no conditions.`,
    whoIsBehindThis: `${COPY_PENDING} 10. Who is behind this.`,
    howToStart: `${COPY_PENDING} 11. How to start — write to {contact}.`,
  },
  kabinet: {
    /**
     * The history actor label when `KABINET_OPERATOR_DISPLAY_NAME` is unset
     * (RS-Q2): the English sense of the Ukrainian. Nominative, used only where the nominative fits.
     */
    operatorFallbackName: "Registry operator",
    shell: {
      label: "cabinet",
    },
    signIn: {
      pageTitle: "Sign in to the cabinet",
      title: "Sign in to the cabinet",
      intro:
        "For shelters and the registry operator. There is no password: a sign-in link arrives by email.",
      emailLabel: "Email address",
      send: "Send the link",
      addressNote:
        "The operator adds your address when inviting your shelter. If the address is not on the list no email arrives, and this page does not say so, so that it never reveals who is registered.",
      sendFailed: "The link could not be sent. Check your connection and try again.",
      sentTitle: "Check your email",
      sentBody:
        "If this address is on the list, a sign-in link will arrive at {email}. It works for 15 minutes and opens on any device.",
      spamNote: "No email? Check «Spam» and «Promotions». You can send it again after 60 seconds.",
      resend: "Send again",
      resendIn: "Send again · {time}",
      otherAddress: "A different address",
    },
    profile: {
      pageTitle: "Shelter profile",
      title: "Shelter profile",
      phoneTitle: "Profile",
      intro: "What people looking for an animal see about you on every card.",
      role: "shelter administrator",
      signOut: "Sign out",
      signOutFailed:
        "Sign-out didn't go through, so you are still signed in. Check the connection and try again.",
      contactsTitle: "Contacts",
      contactsNote:
        "A person sees these contacts when they tap «Write to the shelter», and writes to you themselves. Messages go directly, not through the registry.",
      donationTitle: "Fundraising",
      donationLink: "Fundraising link",
      donationNote:
        "https only. The registry never takes or passes on money: this is an external link.",
      donationPending: "The proposed link is waiting for me to check it.",
      voiceTitle: "The shelter's voice",
      voiceLabel: "Your words on the cards",
      voiceNote: "One sentence in the first person, written by you.",
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
    testShelterOnly: {
      animalForm: {
        dateUnchanged:
          "Editing the text doesn't change the «Updated» date. Your confirmation in the animal list does, and so does any photo change.",
        lastPhotoKeptNotShown: `${COPY_PENDING} "This card is published, so it keeps at least one photo." (instead of photos.lastPhotoKept while the shelter's cards are hidden)`,
      },
    },
    profileEdit: {
      actions: {
        save: "Save",
        cancel: "Discard changes",
        liveOnSave: {
          contacts:
            "People see the new contacts as soon as you save, when they tap «Write to the shelter».",
          voice:
            "The new sentence appears in the deck and on the animals' pages as soon as you save.",
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
        notAvailable: "Changes from the cabinet aren't available yet. Write to me to make one.",
        phoneFormat: "Enter the number with the country code, for example +380 67 123 45 67.",
        telegramFormat:
          "A Telegram username: 5–32 Latin letters, digits or underscores. The @ is optional.",
        viberFormat: "Enter the Viber number with the country code, for example +380 67 123 45 67.",
        emailFormat: "That doesn't look like an email address.",
        httpsOnly: "Only links that start with https://.",
        notAUrl: "That doesn't look like a link.",
        sentenceTooLong: "The sentence is longer than {max} characters.",
        unknownToken: "Only {імʼя} is filled in. Remove «{token}», or write it without braces.",
        dateTokenGone: "The date is already shown above your sentence, so {дата} isn't needed.",
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
        hint: "One sentence in the first person, in your own words. The registry fills in only the animal's name, where you write {імʼя}. Nothing else changes.",
        nameStaysHint:
          "The name goes in as it is: Rex, Murka. It isn't declined, so write the sentence so it reads naturally, for example «{імʼя} is still looking for a home».",
        insertName: "Insert {імʼя}",
        counter: "{count} / {max}",
        counterOver: "Characters over: {over}",
        emptyMeans: "Leave it empty and the cards show only “Updated … ago”.",
        previewLabel: "This is how it looks on the animal's page: {name}",
        previewNoAnimals:
          "The preview appears once you have an animal: it shows how the sentence will look on its page.",
        previewEmpty: "No sentence: the card shows only “Updated … ago”.",
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
        sizeHintRange: "{min}–{max} kg",
        sizeHintFrom: "from {min} kg",
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
        bucketRange: "{min}–{max}",
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
      health: {
        title: "Medical",
        confirm: "Done",
        unknownNote:
          "«Not recorded» is an honest answer. People looking for an animal will see «Not recorded», not «no».",
        registryReadOnly:
          "Confirmed by the state animal registry. This line can't be changed here.",
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
      },
      publish: {
        button: "Publish",
        missing: "To publish, this still needs: {list}.",
        gap: {
          size: "size",
          age: "age",
          description: "description",
          photo: "a photo",
        },
        done: "Published. People looking for an animal can see the card now.",
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
        birthDateFuture: "The birth date can't be in the future.",
        asOfFuture: "The «As of» date can't be in the future.",
        dateTooOld: "That date is too far back: more than {years} years ago.",
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
    /** The English sense of uk.ts's final Ukrainian (2026-10-14); both emails are signed `— {operator}`. */
    email: {
      signIn: {
        subject: `A sign-in link for the shelter's cabinet`,
        intro: `Hello. A sign-in link for the shelter's cabinet was requested for this address.`,
        action: `Open the sign-in page`,
        expiry: `The link works once and expires in {minutes} minutes.`,
        notYou: `If you didn't ask for this, just ignore the email: nothing happens without the link.\n— {operator}`,
      },
      invite: {
        subject: `Your access to the shelter's cabinet`,
        intro: `Hello. I am opening access to the cabinet of the shelter «{shelter}» in the registry for this address.`,
        what: `For now the cabinet shows the shelter's details: both what people see and the verification details. They can't be changed there yet: write to me for that.`,
        action: `Open the invitation`,
        expiry: `The invitation is valid for {hours} hours. If you miss it, I will send a new one.`,
        notYou: `If you weren't expecting this email, just ignore it: nobody gets access without signing in from this address.\n— {operator}`,
      },
    },
    signInCard: {
      notArrived: `If the email hasn't arrived in a few minutes, write to me at {contact}.`,
    },
    /** The invite landing (IN-Q11, KS-Q2 A); see the Ukrainian catalogue. */
    inviteLanding: {
      pageTitle: `Invitation to the cabinet`,
      title: `An invitation to administer «{shelter}»`,
      sent: `We've sent a sign-in link to {email}. It works once and expires in {minutes} minutes; signing in with it accepts the invitation.`,
      unusableTitle: `This invitation can't be used`,
      expired: `This invitation is no longer valid; ask the operator to send a new one.`,
      alreadyAccepted: `This invitation was already accepted; sign in as usual.`,
      rateLimited: `Too many links were requested for this invitation; try again later.`,
      signIn: `Go to sign-in`,
      ready: `The sign-in link will go to the address this invitation reached you at.`,
      send: `Send the link`,
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
  },
} as const;
