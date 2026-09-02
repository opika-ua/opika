# Copy and information-architecture critique — live site, post-Phase F

Assessment only. Nothing below was acted on. Source: `packages/i18n/src/messages/uk.ts` (the only catalogue actually rendered in production — `en.ts`'s own header comment confirms next-intl isn't wired until H3, so it's a future reference, not live copy) and a full route/link inventory of `apps/web/src`.

---

## D. Copy audit

### String inventory

Every user-facing string in `uk.ts`, grouped by where it renders. (Full text is in the source file — this table is the map, not a duplicate of the 220-line catalogue.)

| Group | Renders on | Count | Register found |
|---|---|---|---|
| `firstRun` | First-run band (`/tvaryny`) | 2 | ви |
| `feed` | Gallery header, deck header/announcement | 5 | — (no direct address) |
| `filters` | Rail, sheet, result-count sentences | 20 | — |
| `swipe` / `actions` | Deck buttons, detail-page action pair | 6 | — |
| `freshness` / `medical` / `location` | Freshness block, detail page | 15 | — |
| `detail` | Detail page chrome, not-found state | 8 | — |
| `reveal` | Contact reveal modal | 11 | ви (`з вами`, `узгодите`) |
| `myReveals` | "My reveals" (M1/M2 — not yet a built route) | 3 | — |
| `exhausted` | Deck end-state | 6 | ви (`переглянути`, implied) |
| `errors` | Offline / load-failed / session-expired | 9 | — |
| `reserved` / `resolved` | Card variants | 4 | — |
| `documents` / `cardMeta` | Card chips, card meta line | 8 | — |
| `pagination` | Gallery pagination footer | 8 | — |
| `noMatch` | Zero-result state | 6 | — |
| `galleryError` | Whole-list error | 5 | — |
| `outOfRangePage` | `?stor=` beyond range | 3 | — |
| `footer` / `about` | Page footer, «Про проєкт» | 9 | — (about.intro is first-person singular — see D1) |

**~128 keys total**, all Ukrainian, machine-translated `en.ts` mirror unused in production.

### D1 — Voice: two strings editorialize about the platform's own design, where the rest of the catalogue doesn't

The design's premise (per the brief) is the shelter speaking in first person, the platform staying neutral. Two strings break that — not by claiming to be the shelter, but by the *platform* explaining its own engineering decisions to a user who didn't ask:

- **`pagination.footnote`**: *"Сторінки, а не безкінечна стрічка: у кожної сторінки своя адреса, кнопка «назад» працює, і посилання можна надіслати в Telegram."* ("Pages, not infinite scroll: each page has its own address, back works, and links can be sent on Telegram.") This reads like a line from an engineering design doc, not copy written for an adopter. No adopter arrived at this page wondering why it isn't infinite-scroll.
- **`noMatch.suggestionExplainer`**: *"Кожна пропозиція називає, скільки тварин вона додасть. Порожній екран не питає «спробуйте інше» без числа."* ("Every suggestion names how many animals it adds. An empty screen doesn't ask 'try something else' without a number.") Same pattern — explaining the *quality* of the empty-state copy to the person reading it, rather than just being that copy.

Contrast with `filters.railFooter`: *"Немає фільтра «тільки свіжі картки». Тварина, про яку давно не писали, все одно чекає."* ("There's no 'only fresh cards' filter — an animal nobody's written about in a while is still waiting.") This *also* explains a design absence, but it's aimed at an adopter's actual worry (does an old listing mean the animal isn't available anymore?) rather than narrating the interface's own philosophy. Worth keeping as the model; the other two read like leftover doc comments that migrated into the message catalogue.

### D2 — Register: consistently ви, no mixing found

Checked every string carrying a direct second-person form: `Перегляньте` (imperative, ви), `узгодите`, `з вами` (reveal's reflection prompt) — all ви. No ти-form leaked in anywhere (buttons and infinitives like `Написати`/`Скинути`/`Показати` don't carry a ти/ви marker at all, so they can't conflict either way). **Clean — checked and confirmed, not a finding.**

### D3 — Naturalness: reads as written in Ukrainian, not translated from English, with one label-pattern exception

No calque-y sentence structures found on a full read-through — `about.intro`'s *"який я роблю сам, поза роботою"*, `reveal.title`'s *"Ось як зв'язатися з притулком"*, `exhausted.body`'s *"це нормально"* all read like native phrasing, not backfilled English syntax.

One exception: **`freshness.attribution`**: *"Слова притулку · дата автоматична"* ("Shelter's words · date automatic"). The middot-joined label-fragment pattern (`X · Y`, both fragments, neither a full clause) is a very English/UI-label construction — `Слова притулку. Дату проставлено автоматично.` (two real short sentences) would read more like Ukrainian prose and less like a transplanted label pattern. Minor; flagged because it's the one place the pattern actually shows, not because it's broken.

### D4 — Microcopy: consistently pairs "what happened" with "what to do" — a real strength, not a gap

Checked every error/empty state specifically for this:

| State | What happened | What to do next |
|---|---|---|
| Offline | "Зараз немає інтернету." | "Спробувати ще раз" |
| Load failed | "Щось не спрацювало на нашому боці." + explicit not-your-fault line | "Оновити" |
| Session expired | "Ми почали стрічку заново." (eyebrow explains why) | "До стрічки" |
| No match | "Під ці фільтри зараз нікого немає." | Two buttons, each naming its exact yield: "Прибрати «розмір» (+11 тварин)" |
| Gallery error | "Сторінку не вдалося завантажити." + reassurance filters are saved | "Спробувати ще раз" / "Показати всіх тварин" |
| Out-of-range page | "Сторінки {N} не існує — тут лише {total}." | Explains the fallback ("Показуємо сторінку {total}") + "На першу сторінку" |

Every single one pairs a plain statement of what happened with either a concrete next action or an explicit reassurance of what *didn't* break. Genuinely strong, consistent microcopy discipline — recorded here because the brief asked to check for it, not because anything needed fixing.

### D5 — The four adopter-facing promises: three are on the first-run band verbatim, the fourth is correctly scoped elsewhere

Checked what a first-time visitor sees **without clicking anything**, on the band itself:

- "**Verified shelters**" — *"Тварини з перевірених притулків Київщини"* — stated directly in the promise sentence.
- "**No money handled**" — *"Ми не беремо і не переказуємо грошей"* — stated directly in the disclaimer.
- "**«Не зараз» is a filter, not a judgement**" — *"«Не зараз» — це просто фільтр, а не оцінка тварини"* — stated verbatim.
- "**Free**" — not on the band. But re-examined what this promise actually means: it's about whether *shelters* pay to use the registry, a B2B/shelter-facing fact an adopter has no reason to need mid-scroll. It's correctly scoped to «Про проєкт» instead. **Not a gap** — the one promise that's adopter-irrelevant is the one that's not adopter-facing. (Its actual reachability problem is an IA issue, not a copy one — see E4.)

### D6 — «з N», result counts, «Не записано»: appropriately label-style where labels are correct, sentence-style where sentences are needed

- `pagination.ofTotal` ("з {total}") is a bare fragment — but it's attached to a numbered button row as a terminal count, matching the design's own `label`/`caption` typographic role for exactly this kind of context. Appropriate, not a defect.
- `filters.resultCount` ("Підходить {count} {animalWord}. Притулків у цьому місті — {shelterCount}.") is a real two-clause Ukrainian sentence, correctly pluralized (verified at n=1/2/5/21/74 live — see `design-critique.md` C4).
- `medical.unknown` ("Не записано") is a two-word field-value, always paired with a labeled row (`Комплексне щеплення: Не записано`) — appropriate as a label, not miscast as a sentence that needs subject/verb.

No finding here — checked because it was asked, confirmed each instance matches its actual UI role.

---

## E. Information architecture

### Route and state inventory

| Route | Purpose | States reachable within it |
|---|---|---|
| `/` | Redirect only (308 → `/tvaryny`) | none — no page renders here |
| `/tvaryny` | Gallery, the primary surface | first-run band present/gone · populated grid · no-match (0 results) · whole-list error · out-of-range-page notice · 10 numbered pages |
| `/tvaryny/gortaty` | Deck (swipe mode) | loading · normal card · reserved-badge card (real in seed data — confirmed live) · exhausted (end of deck) · load error |
| `/tvaryny/[animalId]` | Animal detail | normal detail · not-found (bad/missing id) · contact reveal before/after · reveal error |
| `/pro` | «Про проєкт» | single static state |
| `/api/rpc/[...rpc]` | API only | not user-facing |

Five user-facing surfaces, no more and no fewer than what a full source read finds — nothing hidden behind a flag or unreachable route.

### E1 — An adopter from a shared link (`/tvaryny/{animalId}` directly) gets zero brand or trust context

Landing directly on a detail page (the realistic case — this is exactly the URL shape someone pastes into a Telegram chat) shows: the animal, its photo, its shelter, a reveal button, and a bare "← До списку" back link. **No wordmark** (see `design-critique.md` B2 — the detail header drops "Opika" entirely), **no promise text**, **no link to «Про проєкт»** (confirmed — grepped every `.tsx` file for `/pro`, it appears in exactly one place, `tvaryny/page.tsx`, not on the detail page). A first-time visitor arriving this way has no way to learn what Opika even is without backing out to the gallery first — and even then, only reaches trust-building copy by scrolling to the footer.

### E2 — Same landing page, but for Google — currently moot, worth flagging for when it isn't

`noindex, nofollow` is live site-wide (confirmed in the Part 1 deployment check), so this scenario can't happen today. The moment that flag comes off, E1's gap becomes the *first* thing a cold Google visitor sees, at scale, unmitigated. Worth having a plan for before flipping that flag, not urgent while it's still off.

### E3 — A shelter considering joining: no path exists at all

Confirmed by grep across the whole `i18n` catalogue and every route: no "join," "apply," "become a partner shelter," or equivalent copy or link anywhere. The only contact surface in the entire app is `about.contact` — a generic *"Зв'язатися з розробником: {contact}"* mailto on «Про проєкт», addressed to "the developer," not "the team" or "the registry." A shelter that reaches this page has to guess that emailing about wanting to *list their animals* is an appropriate use of a line clearly written for general inquiries, and reaching even that requires the same footer-only path in E4 below. Nothing on the page explains what verification involves, what data to prepare, or what happens after they email — confirming the gap the brief already suspected.

### E4 — No way to report a stale or wrong listing

Same search, same result: nothing. An adopter who reveals a shelter's contact, calls, and learns the animal was adopted three months ago has no in-app path to flag that — their only recourse is the same generic developer mailto, once they've found «Про проєкт» at all.

### E5 — «Про проєкт» is reachable from exactly one place in the entire app

Grepped every `.tsx` file for `"/pro"` — it appears **once**: `apps/web/src/app/tvaryny/page.tsx:302`, the gallery's own footer. Not linked from the detail page, not from the deck, not from the reveal modal, not from the no-match or error states, not from `/` (which never renders anything of its own — it redirects straight past). On a 220-animal, 10-page gallery, reaching it means scrolling past the current page's cards and pagination controls first. This is the single largest concrete finding in this pass: the one page whose entire purpose is "is this legitimate, who's behind it, how do I get in touch" is reachable from one link, in one screen, below the fold.

### E6 — Does the first-run band carry enough for a first-time visitor? Recommendation: mostly yes, with one cheap fix

The design's own stated intent for this surface (`README.md:427`) is explicit: *"not a separate screen... nothing blocks browsing."* Measured against that stated goal rather than against a generic landing-page checklist, the band does its actual job — three of the four adopter-facing promises are stated in it verbatim (D5), and it gets out of the way in one screen's worth of content, exactly as specified. I don't think it needs to become a landing page; the design's bet that showing real, verified-badge-carrying animals immediately is more convincing than marketing copy is a reasonable one, and adding more to the band would work against the "nothing blocks browsing" rule it was explicitly written to satisfy.

**The recommendation is narrower and cheaper than "expand the band": put the «Про проєкт» link somewhere reachable from every screen — the header, not just the gallery's footer.** That fixes E1, E3, E4, and E5 simultaneously without touching the band's actual content or its minimalism. The band doesn't need to carry more; the *header* needs to carry the one link that currently only exists at the bottom of one page.

### E7 — Someone deciding whether to trust the project has one real path, and it's the one that's hardest to find

Ties E5 and E6 together: «Про проєкт» is the actual, well-written answer to "can I trust this" (D-section confirms its copy is clear, honest, and covers what a skeptical volunteer would ask). The problem isn't the content — it's that E5 makes it nearly unreachable except by someone already committed enough to scroll a full gallery page looking for a footer.

---

## Prioritized findings — most damaging first

1. **(E5) «Про проєкт» is linked from exactly one place in the whole app** — the gallery footer, below a potentially 10-page scroll. Every other finding in this document (E1, E3, E4, E7) is a direct downstream consequence of this one fact. Highest priority because fixing it is cheap (a header link) and it unblocks four separate audience-facing gaps at once.

2. **(E3) No path exists for a shelter to learn how to join or what verification involves.** Confirmed by exhaustive search, not assumed. The only contact surface is a generic developer email, and reaching even that requires finding the footer link first.

3. **(E1) A shared-link visitor landing directly on a detail page gets zero brand or trust context** — no wordmark, no promise text, no path to «Про проєкт». This is a realistic, common entry point (it's the exact URL shape meant for sharing), not an edge case.

4. **(E4) No way to report a stale or incorrect listing.** An adopter who discovers a listing is wrong has no dedicated path to flag it — same generic mailto as everything else.

5. **(D1) Two strings editorialize about the platform's own design** (`pagination.footnote`, `noMatch.suggestionExplainer`) rather than serving the reader — they read like design-doc commentary that migrated into user-facing copy. Low cost to rewrite, worth doing whenever this copy gets a pass.

6. **(E2) The E1 gap becomes consequential at scale the moment `noindex` comes off.** Not urgent today, but worth a plan before that flag flips.

7. **(D3) One label-pattern construction reads translated-from-English**: `freshness.attribution`'s middot-joined fragments (`Слова притулку · дата автоматична`). Minor, single instance.

**Checked and confirmed clear** (not findings, listed because the brief asked specifically): register consistency — ви throughout, no ти-form found (D2); microcopy discipline — every error/empty state pairs "what happened" with a next action or explicit reassurance (D4); the four adopter-facing promises are legible without documentation, three verbatim on the band and the fourth correctly scoped to a shelter-facing page (D5); «з N», result counts, and «Не записано» are each in the appropriate register for their actual UI role (D6); the first-run band itself is not under-scoped relative to its own stated design intent (E6) — the fix that's needed is a header link, not a bigger band.
