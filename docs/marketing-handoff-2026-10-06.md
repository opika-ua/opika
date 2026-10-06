# Marketing handoff — Opika, 2026-10-06

For a session running the **Marketing** plugin (`/competitive-brief`, `/campaign-plan`,
`/brand-review`, `/draft-content`). Read this whole file before invoking any skill. Context
that outranks anything a skill template assumes is in §2 and §3.

## 1. What Oleksii asked for (in this order)

1. **Competitive brief** — `/competitive-brief`. How Kyiv-oblast shelters and adopters find each
   other today, and where Opika's positioning is unclaimed.
2. **Brand voice guide + review of current copy** — write the guide first (there is none), then
   `/brand-review` the live strings against it.
3. **Overall brand improvement points** — Opika should read as a *register* (institutional,
   trustworthy, Diia-adjacent) yet be a recognisable brand. Concrete, prioritised recommendations:
   name, mark, voice, visual system, what to keep and what to change.
4. **Adopter launch campaign plan** — `/campaign-plan`. For public launch, which is months away
   and has no date. Plan structure and channels; do not invent a calendar with real dates.

**Output:** Markdown files in the repo at `D:\Startup\opika\docs\marketing\` (create the folder)
— `competitive-brief.md`, `brand-voice.md`, `brand-review.md`, `brand-improvements.md`,
`adopter-launch-plan.md` — plus a copy of each in the Claude project "Opika". Do not commit; the
dev session commits docs under its own loop. Date every file.

## 2. The product, in facts you may rely on

- **What:** a registry of adoptable dogs and cats from manually verified shelters in **Kyiv
  oblast**, Ukraine. Adopters browse a filterable gallery (primary) or a one-card-at-a-time deck
  (secondary), open an animal's page, and reveal the shelter's contact to write to them directly.
- **Who built it:** one person (Oleksii), evenings/weekends, ~10 h/week. No team, no budget, no
  marketing spend. Everything on the site is Ukrainian-language only.
- **Status:** built but not launched. `opika.org.ua` is live behind a pre-launch gate (403 without
  a secret), `noindex`, holding a labelled demo corpus of fictional shelters. **No real shelter
  has been contacted yet and none will be until the product is finished and rehearsed** — that is
  Oleksii's decision, don't argue it in the marketing docs.
- **Business model:** none at MVP. Free for shelters, free for adopters, no money passes through
  the platform, donations are external links to the shelter's own page. Phase 2 (far future) is
  rewarded-video ads *beside* listings, never affecting order.
- **Name:** "Opika" (Опіка — guardianship/care; same word as Polish *opieka*) is a **working name**.
  Domain `opika.org.ua`. A rename is possible; the brand-improvements doc may recommend one but
  must treat it as a cost (domain, every string, the mark) not a free move.
- **Design system:** bespoke, called «Реєстр», styled after Diia / Reserv+ (Ukrainian state apps),
  e-Ukraine typeface (CC BY 4.0, attributed in the footer), warm cream ground `#ECECEA`, ink
  `#101112`, a logo mark «Поріг · Межа» (arch + threshold + dot). Freshness is shown as three pips
  plus a day count in words, never red/amber. Full spec: `docs/design/README.md` in the repo.
- **Stack** (only if a doc needs it): Next.js, Postgres on Neon (Frankfurt), Vercel, Cloudflare R2.
  SEO-relevant: numbered pagination with indexable `?stor=N` URLs, per-animal pages with Open
  Graph metadata, city-slug URLs (`?misto=brovary`) landing now.

## 3. Hard constraints on every claim — read before writing a single sentence

The product's whole positioning is **literal honesty**: every sentence on the site must be
mechanically true of how the code behaves. There is a register of commitments the shelter page
(`/prytulkam`) makes, in `docs/standing-constraints.md` ("Commitments the «Для притулків» page
makes"). Marketing copy, taglines and campaign messaging must not contradict any of them:

1. Listing order depends on date (and card completeness in the deck) and nothing else. No
   "featured", no boost, no paid placement — ever in copy.
2. A shelter is never told that someone looked at a card. No "see who's interested" promises.
3. Free, and any change is announced to shelters in advance. Do not write "free forever"; write
   "free, with notice before anything changes."
4. Opika never contacts an adopter on a shelter's behalf and never speaks for a shelter. No
   "we connect you", no matching, no messaging features.
5. Opika never touches money.
6. The work on Opika's side is done by a named person. (This will change when self-serve shelter
   accounts ship; until then copy says "I", not "we" or "our team".)
7. The freshness date says only "when the information was last updated" — never "confirmed".
8. Both browsing modes show every animal; the deck only hides what *you* skipped.

Additional rules from `docs/standing-constraints.md` and the design spec:

- **The swipe is filtering, not judging.** Never "swipe left on", "nope", "match", "it's a
  match", stamps, streaks, scores, celebration, "find your perfect match". A right swipe is an
  inquiry; the shelter is not swiping back. Do not position Opika as "Tinder for pets" in any
  external copy, even if a journalist would.
- **No alarm.** Freshness is never urgent, never "last chance", never red. No urgency marketing
  ("adopt before it's too late").
- **No fabricated social proof.** There are zero real shelters and zero adoptions. Never write
  testimonials, numbers, "trusted by", logos, or "hundreds of animals". Campaign plans may
  *describe* where proof will come from once it exists.
- **Verification is manual and real.** "Перевірені притулки" means a human checked registration
  / bank account holder / references or did a site visit. Don't inflate it into "certified",
  "vetted partners", or anything implying an ongoing audit.
- **Privacy:** shelter exact addresses and foster carers' locations are never public; a fostered
  animal shows only a city. Don't write "see animals near you on a map".
- **Language:** Ukrainian, never Russian. English only for internal docs. Avoid Russian-origin
  calques that Ukrainian editors flag. Ukrainian copy that would go *on the site* is Oleksii's
  to write or approve — the brand docs may propose Ukrainian lines, clearly marked as proposals.
- **No real shelter data anywhere** in these docs; the repo is public. Fictional examples only.

## 4. Audiences

- **Shelters / volunteer initiatives in Kyiv oblast** — the supply side and the hard side.
  Registered NGOs, sole proprietors, and unregistered volunteer groups (one person with 40 dogs
  and a phone). They already post on Instagram, Facebook groups, Telegram channels, OLX. They are
  overworked, distrustful of platforms that promise and vanish, and allergic to admin work. Their
  question: "what do I get for the effort, and will you waste my time?"
- **Adopters** — people in Kyiv oblast (and Kyiv city) wanting a dog or cat, currently sifting
  OLX listings mixed with breeders, Telegram reposts with dead links, and Instagram stories that
  expire. Their question: "is this animal real, still available, and is this a real shelter?"
- Later (Phase 4, not now): adopters in Poland/EU for cross-border adoption.

## 5. Competitive research scope for `/competitive-brief`

Research live, don't rely on memory; note the research date. Cover at least:

- **Marketplaces where animals are actually listed:** OLX.ua (pets section — includes breeders
  and free-to-good-home), Facebook groups (Kyiv adoption groups), Telegram channels, Instagram.
- **Ukrainian adoption platforms/registries:** search for current ones — e.g. "Сіріус" shelter's
  own site, UAnimals, "Друг" / "Happy Paw" / "Hvost" / "Patron Pets" or whatever is currently
  live; municipal Kyiv shelter (Бородянка) pages; any state or municipal animal registry
  initiative (Diia-adjacent pet registration). Verify each is still alive.
- **International references** adopters may know: Petfinder, Adopt-a-Pet (US), Pets4Homes /
  RSPCA (UK), Polish *schroniska* aggregators (for the Phase 4 angle).
- **Dimensions that matter here** (replace the skill's B2B defaults): verification of listers,
  freshness/availability of listings, whether breeders/sellers are mixed in, whether the platform
  intermediates contact, whether it's free for shelters, Ukrainian-language quality, mobile
  experience on a cheap Android, shareability of a listing in Telegram.
- Skip pricing/packaging, analyst reports, job postings, G2/Capterra — irrelevant to this market.
- Positioning map axes suggestion: *verified ↔ anyone can post* vs *registry ↔ social feed*.

## 6. Brand voice — source material for the guide

There is no written voice guide. Derive it from the strongest existing copy, in this order:

1. `packages/i18n/src/messages/uk.ts` — every live string, keyed. `forShelters.*` (the letter to
   shelters, eleven sections) is the voice at its best. `errors.*`, `demo.*`, `freshness.*` show
   it under pressure.
2. `docs/prytulkam-argument.md` — the English argument the letter was written from.
3. `docs/copy-and-ia-critique.md`, `docs/design-critique.md` — prior critiques; don't repeat
   their findings as new.
4. `docs/design/README.md` — tone notes, the «Реєстр» rationale, string table.

Voice traits you'll find and should name: first person singular; plain, short declaratives;
describes mechanism rather than promising outcomes; never exclaims; respectful of the shelter's
time; no diminutives/cuteness ("пухнастики", "хвостики" — flag these as off-voice); state-app
register without bureaucratic coldness.

`/brand-review` then checks the live strings against the guide. Severity: a claim that is false
or unprovable is *critical*; cuteness/diminutives *major*; register drift *minor*.

## 7. What "brand improvement points" should answer

Prioritised, each with effort and what it costs (never "fast"): is "Opika" the right name and
why/why not; whether the mark and wordmark work at favicon, Telegram-avatar and OG-image sizes
(none of the latter exist yet — the OG image for shared links is a real gap); a one-line
descriptor to sit under the name; how to be *recognisable* without breaking the registry register
(colour ownership, the pips as a signature, typographic consistency); what the first
shelter-facing material should look like (a one-page PDF/leaflet for a volunteer); social
presence — which single channel to open first and what it must never do. Reference Diia's brand
discipline as the model, not consumer pet brands.

## 8. Adopter launch plan — constraints

No date, no budget, one person. Channels realistic for that: the shelters' own Instagram/Telegram
(each verified shelter is the distribution), Kyiv-oblast Telegram communities, organic search on
per-animal and per-city pages, one local-press/blogger angle. Define metrics the site can
actually measure (page views by city, contact reveals, reveals per animal, time-to-adoption
reported manually by shelters). Phase the plan by *shelter count* (1, 5, 15 shelters), not by
weeks. Note explicitly what is out: paid ads, influencer budgets, any adopter accounts or
notifications (they don't exist).

## 9. Repo paths (verify before trusting; the repo is on Oleksii's Windows machine)

```
D:\Startup\opika\
  docs\build-plan.md                 plan of record (long)
  docs\handoff-2026-10-04.md         current engineering handoff — the finish-line ledger
  docs\standing-constraints.md       the commitments register is here
  docs\design\README.md              design system
  docs\prytulkam-argument.md         the shelter letter's argument
  docs\copy-and-ia-critique.md       prior copy critique
  packages\i18n\src\messages\uk.ts   all live Ukrainian strings
  packages\i18n\src\messages\en.ts   English key-parity file (not shipped)
```

## 10. Not in scope for the marketing session

No code, no edits to `uk.ts`, no pushing to GitHub, no contacting any shelter or posting anywhere
publicly, no creating social accounts, no SEO audit (site is noindexed; run `/seo-audit` only
after launch), no email sequences (shelter outreach is a separate, later handoff).
