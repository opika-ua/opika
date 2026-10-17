# K2 copy sheet: the animal list (`/kabinet/tvaryny`)

Every user-facing string K2 (PR 5 of the K milestone) needs. One sheet per PR, sent at its start
(K-Q13). The English says what is true in code at `1b2b3d3` (main), or will be once PR 4 and PR 5
build what `docs/k3-draft-shapes.md` and this sheet describe. "Mock" means a designer's draft, not
approved copy. **No Ukrainian in this file is new:** every Ukrainian string is quoted from the
mock, KABINET.md, his final K3/K4/R-UI text or `uk.ts`, with its source.

**PR numbering** (K-B1): PR 1 groundwork, PR 2 K4, PR 3 photos, PR 4 K3 form, **PR 5 K2 (this
sheet)**, PR 6 opens writes for every shelter. Until PR 6 only his allowlisted test shelter can
write (K-Q4, K-Q17), so nothing a real shelter reads goes false before then.

**Copy gate.** Under `kabinet.*`, a `[COPY PENDING]` string outside `kabinet.testShelterOnly.*`
turns production sign-in off (CG-B1, `docs/decisions-inbox/feat-k4-profile.md`). Keys are proposed
as `kabinet.animalList.*` and `kabinet.nav.*`. Any still pending when PR 5 merges sit under
`kabinet.testShelterOnly.animalList.*`, and the part of the screen that reads them mounts from
`apps/web/src/features/kabinet/test-shelter-only/`. PR 6 refuses to merge while any remains
(`docs/pr6-checklist.md` §3). Each key needs its `en.ts` twin (`messages.test.ts` parity).

**Sources.**
- `KAB` = `docs/design/KABINET.md`. K2 is KAB:131-175, rule 4 KAB:55-56, N3-N5 KAB:380-382,
  N15 KAB:392, N18 KAB:395.
- `MOCK:28` = `docs/design/Opika Kabinet.dc.html` line 28 (the K2 1440 frame). `MOCK:29` = line 29
  (K2 360, the empty and loading frame at 1440, the empty frame at 360). `MOCK:33` = the S3 reason
  dialog, N15's template.
- `K3UK` = `D:\opika-worktrees\k3-copy-uk.md`, his final K3 Ukrainian (outside the repo; the keys
  land with PR 4). `K3CS` / `K3DS` = `origin/feat/k3-form:docs/k3-copy-sheet.md` /
  `docs/k3-draft-shapes.md`.
- `RUI` = `D:\opika-worktrees\rui-copy-uk.md`, his final R-UI Ukrainian (lands with R-UI 1-3).
- `uk:N` = `packages/i18n/src/messages/uk.ts` line N at `1b2b3d3`.
- `D4` = his answer to K3DS §12 D4 (2026-10-17, due in PR 4's inbox file), verbatim: "D4 / RH-B7:
  approved, option (i), with your §7.3 wording for commitment #7 as written. B1/B2 copy still due
  by PR 6."
- The mock's apostrophes are U+0027. His rule for his strings is U+02BC (K4-B4, answer 3).

**His rules this sheet applies** (K3UK, header and answers 2-5, verbatim): "No «ми», no
«адоптери», no «реєстр» except the explicit state register (Q5). Pronoun-free for the animal (Q2)."
· "2. Pronoun-free wording everywhere. No sex-keyed variants." · "3. «ті, хто шукає тварину» (or
«люди» where shorter). Never «адоптери»." · "4. Rewritten below: the site is the subject («сайт»),
or impersonal / passive forms." · "5. «реєстр» is allowed ONLY as the explicit name of the state
register: «державний реєстр тварин»."

**Mock strings flagged** (each detailed in its row):
- «Адоптери бачать на них…» (stale strip): «адоптери»; one day count for several cards; names
  only «Ще шукає».
- «Від вашої картки нічого не вимагаємо одразу: назва й фото достатні для чернетки…» (empty
  state): «ми» voice, and false (K-Q5: a name and a species make a draft; no photo is needed).
- «Додайте першу — вона з'явиться в галереї… До того її бачите лише ви.» (empty state):
  pronouns; «бачите лише ви» false (F-B2); "appears at once" true only for a verified shelter.
- «Собака · дівчинка · середня · 2 роки · у волонтерки, Бровари» (row meta): size words agree
  with the animal's sex; no surface prints an age in years, and the row carries no age; fostered
  animals are out of scope (K-Q10) and the row carries no location; «волонтерки» is gendered.
- «Ще не опубліковано · бракує фото» (draft row): the gap list is wider since K-Q5/F-B1;
  «Ще не опубліковано» is false for a draft restored after a withdrawal.
- «Порядок у публічній галереї — дата й повнота картки…» (rule 4): false (the gallery orders by
  date only), superseded by F-B3, which is itself flagged back (F-T1).
- «Показати ці 3» (stale strip): no list filter backs it today.
- «Домовляються» as the reserve button: the same word as the status chip.
- «реєстр»: none in K2's mock strings.

---

## 0. What K2 can do (the facts the copy must match)

| Fact | Code |
|---|---|
| The list: one page of the shelter's animals, most recently edited first (keyset on `last_updated_at`, `id`; HS-T8), optionally filtered by one listing kind, with per-kind counts and `staleCount` | `packages/contracts/src/kabinet/procedures.ts:324-341`; `packages/db/src/repos/kabinet-animal-repo.ts:296-365`; `apps/web/src/kabinet/handlers/animals.ts:273-291` |
| A row carries id, name, species, sex, size, the listing (its dates; a withdrawal's code and note), `lastUpdatedAt`, the cover photo, freshness (published or reserved only) and the publish gaps. **No age, no foster location, nothing about anyone's engagement** (commitment #2) | `packages/contracts/src/kabinet/views.ts:24-37`; `animals.ts:81-97` |
| Stale = published or reserved with a confirmation more than 30 whole days old, the same cut the pips use (`agingMaxDays` 30) | `animals.ts:265-271`; `kabinet-animal-repo.ts:353-365`; `packages/domain/src/discovery/freshness.ts:40-43` |
| Moves (`shelter.animals.transition`): draft → publish (every gap closed); published → reserve, adopt, withdraw; reserved → release, adopt, withdraw; withdrawn → restore to draft. Adopted is terminal (H2-7: a returned animal is a new card). Draft → withdrawn is closed: a draft is deleted | `packages/domain/src/animals/listing-transition.ts:121-207`; `procedures.ts:306-313, 371-376` |
| No listing move touches `lastUpdatedAt` (HS-T9), so a move never reorders K2. Reserve and release keep the confirmation date. Restore to draft drops `publishedAt`: publishing again starts the waiting time and the date over | `animals.ts:220-225`; `listing-transition.ts:128-145` |
| A withdrawal needs one of five codes and takes an optional note. The note stays on the listing, never in history (K-Q18). Restoring to draft drops it | `packages/domain/src/animals/listing.ts:8-29`; `animals.ts:428-445` |
| «Ще шукає» / «Ще домовляються» = `confirm`: one animal per call, sets the date to now, answers `undoUntil`. Not recorded in history (K-B2, S1) | `animals.ts:450-473`; `procedures.ts:377-381` |
| Undo: the server window is 13 s (the screen's 8 + 5 of slack). It restores the exact previous date. `UNDO_EXPIRED` past the window or after any newer write to the listing; `ILLEGAL_TRANSITION` if the card left the visible states meanwhile. **With RH-B7** (D4 (i), built in PR 4) a photo add, reorder or removal on a published or reserved card is such a write: it sets the date and clears the undo | `listing-transition.ts:36-42, 93-119, 253-276`; K3DS §7.2-§7.3 |
| Delete: a never-published draft only. A draft that was ever published, or one a swipe or reveal references, gets **one** answer, `WAS_PUBLISHED`, with no data (K-Q9). A non-draft gets `ILLEGAL_TRANSITION`. Recorded as `animal_deleted` with the name. The photo files stay in R2: nothing deletes objects (P-Q14) | `animals.ts:493-533`; `kabinet-animal-repo.ts:269-294` |
| Who can see a card: published or reserved listings of a **verified** shelter only. Paused, pending, under review, rejected and suspended shelters' animals are hidden. The kabinet lets a shelter of any status publish | `packages/domain/src/shelters/verification/state.ts:149-155`; `packages/db/src/repos/feed-predicate.ts:43-55`; `apps/web/src/kabinet/access.ts:210-269` (no status check) |
| The paused banner's data comes from `shelter.profile.get` (`verification.status`, `since`, `reason`). Resume is `shelter.profile.resume`, with no dialog (only pausing opens one, KAB:242-247) | `views.ts:67-78`; `shelter-facing.ts:14-21` |
| Errors a K2 call can get: `UNAUTHENTICATED`, `FORBIDDEN` (another shelter's id, or a support view writing), `NOT_FOUND`, `ILLEGAL_TRANSITION`, `PUBLISH_REQUIREMENTS_UNMET` (with every gap), `UNDO_EXPIRED`, `WAS_PUBLISHED`, `INVALID_CURSOR`, and `SHELTER_WRITES_NOT_YET_AVAILABLE` until PR 6. The route's limiters answer a **plain HTTP 429**, not an oRPC error (100 a minute per user, 300 per IP) | `procedures.ts:122-138, 317-389`; `apps/web/src/kabinet/rpc-route.ts:34, 112, 134`; `apps/web/src/kabinet/rate-limits.ts:23-24` |

---

## 1. Reused as-is (no new key)

| Existing key | Text | Used in K2 for |
|---|---|---|
| `kabinet.listingStatus.draft` / `.published` / `.reserved` / `.adopted` / `.withdrawn` (PR 4, K3UK §2) | «Чернетка» · «Опубліковано» · «Домовляються» · «Удома» · «Знято з показу» | the row's status chip (N3) |
| `kabinet.animalForm.publish.button` (PR 4) | «Опублікувати» | a draft row's forward action |
| `kabinet.animalForm.publish.missing` + `publish.gap.size` / `.age` / `.description` / `.photo` (PR 4) | «Щоб опублікувати, ще потрібно: {list}.» / «розмір» «вік» «опис» «фото» | written next to a draft row's disabled «Опублікувати», which stays focusable (KAB:93, KAB:149), and the `PUBLISH_REQUIREMENTS_UNMET` answer. Replaces the mock's «бракує фото» (§4) |
| `kabinet.animalForm.publish.done` (PR 4) | «Опубліковано. Тепер картку бачать ті, хто шукає тварину.» | live region after a row publish. ⚠ **True only while the shelter is verified** (§0; Q5) |
| `kabinet.animalForm.publish.stateChanged` (PR 4) | «Картка змінилася в іншому вікні. Оновіть сторінку, щоб побачити поточну версію.» | any `ILLEGAL_TRANSITION` from a row move, a confirm, an undo or a delete |
| `kabinet.animalForm.errors.notFound` (PR 4) | «Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.» | `NOT_FOUND`, and `FORBIDDEN` on another shelter's id (same words, as K3 decided) |
| `kabinet.animalForm.draft.notVisible` (PR 4, F-B2) | «Ті, хто шукає тварину, цю чернетку не бачать.» | proposed for the draft row's status line (Q9) |
| `kabinet.animalForm.who.sexMale` / `.sexFemale` (PR 4) | «Хлопчик» / «Дівчинка» | the row's meta line (the mock lowercases them) |
| `kabinet.profileNotRecorded` (uk:961) | «Не записано» | an unknown sex in the meta line (the standing rule: unknown reads «Не записано») |
| `detail.speciesDog` / `.speciesCat` (uk:306-307) | «Собака» / «Кіт» | the meta line |
| `filters.sizeSmall` / `.sizeMedium` / `.sizeLarge` (uk:149-151) | «Малий» / «Середній» / «Великий» | the meta line: the labels K3's size segments use, never sex-agreeing forms (Q6) |
| `cardMeta.ageBaby` … `.ageSenior` (uk:471-474), via `ageBucketLabel` | «малюк» … «літній» | the meta line's age, if the row gains `age` (§13, P3). The masculine-only gap is his recorded follow-up (K3UK answer 9) |
| `freshness.updatedAgo` via `freshnessLabel` (uk:251; `packages/ui/src/freshness-display.ts:54-57`) | «Оновлено {days}» | the freshness cell on both widths. Follows K-Q14 |
| `kabinet.profile.title` (uk:891) | «Профіль притулку» | the second nav item |
| `kabinet.profile.role`, `.signOut`, `kabinet.support.*`, `kabinet.shell.label` | (as shipped) | header and support mode, unchanged |
| `kabinet.profileEdit.pause.pausedLine` + `pause.reason.*` (uk:1098, 1104-1110) | «Прийом на паузі з {date} · {reason}» | the N18 banner's line (P2) |
| `kabinet.profileEdit.pause.resumeButton` (uk:1096) | «Відновити прийом тварин» | the N18 banner's button |
| `kabinet.profileEdit.pause.resumed` (uk:1124) | «Прийом відновлено. Ваших тварин знову видно.» | live region after resuming from the banner. True: resume returns the shelter to verified |
| `kabinet.profileEdit.errors.illegalTransitionResume` (uk:1029-1030) | «Звідси прийом зараз не відновити: статус притулку змінився. Напишіть мені.» | resume refused from the banner |
| `kabinet.profileEdit.pause.reasonLabel` / `.reasonPlaceholder` / `.noteLabel` / `.noteHint` (uk:1102-1103, 1111, 1118-1119) | «Причина» / «Оберіть причину» / «Коментар» / «Коментар бачите ви, інші адміністратори притулку і я. Людям, які шукають тварину, він не показується.» | the withdraw dialog's fields (P6). `noteHint` is true of the withdrawal note as well: K2 rows show it to the shelter's admins and to the operator's support view, and no public view carries a withdrawn animal at all |
| `kabinet.profileEdit.pause.cancel` / `.close` (uk:1121-1122) | «Скасувати» / «Закрити» | every K2 dialog's secondary button and ✕ |
| `kabinet.profileEdit.state.retry` (uk:1021) | «Спробувати ще раз» | after a failed list load or action |
| `kabinet.profileEdit.errors.notAvailable` (uk:1031) | «Змінювати дані в кабінеті поки не можна — для цього напишіть мені.» | `SHELTER_WRITES_NOT_YET_AVAILABLE` if the policy changes while K2 is open (until PR 6; its fate is pr6-copy-sheet Q8) |
| `kabinet.verificationDecision.suspendedEffect` / `.rejectedEffect` (R-UI 3, RUI §3.4; only if R-UI 3 merges first) | «Поки притулок призупинено, його тварин немає в галереї.» / «Тварин притулку не буде в галереї, доки перевірку не пройдено.» | the not-visible line (§9, Q5) |

`profileEdit.*` keys reused here live under K4's namespace. A shared `kabinet.form.*` home is tidier
once K2 and K3 both reuse them: a rename, no new copy.

---

## 2. Page, header, nav

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.pageTitle` | Animals | `<title>` | — | «Тварини» (MOCK:28, KAB:132) |
| `animalList.title` | Animals | page heading | — | «Тварини» (MOCK:28-29) |
| `animalList.caption` | {shelter} · {count} cards in the list (every state, adopted and withdrawn included) | under the heading | `{shelter}` display name; `{count}` sum of `counts`; the noun needs three forms (`pluralizeUk`, `packages/domain/src/primitives/plural.ts`) | «Притулок «Домівка» · 14 тварин» (MOCK:28); «… · 0 тварин» (MOCK:29). Only the «many» form exists. ⚠ The count includes adopted and withdrawn cards; «тварин» reads as animals at the shelter now (Q6) |
| `animalList.add` | Add an animal | header primary, opens `/kabinet/tvaryny/nova` (K3) | — | «Додати тварину» (MOCK:28, KAB:132) |
| `animalList.addShort` | Add | the same at 360 | — | «Додати» (MOCK:29) |
| `kabinet.nav.label` | Cabinet sections | the nav landmark's name. Today it is `profile.title` (`ShelterProfile.tsx:118-120`), wrong once the nav holds two items | — | no draft |
| `kabinet.nav.animals` | Animals | nav item and phone tab | — | «Тварини» (MOCK:28-29; KAB:115) |

## 3. Filter chips (inventory counts, KAB:133)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.filter.label` | Show | the chip group's accessible name | — | no draft |
| `animalList.filter.all` | All | chip | — | «Усі» (MOCK:28) |
| `animalList.filter.draft` | Drafts | chip | — | «Чернетки» (MOCK:28) |
| `animalList.filter.published` | Published | chip | — | «Опубліковано» (MOCK:28) |
| `animalList.filter.reserved` | Arranging | chip | — | «Домовляються» (MOCK:28) |
| `animalList.filter.adopted` | Home | chip | — | «Удома» (MOCK:28) |
| `animalList.filter.withdrawn` | Withdrawn from display | chip | — | «Знято» (MOCK:28). ⚠ His chip label is «Знято з показу» (K3UK §2): one wording for the state (Q7) |
| `animalList.filter.withCount` | {label} · {count} | each chip | `{label}`, `{count}` from `counts` (inventory, not engagement) | «Усі · 14», «Чернетки · 2» (MOCK:28) |

## 4. The row

**Meta line:** species · sex · size · age, joined with « · » and omitting what is absent (no key:
the parts are §1's labels). A draft's missing size or age goes in the gap line, never as
«не записано»: a gap isn't an answer. The mock's «2 роки» and «у волонтерки, Бровари» are dropped
(§0; Q6).

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.row.draftStatus` | Not published | draft row, first line of the freshness cell | — | «Ще не опубліковано» (MOCK:28, KAB:149). ⚠ **False for a draft restored after a withdrawal** (it was published before; `first_published_at` is set). Q9 |
| (reused) | To publish, this still needs: {list}. | draft row with gaps, second line | — | `animalForm.publish.missing`. The mock's «бракує фото» (MOCK:28-29) predates K-Q5 and names the photo only |
| `animalList.row.adoptedSince` | Home since {date} | adopted row | `{date}` `adoptedAt`, `Intl` day and month (the year added when it isn't the current one) | «Удома з 12 вересня» (MOCK:28, KAB:152) |
| `animalList.row.withdrawnOn` | Withdrawn on {date} · {reason} | withdrawn row | `{date}` `withdrawnAt`; `{reason}` the code's label (§6), then the shelter's note in «…» when there is one | «Знято 2 жовтня · «переїхав в інший притулок»» (MOCK:28, KAB:153): the mock shows a sample note only; its «переїхав» is the shelter's own words |
| `animalList.row.more` | More | «Ще ▾» menu button (the ▾ is a glyph, hidden from screen readers) | — | «Ще ▾» (MOCK:28-29) |
| `animalList.actions.edit` | Edit | menu, every state (opens K3) | — | no draft |

Published and reserved rows show the pips and `freshnessLabel` (§1). Which actions a row offers:

| State | Forward action | «Ще ▾» menu |
|---|---|---|
| draft | «Опублікувати» (disabled with the gap line while gaps remain) | edit; delete draft (only where it can work, P8) |
| published | reserve (§6) | edit; «Уже вдома»; withdraw |
| reserved | «Уже вдома» | edit; release; withdraw |
| adopted | none | edit |
| withdrawn | «Повернути в чернетки» | edit |

## 5. «Ще шукає» / «Ще домовляються» and the 8-second undo (N4)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.confirm.stillLooking` | Still looking: confirms this animal is still looking for a home; the card's date becomes today. One animal per tap; there is no "confirm all" (commitment #7, KAB:157-161) | published row, under the freshness marker | — | «✓ Ще шукає» (MOCK:28, KAB:150). The ✓ is a glyph, hidden from screen readers (P4) |
| `animalList.confirm.stillArranging` | Still arranging: confirms the arrangement still stands; the card's date becomes today | reserved row | — | «✓ Ще домовляються» (MOCK:28, KAB:151) |
| `animalList.confirm.done` | Confirmed today | the cell for 8 s after a confirm | — | «✓ Підтверджено сьогодні» (MOCK:28, KAB:158). Its word vs the public «Оновлено» follows K-Q14 |
| `animalList.confirm.undo` | Undo · {seconds} s | button beside `confirm.done`, counting down from 8. The server accepts it up to 13 s (`UNDO_WINDOW_MS`), so a tap at the last second still lands | `{seconds}` | «Скасувати · 8 с» (MOCK:28, KAB:158) |
| `animalList.confirm.undone` | Undone: the card's date is back to what it was | live region after a successful undo (the exact previous date, H2-16) | — | no draft |
| `animalList.confirm.undoExpired` | Too late to undo: the card changed after this confirmation, or the time ran out. Its date stays today | `UNDO_EXPIRED`. Reached past the 13 s window, or after a newer write to the listing; **since RH-B7, a photo change on this card in K3 during the 8 s is one** (§0). In every case the date is today: the confirm or the photo change set it. Says nothing about who changed it | — | no draft |
| `animalList.confirm.failed` | Not confirmed: the card's date hasn't changed. Check the connection and try again | after a failed confirm. When no answer arrived at all, K2 re-reads the row first (K4-T16's pattern) and shows this only if the date really didn't move | — | no draft |

An undo refused with `ILLEGAL_TRANSITION` (the card was withdrawn or adopted meanwhile) uses
`publish.stateChanged`.

## 6. Listing moves

Only moves that take an animal out of view confirm in N15's dialog (KAB:155): adopt and withdraw.
Reserve, release, restore and publish act on one tap.

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.actions.reserve` | Mark as arranging: the card stays visible (the gallery card carries «Уже домовляються», uk:438; `AnimalCard.tsx:195`), and its date and waiting time don't change | published row, forward action | — | «Домовляються» (MOCK:28, KAB:150). ⚠ The chip's status word used as a button (Q7) |
| `animalList.actions.release` | The arrangement fell through: show as looking again. Keeps the date and the waiting time | reserved row, menu | — | no draft. **The mock has no control for it**; without one a fallen-through reservation could only be withdrawn and restored, which restarts the waiting time (P9) |
| `animalList.actions.adopt` | Home | reserved row (forward), published row (menu) | — | «Уже вдома» (MOCK:28, KAB:151) |
| `animalList.adoptDialog.title` | «{name}» is home? | N15 dialog, no reason field (`adopt` takes none) | `{name}` | no draft (template «Відхилити «Ірпінь-Хвіст»?», MOCK:33) |
| `animalList.adoptDialog.body` | The card leaves the gallery and the deck, and its page then says it is gone. It stays in your list as «Удома». This can't be undone: if the animal comes back, add it as a new card | dialog body. True: adopted is terminal (H2-7); public reads refuse a non-visible listing; the page answers `detail.notFound` (uk:311, itself «реєстр» hit #18 in `origin/docs/r-ui-scope:docs/copy-reyestr-hits.md`). A deck already loaded on someone's screen keeps the card until it reloads, but its reveal is refused | `{name}` | no draft. Q8 |
| `animalList.adoptDialog.confirm` | Yes, home | dialog primary (black) | — | no draft |
| `animalList.actions.withdraw` | Withdraw from display | published or reserved row, menu | — | no draft. Nearest wording: his F-B4 «зняти з показу» and his chip «Знято з показу» |
| `animalList.withdrawDialog.title` | Withdraw «{name}» from display? | N15 dialog | `{name}` | no draft |
| `animalList.withdrawDialog.body` | People looking won't see the card any more, and its page says it is gone. It stays in your list, and you can move it back to drafts; publishing it again starts its waiting time and its date from that day | dialog body (`listing-transition.ts:134-135, 198-199`) | — | no draft (S3's «Притулок побачить цю причину дослівно…», MOCK:33, is the operator's dialog) |
| `animalList.withdrawDialog.confirm` | Withdraw | dialog primary (black) | — | no draft |
| `animalList.withdrawReason.adopted_elsewhere` | found a home another way | select option; also the row's `{reason}` | — | no draft (`docs/h2-copy-sheet.md` D lists all five with no Ukrainian; F-B4, verbatim: "Withdrawal reason labels come with the K2 sheet."). Q10 |
| `animalList.withdrawReason.transferred` | moved to another shelter | same | — | no draft |
| `animalList.withdrawReason.deceased` | died | same | — | no draft. Tone: Q10 |
| `animalList.withdrawReason.listing_error` | listed by mistake | same | — | no draft |
| `animalList.withdrawReason.other` | other | same | — | no draft |
| `animalList.actions.restore` | Back to drafts | withdrawn row, forward action | — | «Повернути в чернетки» (MOCK:28, KAB:153) |
| `animalList.moved.reserved` / `.released` / `.adopted` / `.withdrawn` / `.restored` / `.published` | «{name}»: arranging / looking again / home / withdrawn / back in drafts / published | polite live region after each move (`.published` is `animalForm.publish.done` where that is true, Q5) | `{name}` | no draft |

No reason chosen in the withdraw dialog: the select is marked invalid and focused, with no message
(K4-T17's precedent; «Оберіть причину» is already its placeholder).

## 7. Deleting a draft (commitment #2, K-Q9)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.actions.deleteDraft` | Delete draft | draft row, menu (P8: only where it can work) | — | no draft. Nearest wording: his R-UI history line «Видалено чернетку: {name}» (RUI:125) |
| `animalList.deleteDialog.title` | Delete the draft «{name}»? | N15 dialog, no reason field | `{name}` | no draft |
| `animalList.deleteDialog.body` | It disappears from your list for good | dialog body | — | no draft |
| `animalList.deleteDialog.photosStay` *(Q8)* | Its photo files aren't deleted at once; write to me if they must go | dialog body, only when the draft has photos. True: nothing deletes R2 objects (P-Q14), and a draft's photos are public files at unguessable addresses (F-B2) | — | no draft. Precedent, his K3 text: «Фото зникло з картки. Сам файл не видаляється одразу — якщо його треба прибрати зовсім, напишіть мені.» (K3UK §7, `photos.removedStillReachable`) |
| `animalList.deleteDialog.confirm` | Delete | dialog primary (black) | — | no draft |
| `animalList.deleted` | Draft «{name}» deleted | polite live region | `{name}` | no draft |
| `kabinet.deleteDraft.refused.wasPublished` (E3's key, `docs/h2-copy-sheet.md:212-228`) | This card has been published before, so it can't be deleted. It stays in your list as a draft, and people looking don't see it | `WAS_PUBLISHED`, the one answer for both causes. **Nothing in it may vary with whether anyone swiped or asked about the animal** (commitment #2's watch item, `docs/standing-constraints.md:354`) | — | His direction (F-B4, verbatim): "E3 direction per K-Q9: «Цю картку вже публікували, тож видалити її не можна — лише зняти з показу.»" ⚠ **F-T2, open:** the refusal only ever reaches a draft, and a draft can't be withdrawn (`draft → withdrawn` closed) and is already not shown. «лише зняти з показу» offers a move that doesn't exist there. Q2 |

## 8. The stale strip (N5, KAB:163-166)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.stale.count` | {count} cards haven't been confirmed for more than 30 days | strip heading, only when `staleCount` > 0 | `{count}`, with three noun forms (`pluralizeUk`). The «30» is typed: pin it to `DEFAULT_FRESHNESS_POLICY.agingMaxDays` as `copy-plural-pins.test.ts` pins the TTLs | «3 картки ви не підтверджували понад 30 днів.» (MOCK:28-29). True: stale means a confirmation older than 30 whole days. With RH-B7 a photo change counts as one |
| `animalList.stale.caption` | People looking see an old date on them. If nothing has changed, a tap on «Ще шукає» or «Ще домовляються» is enough | strip caption | — | «Адоптери бачать на них «оновлено 41 день тому». Якщо нічого не змінилось — достатньо «Ще шукає».» (MOCK:28-29). ⚠ «Адоптери»; one day count for several cards, each with its own; «оновлено» follows K-Q14; reserved cards count too, and theirs is «Ще домовляються»; "people see" is false while the shelter isn't visible (§9). Q4 |
| `animalList.stale.show` | Show these {count} | strip button: filters the list to the stale cards (P7) | `{count}` | «Показати ці 3» (MOCK:28-29) |
| `animalList.stale.showAll` | Show all | leaves that filter | — | no draft |

## 9. When nobody can see the cards (N18 and the other states)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| (reused) | Intake paused since {date} · {reason} | N18 banner, paused only, above everything | — | `profileEdit.pause.pausedLine`. The mock's «Прийом тварин на паузі · {причина}» (KAB:136) is superseded by his K4 line (P2) |
| `animalList.paused.hidden` | While intake is paused, people looking don't see your animals | banner, second line: says why (KAB:138-139, "never be left wondering why") | — | His own sentence, the first of `profileEdit.pause.dialogBody` (uk:1100-1101): «Поки прийом на паузі, ваших тварин не бачать ті, хто шукає.» Reused as a key of its own if he agrees (Q5) |
| (reused) | Resume taking animals | banner button; no dialog (KAB:242-247) | — | `profileEdit.pause.resumeButton`. Mock: «Відновити» (KAB:136) |
| `animalList.notVisible.pending` | Your animals appear to people looking once verification is finished | banner, pending or under review | — | no draft. KABINET designs no such state for K2. His R-UI `rejectedEffect` («Тварин притулку не буде в галереї, доки перевірку не пройдено.») reads true here too (Q5) |
| (reused) | — | suspended / rejected | — | R-UI's `suspendedEffect` / `rejectedEffect` (§1), if R-UI 3 has merged |

## 10. The ordering sentence (KAB:55-56, commitment #1)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.orderNote` | Order in the public gallery is by date (most recently confirmed first, or longest waiting first, as the person chooses); card completeness affects only the order in the deck. Nothing here changes it, and there is no promotion | under the list | — | KAB:56: «Порядок у публічній галереї — дата й повнота картки. Тут його не можна змінити, і просування немає.» ⚠ False: the gallery orders by date only (`gallery-repo.ts` doesn't call `scoreAnimal`). His rewrite (F-B3, verbatim): "F3: K2 rewrite = «Порядок у галереї — за датою оновлення. Повнота картки впливає лише на порядок у стрічці.»" ⚠ **F-T1, open:** there are two date sorts (`freshest` by `last_confirmed_at`, `longest_waiting` by `wait_anchor_at`), and «оновлення» is K-Q14's open word. Q3 |

K2's own order (most recently edited, HS-T8) is not the gallery's; nothing here describes it.

## 11. Empty, loading, more, filter-empty

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.empty.title` | No animals here yet | empty card | — | «Тут поки немає тварин.» (MOCK:29, KAB:172) |
| `animalList.empty.body` | Add the first one. People looking don't see it until you publish it | empty card | — | «Додайте першу — вона з'явиться в галереї, щойно ви натиснете «Опублікувати». До того її бачите лише ви.» (MOCK:29). ⚠ «вона», «її»: pronouns (his answer 2); «бачите лише ви» false (F-B2: other admins and the operator's support view see drafts, and a draft's photos are public files at unguessable addresses); "appears as soon as you press" true only while the shelter is verified (Q5) |
| `animalList.empty.add` | Add the first animal | empty primary, opens K3 | — | «Додати першу тварину» (MOCK:29, KAB:173) |
| `animalList.empty.caption` | A name and a species are enough to save a draft; the rest can be added later | empty caption | — | «Від вашої картки нічого не вимагаємо одразу: назва й фото достатні для чернетки, решту можна дописати пізніше.» (MOCK:29, KAB:173). ⚠ «вимагаємо»: «ми» voice; **false**: K-Q5 makes a draft from a name and a species, with no photo; «назва» where K3 says «Імʼя». His true sentence for the fact: «Щоб зберегти чернетку, потрібні імʼя та вид.» (K3UK §9, `draft.notSavedYet`) |
| `animalList.loading` | Loading | the `aria-busy` region's name (skeleton rows, no shimmer, KAB:174) | — | «Завантаження» (MOCK:29) |
| `animalList.loadMore` | Show more | after the last row while `nextCursor` is set (keyset) | — | no draft |
| `animalList.filterEmpty` | No cards in this group | a filter with no rows | — | no draft |
| `animalList.loadFailed` | The list didn't load. Check the connection and try again | read failure, with `profileEdit.state.retry` | — | no draft (K3's `errors.loadFailed` speaks of one card) |

`INVALID_CURSOR` reloads from the top with no message.

## 12. Errors

| Key | English sense | What triggers it | Vars | Mock draft |
|---|---|---|---|---|
| `animalList.errors.rateLimited` | Too many actions in a short time. Wait a moment and try again | the route's plain HTTP 429 (100 a minute per user) | — | no draft |
| `animalList.errors.actionFailed` | That didn't go through. Check the connection and try again | network failure or 5xx on a move or delete. After a lost answer K2 re-reads the row (K4-T16) and reports what is actually stored | — | no draft |
| (reused) | | `ILLEGAL_TRANSITION`, `NOT_FOUND`/`FORBIDDEN`, `SHELTER_WRITES_NOT_YET_AVAILABLE`, `PUBLISH_REQUIREMENTS_UNMET` | | §1 |

---

## 13. Code facts PR 5 must settle (proposed, reversible; "Decisions taken" in PR 5)

- **P1. Who sees K2 before PR 6.** K2's route and nav item render for a write grant and for a
  support view (every action disabled, S5); every other shelter keeps today's `/kabinet`
  (K4-T2's precedent). A read-only K2 would point at buttons it doesn't have (§8's caption, §11).
- **P2.** N18 reuses his K4 `pausedLine` and `resumeButton`, not the mock's shorter pair.
- **P3. The row gains `age`** (a `pick`, inventory), so the meta line can print the card's bucket
  word; and **`everPublished`** (from `first_published_at`), so the menu offers «Видалити
  чернетку» only where it can work and the draft line can be true (Q9). Neither says anything
  about adopters: `first_published_at` records the shelter's own publish.
- **P4.** Glyphs (✓, ▾) stay out of the strings and are hidden from screen readers. Repeated row
  buttons get the animal's name through `aria-describedby`, so no template key.
- **P5.** `freshnessLabel` on both widths (the 360 mock drops «оновлено»).
- **P6. The withdrawal note**: K4's «Коментар» label and `noteHint`; **capped at 2,000 characters,
  trimmed, blank meaning none.** Today `WithdrawalReasonSchema.note` is `min(1)` with no maximum and
  no trim (`listing.ts:25-28`), and `KabinetListingEventInputSchema` takes it as is
  (`procedures.ts:311`): a whitespace-only or unbounded note is accepted. Same fix as the pause
  note's (K4-T15).
- **P7. «Показати ці N»** needs a stale filter on `shelter.animals.list` (a read; today the input
  is `listing`, `cursor`, `limit` only). Filtering the loaded page on the client would miss stale
  cards on later pages.
- **P8.** «Видалити чернетку» shown only on drafts with `everPublished` false. `WAS_PUBLISHED`
  stays handled (a pre-PR 1 swipe on a draft can still cause it, K-T1).
- **P9. Release** goes in the reserved row's menu though the mock has no control for it.
- **P10.** `listed.dateUnchanged` (K3UK §10: «…Її змінює ваше підтвердження в списку тварин і
  будь-яка зміна фото.») becomes true with K2's buttons: if PR 4 parked it under
  `testShelterOnly`, PR 5 moves it to `kabinet.animalForm.listed.dateUnchanged` (his note there,
  verbatim: "If K2's confirmation buttons aren't shipped yet when PR 4 merges, this line waits
  under testShelterOnly until PR 5.").

## 14. Strings elsewhere that K2 changes

| Key / source | What changes | When |
|---|---|---|
| `kabinet.animalForm.listed.dateUnchanged` (PR 4) | Becomes true (P10) | PR 5 |
| `forShelters.whenAnimalFindsHome` §9 ¶3 (commitment #6) | K2 ships «Уже вдома», but writes stay closed outside the allowlist, so «напишіть, і я приберу» stays true for every real shelter | PR 6 (`docs/pr6-checklist.md` §6) |
| KAB:56 (rule 4), KAB:164-165 (stale caption), KAB:173 (empty caption: "a name and a photo are enough for a draft") | Design doc, not copy: false as written (§8, §10, §11) | KABINET.md note with PR 5 |

Still true: commitment #2 (rows carry inventory only, `views.ts:24`; one delete refusal); commitment
#1 (no ordering input in K2); `freshness.attribution`.

---

## 15. Questions for Oleksii (brand voice and public claims; one batch at PR 5's start)

1. **The Ukrainian** for every key above marked "no draft" or quoting the mock. Recommend the
   batch as for K3.
2. **Delete refusal (E3; F-B4 flagged back as F-T2).** Recommend keeping your first clause
   («Цю картку вже публікували, тож видалити її не можна») and replacing «— лише зняти з показу»
   with the fact that, as a draft, people looking don't see it. One answer for both causes (K-Q9).
3. **Ordering sentence (F-B3 flagged back as F-T1).** Recommend wording true for both gallery
   sorts, without «оновлення» until K-Q14 is decided; keep your completeness clause.
4. **Stale strip caption.** Recommend «ті, хто шукає тварину» for «Адоптери», no single day count,
   both buttons named, and its date word following K-Q14.
5. **Cards nobody can see.** A pending, under-review, paused or suspended shelter can publish, but
   its cards stay hidden, so the empty state's «з'явиться в галереї, щойно…», your K3
   `publish.done` («Тепер картку бачать…») and the stale caption are false for it. Recommend
   showing those lines only while the shelter is verified, and otherwise one line saying why:
   paused, your «Поки прийом на паузі, ваших тварин не бачать ті, хто шукає.»; suspended or
   rejected, your R-UI lines; pending or under review, your `rejectedEffect` text if it reads true
   to you there, or a new line.
6. **Row meta and header count.** Recommend species · sex · size · age with your K3 segment labels
   (no sex-agreeing size words), the card's age word, no foster part (K-Q10), and a header count
   that says cards, since it includes adopted and withdrawn ones (three plural forms).
7. **Labels.** The filter says «Знято», your chip «Знято з показу»; the reserve button says
   «Домовляються», the chip's own status word. Recommend one wording for the withdrawn state, and
   an action wording for reserve distinct from the status.
8. **Dialog claims.** (a) «Уже вдома» can't be undone (H2-7). (b) Deleting a draft leaves its photo
   files reachable (P-Q14). Recommend saying both, (b) only when the draft has photos, in the way
   your K3 `photos.removedStillReachable` does.
9. **The draft line.** «Ще не опубліковано» is false for a draft restored after a withdrawal.
   Recommend your F-B2 sentence («Ті, хто шукає тварину, цю чернетку не бачать.»), true for every
   draft, or a short "not published" wording true for both.
10. **Withdrawal reasons.** Five labels are needed. `adopted_elsewhere` overlaps «Уже вдома» from
    the shelter's side, and a homed animal withdrawn that way is counted as withdrawn, not adopted.
    `deceased` needs a gentle word. Recommend offering four codes in the dialog (the fifth stays in
    the domain, labelled, for rows that already carry it) and pointing a homed animal to «Уже
    вдома».
