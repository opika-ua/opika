# Designer round 1: plan (for review)

Status: **answered, and being built slice by slice (2026-10-20).** Oleksii answered the open
questions (§8); his answers are in §10 and his copy for the slices in §11, both verbatim, and §11
is the only source for those strings. Each slice is its own PR: S1 (#162) and S2 (#163) are merged,
S3 (#165) is in review. The rest of this document is the plan as reviewed, not a record of what was
built; each slice's PR is that record.

## The scope, as it reached this session

Relayed in the scheduled task that wrote this plan as Oleksii's words of 2026-10-20, verbatim:
"Designer round 1: go now, in the cloud. Contract-first: first a plan doc docs/designer-round-1.md
(the shelter page with «Слова притулку» only there, the preview drawer, no shelter name on the card
preview, likes in localStorage plus a liked page, the long/short fur filter; “viewed” is NOT in
scope) as a draft PR for my review. Then build in slices, one PR per slice."

Five items:

1. a public **shelter page**, the only place «Слова притулку» appears (§1);
2. a **preview drawer** over the gallery (§2);
3. **no shelter name on the card preview** (§3);
4. **saved animals in localStorage** («Зберегти»; his DR1-Q3 renamed the scope's "likes"), plus a page that lists them, «Збережені тварини» (§4);
5. a **long/short fur filter** (§5).

**Out of scope: "viewed".** No "viewed" marker, no seen-history on cards, no "you looked at this"
state of any kind is planned or built here. Nothing in this plan stores or shows which animals a
person opened.

## Where the spec comes from

No designer round-1 handoff file is in the repo (searched `docs/` and the three `*.dc.html` mocks
for the shelter page, a drawer, likes, fur, and "viewed"). **None of the five items has a mock
frame.** What exists:

- `docs/design/README.md`'s "The shelter's sentence" (the «Слова притулку» attribution, VH-Q2),
  "The gallery card" (the shelter line), "Detail (04)", "Contact reveal (05)" (the modal pattern
  this plan reuses for the drawer), "06 My reveals" (a device-only list, the nearest precedent
  for the saved page) and "Deliberately absent" (no attention counters).
- `Opika Registry Frames.dc.html`, the D1 caption: «Смужка джерела … #63676B — слова притулку»,
  the source legend on «Медичний стан» rows.

So the scope sentence above is the specification, and everything finer is **proposed here**. Per
the working mode (WM-B1), a reversible point with no mock is decided and listed under
"Decisions taken" (§9); only irreversible, security, public-claim and brand-voice points are
asked (§8). **The designer's own frames, when they arrive, decide structure and content (which
fields, which states, which copy) and replace anything proposed here that they contradict.**

Ground rules carried into every slice: test logic, not looks (CLAUDE.md); theme tokens only, no
one-off styles; every new Ukrainian string ships as `[COPY PENDING]` with its English sense listed
here, and **no Ukrainian in this plan is new copy**: every Ukrainian string quoted is already live
in `packages/i18n/src/messages/uk.ts` or in a mock.

---

## 1. The shelter page, with «Слова притулку» only there

**What it is.** A public page per verified shelter: its name, city, the shelter's own words, its
donation link, and its animals (date-ordered, like the gallery). «Слова притулку», the attribution
that today sits under the shelter's sentence on the animal page, appears **only on this page**.
Source: the scope sentence; no mock frame (proposed here).

### What exists today

- **No public shelter page.** `shelters.byId` exists (`packages/contracts/src/procedures/shelters.ts`,
  handler `apps/web/src/api/handlers/shelters.ts`) and is read only by the animal page
  (`apps/web/src/app/tvaryny/[animalId]/page.tsx:55`) for the shelter row and the donation link.
  It answers `NOT_FOUND` for an unverified shelter, same as a missing one.
- `PublicShelterViewSchema` (`packages/contracts/src/views/shelter.ts`): `pick` of `id`,
  `displayName`, `description`, `donation`, `createdAt`, plus `publicLocation` (city only) and
  `verification`. It does **not** carry `freshnessSentence`; `ShelterSummaryViewSchema` (on every
  card) does.
- **Where «Слова притулку» renders today** (`uk.freshness.attribution` and `uk.medical.shelterDeclared`
  both read «Слова притулку»):
  - the animal page's freshness block, under the shelter's sentence
    (`apps/web/src/features/animal-detail/ShelterFreshnessBlock.tsx`, used by
    `AnimalDetailScreen.tsx:239` and by K4's voice preview, N11);
  - the animal page's «Медичний стан» rows, as the source label for a shelter-declared fact
    (`apps/web/src/features/animal-detail/medical-labels.ts`);
  - the deck card shows the shelter's sentence **without** the attribution
    (`apps/web/src/features/discovery/SwipeCard.tsx`, `FreshnessBlock`).
- **Public claims that name where the sentence appears:** `/prytulkam` §8 (`forShelters.whyThatSentence`,
  commitment 7's B1, his PR 6 text) says «…а на сторінці тварини — ваше речення про те, як часто ви
  це робите, вашими словами.» K4's voice preview label (`voice.previewLabel`) reads «Так це виглядає
  на сторінці тварини».

### What changes

- New route `apps/web/src/app/prytulky/[shelterId]/page.tsx`, feature folder
  `apps/web/src/features/shelters/`. Server-rendered; works without JS (the gallery's own pattern).
  Metadata follows the existing `SITE_IS_PUBLICLY_DISCOVERABLE` gate.
- Content, top to bottom: name; city (city only, `PublicCityLocationView`); the «Слова притулку»
  section; the donation link with its domain visible before the tap (product rule, commitment 5);
  the shelter's discoverable animals as gallery cards, with the gallery's two sorts and its
  numbered pagination.
- What goes in the «Слова притулку» section, and what leaves the animal page and the deck, is
  **DR1-Q1** (§8): it moves a sentence a live `/prytulkam` commitment says is on the animal page.
- The animal page's shelter row becomes a link to the shelter page. The donation link **stays on
  the animal page** too: `forShelters.money` says «на сторінці тварини буде посилання на неї».
- A shelter with no description and no sentence: the «Слова притулку» section is omitted entirely
  (never an empty heading, never a placeholder), the same rule as VH-Q2: the attribution never
  stands over words the shelter didn't write.

### Contract (proposal)

- `PublicShelterViewSchema`: **add `freshnessSentence` to the `pick`** (a deliberate widening by
  one field that is already public on every card through `ShelterSummaryView`). Only if DR1-Q1
  puts the sentence on this page.
- `GalleryListInputSchema` gains a scope, a discriminated union, defaulting to today's behaviour:

  ```
  GalleryScope =
    | { kind: "everyone" }
    | { kind: "shelter"; shelterId: ShelterId }
  GalleryListInput = { filters, sort, page, pageSize, scope: GalleryScope = { kind: "everyone" } }
  ```

  The repository adds `animals.shelter_id = $1` to the same discoverable predicate
  (`packages/db/src/repos/feed-predicate.ts`); a scope naming an unverified or unknown shelter
  returns an empty page (the page itself has already answered 404 through `shelters.byId`, so
  nothing new leaks). It stays `gallery.list`, so it stays inside the one named `OFFSET` exception
  (standing constraints, decision 17) rather than adding a second paginated procedure.
  `totalShelters` is 1 or 0 in that scope; nothing renders it there.
- `gallery.relaxationCounts` is unchanged: the shelter page has no filter rail in round 1
  (decision DR1-D3).
- If DR1-Q1 takes the sentence off the animal page and the deck, **`freshnessSentence` leaves
  `ShelterSummaryViewSchema`'s `pick`** in the same slice, so cards stop shipping a field nothing
  renders (deny by default).
- **DB: none.** `animals.shelter_id` exists; the slice checks there is an index usable for
  `shelter_id` + the discoverable predicate, and records the `EXPLAIN` on the local database.

### Privacy and public claims

- City only, like every pre-reveal view: the new output joins the walk in
  `packages/contracts/src/pre-reveal-location.test.ts`, which already holds every adopter-facing
  output to "no coordinates, no district".
- **Commitment 1** (ordering is date, plus completeness in the deck, «Це все, що впливає на
  порядок.»): the shelter page uses the gallery's two date sorts and nothing else. No "featured",
  no pinning, no shelter-chosen order.
- **Commitment 2** (a shelter is never told someone looked): the page shows inventory only. No
  view count, no saved count, no "N people asked". A shelter reading its own public page learns
  nothing about adopters.
- **Commitment 7** (the freshness date and the sentence say only what they measure): DR1-Q1.
- **Commitment 5** (money): the donation link stays an external link with its domain shown,
  on both pages.

### Copy (all `[COPY PENDING]`; English sense only)

| Key | English sense |
|---|---|
| `shelterPage.title` | page title: the shelter's name (template, no new words if he agrees the name alone is the title) |
| `shelterPage.wordsHeading` | the «Слова притулку» section heading. **Proposed: reuse the existing «Слова притулку» string** rather than a new one, since the scope names it |
| `shelterPage.animalsHeading` | "Their animals looking for a home" (with a count: «{count}» plural forms via `Intl.PluralRules`) |
| `shelterPage.noAnimals` | "No animals are listed right now." Must not say why (paused, all adopted): the reason is the shelter's |
| `shelterPage.cityLine` | "{city}", reusing `cardMeta.atShelter`'s sense if he prefers |
| `detail.shelterRowLink` | the animal page's shelter row, now a link: accessible name "the shelter's page: {name}" |
| per DR1-Q1 (b)/(c) | `forShelters.whyThatSentence` ¶1's clause «а на сторінці тварини — ваше речення…», and `voice.previewLabel` «Так це виглядає на сторінці тварини»: both must change in the **same** PR that moves the sentence (his Ukrainian) |
| per DR1-Q1 (c) | `medical.shelterDeclared`, a new source label for the «Медичний стан» rows |

### Tests (behaviour only)

- Handler: `shelters.byId` output now includes `freshnessSentence` only if picked; a field added to
  `Shelter` still can't reach it (existing `pick` test style); `gallery.list` with
  `scope: shelter` returns only that shelter's discoverable animals, empty for an unverified one,
  with the same ordering as the unscoped list (repository test on local Postgres).
- `handlers-implement-contract.test.ts` still passes (the scope is on an existing procedure).
- Component: the «Слова притулку» section renders with the shelter's words and is **absent** when
  the shelter wrote none (no heading over nothing); the donation link shows its domain as text.
- "Only there": a test that renders the animal page, the deck card, the gallery card and the
  drawer and asserts `uk.freshness.attribution` appears in none of them (asserting against the
  string's meaning, not its constant: the test reads the rendered text for the shelter's sentence
  as well, per DR1-Q1's answer).
- Harness flow (by role/text): gallery → animal page → shelter row link → shelter page; the page's
  heading is the shelter's name; the animal is listed there. A suspended shelter's id → 404 page.
- Accessibility: one `h1`; the animals list is a list with an accessible name; keyboard reaches
  every card and the pagination.

**Tier: 1.** It changes what a public page and `/prytulkam` say (commitment 7), whichever option
DR1-Q1 takes; the full review runs before commit.

---

## 2. The preview drawer

**What it is.** From the gallery, opening a card shows the animal in a drawer over the list
instead of leaving it: the list keeps its scroll, filters and page, and the drawer links to the
full animal page. Source: the scope sentence; no mock frame (proposed here).

### What exists today

- `AnimalCard` (`apps/web/src/features/gallery/AnimalCard.tsx`) is one `<a href="/tvaryny/{id}">`
  per animal, no nested buttons (README "The gallery card"); `ArrowKeyGrid.tsx` moves between
  cards with the arrow keys.
- The full page `apps/web/src/app/tvaryny/[animalId]/page.tsx` → `AnimalDetailScreen`.
- Dialog frames: `apps/web/src/features/controls/ModalDialog.tsx` (focus to title, Tab trapped,
  Escape and ✕ close, page behind doesn't scroll) and `ContactRevealDialog` (the same pattern).

### What changes

- **A Next intercepting route**: `apps/web/src/app/tvaryny/@preview/(.)[animalId]/page.tsx` with
  `@preview/default.tsx` and a `tvaryny/layout.tsx` rendering the slot. A soft navigation from the
  gallery to `/tvaryny/{id}` renders the drawer over the gallery; a direct load, a reload, a shared
  link or a no-JS click renders the full page exactly as today. So the URL in the address bar is
  always the animal's own shareable URL (the reveal modal's own reasoning, README 05), and the
  phone's back gesture closes the drawer (history, not component state).
- **Scope of the interception:** the gallery and the saved page (§4) only. The deck
  (`/tvaryny/gortaty`) and the shelter page keep full-page navigation; a harness flow pins that
  the deck's link to an animal is **not** intercepted. If Next can't scope `(.)` that narrowly
  without restructuring routes, the slice moves the gallery under a route group rather than
  widening the drawer to the deck (decision DR1-D5).
- Contents (no shelter name, §3): the photos (`DetailPhotoGallery`), name, meta line, the
  freshness pips and day count, the animal's description, the save control (§4), «open the full
  page» (a link to the same URL, full navigation), and ✕. **No contact reveal in the drawer**: the
  reveal stays on the animal page, so there is still one reveal surface with its rate limit and its
  reassurance sentence (README 05, «Притулок не знає про цей запит…»).
- Phone: a bottom sheet; tablet and up: a side panel. Through tokens only.
- The focus trap is extracted from `ModalDialog` into a shared hook both use, rather than a third
  copy of it (DRY; decision DR1-D6).

### Contract

**None.** The drawer reads `animals.byId` (`AnimalDetailView`), which the full page already reads.
No DB change.

### Privacy and public claims

Nothing is recorded when the drawer opens: no `swipes.record`, no analytics event beyond the page
view the URL change already produces today. Commitments 1, 2 and 8 are untouched: the drawer
neither reorders nor hides anything, and tells no shelter anything.

### Copy (`[COPY PENDING]`)

| Key | English sense |
|---|---|
| `preview.openFull` | "Open the full page" |
| `preview.close` | accessible name of ✕: "Close" (reuse an existing close label if one fits) |
| `preview.dialogLabel` | none new: the dialog's accessible name is the animal's name heading |

### Tests (behaviour only)

- Component (happy-dom + RTL): opening focuses the heading; Tab and Shift+Tab stay inside; Escape
  closes; ✕ closes; on close focus returns to the card that opened it; `role="dialog"`,
  `aria-modal="true"`, labelled by the name heading; the page behind is inert to Tab.
- Harness flows (by role/label/text): click a card → a dialog named after the animal, URL is
  `/tvaryny/{id}`; browser back → dialog gone, the same gallery page and filters in the URL;
  reload on `/tvaryny/{id}` → the full page, no dialog; «open the full page» → the full page; the
  deck's animal link → the full page, no dialog; with JavaScript disabled, the card is a plain link
  to the full page.
- The drawer shows no reveal button and no shelter name (asserted by role and text).

**Tier: not Tier 1** (no claim, no auth, no data). One review.

---

## 3. No shelter name on the card preview

**What it is.** The gallery card stops showing the shelter's name (and with it the
«· перевірений» suffix, already suppressed while `REGISTRY_HAS_NO_REAL_SHELTERS`). Source: the
scope sentence; no mock frame. **Interpretation taken** (DR1-D1): "the card preview" is the
gallery card, and the drawer (§2), which previews the same card, follows the same rule. The deck
card keeps its shelter line.

### What exists today

- `AnimalCard.tsx:270-276`, `data-testid="shelter-line"`: `card.shelter.displayName` +
  `verificationSuffix(...)`; specified in README "The gallery card" (the "Shelter" bullet).
- The deck card's shelter line (`SwipeCard.tsx:245`) and the animal page's shelter row: unchanged.

### What changes

- Delete the shelter line from `AnimalCard` (all three variants: standard, reserved, resolved).
  The accessible name (`cardAccessibleName`) already omits the shelter; unchanged.
- `README.md` "The gallery card" loses its "Shelter" bullet, with a dated note pointing here
  (one document per subject).
- `FeedCardView` keeps `shelter`: the deck still renders it, and the gallery needs
  `shelter.publicLocation` for the city of an animal at its shelter.

### Contract

None. No DB change.

### Privacy and public claims

Removing a statement, not adding one: no claim in the commitments register names the shelter on
the gallery card. The verified suffix leaving the card is noted for the launch gate: once
`REGISTRY_HAS_NO_REAL_SHELTERS` flips, verification is stated on the animal page and the shelter
page, not on gallery cards.

### Copy

None.

### Tests

- `AnimalCard.test.tsx`: the existing shelter-line assertions become an absence assertion (the
  shelter's name is not in the card's text, in all three variants).
- Harness: `test/harness/viewports.ts` and `discovery-layout.harness.ts` reference `shelter-line`
  for the **deck**; they stay. Any gallery geometry check that fails only because the line is gone
  is a frozen visual test and is **deleted, not fixed**, and listed for Oleksii in the PR body.

**Tier: not Tier 1.** One review. Smallest slice; no dependency.

---

## 4. Saved animals in localStorage, and the saved page («Збережені тварини»)

**What it is.** A person can mark an animal to come back to; the marks live only in their
browser's `localStorage`; a page lists the marked animals with their current state. Source: the
scope sentence, plus README "06 My reveals" as the nearest precedent (a device-only list,
«Зберігається лише на цьому пристрої. Ми не знаємо, хто ви.»). No mock frame.

### What exists today

- Nothing stores anything in `localStorage` for adopters. On-device state today: the anonymous
  session cookie (decision 13), set only after the first «Не зараз» / «Запитати» / «Написати».
- **Public sentences about what the site keeps on a device:**
  - `forShelters.whatHappensToAnimals` (commitment 8): «…це пам'ять лише її пристрою… Від людини
    не ховається нічого, крім того, що вона сховала сама.»
  - `about.data` (`/pro`): describes shelter and kabinet data; says nothing about adopter devices.
  - `PENDING_R4_2_ANALYTICS_SENTENCE` (not live; gated by `assertAnalyticsCopyMatchesGateState`):
    «Людині, яка шукає тварину, сайт ставить одне кукі — і тільки після першої дії…»
  - `myReveals.deviceOnly`: «Зберігається лише на цьому пристрої. Ми не знаємо, хто ви.»

### What changes

- **Storage** (`apps/web/src/features/likes/likes-store.ts`): one key, brand-free
  (`likes.v1`, so a product rename never orphans anyone's list), holding

  ```
  LikesStoreV1 = { version: 1; items: { animalId: AnimalId; likedAt: string /* ISO */ }[] }
  ```

  parsed with a Zod schema on read; anything that fails to parse is treated as empty and
  overwritten on the next write (never a crash, never a partial list). Capped at **200** items
  (`MAX_LIKES`); at the cap, a new save is refused with a message (never a silent drop of the
  oldest). Same-browser tabs stay in sync through the `storage` event. When `localStorage`
  throws (private mode, blocked storage), the control still toggles for the page's lifetime and
  the saved page says the list can't be kept on this device.
- **The control**: a toggle button (`aria-pressed`) on the drawer (§2) and the animal page. **Not
  on the gallery card** in round 1: the card is one `<a>` with no nested controls and one Tab stop
  per animal (README "The gallery card"); a save button there means a second, sibling tab stop per
  card and a change to `ArrowKeyGrid` (decision DR1-D8, reversible once the designer's frames say
  otherwise). **Not on the deck card**: the deck's two actions are «Не зараз» and «Запитати», and a
  third one beside them would read as a stronger yes (the swipe filters, it doesn't judge).
- **Saving records nothing on the server**: no `swipes.record`, no analytics event, nothing in the
  session. A saved animal stays in the list and the deck exactly as before (commitment 8).
- **The saved page** («Збережені тварини», nav «Збережені», a bookmark icon, no heart: his DR1-Q3):
  a new route at his slug `zberezheni` ("slug /zberezheni"). Whether it sits at `/zberezheni` or
  under `/tvaryny/` is S8's call; under `/tvaryny/` it must be a static sibling of `[animalId]`
  like `gortaty`, and the drawer's `(.)[animalId]` interception must not swallow a soft navigation
  to it (S8 adds a harness flow proving that, as S4 did for the deck; S4's review, note 5). Linked
  from the site header. Client-rendered from storage (it can't be server-rendered: the server doesn't know the
  list). Newest first, by `likedAt` (an internal field name): the person's own order, not a ranking. Each item renders
  as a gallery card (no shelter name, §3) opening the drawer; an animal that is no longer
  discoverable (adopted, withdrawn, shelter paused or no longer verified) shows as "no longer
  listed" **without saying why** (the same no-leak rule as `shelters.byId`'s `NOT_FOUND`), with a
  button to remove it from the list. The header link carries no count (decision DR1-D9).
- How the page gets the cards' current state is **DR1-Q2** (§8), the security question in this
  plan. The recommended shape:

### Contract (proposal, per DR1-Q2 option A)

```
animals.cardsByIds
  input:  { animalIds: AnimalId[]  (1..MAX_LIKES, unique) }
  output: { items: FeedCardView[]           // discoverable ones, in the input's order
          ; unavailable: AnimalId[] }       // everything else, one bucket, no reason
  errors: RATE_LIMITED
```

- Sent as a POST body (oRPC's default), so the ids are never in a URL or a request log line.
- Called with `credentials: "omit"`, so the browser sends no session cookie with it; the handler
  takes no `adopterId` from context, and a test pins both. The ids are not stored, logged or
  joined to anything; the per-IP generic limiter keys on the existing HMAC'd IP
  (`rate-limit-key.ts`), as every public procedure does.
- `unavailable` merges "never existed", "draft", "adopted", "withdrawn" and "shelter not
  visible" into one bucket on purpose: distinguishing them would leak moderation state about a
  known id (the reasoning already in `sheltersByIdContract`).
- Goes through `implement(contract)`; `handlers-implement-contract.test.ts` covers it.
- **DB: none.** One `WHERE id = ANY($1)` over the existing discoverable predicate.

### Privacy and public claims

- **What is stored:** animal ids and the time each was saved, in this browser only.
- **What is sent:** under DR1-Q2 (A), the list of ids, once per visit to the saved page, without
  the session cookie, and nothing is kept. Under (B) nothing is ever sent, at the cost of a stale
  list. Under no option is a save ever written to the server.
- **Commitment 1** (ordering): saved animals never reach the server, so they can't reach `scoreAnimal`,
  the feed or the gallery. A test asserts `DEFAULT_SCORING_POLICY`'s inputs are unchanged and the
  feed/gallery handlers receive no saved-list data.
- **Commitment 2** (no engagement reported to shelters): there is nothing server-side to report.
  No shelter-facing count, ever; the kabinet gains nothing from this slice.
- **Commitment 8** (only what she hid herself): saving hides nothing and excludes nothing.
  «пам'ять лише її пристрою» stays true and gains a second device-only memory of the same kind.
- **`/pro`:** the page today says nothing about adopter devices, and the pending R4-2 sentence says
  «сайт ставить одне кукі». A `localStorage` list isn't a cookie, but a reader who is told "one
  cookie" will reasonably take that as everything kept on the device. **DR1-Q4** asks for one
  sentence on `/pro` and whether R4-2 changes before it lands.
- Consent: storage the person asks for, to do what they asked, is the "strictly necessary" case of
  ePrivacy Art. 5(3) as commonly read, so no banner is planned. That reading is **unverified
  here** (not legal advice) and sits with DR1-Q4; either way the claim is stated, because public
  pages describe the site exactly.

### Copy (`[COPY PENDING]`; the concept's name is DR1-Q3)

| Key | English sense |
|---|---|
| `likes.toggleOff` | button, not yet saved: «Зберегти» (his DR1-Q3) |
| `likes.toggleOn` | button, saved: «Збережено» (his DR1-Q3; accessible state via `aria-pressed`, so the label may stay one string) |
| `likes.announceAdded` / `likes.announceRemoved` | aria-live: "{name} added to / removed from your list" |
| `likes.full` | at the cap: "Your list holds {max}; remove one to add another." |
| `likes.page.title` | the page title: «Збережені тварини» (his DR1-Q3) |
| `likes.page.deviceOnly` | "Kept only on this device…" **Proposed: reuse `myReveals.deviceOnly` verbatim** if its second sentence («Ми не знаємо, хто ви.») is true of this page too, which it is under DR1-Q2 (A) and (B) |
| `likes.page.empty` | "Nothing saved yet." plus a link back to the gallery |
| `likes.page.unavailable` | "{name} is no longer listed." (no reason) |
| `likes.page.remove` | "Remove from the list" |
| `likes.page.storageBlocked` | "This browser doesn't let the site keep your list." |
| `nav.liked` | the header link: «Збережені» (his §11; the key's name is internal) |
| `about.likesSentence` | the `/pro` sentence, per DR1-Q4 |

### Tests (behaviour only)

- Store (unit, no DOM): add/remove/toggle; ids unique; newest first; the cap refuses the 201st and
  says so (the mutation is crossing it: 200 → 201 must fail with the value and the limit named);
  a corrupt or wrong-version value reads as empty and is overwritten; a throwing `localStorage`
  degrades without throwing; a `storage` event from another tab updates the list.
- Control: `aria-pressed` toggles; the aria-live region announces the change; it works by keyboard
  (Enter and Space); **no network request is made on toggle** (MSW asserts zero calls).
- `animals.cardsByIds` handler: discoverable ids come back in input order; adopted, withdrawn,
  draft, unknown and unverified-shelter ids all land in `unavailable` with no way to tell them
  apart; >200 ids or duplicates → `BAD_REQUEST`; the handler reads no session (a request with a
  valid cookie and one without return the same and write nothing to `adopters`/`sessions`).
- The saved page (component): renders from storage, newest first; unavailable items say so with
  no reason and can be removed; the empty and blocked states render.
- Harness flow: save on the animal page → reload → the saved page lists it → remove it → empty;
  the request the page sends carries no `Cookie` header (checked on the request, not the code).
- Commitment guards: a test that `scoreAnimal`'s signature and `DEFAULT_SCORING_POLICY`'s
  components are unchanged (it fails if a saved-list-derived input is ever added); the existing
  `history-no-engagement.test.ts` stays green.

**Tier: 1.** It adds a public claim (`/pro`) and a new read that touches adopter privacy.

---

## 5. The long/short fur filter

**What it is.** An animal can be recorded as long- or short-haired, and the gallery and the deck
can filter on it. Source: the scope sentence; no mock frame.

### What exists today

- No fur field anywhere: not in `animalCoreShape` / `ListingFactsSchema`
  (`packages/domain/src/animals/animal.ts`), not in `packages/db/src/schema/animals.ts`.
- `FeedFiltersSchema` (`packages/domain/src/adopters/feed-filters.ts`) has four dimensions:
  `cities`, `species`, `sizes`, `ages`. `FeedFilterDimensionSchema = FeedFiltersSchema.keyof()`,
  so a fifth dimension automatically reaches the relaxation counts (`relaxDimension`), the
  no-match suggestions and any loop over `FEED_FILTER_DIMENSIONS`. `canonicalizeFilters`,
  `filtersFingerprint` and `isUnfiltered` list the dimensions by hand and need the fifth added.
- SQL: `buildFilterPredicate` (`packages/db/src/repos/feed-predicate.ts:65`), shared by the deck,
  the gallery and the relaxation counts.
- UI: `FilterRail.tsx` / `FilterSheet.tsx` (gallery), `use-feed-filters.ts` (deck), URL params in
  `filter-url.ts` (`misto`, `vyd`, `rozmir`, `vik`), the kabinet form
  (`apps/web/src/features/kabinet/animal-form/`), `AnimalPatchSchema`
  (`packages/contracts/src/kabinet/procedures.ts:351`).

### Domain and contract (proposal)

- **A bucket like size (decision 3), closed at two values:**

  ```
  CoatLengthSchema = z.enum(["short", "long"])
  COAT_LENGTHS = ["short", "long"]
  ```

  Not a measurement, not free text. No third value (e.g. hairless, wire) in round 1: adding a
  literal later is a compiler-guided, additive edit, the same reasoning as species (decision 8).
- **Optional, and nullable everywhere** (decision DR1-D10): `animalCoreShape` gains
  `coatLength: CoatLengthSchema.nullable()`, on drafts and listed animals alike, and it is **not**
  a `ListingFacts` requirement. Unknown reads «Не записано» on the animal page (product rule:
  unknown is never "no"). Making it required to publish would block every already-published real
  animal's next edit until someone fills it in, and would need a backfill that invents facts about
  real animals.
- `FeedFiltersSchema` gains `coatLengths: filterSelectionSchema(CoatLengthSchema)`; `NO_FILTERS`,
  `canonicalizeFilters` (universe `COAT_LENGTHS`, so picking both collapses to "any"),
  `filtersFingerprint` (a fifth segment) and `isUnfiltered` follow.
- **Filtering on unknown:** `oneOf` matches the chosen value only; an animal whose fur isn't
  recorded is excluded while a fur filter is on, and the relaxation counts tell the person how
  many more they'd see without it (decision DR1-D11, reversible: the alternative is "unknown
  matches every fur filter").
- `FeedCardView` and `AnimalDetailView` gain `coatLength` (picked).
- `AnimalPatchSchema` and the create-draft input gain `coatLength: CoatLengthSchema.nullable()`:
  unlike size (T4), it can be cleared, because unknown is a valid permanent answer here.
- **Ordering untouched:** `scoreAnimal`'s completeness stays photos, description, vaccination.
  `/prytulkam` §3 names exactly those («та, де є фотографії, опис і відмітка про щеплення»), so
  counting fur toward completeness would falsify commitment 1's sentence. The slice adds a test
  that the completeness components are exactly those three.

### DB (proposal) — migration kind: **additive**

- `animals.coat_length text` nullable, typed `$type<CoatLength>()` with the enum, like `size`. No
  default, no backfill: every existing row is `NULL` = not recorded.
- No new index in round 1: a two-value equality filter is applied on rows the existing feed and
  wait-anchor indexes already narrow. The slice records the local `EXPLAIN` of a filtered gallery
  page; adding `coat_length` to an index later is its own additive migration.
- Written, never applied by the builder. **The PR waits for Oleksii's production migration from
  the PR branch before it merges** (his 2026-10-19 rule).
- `onboard:shelter` is **not changed** in round 1 (decision DR1-D12): it is a production write
  path (Tier 1), and an onboarded animal simply starts with fur not recorded; the shelter fills it
  in the kabinet.
- History (K-Q7): an edit to the field records the field name only, like every other animal field;
  the history view needs its label.

### Seed data

Fictional, in `packages/db/src/seed.ts`: a deterministic spread over `short` / `long` / `null` for
both species, with at least one of each per species and some `null` among published animals, so
the filter, the relaxation count and «Не записано» all have data. Pinned in
`packages/db/test/seed-corpus.test.ts`.

### UI

- Gallery rail and sheet: a fur group after size, same chips, same `galleryHref` toggling. URL
  param `sherst` (`?sherst=long`, comma-joined like the others).
- Deck filter sheet: the same group.
- No-match: the relaxation suggestion for the fur dimension.
- Animal page: a fact line for fur, «Не записано» when null. Not on the card's meta line
  (decision DR1-D13: the meta line already fills a 360px card).
- Kabinet form: a three-way segmented choice (short / long / not recorded), defaulting to not
  recorded; optional for publishing.

### Privacy and public claims

No claim changes. Commitment 1 is guarded by the completeness test above. `/prytulkam` §7's list
of what to prepare («ім'я, приблизний вік, розмір, вдача») stays true: fur is optional.
Deploy note: the fingerprint changes, so a deck cursor issued before the deploy answers
`INVALID_CURSOR` once; the slice verifies the deck restarts cleanly on that.

### Copy (`[COPY PENDING]`)

| Key | English sense |
|---|---|
| `filters.coat` | filter group heading: "Fur" |
| `filters.coatShort` / `filters.coatLong` | "Short-haired" / "Long-haired" |
| `noMatch.relaxCoat` | relaxation suggestion: "Any fur: +{count}" (same template as the other dimensions) |
| `detail.coatLabel` | animal page fact label: "Fur" |
| `detail.coatShort` / `detail.coatLong` | the fact's value (may reuse the filter labels) |
| `kabinet.animalForm.coat.label` | form label: "Fur" |
| `kabinet.animalForm.coat.short` / `.long` / `.unknown` | the three options |
| `kabinet.history.field.coatLength` | history line's field name |

The `kabinet.*` keys can't be pending in CI (`copy-status.test.ts`: nothing under `kabinet.*` is
pending; a pending string also turns production sign-in off), so the UI slice can't go green until
his Ukrainian for those keys is in.

### Tests (behaviour only)

- Domain: `CoatLengthSchema`; `canonicalizeFilters` collapses both values to "any";
  `filtersFingerprint` differs for each selection and keeps every earlier fingerprint distinct;
  `relaxDimension` covers the fifth dimension (driven by `FEED_FILTER_DIMENSIONS`, not a literal).
- Repository (local Postgres): the filter returns only matching rows, excludes `NULL` under a
  `oneOf`, and the relaxation count for fur equals the unfiltered count minus the filtered one.
- Contract/handler: the field round-trips through `AnimalPatchSchema`, can be cleared, and a
  published animal with `coatLength: null` still validates as `ListedAnimal`.
- Completeness guard: the components are exactly photos, description, vaccination.
- Components: the rail toggles the URL param; the form's segmented choice is a labelled radio
  group, keyboard-operable; the animal page shows «Не записано» for null.
- Harness flow: `?sherst=long` lists only long-haired animals; the no-match state offers the fur
  relaxation.

**Tier: not Tier 1** (no claim, no auth, no deletion; the migration is applied by Oleksii, not by
the builder). One review. The migration slice waits for his production migration before merging.

---

## 6. Slice plan

One PR per slice. DB and contract slices land before the UI slices that use them. At most two
feature PRs open at once, in different areas (WM-B1).

| # | Slice | Files (main ones) | Tier | Migration | Depends on |
|---|---|---|---|---|---|
| S1 | **No shelter name on the gallery card** (§3) | `features/gallery/AnimalCard.tsx`, `AnimalCard.test.tsx`, `docs/design/README.md` | not 1 | none | — |
| S2 | **Fur: domain, contract, DB, seed, repository** (§5, no UI) | `packages/domain/src/animals/coat.ts`, `animal.ts`, `adopters/feed-filters.ts`; `packages/contracts` views + `AnimalPatchSchema`; `packages/db/src/schema/animals.ts`, `drizzle/0014_*.sql`, `repos/feed-predicate.ts`, mappers, `seed.ts`, tests | not 1 | **additive** (waits for his production migration) | — |
| S3 | **Fur: UI** (gallery rail/sheet, deck sheet, URL, no-match, animal page, kabinet form, history label) | `features/gallery/*`, `features/filters/*`, `features/animal-detail/*`, `features/kabinet/animal-form/*`, `packages/i18n` | not 1 | none | S2 merged; his copy for `kabinet.*` keys |
| S4 | **Preview drawer** (§2) | `app/tvaryny/layout.tsx`, `app/tvaryny/@preview/**`, `features/animal-preview/*`, shared focus-trap hook from `features/controls/ModalDialog.tsx` | not 1 | none | S1 (the drawer follows the no-shelter-name rule) |
| S5 | **Shelter page: contract** (`GalleryScope`, `PublicShelterView` pick per DR1-Q1) | `packages/contracts/src/procedures/gallery.ts`, `views/shelter.ts`, `apps/web/src/api/handlers/*`, `packages/db/src/repos/gallery-repo.ts`, tests | **1** | none | DR1-Q1 answered |
| S6 | **Shelter page: UI**, «Слова притулку» moved per DR1-Q1, `/prytulkam` §8 and `voice.previewLabel` changed in the same PR | `app/prytulky/[shelterId]/page.tsx`, `features/shelters/*`, `features/animal-detail/*`, `features/discovery/SwipeCard.tsx` (if the sentence leaves the deck), `packages/i18n` | **1** | none | S5; DR1-Q1; his Ukrainian |
| S7 | **Saved animals: store, control, `animals.cardsByIds`** | `features/likes/*`, `packages/contracts/src/procedures/animals.ts`, `apps/web/src/api/handlers/animals.ts`, `packages/db/src/repos/feed-repo.ts` | **1** | none | DR1-Q2, DR1-Q3; S4 (the control sits in the drawer) |
| S8 | **The saved page («Збережені тварини») + `/pro` sentence** | the `zberezheni` route (his slug, DR1-Q3; location S8's call, with the drawer-interception harness flow), `features/likes/*`, `features/chrome/SiteHeader.tsx`, `packages/i18n` (`about.*`) | **1** | none | S7; DR1-Q4; his Ukrainian |

Order of work: S1 and S2 in parallel (different areas) → S3 and S4 → S5 → S6 → S7 → S8. S5–S8
wait on the open questions; S1–S4 don't, so building starts there while he answers.

Added from the coordinator's review on PR #160 (2026-10-20; the coordinator's notes, not
Oleksii's decisions):

- `animals.cardsByIds` (S7) goes through the per-IP rate limit and returns a `pick`-built public
  view (`FeedCardView`), like every public read; Tier 1 review.
- S2's migration `0014` is the only migration-bearing branch until it lands, so two branches never
  both claim `0014`.
- S2 and S3 change SQL (`buildFilterPredicate`), so each waits for Oleksii's real-Neon smoke
  before merge.

Every slice: `pnpm check` green, pasted in the PR; behaviour tests only; new strings as
`[COPY PENDING]` listed in the PR body; "Decisions taken" in the PR body; its migration kind
stated. Each Tier 1 slice is reviewed before commit; the others get one review.

---

## 7. What each slice must not break

- **Commitment 1:** S2/S3 (completeness unchanged, guarded), S5/S6 (date sorts only), S7/S8
  (saved animals never reach ordering).
- **Commitment 2:** S6 (shelter page shows inventory only), S7/S8 (nothing server-side to report).
- **Commitment 5:** S6 (donation link stays on the animal page, domain visible).
- **Commitment 7:** S6 (DR1-Q1; B1 and the voice preview label change in the same PR as the move,
  so a false sentence is never live).
- **Commitment 8:** S7/S8 (saving hides nothing).
- **Product rules:** freshness stays pips plus the day count in words (S4's drawer, S6's cards);
  «Не записано» for unknown fur (S3); no attention counters anywhere (no saved counts shown to
  anyone, no "N saved this"); no money UI.

---

## 8. Open questions for Oleksii

Only irreversible, security, public-claim and brand-voice questions. Each: decision, options,
consequence, recommendation.

### DR1-Q1 · What moves to the shelter page, and what that does to `/prytulkam` §8 (public claim)

**Decision.** "«Слова притулку» only there" moves words that a live commitment places on the
animal page: B1 says «а на сторінці тварини — ваше речення…», and K4's voice preview is labelled
«Так це виглядає на сторінці тварини». The same two words are also the source label on the
«Медичний стан» rows.

**Options.**
- **(a) Additive.** The shelter page gets the shelter's description under «Слова притулку»; the
  freshness sentence and its attribution stay on the animal page; the medical label stays.
- **(b) Move the sentence.** The shelter page carries the description and the freshness sentence
  under «Слова притулку»; the animal page and the deck show the pips and the day count only, plus
  a link to the shelter page. The medical rows keep «Слова притулку» as their source label.
- **(c) Move everything named «Слова притулку».** As (b), and the medical rows' source label gets
  a new wording, so the two words appear nowhere but the shelter page.

**Consequences.**
- (a): no claim changes; but «Слова притулку» is then on two pages, which is not what the scope
  says.
- (b): B1's ¶1 clause and `voice.previewLabel` become false and must be rewritten in his Ukrainian
  **in the same PR**; the adopter loses the shelter's "how current we are" sentence at the moment
  of choosing (one tap further away); `freshnessSentence` leaves the card view. The medical rows
  still show the two words, so "only there" holds for the shelter's speech but not for the label.
- (c): as (b), plus one new medical source label (his Ukrainian), and the README's source legend
  («#63676B — слова притулку») is reworded.

**Recommendation: (b).** It does what the scope says for the shelter's own speech, while the
medical label is a source legend, not quoted speech, and renaming it buys nothing for an adopter.
If "only there" was meant literally for the label too, (c).

### DR1-Q2 · How the saved page learns the animals' current state (security / privacy)

**Decision.** The list lives on the device; showing it accurately (adopted, reserved, freshness,
photo) needs current data from the server, which means sending the ids.

**Options.**
- **(A) A cookieless batch read**, `animals.cardsByIds`: ids in a POST body, sent without the
  session cookie, not stored or logged, one bucket for "no longer listed".
- **(B) Snapshot only, nothing ever sent**: store name, photo and city at save time; the page shows
  that snapshot and links to each animal's page.
- **(C) Per-id `animals.byId` calls** from the page, with cookies as today.

**Consequences.**
- (A): accurate list; the server sees an unlinked set of ids for one request and keeps nothing; the
  `/pro` sentence can say so truthfully. One new public procedure (Tier 1 review).
- (B): the strongest privacy claim («never leaves this device»), but the list goes stale: an
  adopted animal still looks available until clicked, and freshness can't be shown honestly, so
  the page would have to drop the pips (a product rule says freshness is always both pips and
  words wherever it appears).
- (C): no new procedure, but up to 200 requests per visit, each carrying the session cookie, so
  the server could link the saved set to the anonymous session.

**Recommendation: (A).**

### DR1-Q3 · What the feature is called (brand voice)

**Decision.** The scope says "likes". The site's voice rules say the swipe filters and doesn't
judge, and a right swipe is an inquiry, not a match. A heart and "like" read as judgement and
sit close to dating-app language; the feature is really "keep for later".

**Options.** (i) "like" wording and a heart; (ii) "save for later" wording and a neutral mark;
(iii) his own word.

**Consequences.** (i) matches the scope's word, risks the "match" reading the voice rules avoid.
(ii) says what it does; the route slug and every key above follow it. (iii) as he writes it.

**Recommendation: (ii)**, with the Ukrainian his. The slug (`vpodobani` proposed then; his answer is `/zberezheni`) follows his
word.

### DR1-Q4 · The `/pro` sentence about on-device storage (public claim)

**Decision.** `/pro` says nothing about adopter devices today, and the pending R4-2 sentence says
«сайт ставить одне кукі». The saved list adds a second thing kept on the device.

**Options.**
- (a) Add one sentence to `about.data` (his Ukrainian) saying the saved list is kept only on this
  device, and, under DR1-Q2 (A), that the page asks for those cards without the cookie and keeps
  nothing; and amend R4-2 before it lands so "one cookie" isn't read as "the only thing on your
  device".
- (b) Add the sentence only on the saved page (the `myReveals.deviceOnly` pattern), nothing on
  `/pro`.

**Consequences.** (a) keeps `/pro` a complete description of what the site keeps; two strings to
write. (b) is one string, but `/pro` stays silent about something the site stores, and R4-2 would
later go live describing the device incompletely.

**Recommendation: (a).** S8 doesn't merge until the sentence is in.

---

## 9. Decisions taken (reversible; overturn at merge)

| ID | Decision | Reason |
|---|---|---|
| DR1-D1 | "The card preview" = the gallery card; the drawer follows the same rule; the deck card keeps its shelter line | The deck card carries the shelter's sentence (until DR1-Q1), which needs its speaker; the gallery card has no sentence |
| DR1-D2 | Shelter page at `/prytulky/{shelterId}` (id, not a slug) | Shelters have no slug column; a slug is an additive change later. Matches the kabinet's `/kabinet/prytulky` |
| DR1-D3 | No filter rail on the shelter page in round 1 | A shelter's list is short; avoids a scoped `relaxationCounts` |
| DR1-D4 | The shelter's animals come from `gallery.list` with a `scope` union, not a new procedure | Stays inside the one named `OFFSET` exception and reuses the discoverable predicate and both sorts |
| DR1-D5 | The drawer is a Next intercepting route, gallery and saved page only; the deck keeps full-page navigation | Shareable URL, back gesture closes it, no-JS degrades to the full page |
| DR1-D6 | The focus trap is extracted from `ModalDialog` into a shared hook | One trap, not three |
| DR1-D7 | No contact reveal in the drawer | One reveal surface, with its rate limit and reassurance |
| DR1-D8 | The save control on the drawer and the animal page, not on the gallery card or the deck card | The card is one `<a>` with one Tab stop (README); a third deck action would read as a stronger yes |
| DR1-D9 | No count on the header's saved-page link | No counters; also avoids a hydration mismatch from storage |
| DR1-D10 | Fur is optional and nullable, not a publish requirement; no backfill | Unknown is a complete answer; a backfill would invent facts about real animals |
| DR1-D11 | A fur filter excludes animals whose fur isn't recorded; the relaxation count shows how many | Same semantics as every other dimension; the person sees what the filter cost |
| DR1-D12 | `onboard:shelter` unchanged in round 1 | It is a production write path (Tier 1); onboarded animals start "not recorded" |
| DR1-D13 | Fur on the animal page, not on the card's meta line | The meta line already fills a 360px card |
| DR1-D14 | The saved list stored under a brand-free key `likes.v1` (internal), capped at 200, refusing (never dropping) past the cap | A rename never orphans a list; a silent drop would lose what the person chose |
| DR1-D15 | Saving records nothing server-side and sends no analytics event | Commitments 1 and 2 hold by construction, not by policy |

---

## 10. His final answers (Oleksii, 2026-10-20, verbatim)

These override anything above that they contradict. DR1-Q2 and DR1-Q3 are in the inbox file's rows.

```text
DR1-Q1, final: «Слова притулку» only on the shelter page.

What moves: the shelter’s freshness sentence leaves the deck and animal pages and shows only on the shelter page. «Оновлено … тому» stays on every card.
The medical rows: their source label «Слова притулку» is renamed to «Дані притулку» (option (c)).
Rewrites: the strings below. Email changes are Tier 1; update the exact-payload tests.

The strings:

forShelters.whyThatSentence, paragraph 1 only (paragraphs 2–3 unchanged): «Людина, яка обирає між двома собаками, ніяк не дізнається, про кого з них писали минулого тижня, а про кого — позаторік. Тому на картці видно, коли ви востаннє підтвердили, що тварина ще шукає дім, а на сторінці притулку — ваше речення про те, як часто ви це робите, вашими словами.»
kabinet.profileEdit.voice.previewLabel: «Так це виглядає на сторінці притулку:» (drop {name})
kabinet.profileEdit.actions.liveOnSave.voice: «Нове речення зʼявиться на сторінці притулку одразу після збереження.»
kabinet.profileEdit.errors.dateTokenGone: «Дата оновлення показується на кожній картці, тому {дата} у реченні писати не потрібно.»
kabinet.profileEdit.voice.hint: «Одне речення від першої особи, вашими словами, про те, як часто ви оновлюєте картки. Воно показується на сторінці притулку.»
kabinet.profileEdit.voice.emptyMeans: «Якщо залишити порожнім, на сторінці притулку цього речення не буде, а на картках, як і раніше, буде „Оновлено … тому“.»
kabinet.profileEdit.voice.previewNoAnimals: delete the key, since the preview no longer needs an animal. If it must stay: «Тут видно, як речення виглядатиме на сторінці притулку.»
kabinet.profileEdit.voice.previewEmpty: «Речення немає — на сторінці притулку його не буде.»
kabinet.email.invite.what and whatBeforeVerification: replace «Контакти, речення на картках і картки тварин ви змінюєте самі» with «Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі». The rest is unchanged.
kabinet.operator.history.freshness_sentence_changed: «Змінено речення на сторінці притулку»
The medical rows’ source label: «Дані притулку»

DR1-Q5: (a), drop {імʼя}.

The sentence is shelter-level, and the editor refuses {імʼя}.
The new error: «Тепер речення показується на сторінці притулку, тому {імʼя} у ньому не використовується. Приберіть його й збережіть ще раз.»
Existing test-shelter sentences containing it are re-saved, not migrated.

DR1-Q4, the R4-2 amendment. The pending sentence becomes:
«Людині, яка шукає тварину, сайт ставить одне кукі — і тільки після першої дії: «Не зараз», «Запитати» чи «Написати». У ньому немає імені чи номера телефону, лише випадковий ідентифікатор: щоб режим «по одній» памʼятав, кого ви вже бачили, а сайт — чиї контакти ви вже відкрили. Він перестає діяти через 7 днів без візитів або через 30 днів у будь-якому разі. Окремо від кукі, якщо ви зберігаєте тварин, їхній список лежить у цьому браузері.»

Note «памʼятав» with ʼ (U+02BC). Grep the catalogue for straight apostrophes in Ukrainian strings and fix them in the same PR.
The /pro sentence for saved animals stays as I sent it.

Any other live string this makes false: send it to me; don’t rewrite it yourself.
```

## 11. His copy for the slices (Oleksii, 2026-10-20, verbatim)

The only source for these keys. Anything not here stays `[COPY PENDING]` and goes back to him.

```text
1. DR1-S2-Q1: (a). The kabinet half moves to S3, built with the copy below.

2. Fur copy (S3):

kabinet.animalForm.coat.label: «Шерсть»
kabinet.animalForm.coat.short / .long / .unknown: «Коротка» / «Довга» / «Не вказано»
kabinet.history.field.coatLength: «Шерсть»
filters.coat: «Шерсть»
filters.coatShort / filters.coatLong: «Короткошерсті» / «Довгошерсті»
noMatch.relaxCoat: «Будь-яка шерсть: +{count}»
detail.coatLabel: «Шерсть». Don’t reuse the filter labels. The value is «Коротка» / «Довга», the same as the form. If it isn’t recorded, hide the row (don’t show «Не вказано» to adopters).

3. Preview drawer (S4):

preview.openFull: «Відкрити повну сторінку»
preview.close: yes, reuse the existing «Закрити» label if there is one. If not: «Закрити».

4. Shelter page (S6):

shelterPage.title: the shelter’s name alone, yes.
The «Слова притулку» heading: reuse the existing string, yes.
shelterPage.animalsHeading: «Шукають дім: {count}»
shelterPage.noAnimals: «Зараз тут немає тварин, які шукають дім.»
shelterPage.cityLine: reuse the existing string, yes.
detail.shelterRowLink (accessible name): «Сторінка притулку «{name}»»

5. Saved animals (S7, S8):

likes.announceAdded: «{name}: додано до збережених»
likes.announceRemoved: «{name}: прибрано зі збережених»
likes.full: «Список повний — у ньому може бути не більше {max} тварин. Щоб додати нову, приберіть когось зі списку.» This is written for {max} = 200. If the limit ever changes, send it back for the plural check.
likes.page.deviceOnly: don’t reuse myReveals.deviceOnly unless it’s literally true for the saved list. Use: «Список зберігається лише в цьому браузері: на іншому пристрої чи в іншому браузері його не буде.»
likes.page.empty: «Тут поки нічого немає. Збережіть тварин у галереї, щоб повернутися до них пізніше.» Link text: «До галереї».
likes.page.unavailable: «{name} більше не показується на сайті.»
likes.page.remove: «Прибрати зі списку»
likes.page.storageBlocked: «Цей браузер не дає сайту зберегти ваш список.»
nav.liked: «Збережені»

All of these use ʼ (U+02BC) wherever an apostrophe appears, and no exclamation marks.
```
