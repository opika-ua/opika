# Decisions inbox: feat/dr1-s6-shelter-page

Rows for the shared table (`docs/decisions-inbox.md`), appended at merge. Designer round 1, slice
S6 (`docs/designer-round-1.md` §1, §6, §7, §9, §10, §11 item 4): the shelter page, the shelter's
sentence moved there, and his copy for it. Tier 1: a new public page, a sentence a live
`/prytulkam` commitment (#7) describes, and an email. Built on S5's reviewed head `065926c`.
Every row below is the builder's decision unless its answer column quotes Oleksii.

His answers this slice implements (Oleksii, 2026-10-20, verbatim, from `docs/designer-round-1.md`
§10 and §11):

> DR1-Q1, final: «Слова притулку» only on the shelter page.
>
> What moves: the shelter’s freshness sentence leaves the deck and animal pages and shows only on the shelter page. «Оновлено … тому» stays on every card.
> The medical rows: their source label «Слова притулку» is renamed to «Дані притулку» (option (c)).
> Rewrites: the strings below. Email changes are Tier 1; update the exact-payload tests.

> DR1-Q5: (a), drop {імʼя}.
>
> The sentence is shelter-level, and the editor refuses {імʼя}.
> The new error: «Тепер речення показується на сторінці притулку, тому {імʼя} у ньому не використовується. Приберіть його й збережіть ще раз.»
> Existing test-shelter sentences containing it are re-saved, not migrated.

> Any other live string this makes false: send it to me; don’t rewrite it yourself.

His §11 item 4 (shelter page copy) is used as written: `shelterPage.title` is the name alone, the
«Слова притулку» heading and the city line reuse existing strings, `shelterPage.animalsHeading`
«Шукають дім: {count}», `shelterPage.noAnimals`, `detail.shelterRowLink`.

| ID | Date | Row | Question | Options | Default taken | Oleksii's answer | Status |
|---|---|---|---|---|---|---|---|
| DR1-S6-M1 | 2026-10-21 | Migration kind | - | - | **None.** No schema change; the page reads S5's scoped `gallery.list` and `shelters.byId`. No SQL or driver change, so no new Neon smoke (S5's step 40 covers the scoped query). | - | recorded |
| DR1-S6-T1 | 2026-10-21 | Where `{імʼя}` is refused (DR1-Q5) | He says "the editor refuses". Only the editor, or every write path? | the kabinet editor only · the domain rule, so every write path | **The domain rule** (`normalizeFreshnessSentenceText` gains a `name_token` problem, checked first, any spelling): the kabinet editor (his error), the kabinet contract, the registry's create and the `onboard:shelter` script all refuse it. A client-only refusal would let a hand-made request store a sentence the shelter page can't show. `onboard:shelter` is a production write path; the change only narrows what it accepts. | - | decision taken |
| DR1-S6-T2 | 2026-10-21 | A stored sentence that still carries `{імʼя}` | His words: re-saved, not migrated. Until then, what does the shelter page show? | show it with the braces · strip the token · leave the sentence out | **Leave it out** (`shownSentence`), until the shelter re-saves it; the editor shows it as written and asks for the token to go when saved. Braces would reach adopters verbatim; stripping would put words in the shelter's mouth. | - | decision taken |
| DR1-S6-T3 | 2026-10-21 | What goes with the token | - | - | Deleted, as false since DR1-Q5 (a deletion, not new copy): the «Вставити {імʼя}» button and its key `voice.insertName`, `voice.nameStaysHint`, `fillAnimalName`, `insertAt`. `voice.previewNoAnimals` deleted by his answer. The kabinet home page no longer reads an animal for the preview. | - | decision taken |
| DR1-S6-T4 | 2026-10-21 | The shelter page's 404 | The animal 404's title and body speak of a card («Цієї картки більше немає»), false here. | new `[COPY PENDING]` strings on a public page · existing strings that are true | **Existing strings:** «НЕ ЗНАЙДЕНО» as the heading and «Усі тварини» to the gallery. A public page can't carry `[COPY PENDING]`; a fuller shelter wording is his, if he wants one (listed in the PR). | - | decision taken |
| DR1-S6-T5 | 2026-10-21 | Rate limits on the page | - | - | `/prytulky` joins `/tvaryny` under `proxy.ts`'s per-IP page limit (same budget, his 429 sentence); the page's own `rate_limited` state is the animal page's (RL-F1), moved to `features/chrome/RateLimitedScreen.tsx` and shared. | - | decision taken |
| DR1-S6-T6 | 2026-10-21 | Reuse of the gallery's controls | - | copy them · give them an href builder | `SortLinks` and `PaginationNav` take where each link leads; `SortControl` and `GalleryPagination` are thin wrappers over them, so the gallery is unchanged. `ArrowKeyGrid` can render a `<ul>` named by a heading. On the shelter page the sorts show at every width (it has no sheet). | - | decision taken |
| DR1-S6-T7 | 2026-10-21 | The page's URL | - | - | The gallery's own params (`sort`, `stor`) and parser; filter params are ignored (DR1-D3). A page past the last is served clamped, with no out-of-range notice (the gallery's notice links into the gallery). | - | decision taken |
| DR1-S6-T8 | 2026-10-21 | K4's voice preview (task item 5) | - | the sentence only · the whole section with the description | **The sentence only**, in the shelter page's own section component (heading «Слова притулку», `h3` inside the card), under his `previewLabel`; his `previewEmpty` when there is none. The description is not edited there. | - | decision taken |
| DR1-S6-T9 | 2026-10-21 | Metadata | - | - | Title: the shelter's name alone (his §11). Description: the D-2 demo disclosure while `REGISTRY_HAS_NO_REAL_SHELTERS`, the shelter's description after. No `robots` of its own, so the root layout's `SITE_IS_PUBLICLY_DISCOVERABLE` gate applies; a rate-limited answer is `noindex`. | - | decision taken |
| DR1-S6-T10 | 2026-10-21 | The deck card's shelter line | DR1-D1 kept it because the sentence needed its speaker; the sentence is gone. | keep · remove | **Kept.** Removing it is §3's question (the card preview), not S6's; listed for him. | - | decision taken |
| DR1-S6-T11 | 2026-10-21 | The design README and the mock | The source legend «#63676B — слова притулку» is in `Opika Registry Frames.dc.html`'s D1 caption, not in the README. | edit the mock · amend the README | **README amended** ("The shelter's sentence", his DR1-Q1 and DR1-Q5 quoted), saying the legend now reads «Дані притулку» and that the prose wins over the mock; the designer's mock is untouched. | - | decision taken |
| DR1-S6-T12 | 2026-10-21 | Commitment #7's register | - | - | Row 7 in `docs/standing-constraints.md` records the move, his ¶1, where the sentence renders, the tests that pin it, and what would falsify it. | - | recorded |
| DR1-S6-T13 | 2026-10-21 | A shelter that wrote neither words | The schema requires a description, so the section always has one today. | - | The section is omitted when both are blank (trimmed), never a heading over nothing; tested on the component. | - | decision taken |
| DR1-S6-T14 | 2026-10-21 | English catalogue | - | - | `en.ts` mirrors the key shape and slots (a parity test requires it) and follows his meaning; it is not live (next-intl isn't wired until H3). | - | recorded |
| DR1-S6-C1 | 2026-10-21 | Live strings this makes false (his rule: send, don't rewrite) | `kabinet.profile.voiceLabel` «Ваші слова на картках» (the sentence field's label in the editor and the read-only profile): the sentence is no longer on the cards. | his text | **Unchanged**, sent to him. | - | waits for his text |
| DR1-S6-C2 | 2026-10-21 | ditto | `kabinet.profileEdit.errors.unknownToken` «Підставляється лише {імʼя}. …»: nothing is substituted any more. | his text | **Unchanged**, sent to him. | - | waits for his text |
| DR1-S6-C3 | 2026-10-21 | ditto | `kabinet.profileEdit.errors.strayBrace` «… Фігурні дужки потрібні лише для {імʼя}.»: braces are for nothing now. | his text | **Unchanged**, sent to him. | - | waits for his text |
| DR1-S6-C4 | 2026-10-21 | Not false, for his eye | `detail.shelterRowLink` with a name that already holds «…» (every seeded name, e.g. «Притулок «Добрі лапи»») reads «Сторінка притулку «Притулок «Добрі лапи»»». · `kabinet.profileEdit.state.failed` «…на картках нічого не змінилося» also shows for the voice section, whose sentence is not on the cards. · A shelter-specific 404 wording (T4). | - | Used as written. | - | for his eye |
