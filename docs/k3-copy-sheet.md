# K3 copy sheet: the animal form (`/kabinet/tvaryny/nova`, `/kabinet/tvaryny/[id]`)

Every user-facing string K3 (PR 4 of the K milestone) needs, for create and edit. One sheet per
PR, sent at its start (K-Q13). The English is a description of what is true, not a draft to
translate. "Mock" means a designer's draft, not approved copy. **No Ukrainian in this file is
new:** every Ukrainian string is either a quotation from the mock or from KABINET.md, with its
source, or a key already in `uk.ts`.

**Copy gate.** Under `kabinet.*`, a `[COPY PENDING]` string outside `kabinet.testShelterOnly.*`
turns production sign-in off (`productionSignInOf`; CG-B1, `docs/decisions-inbox/feat-k4-profile.md`).
So the keys below are proposed as `kabinet.animalForm.*`. If any are still pending when PR 4
merges, they sit under `kabinet.testShelterOnly.animalForm.*` until his text lands, and the
form mounts from `apps/web/src/features/kabinet/test-shelter-only/`. PR 6 refuses to merge while
any pending string remains (CG-B1). Each key also needs its `en.ts` twin, because of the
catalogue-parity and slot-parity tests in `messages.test.ts`.

**PR numbering** (K-B1): PR 1 groundwork, PR 2 K4, PR 3 photo upload, **PR 4 K3 (this sheet)**,
PR 5 K2 list, PR 6 opens writes for every shelter. Until PR 6, only his allowlisted test shelter
can write (K-Q4, K-Q17), so nothing a real shelter reads goes false before then.

**Sources and line refs.**
- `KAB` = `docs/design/KABINET.md`. K3 is KAB:177-219, N9 is KAB:386, N19 is KAB:396.
- `MOCK:30` = `docs/design/Opika Kabinet.dc.html` line 30. It holds both K3 frames (1440 and
  360) and both K4 frames. `MOCK:26` = that file's N-pattern ledger. `MOCK:28`/`MOCK:29` = the
  K2 frames.
- `uk:N` = `packages/i18n/src/messages/uk.ts` line N, as of `a92e8a1`.
- The mock's apostrophes are U+0027 («Ім'я»). His rule for his own strings is U+02BC (K4-B4,
  answer 3), so his final text will differ from the quotes here in that character.

**Brand rule.** His rule, verbatim (RH-B4, `docs/decisions-inbox/docs-rehearsal-retire.md` on
`docs/rehearsal-retire`): "brand rule: no «реєстр» in user-facing copy, as it implies a state
service". His default while he writes exact wording, verbatim (CB-B2, recorded in
`docs/decisions-inbox/fix-copy-no-reyestr.md` on `fix/copy-no-reyestr`, worktree
`D:\opika-worktrees\cp`, not yet committed): "Default rule while I write the exact wording: -
user-facing copy (adopter or shelter) never says «реєстр»; - where it means the website, use
«сайт» or rephrase to «через сайт» / «на сайті»; - where it means the person checking shelters,
use «я» (operator voice: no «ми», no gendered past tense); - where it means the verification
itself, use «перевірка». Don't apply these to the remaining hits until I've confirmed the
wording."

Hits in what K3 would show:
- **«реєстр»:**
  - the mock's read-only line «Сказ уже підтверджено реєстром тварин — цей рядок ви не змінюєте,
    він оновлюється сам.» (MOCK:30);
  - the reused public keys `medical.registry` «Реєстр тварин» (uk:269) and
    `medical.registryConfirmed` «Підтверджено реєстром тварин» (uk:264).

  All three mean the **state** animal registry, which really is a state service. None of CB-B2's
  three cases covers it (Q5).
- **«ми» voice**, which CB-B2 rules out:
  - «Ми зберігаємо саме те, що ви знаєте…»;
  - «Великі фото стискаємо…»;
  - «Завантажуємо · 64%…» (all MOCK:30).
- **«Адоптери»:**
  - «Адоптери побачать…»;
  - «Адоптери так і побачать…» (MOCK:30).

  His K4 text replaced the designer's «адоптер» with «ті, хто шукає тварину» / «люди»
  (`kabinet.profile.intro` uk:894, `profileEdit.donation.previewLabel` uk:1076). F-B2's footer
  uses the same register (Q3).
- **PR 3's own English for P-T8 (4)**, "not a photo the registry accepts", is rewritten below as
  "the site".

**Superseded or false in the mock**, each detailed in its row:
- «бачите лише ви» (F-B2).
- «Здоров'я й документи» and the documents checklist (KAB:211-216).
- [Зроблено | Не зроблено | Не записано] (N19, KAB:199-207).
- «Де живе» (foster, out of scope: K-Q10).
- «JPG, PNG, HEIC · до 10 МБ».
- «На картці — повні слова.».
- «Адоптери побачать: «Молода, близько 2 років».».

---

## 1. Reused as-is (no new key)

| Existing key | Current uk | Used in K3 for |
|---|---|---|
| `detail.speciesDog` / `detail.speciesCat` (uk:306-307) | «Собака» / «Кіт» | species segments; identical to the mock's [Собака \| Кіт] (MOCK:30, KAB:183) |
| `filters.sizeSmall` / `sizeMedium` / `sizeLarge` (uk:149-151) | «Малий» / «Середній» / «Великий» | size segments; identical to the mock (MOCK:30, KAB:185) |
| `filters.ageBaby` … `ageSenior` (uk:153-156) | «Малюк» / «Молодий» / «Дорослий» / «Літній» | the bucket chips' names; the mock adds a range after «·» (section 4) |
| `cardMeta.ageBaby` … `ageSenior` (uk:471-474), through `ageBucketLabel` | «малюк» / «молодий» / «дорослий» / «літній» | the live line's `{label}`: the word the card actually prints (section 4) |
| `kabinet.profileNotRecorded` (uk:961) | «Не записано» | the sex segment for `unknown` (the standing rule's wording; the mock's third segment) |
| `medical.unknown` / `medical.inProgress` (uk:262-263) | «Не записано» / «У процесі» | N19 options 1 and 2; KAB:202-205 says to reuse exactly these keys |
| `medical.shelterDeclared` (uk:265) | «Слова притулку» | the badge a chosen third option renders as (KAB:205-207); the option itself is a new action label |
| `medical.spayNeuter` (uk:268) | «Стерилізація» | field label; identical to the mock |
| `medical.vaccination` (uk:267) | «Комплексне щеплення» | vaccination field label, if Q6 picks the public label (the mock says «Щеплення») |
| `medical.rabies` + `medical.registry` (uk:266, 269), through `vaccinationRow` | «Сказ» / «Реєстр тварин» | the read-only `source: "registry"` row, "reusing `vaccinationRow`'s own existing rabies-badge treatment unchanged" (KAB:208-210). Brand: Q5 |
| `kabinet.profileEdit.state.saving` (uk:1015) | «Збереження…» | autosave and save in progress |
| `kabinet.profileEdit.state.savedAt` (uk:1018) | «Збережено о {time}» | a listed animal's last save (section 10) |
| `kabinet.profileEdit.state.retry` (uk:1021) | «Спробувати ще раз» | autosave retry. The failed photo tile's link is the same words in the mock («Спробувати ще раз», MOCK:30) |
| `kabinet.profileEdit.actions.unsavedLeave` (uk:1012) | «Зміни не збережено. Все одно вийти?» | leaving a listed animal's form with unsaved edits (drafts autosave) |
| `kabinet.profileEdit.errors.conflictReload` (uk:1026) | «Показати поточну версію» | the button next to K3's own conflict message (section 12) |
| `kabinet.profileEdit.errors.notAvailable` (uk:1031) | «Змінювати дані в кабінеті поки не можна — для цього напишіть мені.» | `SHELTER_WRITES_NOT_YET_AVAILABLE`, if the policy changes while the form is open. A shelter outside the allowlist gets no form at all, as with K4-T2 |

`profileEdit.*` keys reused here live under K4's namespace. A shared `kabinet.form.*` home is
tidier once K2 reuses them too: a rename, no new copy.

---

## 2. Page: titles, header, back

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.pageTitleNew` | New animal | `<title>` on `/nova` | — | «Нова тварина» (MOCK:30, 360 header) |
| `animalForm.pageTitleEdit` | {name} | `<title>` on `/[id]` | `{name}` | no draft |
| `animalForm.titleNew` | New animal | page heading before the draft has a name | — | «Нова тварина» (MOCK:30, 360) |
| (no key) | the animal's name | page heading once named | — | the mock's 1440 frame shows the name itself as the heading («Ластівка», MOCK:30) |
| `animalForm.backToList` | ← Animals (back to the list) | header back button, both widths | — | «← Тварини» (MOCK:30, both frames; KAB:111's «← Розділ» pattern) |
| `animalForm.header.createdNotPublished` | Created {when} · not in the gallery yet | header status line, draft | `{when}` relative day, `Intl` | «Створено сьогодні · ще не в галереї» (MOCK:30, 1440) |
| `kabinet.listingStatus.draft` / `.published` / `.reserved` / `.adopted` / `.withdrawn` | the five listing-status chip labels | header chip in K3; the same chips are K2's rows (N3). Shared with PR 5, so not under `animalForm` | — | «Чернетка» · «Опубліковано» · «Домовляються» · «Удома» · «Знято» (KAB:133, KAB:380 N3; «Чернетка» also MOCK:30) |

## 3. «Хто це»: name, species, sex, size

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.who.title` | Who this is | section title | — | «Хто це» (MOCK:30, KAB:183) |
| `animalForm.who.nameLabel` | Name | field label | — | «Ім'я» (MOCK:30) |
| `animalForm.who.nameHint` | The name the shelter calls the animal. One name, no quotes or explanations. | hint under the name | — | «Так її кличуть у притулку. Одне ім'я, без лапок і пояснень.» (MOCK:30, 1440; KAB:183 "one name, no quotes"). ⚠ «її» is feminine, but the sex may be unknown or male (Q2). The hint asks for no quotes; the rule refuses only braces (section 13) |
| `animalForm.who.namePlaceholder` | e.g. a sample name | name placeholder | — | «Наприклад, Ластівка» (MOCK:30, 360) |
| `animalForm.who.speciesLabel` | Species | segment group label | — | «Вид» (MOCK:30) |
| `animalForm.who.sexLabel` | Sex | segment group label | — | «Стать» (MOCK:30) |
| `animalForm.who.sexMale` | Boy | segment | — | «Хлопчик» (MOCK:30, KAB:184) |
| `animalForm.who.sexFemale` | Girl | segment | — | «Дівчинка» (MOCK:30, KAB:184) |
| `animalForm.who.sexMaleShort` / `sexFemaleShort` | short forms at 360; the accessible name stays the full word | phone segments | — | «Хлопч.» / «Дівч.» (MOCK:30, 360; KAB:184). Q8 |
| `animalForm.who.sexShortNote` | (proposed: don't ship) "The card uses the full words." | 360 caption under sex | — | «На картці — повні слова.» (MOCK:30, 360; KAB:184 "the public card shows the full words"). ⚠ **False:** no public surface prints sex. `FeedCardView` carries it and nothing renders it (no `.sex` read under `apps/web/src/features`) |
| `animalForm.who.sizeLabel` | Size | segment group label | — | «Розмір» (MOCK:30) |
| `animalForm.who.sizeNote` | There is no weight field on purpose: a size judged by eye is more accurate than last year's number. | caption under size | — | «Ваги немає свідомо: розмір на око точніший, ніж цифра з минулого року.» (MOCK:30, 1440; KAB:185) |
| `animalForm.who.sizeHintUpTo` | up to {max} kg | under «Малий» | `{max}` = `SIZE_BUCKET_WEIGHT_HINTS_KG.small.maxKg` (10) | no draft (decision #3: the hints guide whoever fills in the listing; weight is never stored) |
| `animalForm.who.sizeHintRange` | {min}–{max} kg | under «Середній» | `{min}` 10, `{max}` 25 (`.medium`) | no draft |
| `animalForm.who.sizeHintFrom` | {min} kg and over | under «Великий» | `{min}` = 25 (`.large.minKg`) | no draft |

The sex control starts on «Не записано» if the draft shape's D2 is taken as recommended (a new
animal's sex defaults to `unknown`, the way its medical facts default to unknown). It starts with
nothing selected if D2 goes the other way, and the publish gap list then gains "sex" (section 11).

## 4. «Вік»

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.age.title` | Age | section title | — | «Вік» (MOCK:30, KAB:186) |
| `animalForm.age.modeLabel` | How you know the age | mode segment group label | — | «Вік» (MOCK:30: the control's label repeats the title) |
| `animalForm.age.modeBirthDate` | We know the birth date | mode segment, desktop | — | «Знаємо дату народження» (MOCK:30, KAB:186) |
| `animalForm.age.modeBucket` | We know the age as of a date | mode segment, desktop | — | «Знаємо вік на певну дату» (MOCK:30, KAB:186) |
| `animalForm.age.modeBirthDateShort` / `modeBucketShort` | short forms | mode segments at 360 | — | «Дата народження» / «Вік на дату» (MOCK:30, 360; KAB:187) |
| `animalForm.age.modeNote` | Both ways are equally good. The site keeps exactly what you know and works the age out from it as time passes. | caption under the mode control | — | «Обидва способи рівноцінні. Ми зберігаємо саме те, що ви знаєте, і рахуємо вік далі самі.» (MOCK:30). The fact is true (the bucket is derived at read time, `ageBucketOf`, decision #4). ⚠ «Ми» (CB-B2, Q4) |
| `animalForm.age.birthDateLabel` | Birth date | date input, birth-date mode | — | no draft (the mock shows bucket mode only) |
| `animalForm.age.bucketLabel` | How old the animal was | bucket chips' label | — | «Скільки їй було» (MOCK:30). ⚠ «їй» is feminine (Q2) |
| `animalForm.age.bucketRangeUnder` | under {max} | after «Малюк ·» | `{max}` = `AGE_BUCKET_MAX_YEARS.baby` (1) | «до 1» (MOCK:30 «Малюк · до 1»; KAB:188) |
| `animalForm.age.bucketRange` | {min}–{max} | after «Молодий ·», «Дорослий ·» | `{min}`/`{max}` from `AGE_BUCKET_MIN_YEARS`/`MAX_YEARS` | «1–3», «3–8» (MOCK:30) |
| `animalForm.age.bucketRangeFrom` | {min}+ | after «Літній ·» | `{min}` = 8 | «8+» (MOCK:30) |
| `animalForm.age.asOfLabel` | As of | date input in bucket mode, defaults to today | — | «Станом на» (MOCK:30, KAB:189) |
| `animalForm.age.asOfHint` | When you made this estimate. Usually the day the animal arrived. | hint under «Станом на» | — | «Коли ви це оцінили. Зазвичай — день прийому.» (MOCK:30; KAB:189). ⚠ **True only if the server keeps the chosen date.** Today it doesn't: `stampedAge` (`apps/web/src/kabinet/handlers/animals.ts:140-141`) overwrites `declaredAt` with the save time. Shapes doc, D3 |
| `animalForm.age.adopterSees` | People looking will see: «{label}». | live line under the age block | `{label}` = `ageBucketLabel(ageBucketOf(estimate, now))`, the card's own word | «Адоптери побачать: «Молода, близько 2 років».» (MOCK:30, KAB:190). ⚠ **False as drafted:** the card prints only the bucket word, e.g. «молодий» (`cardMeta.age*`). It is masculine for every animal: uk:458-469 flags that gap and leaves it unfixed. No surface prints "about N years" or a feminine form. «Адоптери»: Q3. Q9 |
| `animalForm.age.uncertain` *(optional)* | You gave the age bracket {when}; the card now shows «{label}». If the animal is older than that, update it. | shown when `isAgeEstimateUncertain(age, now)` | `{when}` date, `{label}` | no draft. `age.ts` (comment on `isAgeEstimateUncertain`) expects the shelter to be asked; K3 is where it would see it |

No live line is shown while a draft has no age yet.

## 5. «Опис»

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.description.title` | Description | section title | — | «Опис» (MOCK:30, KAB:191) |
| `animalForm.description.prompt` | What you'd tell someone standing by the enclosure. | section caption | — | «Що б ви сказали людині біля вольєра.» (MOCK:30) |
| `animalForm.description.label` | About the animal | textarea label | — | «Про неї» (MOCK:30). ⚠ feminine (Q2) |
| `animalForm.description.hint` | Plain text, no formatting. | hint | — | «Простий текст, без форматування.» (MOCK:30, the hint's first half) |
| `animalForm.description.counter` | {count} of {max} characters | live counter in the hint; `aria-live="polite"` only near the limit | `{count}` counted by `characterCount` (characters as a reader sees them, K-B2), not `.length`; `{max}` = 1500 (`ANIMAL_DESCRIPTION_MAX_CHARACTERS`); both through `Intl.NumberFormat('uk')` | «120 з 1 500 знаків.» (MOCK:30; KAB:191). The noun's form fits 1,500 only, so it gets a pin like `copy-plural-pins.test.ts` against a change of the cap |
| `animalForm.description.counterOver` | {over} characters too many | counter past 1,500 | `{over}` | no draft (K4's `voice.counterOver` «Зайвих символів: {over}», uk:1066, is the precedent) |

## 6. «Здоров'я» (N19)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.health.title` | Health | section title | — | «Здоров'я» (KAB:199). The mock's «Здоров'я й документи» (MOCK:30) is superseded: documents are not edited here (KAB:211-216). The public heading is `medical.heading` «Медичний стан» (uk:261). Q6 |
| `animalForm.health.vaccinationLabel` | Vaccination | field label | — | «Щеплення» (MOCK:30). The public row reads «Комплексне щеплення» (`medical.vaccination`), so Q6 |
| `animalForm.health.confirm` | Done (the shelter says so) | the third option: an action label, distinct from the badge it renders as afterwards («Слова притулку») | — | KAB:205: "name tbd". Nearest mock draft: «Зроблено» (MOCK:30, from the superseded control). Q7 |
| `animalForm.health.unknownNote` | «Не записано» is an honest answer. People will see «Не записано», not "no". | caption under the medical rows | — | «"Не записано" — чесна відповідь. Адоптери так і побачать: «Не записано», а не «ні».» (MOCK:30). True: `vaccinationRow`/`spayNeuterRow` print `medical.unknown`. «Адоптери»: Q3 |
| `animalForm.health.registryReadOnly` | Confirmed by the state animal registry; it can't be changed here. | under a `source: "registry"` vaccination, rendered read-only. Unreachable today: no registry adapter exists | — | «Сказ уже підтверджено реєстром тварин — цей рядок ви не змінюєте, він оновлюється сам.» (MOCK:30). ⚠ «він оновлюється сам» describes an adapter that doesn't exist. Brand: Q5 |

**Cut, not built:**
- the option «Не зроблено» (MOCK:30): no `MedicalState` means "not done", and N19 replaced it
  with «У процесі»;
- «Документи, що вже є» with «Чип», «Ветпаспорт», «Довідка про сказ» and «Показуємо лише те, що
  відмічене. Якщо нічого — блок документів на картці не з'являється.» (MOCK:30): KAB:211-216 cut
  the checklist. `documentReadiness` stays `{kind: "unknown"}`.

## 7. «Фото» (N9)

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.photos.title` | Photos | section title | — | «Фото» (MOCK:30) |
| `animalForm.photos.ratioNote` | Shown at 4:5; the cover comes first. | section caption | — | «4:5, обкладинка перша.» (MOCK:30) |
| `animalForm.photos.add` | + Photo | add tile, a button that opens the file picker | — | «+ Фото» (MOCK:30, KAB:193) |
| `animalForm.photos.addHint` | Any photo this phone or browser can open. HEIC only where the browser can read it. | add tile caption | — | «JPG, PNG, HEIC · до 10 МБ» (MOCK:30; KAB:193 "formats and the 10 MB limit"). ⚠ **False as drafted:** there is no 10 MB limit. The device compresses any file it can decode (`compress-photo.ts`). The only ceiling is the server's 4 MiB, after compression (`PHOTO_UPLOAD_MAX_FILE_BYTES`). HEIC works only where the browser decodes it (P-B1, P-Q6) |
| `animalForm.photos.howItWorks` | The first photo is the cover; drag to change the order. At least one is needed to publish. Big photos are shrunk on the device to 2000 px before sending, to save mobile data. | section caption | `2000` from `PHOTO_MAX_EDGE_PX` | «Перше фото стає обкладинкою; перетягніть, щоб змінити порядок. Принаймні одне потрібне для публікації. Великі фото стискаємо на пристрої до 2000px перед відправкою — це економить мобільний трафік.» (MOCK:30; MOCK:26 N9). True: cover = `photos[0]` (P-Q9), at least one to publish (K-Q5), `scaledSize`. ⚠ «стискаємо» is «ми» voice (Q4) |
| `animalForm.photos.preparing` | Preparing the photo… | tile while the device decodes and compresses, before the upload starts (seconds on a budget phone) | — | no draft |
| `animalForm.photos.uploading` | Uploading… | uploading tile when progress isn't measured | — | no draft |
| `animalForm.photos.uploadingProgress` | Uploading · {percent} · {sent} of {total} MB | uploading tile with a 6 px bar | `{percent}`, `{sent}`, `{total}` (the compressed size), all through `Intl` (uk prints «1,2», not the mock's «1.2») | «Завантажуємо · 64% · 1.2 з 1.9 МБ» (MOCK:30; MOCK:26 N9 "відсоток і МБ словами"). ⚠ «Завантажуємо» is «ми» voice. True only if the upload measures progress: the kabinet client is a fetch `RPCLink` (`apps/web/src/api/kabinet-browser-client.ts:39`), which reports none. Q12 |
| `animalForm.photos.done` | Ready | done tile's label, if one is shown | — | «Готово» (MOCK:30, twice) |
| `animalForm.photos.cover` | Cover | white pill on `photos[0]` | — | «Обкладинка» (MOCK:30, KAB:196) |
| `animalForm.photos.failed` | Didn't upload | failed tile | — | «Не завантажилось» (MOCK:30, KAB:195, MOCK:26) |
| `animalForm.photos.retry` | Try again | failed tile's link | — | «Спробувати ще раз» (MOCK:30) = `profileEdit.state.retry`, reused |
| `animalForm.photos.dismissFailed` | Remove this photo (it didn't upload) | failed tile's second action | — | no draft |
| `animalForm.photos.tileLabel` | Photo {n} of {total} | each tile's accessible name | `{n}`, `{total}` | no draft |
| `animalForm.photos.makeCover` | Make this the cover | per-tile action; a reorder (P-Q9). Drag alone isn't keyboard-operable | — | no draft |
| `animalForm.photos.moveEarlier` / `moveLater` | Move earlier / Move later | per-tile keyboard and tap alternative to drag | `{n}` in the accessible name | no draft |
| `animalForm.photos.remove` | Remove photo {n} | per-tile remove; the accessible name names the position | `{n}` | no draft (K4's `contacts.removeOther` «Прибрати», uk:1053, as a visible-label precedent) |
| `animalForm.photos.capReached` | That's the maximum: {max} photos. | in place of the add tile at 10 | `{max}` = `MAX_ANIMAL_PHOTOS` (K-Q11) | no draft |
| `animalForm.photos.lastPhotoKept` | People can see this card, so it keeps at least one photo. | next to the last photo's disabled remove (written beside it, KAB:93), published or reserved only (P-Q8) | — | no draft |
| `animalForm.photos.added` / `.removed` / `.reordered` | Photo added. / Photo removed. / Order changed. | polite live region after each write | — | no draft |
| `animalForm.photos.conflict` | The photos changed in another window. Here is the current set; try again. | `CONFLICT` on reorder or remove (`expectedPhotoKeys`, P-Q3) | — | no draft |
| `animalForm.photos.removedStillReachable` *(optional)* | It's off the card; the file itself isn't deleted. | after a remove (P-Q14: a removed photo stays reachable by its URL; takedown is a manual step) | — | no draft. Q11 |
| `animalForm.photos.dateMoves` *(optional, RH-B7)* | On a card people can see, adding, reordering or removing a photo also refreshes its date. | caption, published or reserved only | — | no draft. True only once RH-B7's mechanism ships (shapes doc §7). Q14 |

## 8. Photo errors (PR 3's keys, P-T8)

Each becomes the failed tile's message, or a live-region message for reorder or remove.

| Key | English sense | What triggers it | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.photoErrors.heicUnsupported` | This phone or browser can't open HEIC photos. Please choose a JPG. | device: `compressPhoto` → `heic_unsupported` (P-T8 (1)) | — | no draft. **His key** (P-B1, verbatim: "where it can't decode it (e.g. Chrome on Windows), show a clear error asking for JPG — new copy key, I'll write it with the K3 sheet.") |
| `animalForm.photoErrors.unreadable` | This file couldn't be opened as a photo. | device: `unreadable` (P-T8 (2)) | — | no draft |
| `animalForm.photoErrors.tooLarge` | Even after shrinking, this photo is too large to send. Try another. | device: `too_large`, not expected at 2000 px (P-T8 (3)) | — | no draft |
| `animalForm.photoErrors.rejected` | The site can't use this file as a photo. | server: `PHOTO_REJECTED`, whatever `data.reason` says (`unsupported_type`, `format_mismatch`, `dimensions_exceeded`, `unreadable`). Only a client that skipped compression gets here, so one message (P-T8 (4)) | — | no draft. P-T8's English said "the registry": brand rule |
| `animalForm.photoErrors.limitReached` | This animal already has {max} photos. | `PHOTO_LIMIT_REACHED` (P-T8 (5)), e.g. a second tab filled it | `{max}` from `data.max` | no draft |
| `animalForm.photoErrors.requiredWhileVisible` | People can see this card, so its last photo stays. | `PHOTOS_REQUIRED_WHILE_VISIBLE` (P-T8 (6)) | — | no draft. The same fact as `photos.lastPhotoKept`, so it can be the same key |
| `animalForm.photoErrors.rateLimited` | Too many photos uploaded for now. Try again later. | `RATE_LIMITED` on `photos.add` (P-T8 (7)); 60 an hour or 300 a day per shelter (P-Q12). The error doesn't say which window was hit, so the copy can't say "in an hour" | — | no draft |
| `animalForm.photoErrors.uploadsUnavailable` | Photos can't be uploaded on this version of the site. | `PHOTO_UPLOADS_UNAVAILABLE` (P-T8 (8)): Preview deployments only. Production refuses to boot without the upload variables (P-T10) | — | no draft |

A network failure, the route's 413, or a 5xx shows `photos.failed` with `photos.retry` and needs
no key of its own.

## 9. Autosave and the draft footer

Drafts autosave "every 10s and on blur" (KAB:179; mock note at MOCK:30). The footer shows the
save line, F-B2's sentence and two buttons.

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.draft.savedAt` | Draft saved at {time} | footer status line | `{time}` HH:mm, Kyiv, as K4's `state.savedAt` | «Чернетку збережено 14:32» (MOCK:30, KAB:180) |
| `animalForm.draft.notVisible` | People looking for an animal don't see this draft. | footer, after `savedAt`, joined by « · » | — | **Final, his (F-B2), verbatim:** «Ті, хто шукає тварину, цю чернетку не бачать.» It replaces the mock's «бачите лише ви» (MOCK:30, KAB:180), which F-B2 found false twice. True: `animals.byId`, the feed, the gallery, swipes and reveals all refuse a non-discoverable animal (`api/handlers/animals.ts:32`, `feed-predicate.ts:45`, `swipes.ts:53`, `reveal.ts:62`). PR 4 pins the sentence in `copy-status.test.ts`, and adds a test that an incomplete draft is refused by each of those |
| `animalForm.draft.notSavedYet` | Not saved yet: a name and a species are needed to save a draft. | footer on `/nova` before creation (K-Q5) | — | «Потрібне ім'я, щоб зберегти чернетку.» (MOCK:30, 360: the name half only, shown there as a field error) |
| (reused) | Saving… | footer while saving | — | `profileEdit.state.saving` «Збереження…» |
| `animalForm.draft.saveFailed` | The draft didn't save. Check the connection; what you typed stays here. | footer and live region; edits kept in the form; retried on the next change or with retry | — | no draft. K4's `state.failed` speaks of cards, which a draft isn't on |
| `animalForm.draft.save` | Save draft | footer button (saves now) | — | «Зберегти чернетку» (MOCK:30, KAB:180) |
| `animalForm.draft.saveShort` | Draft (save) | the same button at 360 | — | «Чернетка» (MOCK:30, 360 footer) |

## 10. Editing a listed animal (published, reserved, adopted, withdrawn)

No mock frame exists (both K3 frames are «Нова тварина»). Builder's decision, reversible: no
autosave here, because KAB:179 says drafts autosave and a published card would otherwise go live
mid-sentence. The save is explicit.

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.listed.save` | Save | footer primary, listed animals | — | no draft (K4's `actions.save` «Зберегти», uk:997, can be reused) |
| `animalForm.listed.liveOnSave` | Changes appear on the card as soon as you save. | caption by save, published or reserved | — | no draft (K4's `actions.liveOnSave.*` precedent) |
| `animalForm.listed.notShownNow` | Nobody looking can see this card now. | caption, adopted or withdrawn | — | no draft |
| `animalForm.listed.dateUnchanged` *(optional)* | Editing the text doesn't change the card's date. «Ще шукає» does. | caption, published or reserved (commitment #7) | — | no draft. Q13 |

## 11. Publish

| Key | English sense | Where / state | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.publish.button` | Publish | footer primary | — | «Опублікувати» (MOCK:30, both frames; KAB:180) |
| `animalForm.publish.missing` | To publish, this still needs: {list}. | written next to the disabled button, which stays focusable (KAB:93), and as the `PUBLISH_REQUIREMENTS_UNMET` answer | `{list}` = the gap labels below in form order, joined by `Intl.ListFormat('uk', { type: "conjunction" })` | KAB:149 / MOCK:28 K2 row «Ще не опубліковано · бракує фото» (photo only, written before K-Q5) |
| `animalForm.publish.gap.size` / `.age` / `.description` / `.photo` | size / age / description / a photo | list items, in form order | — | `.photo`: «фото», from «бракує фото» (MOCK:28-29). The rest: no draft |
| `animalForm.publish.gap.sex` | sex | only if D2 makes sex a publish gap | — | no draft |
| `animalForm.publish.done` | Published. People can see it now. | polite live region after publishing | — | no draft |
| `animalForm.publish.viewPublic` *(optional)* | Open its public page | link after publishing | — | no draft |
| `animalForm.publish.stateChanged` | This card changed in another window. Reload to see it. | `ILLEGAL_TRANSITION` on publish (published already, elsewhere) | — | no draft |

Publishing first saves any pending edits, then publishes.

## 12. Errors

| Key | English sense | What triggers it | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.errors.conflict` | Someone changed this animal after you opened it. Your latest changes aren't saved. Here is the current version; make them again. | `CONFLICT` from `shelter.animals.update` (compare-and-set on `version`). Autosave stops until the page shows the current version. A photo change never causes it: photo writes leave `version` alone (P-B7, RH-B3) | — | no draft. K4's `profileEdit.errors.conflict` (uk:1024) is his precedent for the profile |
| (reused) | Show the current version | button with the conflict message | — | `profileEdit.errors.conflictReload` «Показати поточну версію» |
| `animalForm.errors.registryConfirmed` | This is confirmed by the state animal registry and can't be changed here. | `REGISTRY_CONFIRMED` (a declaration over a registry fact) | — | no draft. Brand: Q5 |
| `animalForm.errors.requiredOnceListed` | People can see this card, so the description can't be empty. | the proposed update refusal (shapes doc §5) when a listed animal's description is cleared | — | no draft |
| `animalForm.errors.notFound` | This animal isn't in your list: it was deleted, or the link is wrong. | `NOT_FOUND` on `byId`. `FORBIDDEN` (another shelter's id) gets the same words, so the page reveals nothing more than the API already does | — | no draft |
| `animalForm.errors.loadFailed` | The animal didn't load. Check the connection and try again. | read failure | — | no draft |

## 13. Validation (inline, under the field, N6: no red, KAB:383)

| Key | English sense | Rule | Vars | Mock draft |
|---|---|---|---|---|
| `animalForm.validation.nameRequired` | A name is needed to save the draft. | name empty after trimming (`animalNameProblem` → `empty`); K-Q5 | — | «Потрібне ім'я, щоб зберегти чернетку.» (MOCK:30, 360, shown as the N6 error) |
| `animalForm.validation.speciesRequired` | Choose dog or cat to save the draft. | no species chosen yet (K-Q5) | — | no draft |
| `animalForm.validation.nameBrace` | A name can't contain curly braces. | `brace` (K-B2: a name substituted into the sentence must not fake a token) | — | no draft |
| `animalForm.validation.nameTooLong` | The name is over {max} characters. | `too_long` | `{max}` = 60 (`ANIMAL_NAME_MAX_CHARACTERS`, K-B2 S2), counted by `characterCount` | no draft (K4's `sentenceTooLong` «Речення довше за {max} символів.», uk:1040, as precedent) |
| `animalForm.validation.descriptionTooLong` | The description is over {max} characters. | `animalDescriptionProblem` → `too_long` | `{max}` = 1500 | no draft |
| `animalForm.validation.birthDateFuture` | The birth date can't be in the future. | birth-date mode, after today (Kyiv) | — | no draft |
| `animalForm.validation.asOfFuture` | The "as of" date can't be in the future. | bucket mode, if D3 keeps the chosen date | — | no draft |
| `animalForm.validation.dateTooOld` | That date is too far back. | either date before the floor the shapes doc proposes (D3) | `{years}` | no draft |

The counter and both caps count characters with `characterCount`, the function the server uses.
A form that counted UTF-16 units would let through text the server refuses.

---

## 14. Existing strings that go false

PR 4 opens animal entry for the allowlisted test shelter only, so none of these is false for a
real shelter before PR 6. The PR 6 ones are already in `docs/pr6-copy-sheet.md`; listed here so
the K3-related ones are written together.

| Key / source | Live or draft text (excerpt) | What goes false | When / where |
|---|---|---|---|
| `forShelters.whatToPrepare` §7, last paragraph (commitment #6) | «Заповнювати анкету не треба: ви розкажете, а я внесу все сам.» | Shelters fill in K3 themselves | PR 6 (pr6-copy-sheet §1.1) |
| `forShelters.whenAnimalFindsHome` §9 A2 (commitment #6) | «…лише для перегляду — змінити чи прибрати щось у ньому поки не можна.» | Animals can be entered and changed | PR 6 |
| `kabinet.email.invite.what` | «Змінювати їх там ще не можна — для цього напишіть мені.» | Same | PR 6 |
| `forShelters.whyThatSentence` §8 and `freshness.updatedAgo` (commitment #7, B1/B2) | «…коли інформацію востаннє оновлювали…» / «Оновлено {days}» | False once K3 ships text edits, because a description edit doesn't move the date. RH-B7 adds a trigger: a photo change on a visible card moves it. B1 must describe publish, «Ще шукає»/«Ще домовляються» **and** photo changes | B1 blocks PR 6 (recorded). RH-B7: shapes doc §7 |
| K2 empty state caption (draft, unshipped) | «Від вашої картки нічого не вимагаємо одразу: назва й фото достатні для чернетки, решту можна дописати пізніше.» (MOCK:29; KAB:173) | Under K-Q5 a draft needs a name and a **species**, and **no** photo | K2 sheet (PR 5) |
| K2 draft row (draft, unshipped) | «Ще не опубліковано · бракує фото» (MOCK:28, KAB:149) | The gap list is wider than the photo | K2 sheet (PR 5), reusing section 11's gap labels |
| KAB:184 | "the public card shows the full words" | Nothing public shows sex | design doc, not copy |
| KAB:193 | "caption with formats and the 10 MB limit" | No 10 MB limit exists | design doc, not copy |

**Still true:**
- `errors.photoMissing.placeholder` «Фото немає — притулок ще не надіслав» (uk:432). Publishing
  now requires a photo, but already-published photo-less cards can keep it.
- `freshness.attribution`.
- `kabinet.profileEdit.errors.notAvailable` (every shelter outside the allowlist).
- Commitment #2: K3 shows no engagement.
- Commitment #1: ordering inputs unchanged. RH-B7 moves the date that is already an input. A
  photo change bumps a card the way «Ще шукає» already can, so no new ranking input.

---

## 15. Questions for Oleksii (brand voice and public claims; one batch, at PR 4's start)

1. **The Ukrainian for every key above** that says "no draft" or quotes a mock draft. F-B2's
   footer is already yours.
2. **Gendered words.** The mock's «її» (name hint), «Скільки їй було» (bucket label) and «Про
   неї» (description label) are written for its female example. The form must read right before
   the sex is known, for a male animal, and for «Не записано».
   - Recommend: wording with no pronoun.
   - Alternative: male, female and unknown variants keyed on the sex field.
3. **«Адоптери».** «Адоптери побачать…» and «Адоптери так і побачать…» (MOCK:30). Your K4 text
   and F-B2 say «ті, хто шукає тварину» / «люди». Recommend: the same here.
4. **«ми» voice.** «Ми зберігаємо… рахуємо…», «Великі фото стискаємо…», «Завантажуємо…»
   (MOCK:30). By CB-B2 these mean the website («сайт» / rephrase). Your wording.
5. **«реєстр» meaning the state animal registry.** The rule's reason is that «реєстр» implies a
   state service; here the text really names one. This covers:
   - the read-only line and `errors.registryConfirmed` in K3;
   - the public `medical.registry` «Реєстр тварин» and `medical.registryConfirmed`
     «Підтверджено реєстром тварин», which K3 reuses for the read-only row.

   Is a name for the state registry exempt? Is there a wording you prefer? The read-only state is
   unreachable today: no registry adapter exists.
6. **Medical labels.**
   - The field: «Щеплення» (mock) or the public «Комплексне щеплення» (`medical.vaccination`)?
     Recommend the public label, so the shelter edits the row by the name adopters read.
   - The section title: «Здоров'я» (KAB), «Медичний стан» (public heading), or the mock's «…й
     документи», which is now false?
7. **The third medical option's label**: an action meaning "done, by our word". It is distinct
   from the badge «Слова притулку» it then shows as. Nearest draft: «Зроблено» (MOCK:30).
8. **Sex on the phone.**
   - Keep «Хлопч.» / «Дівч.» at 360, or full words? The accessible name stays the full word
     either way.
   - Drop «На картці — повні слова.»? It is false: no public surface shows sex.
9. **The age live line.** The card prints only the bucket word («молодий» for every animal: the
   masculine-only gap flagged at uk:458-469). The line can only quote that word.
   - The gap itself is yours to fix or leave.
   - The mock's «Молода, близько 2 років» isn't what anyone sees.
10. **HEIC message** (your P-Q6 key, section 8).
11. **Photo privacy and removal (optional).**
    - Do you want K3 to say that a photo's location data is removed on the phone and again on the
      server? True: the canvas re-encode carries no EXIF, and `prepareUploadedPhoto` strips all
      metadata. It would be a new claim.
    - Do you want K3 to say that a removed photo's file isn't deleted (P-Q14)?
12. **Upload progress.** The mock shows percent and MB. The kabinet client (fetch) can't measure
    upload progress; measuring it needs the upload to use `XMLHttpRequest`.
    - Option (a): measure it, and use `uploadingProgress`.
    - Option (b): no measurement, and use `uploading`.
    - Recommend (a) for budget phones on mobile data. It is a reversible build choice; the copy
      for both is yours.
13. **Edits and the date.** Should a listed animal's form say that text edits don't move
    «Оновлено» and «Ще шукає» does (`listed.dateUnchanged`)? It is a claim about commitment #7.
14. **RH-B7's caption.** Once photo changes move the date (shapes doc §7), should the photo
    section say so (`photos.dateMoves`)?
15. **Status chips** (`kabinet.listingStatus.*`, section 2). K3's header needs the draft chip
    now, and K2 needs all five. Write all five with this sheet?
