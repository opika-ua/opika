# Competitive brief — how Kyiv-oblast shelters and adopters find each other

**Date:** 2026-10-06 · **Research date:** 2026-10-06 (live web research, sources at the end)
**Scope:** `docs/marketing-handoff-2026-10-06.md` §5 · **Status:** internal, English, not for publication
**Constraint note:** every recommendation here was checked against the eight commitments in
`docs/standing-constraints.md` and handoff §3. Individual shelters are deliberately not named —
the repo is public and the brief is about channels and platforms, not about any shelter.

---

## 1. Executive summary

Adoption in Kyiv oblast today runs on **general-purpose channels that were never built for it** —
OLX classifieds (where free animals are the single largest "giveaway" category, ~40k listings in
OLX's own 2023 figures), Facebook groups, Telegram channels and Instagram — plus each large
shelter's own website. The organised alternatives are either **national catalogues with no
stated verification and no dates** (Happy Paw's catalogue and 231-organisation directory,
adopt.ua) or a **municipal service limited to the city and to its own app** (Kyiv Digital's
«Адопція тварин», live since April 2025).

**Biggest opportunity:** nobody in this market combines all four of *verified listers only*,
*a date on every listing*, *a stable web link per animal that pastes cleanly into Telegram*, and
*oblast-wide coverage outside the city*. Each competitor has at most two of these. Opika is
built around all four, and its honesty positioning ("every sentence is mechanically true") has
no counterpart anywhere — every competitor communicates in the register of appeal, not mechanism.

**Biggest threat:** **Kyiv Digital.** It is free, municipal, already uses the state-app visual
register Opika borrows, has a retail partner giving adopters a welcome box, and reported 350+
adoption requests. An adopter who sees Opika's Diia-adjacent design may *assume* it is the city's
service — or a copy of it. That is both a confusion risk and, if mishandled, a credibility risk.
Second threat, for Phase 4: **TailHarbor**, a one-person EU aggregator launched in 2026 that
already lists Kyiv-oblast shelters in 16 languages with auto-translation.

---

## 2. The landscape at a glance

### Positioning map — *verified ↔ anyone can post* × *registry ↔ social feed*

```
                         VERIFIED LISTERS ONLY
                                  ▲
        Shelter's own site ●      │      ● Petfinder (US, approved orgs)
                                  │      ● TailHarbor (EU, "verified welfare orgs")
                                  │   ◎ OPIKA (manual, named-person verification)
        Instagram (shelter's  ●   │      ● Kyiv Digital (curated, criteria undisclosed)
        own account)              │      ● Wrocław city catalogue (PL reference)
                                  │
  SOCIAL FEED ◄───────────────────┼───────────────────► REGISTRY
                                  │      ● Happy Paw catalogue (criteria not stated)
                                  │      ● GladPet (Odesa-centred)
      Telegram channels ●         │      ● adopt.ua (self-post, free, no checks stated)
      Facebook groups ●           │      ● Pets4Homes (UK, breeders mixed, ad vetting)
                                  │      ● OLX «Віддам безкоштовно» / «Тварини»
                                  ▼
                          ANYONE CAN POST
```

The **top-right quadrant is empty in Ukraine outside the city of Kyiv.** Kyiv Digital sits there
for the city but is app-only and does not publish its verification criteria. The international
occupants (Petfinder, TailHarbor) prove the quadrant works; neither serves a Ukrainian adopter
in Ukrainian with oblast-level detail.

### Dimension matrix

✓ = yes · ✗ = no · ~ = partial · ? = not verifiable from public pages (not guessed)

| | Lister verification | Date / freshness shown | Breeders & sellers mixed in | Platform intermediates contact | Free for shelters | Ukrainian quality | Cheap-Android experience | Telegram-shareable per-animal link |
|---|---|---|---|---|---|---|---|---|
| **OLX.ua** | ✗ (any account) | ~ (post date; bumps reset it) | ✓ heavily | ✗ (OLX chat, direct) | ~ (free in giveaway; paid promotion exists) | ✓ (UA/RU toggle) | ~ heavy, ad-dense | ✓ but links die when the ad expires |
| **Facebook groups** | ✗ | ~ (post time, buried by feed) | ✓ | ✗ | ✓ | varies by poster; RU common | ~ | ~ (FB login walls; previews unreliable) |
| **Telegram channels** | ✗ | ~ (message time) | ✓ | ✗ | ✓ | varies; reposts of reposts | ✓ light | ✓ native — but reposts carry stale info and dead links |
| **Instagram (shelter accounts)** | ~ (it's the shelter itself) | ✗ for stories (24h); posts undated in grid | ✗ | ✗ | ✓ | varies | ~ | ✗ poor (no useful preview, login walls) |
| **Shelter's own site** | ✓ (single source) | ✗ typically | ✗ | ✗ / application form | n/a | ✓ | varies widely | ✓ when per-animal pages exist |
| **Happy Paw** (catalogue + 231-org directory) | ? (no criteria published) | ✗ | ✗ | ? | ✓ (charity) | ✓ + EN | ? | ? |
| **adopt.ua** | ✗ ("self-post, free") | ? | ✗ (homeless animals) | ? | ✓ | ✓ | ? | ? |
| **GladPet** | ? | ✗ | ✗ | ✗ (contact the curator) | ✓ | ✓ | ? | ? — Odesa-centred |
| **Kyiv Digital «Адопція тварин»** | ~ (city shelters + "all willing shelters and guardians"; criteria undisclosed) | ✗ (not described) | ✗ | **✓** — "Propose a home", shelter replies within 3–5 days | ✓ | ✓ state-app quality | app install required; no web access described | ~ (in-app "share"; no public web page per animal found) |
| **TailHarbor** (EU) | ✓ claimed ("rescue shelters and verified welfare organisations only") | **✓** ("not confirmed since <date>") | ✗ (breeders excluded) | ✗ (visit shelter site) | ✓ | ✗ (auto-translated; UA names transliterated) | ? | ✓ web |
| **Petfinder** (US ref.) | ✓ (approval, ongoing monitoring) | ~ (members must keep listings current; 90-day inactivity rule) | ✗ (breeders excluded) | ✗ | ✓ | n/a | ✓ | ✓ |
| **Pets4Homes** (UK ref.) | ~ (ad vetting; breeders allowed) | ? | ✓ | ✗ | ? | n/a | ✓ | ✓ |
| **Opika (as built)** | ✓ manual, named person (registration / account holder / references / site visit) | ✓ every card, in words, «коли інформацію востаннє оновлювали» | ✗ — shelters only | ✗ — reveal contact, adopter writes directly | ✓ with notice before change | ✓ UA-only, edited | ~ design target; not yet measured on a low-end device | ✓ `?stor=N`, per-animal OG metadata, city slugs |

The **date** column is the most telling. Only TailHarbor shows one, and it shows a
*confirmation* date — exactly the claim Opika's commitment #7 forbids itself from making
because its data model doesn't record a confirmation. Opika's date says less and means it.

---

## 3. Competitor profiles

### 3.1 OLX.ua — the default marketplace

- **What it is:** Ukraine's general classifieds. Animals sit in «Тварини» (sale) and in
  «Віддам безкоштовно» (giveaways), searchable by town.
- **Scale signal:** OLX reported ~40,000 free cat/dog listings and ~50,000 responses, making
  animals the most popular giveaway category (published Nov 2023).
- **Messaging:** none adoption-specific — it's a utility. Tone is the poster's.
- **Strengths:** everyone already has the app; huge reach in small towns of the oblast; zero
  friction to post; search by locality.
- **Weaknesses:** breeders, resellers, "free puppy, pay for delivery" schemes and genuine shelter
  animals in one feed; no verification of the lister; listings expire or are deleted, so shared
  links die; promotion is paid, so visibility is purchasable. Prosecuted cases of selling
  non-existent puppies online show the adopter's "is this animal real?" anxiety is grounded.
- **Narrative:** no villain, no hero — inventory.
- **What it means for Opika:** OLX is where adopters *start*. Opika does not need to beat it on
  reach; it needs to be the place an adopter goes when OLX has made them suspicious.

### 3.2 Facebook groups, Telegram channels, Instagram — the volunteer's own channels

*(Facebook could not be fetched for live inspection; this section reflects handoff §4 and the
structure of the platforms, not a measured audit.)*

- **What they are:** where shelters and individual volunteers actually post today. Instagram for
  the shelter's own identity (stories, reels), Facebook groups for reach among older adopters,
  Telegram channels for reposting across Kyiv-oblast communities.
- **Strengths:** shelters own them, already know them, and they cost nothing. Emotional
  storytelling (rescue stories, before/after) performs well. Telegram is the most native sharing
  channel in Ukraine.
- **Weaknesses:** a feed is ordered by recency and engagement, so an animal waiting eight months
  sinks; stories vanish in 24 h; reposts propagate stale information with no way to mark an
  animal as adopted; no structured filters (size, age, city); no verification beyond the
  poster's reputation; Russian-language reposts are common.
- **What it means for Opika:** **these are not competitors to displace — they are the
  distribution.** A verified shelter posting an Opika link into its own Telegram is the growth
  loop (`docs/stack-decision.md`). The pitch to a shelter must be "keep posting where you post;
  this gives each animal a page that doesn't expire," never "move here instead."

### 3.3 Shelter's own website (large oblast shelters)

- **What it is:** the bigger shelters (one oblast shelter reports 3,000+ animals) run their own
  sites with per-animal profiles, donation flows and events.
- **Strengths:** single source of truth; verified by definition; often active (recent news,
  regular adoption days).
- **Weaknesses:** adopters must already know the shelter exists; every site has its own UX and
  filters; no cross-shelter search; small volunteer groups (the "one person, 40 dogs, a phone"
  segment) have no site at all.
- **What it means for Opika:** large shelters gain least from Opika and are the least likely
  early adopters. **Small and mid-sized groups without a site are the segment Opika serves best.**

### 3.4 Happy Paw (charitable foundation) — national catalogue + directory

- **What it is:** a national charity whose site includes an animal catalogue spanning many cities
  and a directory of **231 organisations** filterable by region, Kyiv and Kyiv oblast included.
  Its listings also appear on TailHarbor.
- **Messaging:** charity-first — critically ill animals, one-off help, remote guardianship,
  bioethics education. Adoption is one service among many.
- **Strengths:** national recognition, long track record, brand partnerships (EVA, Purina-era
  initiatives), bilingual UA/EN.
- **Weaknesses:** no published inclusion or verification criteria; no listing dates; adoption is
  not the primary job of the brand; directory points to organisations, not available animals.
- **What it means for Opika:** a respected neighbour, not a rival. Opika's narrower promise
  (oblast, verified, dated) is a different product. Do not position against it.

### 3.5 adopt.ua — "База безпритульних тварин України"

- **What it is:** a national free database where volunteers and shelters post on their own.
- **Strengths:** free, self-serve, Ukraine-wide, explicitly for homeless animals (no breeders).
- **Weaknesses:** no verification described; no visible dates; liveness uncertain from public
  pages (copyright year current, "we update regularly", no dated listings seen).
- **What it means for Opika:** proof that "free + self-post" without verification or dates
  doesn't solve the adopter's trust question — the gap Opika is built for.

### 3.6 GladPet — Odesa reference

- **What it is:** Odesa-centred adoption portal; reports 14,343 animals placed; adopter contacts
  the animal's curator.
- **Relevance:** proof that a regional, web-first portal can become *the* local default. Not
  present in Kyiv oblast. A model for "own one region properly".

### 3.7 Kyiv Digital «Адопція тварин» — the municipal service (**primary threat**)

- **What it is:** a service inside the city's «Київ Цифровий» app, launched 10 April 2025. Animal
  profiles (photo, breed, size, birth date, location, guardian contact) from city shelters, open
  to "all willing shelters and guardians". Adopter taps «Запропонувати дім»; the shelter reviews
  and contacts them, reported as within 3–5 days. Favourites and social sharing in-app.
- **Scale signals:** ~100 profiles at launch (32 cats, 68 dogs); "more than 350 adoption
  requests" reported later; city figure of 7,000+ animals in Kyiv and oblast shelters.
- **Incentive:** MasterZoo partnership — adopters through the app get a welcome box and a promo
  code.
- **Messaging:** civic-service register; war-displaced animals; "in a few clicks".
- **Strengths:** municipal legitimacy; free; already installed by many Kyivans; state-app polish;
  a retail partner; offline adoption days run by the city.
- **Weaknesses (for an adopter in the oblast):** app-only — no indexable public web page per
  animal was found, so it doesn't feed Google or link previews in Telegram; city-centred; the
  application flow puts the platform between adopter and shelter with a multi-day wait;
  verification criteria not published; no freshness date described.
- **Narrative:** villain = homelessness and war displacement; hero = the city + the resident.
- **What it means for Opika:**
  1. **Confusion risk.** Opika's «Реєстр» design is deliberately Diia-adjacent. Side by side with
     a real municipal service, an adopter may assume Opika *is* the state, or is imitating it.
     Opika must say plainly what it is (one person's independent project, not a state or city
     service). This is both an honesty commitment and the defence against the "imitation" read.
  2. **Complement, not rival.** Different geography (oblast towns: Brovary, Irpin, Bucha, Bila
     Tserkva…), different mechanism (direct contact, no application queue), different surface
     (web, linkable). A shelter can be in both, and copy should say nothing against the city's
     service.
  3. **Do not compete on incentives.** A welcome box is something Opika cannot and must not
     match (commitment #5: never touches money; no partner incentives at MVP).

### 3.8 TinPet — Kyiv city Telegram bot (2023)

- City-run Telegram bot launched in test mode in August 2023 for listing and finding animals, open
  to other shelters. **Current status not verified** — no 2025–26 coverage found; it appears to
  have been superseded by Kyiv Digital. Worth one manual check before launch; if it's dead, it's
  evidence that the market has seen platforms "promise and vanish" — the exact distrust handoff
  §4 names.

### 3.9 State pet registry (ЄДРДТ) — not a competitor, a future integration

- The Unified State Register of Domestic Animals (launched 2023, experimental registration
  project approved July 2026; Diia vet passport promised once 100k records exist) is about
  identification and vaccination. **It has no adoption catalogue** and none is announced. It
  plans to let municipal facilities register stray animals.
- **Meaning:** no state competitor in adoption discovery is on the horizon; the registry is the
  Phase 3 integration target, not a threat. It also confirms the Diia visual register will keep
  spreading into pet-related services — which raises the confusion risk in 3.7.

### 3.10 TailHarbor (EU) — Phase 4 reference and watch item

- **What it is:** a non-profit EU aggregator, one person, building since 2026, claiming 3,900+
  partner shelters in 40 countries, rescue organisations only, breeders excluded, auto-translated
  into 16 languages, shelters list free, adopter contacts shelter directly. Already lists
  Ukrainian shelters, including Kyiv-oblast ones and Happy Paw's per-city catalogues.
- **Notable mechanic:** each animal shows "not confirmed since <date>" — a freshness signal close
  to Opika's.
- **Weaknesses for a Ukrainian adopter:** UI not in Ukrainian; animal text machine-translated;
  shelters' Ukrainian identity flattened into a pan-European list; claims (3,900 partners,
  "verified") are self-reported.
- **Meaning:** for Phase 4 (cross-border to Poland/EU), TailHarbor already occupies the
  aggregator slot. Opika's eventual angle there is *depth over breadth* — verified, Ukrainian-
  edited, one region known well — or a feed partnership, not a head-on rival.

### 3.11 International references adopters may know

- **Petfinder (US):** approved shelters/rescues only, breeders explicitly excluded, free for
  members, members must keep listings current and remove adopted pets; inactive accounts
  deactivated after 90 days. The closest structural analogue to Opika and a useful sentence for
  journalists ("a regional, Ukrainian-language counterpart to how Petfinder works") — but only
  in conversation, never as a claim of affiliation.
- **Pets4Homes (UK):** mixes breeders and rehoming with ad vetting — the model Opika rejects.
- **RSPCA (UK):** charity running its own centres' listings — analogue to a large shelter site.
- **Poland:** municipal catalogues (e.g. Wrocław's city portal aggregating ~13 local
  organisations, with age/size/status filters — no listing dates) and app-style aggregators like
  Petopo (2022 coverage; current status not verified). For Phase 4 the municipal model is the
  likelier partner.

---

## 4. Messaging comparison

| | Opika | OLX | Happy Paw | Kyiv Digital | TailHarbor |
|---|---|---|---|---|---|
| Primary line | none public yet (pre-launch) | utility, no adoption line | charity mission | "Адопція тварин" in a city app | "A safe harbor for all creatures" / "Adopt, don't shop" |
| Target | adopters in Kyiv oblast; small shelters | everyone | donors + adopters | Kyiv residents | EU adopters |
| Differentiator claimed | verified shelters, dated listings, direct contact, nothing paid | reach | trust, scale of help | municipal, free, welcome box | breadth, translation |
| Tone | plain declaratives, first person singular, mechanism over promise | none | warm, appeal-led | civic, upbeat | warm, slogan-led |
| Proof | mechanism itself (dates, named verifier) — **no numbers yet, and none may be invented** | volume | track record, reports | city data, request counts | partner counts (self-reported) |

**Pattern:** every competitor speaks in the register of *appeal* (save a life, adopt don't shop,
in a few clicks). Nobody speaks in the register of *mechanism* ("this date means X; this badge
means a person checked Y; the order depends on Z and nothing else"). That register is Opika's
to own, and it is also the hardest to copy because it must stay true of the code.

### Narrative analysis

- **Villain** competitors use: homelessness, war, cruelty. Opika's villain is narrower and
  unclaimed: **uncertainty** — the dead link, the expired story, the listing that might be a
  breeder or a scam, the animal that was adopted three weeks ago.
- **Hero:** competitors cast the adopter as rescuer. Opika casts nobody — it describes a tool.
  Keep it that way; it's what makes the register credible.
- **Stakes:** competitors use urgency. Opika's commitments forbid it (no alarm, no "last
  chance"). That's a constraint and a differentiator at once.

---

## 5. Content and channel gaps

| Theme / format | OLX | Social channels | Happy Paw | Kyiv Digital | Opika opportunity |
|---|---|---|---|---|---|
| How to tell a real shelter listing from a seller or scam | ✗ | ~ (ad hoc warnings) | ? | ✗ | **Open** — a plain explainer that describes what Opika's "перевірений" means and what it doesn't |
| What a listing date means | ✗ | ✗ | ✗ | ✗ | **Open** — already the design's core idea |
| Per-city animal pages indexable in Google | ✗ (expiring ads) | ✗ | ? | ✗ (app) | **Open** — `?misto=` slugs |
| Link previews that work in Telegram | ~ | n/a | ? | ✗ | **Open** — needs the OG image (see brand-improvements) |
| Emotional rescue stories | ✗ | ✓✓ | ✓ | ~ | Leave to shelters — Opika links to their stories, doesn't compete |
| Offline adoption days | ✗ | ~ | ✓ | ✓ (city) | Not Opika's job at MVP |
| Guidance for small volunteer groups on listing an animal well | ✗ | ✗ | ✗ | ✗ | **Open** — the one-page leaflet in brand-improvements |

---

## 6. Opportunities

1. **Own the "verified + dated + linkable" quadrant for the oblast outside the city.** No one is
   there. The towns around Kyiv are underserved by the city app and over-served by OLX noise.
2. **Own the mechanism register.** Plain description of how the thing works is unclaimed and
   matches the design system. It also answers the shelter's real question ("will you waste my
   time?") better than any promise could.
3. **Be the page shelters link *to* from where they already post.** Instagram stories expire and
   Telegram reposts go stale; a stable per-animal page with a working preview fixes a problem
   volunteers already feel, without asking them to change habits.
4. **Serve the "no website" segment.** Unregistered volunteer groups have no site and no place in
   the city app; manual onboarding by a named person ("ви розкажете, а я внесу все сам") is the
   lowest-effort path any platform offers them.
5. **Explain trust signals the market lacks.** A short, factual explainer on what verification
   covers, what the date measures, and why there's no paid placement is content no competitor
   publishes — and it's honest by construction.

## 7. Threats

1. **Being mistaken for the state, or for a copy of it.** Highest severity. The Diia-adjacent
   look plus a municipal service with the same function creates a real chance of confusion.
   Mitigation is copy and identity, not code: say who runs it.
2. **Kyiv Digital extends to the oblast or to the web.** Plausible — it's "open to all willing
   shelters and guardians" already. If it does, Opika's geographic gap narrows; its remaining
   differences are direct contact, dates, verification transparency and linkability. Those must
   be the *stated* differences now so they don't have to be invented later.
3. **Platform fatigue among shelters.** TinPet's apparent quiet disappearance is the kind of
   history that makes volunteers distrust a new platform. Opika's answer is already in its
   commitments (named person, notice before change); the launch must not over-promise around it.
4. **TailHarbor already lists the oblast's shelters for EU audiences.** Not a launch threat; a
   Phase 4 reality to plan around.
5. **Low supply at launch makes any registry look empty.** Every competitor with volume looks
   more alive. Mitigation is honest framing ("a few verified shelters, one oblast"), never
   inflated counts.

## 8. Recommended actions

These are pre-launch, so "quick wins" means work that can happen before the first shelter
conversation, not "this week". Effort is stated in Oleksii-hours, never as "fast".

**Near-term (before first shelter contact)**

1. **Add a one-line non-affiliation statement** in the footer/about area — proposal, for
   Oleksii to word in Ukrainian: *"Незалежний проєкт однієї людини. Не є державним чи міським
   сервісом."* Cost: ~1 h incl. key + test. Satisfies commitment #6 and neutralises threat 1.
2. **Ship the Open Graph image** so a pasted animal link previews properly in Telegram — this is
   the single mechanism that turns shelters' existing channels into Opika's distribution.
   Cost: see brand-improvements (design + implementation, est. 4–8 h).
3. **Write the shelter-facing "why this, if I already post on Instagram" answer** as
   *complement* language: your channels keep working; each animal gets a page that doesn't
   expire and says when it was last updated. Feeds the leaflet in brand-improvements.
4. **Check TinPet's status manually** (open the bot). 10 min. If dead, never mention it publicly;
   just know the shelter-side history.

**Strategic**

5. **Position for the oblast's towns, not "Kyiv".** City-slug pages (`?misto=brovary`, etc.)
   and town-level Telegram communities are where Opika has no organised competitor.
6. **Treat Kyiv Digital as a neighbour in all external copy.** Never compare against it publicly.
   If asked by a journalist: different area, direct contact, web links; shelters can use both.
7. **Phase 4: decide feed-partner vs separate presence with TailHarbor** when cross-border work
   starts — not before.
8. **Competitive monitoring:** quarterly re-check of Kyiv Digital (geography, web access,
   verification), TailHarbor (Ukrainian coverage), Happy Paw (dates/verification added?), and
   OLX (any shelter-verification badge). One hour per quarter.

---

## 9. What this brief does not claim

- No user counts, traffic or adoption numbers for Opika — there are none yet.
- Facebook group and Instagram observations are structural, not measured.
- "?" cells are unknown, not "no".
- Competitor figures (350+ requests, 3,900 partners, 14,343 placements, 231 orgs, ~40k OLX
  listings) are the competitors' own or press-reported numbers, as dated below.

## Sources (accessed 2026-10-06)

- [OLX: що українці віддають безкоштовно (The Page, Nov 2023)](https://thepage.ua/ua/news/sho-ukrayinci-na-olx-viddayut-bezkoshtovno-chi-na-obmin)
- [Продавав в інтернеті неіснуючих породистих цуценят (Objectiv, Jul 2023)](https://www.objectiv.tv/uk/objectively/2023/07/06/harkiv-yanin-prodavav-v-interneti-neisnuyuchih-porodistih-tsutsenyat/)
- [Взяти тварину з притулку тепер можна через «Київ Цифровий» (The Village)](https://www.village.com.ua/village/city/city-news/361665-vzyati-tvarinu-z-pritulku-teper-mozhna-cherez-laquo-kiyiv-tsifroviy-raquo)
- [Київ Цифровий: сервіс «Адопція тварин» (Суспільне Київ)](https://suspilne.media/kyiv/991657-zastosunok-kiiv-cifrovij-popovnivsa-novim-servisom-adopcia-tvarin/)
- [Як взяти тварину через Київ Цифровий — інструкція (УП Життя)](https://life.pravda.com.ua/society/yak-uzyati-v-rodinu-tvarinu-cherez-kijiv-cifroviy-instrukciya-307442/)
- [Бонус для тих, хто бере тварину з притулку (Informator)](https://kiev.informator.ua/uk/u-kiyevi-cifrovomu-z-yavivsya-bonus-dlya-tih-hto-bere-tvarinu-z-pritulku)
- [У Києві запустили чат-бот для прилаштування тварин (Espreso, Aug 2023)](https://espreso.tv/u-kievi-zapustili-chat-bot-dlya-prilashtuvannya-tvarin-yak-skoristatisya)
- [Притулки у Києві та області, з яких можна взяти тварин (Наш Київ, Aug 2026)](https://nashkiev.ua/life/pritulki-u-kievi-ta-oblasti-z-yakih-mozhna-vzyati-tvarin)
- [Happy Paw](https://happypaw.ua/) · [Happy Paw — притулки і волонтери](https://happypaw.ua/ua/zoo-organization)
- [adopt.ua](https://www.adopt.ua/pages/volunteer)
- [GladPet](https://gladpet.org/pets/dogs) · [8 українських ініціатив (NV, 2017)](https://nv.ua/ukr/ukraine/events/shukaju-sobaku-hochu-kota-8-ukrajinskih-initsiativ-jaki-dopomozhut-obraty-domashniogo-ulublencya-2284598.html)
- [PetLink](https://petlink.com.ua/shelters/)
- [Уряд запускає експериментальний проєкт реєстрації тварин (LB.ua, Jul 2026)](https://lb.ua/society/2026/07/02/749070_uryad_zapuskaie_eksperimentalniy.html) · [ЄДРДТ — питання та відповіді](https://vet.pet.gov.ua/pytannia-ta-vidpovidi/)
- [TailHarbor — about](https://tailharbor.eu/about) · [TailHarbor — Happy Paw Kyiv](https://tailharbor.eu/shelters/happypaw-kyiv?page=2)
- [Petfinder member terms](https://member-cms.petfinder.com/tos)
- [Pets4Homes — safeguarding welfare online](https://www.pets4homes.co.uk/pet-advice/how-you-can-help-to-safeguard-animal-welfare-when-finding-a-dog-online.html)
- [Wrocław — zwierzęta do adopcji](https://www.wroclaw.pl/adopcja-zwierzat/zwierzeta-do-adopcji) · [Petopo (Tabletowo, 2022)](https://www.tabletowo.pl/?p=692742)
