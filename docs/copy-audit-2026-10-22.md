# Copy audit, 2026-10-22

Every user-facing Ukrainian string in `packages/i18n/src/messages/uk.ts` (and the few typed
outside it), checked against what `main` does at `11688cc` (#180). Every proposed string is a
proposal: Oleksii decides and authors the final Ukrainian. Nothing here changes code.

Flags: **PUBLIC CLAIM** (`/pro`, `/prytulkam`, privacy, sessions, storage: must stay literally
true), **EMAIL** (exact-payload tests in `auth-email-payload.test.ts`, plural pins in
`copy-plural-pins.test.ts`). Auth errors that must read the same for every cause are in §4 and
are not proposed for change.

## 1. Current state on `main` (what the copy depends on)

**Not on `main` yet.** The public shelter page and the saved list (`/zberezheni`) are planned,
not built. S6 (the shelter page, the shelter's sentence moved there) is the unmerged branch
`feat/dr1-s6-shelter-page` (`fb66f21`); S7/S8 (saved animals) have no branch. On `main` the
shelter's sentence and «Слова притулку» still sit on the animal page and the deck card. Strings
S6 already rewrites (from his DR1-Q1 text) are left alone here (§4); strings S6 makes false but
doesn't touch are rows A14 and B2.

**Onboarding.** The operator creates the shelter at `/kabinet/prytulky/novyi`: name, city,
exact address and coordinates, legal data, evidence, first admin. It starts as «Очікує»
(`pending`), and the invite goes out at creation (`operator.create.submit`). The invite email has
two variants: `whatBeforeVerification` (pending, under review, suspended, rejected) and `what`
(verified, paused). Its link (72 h, `INVITATION_TTL_MS`) opens «Створіть пароль» (10–128
characters) and signs the admin in. The shelter edits its contacts, its sentence and its animal
cards itself. A donation link goes live only after the operator approves it. Legal name, ЄДРПОУ
and address are read-only to the shelter. Verification is the operator's, against
`DEFAULT_VERIFICATION_POLICY`: a registered NGO or ФОП needs ЄДРПОУ, bank holder and one
reference; an unregistered initiative needs a visit and two references. Animals are public only
while the shelter is verified and not paused. A suspension or rejection shows the reason in the
shelter's kabinet. There is also a script path, `onboard:shelter`.

**Kabinet sign-in.** Password, or a magic link: 15 min, one use, opens a confirm page whose
«Увійти» button signs in (so mail scanners burn nothing); resend after 60 s. «Забули пароль?»
sends a reset link (60 min). A reset ends every session; a password change ends the others and
keeps this one. A «пароль змінено» email follows both. Sessions: shelter admin 30 days idle / 90
days absolute, operator 7 / 30 (`KABINET_SESSION_LIMITS`). Sign-in delay: 5 free attempts per 15
min, then 1, 2, 4, 8, 15 min, with the same message for every address (`SIGN_IN_DELAY`).

**Animal cards.** A draft needs a name and species to save, and nobody outside sees it.
Publishing needs size, age, description and one photo. From there: «Почали домовлятися» ⇄ «Не
домовилися — знову шукає» (reserved); «Уже вдома» (adopted, final); «Зняти з показу» (withdrawn,
with a reason, back to draft; republishing restarts the date and the waiting time). A draft can be
deleted only if it was never published, and the refusal is the same for every cause. The
«Оновлено» date is `confirmedAt`. Publishing moves it, so do «Ще шукає» / «Ще домовляються» (one
card per tap, with undo) and a photo change on a visible card. Text edits never move it.

**Public side.** Gallery `/tvaryny`: filters for city, species, size, age and fur; sorts
«Спочатку найсвіжіші картки» / «Найдовше чекають»; numbered pages. A card opens the animal page
as an overlay over the gallery (S4b). Deck `/tvaryny/gortaty`: «Не зараз» hides an animal for 30
days, «Написати» (or a right swipe, labelled «Запитати») hides it for good; this is per-device
memory (a cookie, set on first action). Animal page: photos, freshness block (pips, day count,
shelter sentence, «Слова притулку»), medical rows, the city only, «Написати притулку». That opens
the reveal dialog: contacts, a limit of 30 distinct shelters per rolling 24 h (re-opening a
shelter already opened is free), current contacts while the shelter is visible, else the ones
saved at the first reveal. A donation link shows its host. `REGISTRY_HAS_NO_REAL_SHELTERS =
true` on `main`, so the demo banner shows and «Перевірений вручну · …» and «· перевірений» are
hidden. Vercel Analytics and Speed Insights run, with sign-in query strings stripped.

**Emails** (all signed «— {operator}»): sign-in link (15 min); invite (two variants, 72 h,
creates a password); reset (60 min); password changed (no link, Reply-To contact).

## 2. Findings

Proposed strings use ʼ (U+02BC), «…» with „…“ nested, lowercase «ви», impersonal past.

### A. False or stale

| # | Tier | Key | Current text | Proposed text | Why (code reference) | Flags |
|---|---|---|---|---|---|---|
| 1 | A | `location.noMapExplanation` | Карти тут немає: ми не знаємо точної адреси і не вигадуємо її. Місце зустрічі узгодите з притулком. | Карти тут немає: сайт показує лише місто. Місце зустрічі узгодите з притулком. | False for every animal at its shelter: the operator records the exact address and coordinates (`operator.create.address`, `.coordinates`; `Shelter.exactAddress`, CLAUDE.md decision 2). Only a fostered animal has no stored address. The line renders for both (`AnimalDetailScreen.tsx:300`). Also «ми» in the site's voice. | PUBLIC CLAIM |
| 2 | A | `about.free` | Сайт безкоштовний для притулків сьогодні і лишиться безкоштовним. Жодних платних тарифів, … | Сайт безкоштовний для притулків: без платних тарифів і без „пробного періоду“. Якщо це колись зміниться, кожен притулок дізнається про це заздалегідь, а не постфактум. | «і лишиться безкоштовним» contradicts the same paragraph's «якщо це колись зміниться» and commitment 3 (`standing-constraints.md`: "not «free forever» — notice before change"). | PUBLIC CLAIM |
| 3 | A | `forShelters.howToStart` | Напишіть на {contact}. … Далі — розмова, перевірка, про яку йшлося вище, і ваші тварини з'являються на сайті. | Напишіть на {contact}: хто ви і скільки у вас тварин. Після розмови я створю притулок на сайті й надішлю вам доступ до кабінету. Тварин ви додаєте самі, поки триває перевірка, про яку йшлося вище, а ті, хто шукає тварину, бачать картки, щойно її завершено. | Describes the old order (talk, verify, then animals appear). Today the invite goes out at creation, before verification (`operator.create.submit`, `email.invite.whatBeforeVerification`), the shelter adds its own cards (K-Q3, `SHELTER_WRITE_POLICY`), and they show once the operator approves (`operator.verification.approveNote`). It's the page's only call to action. | PUBLIC CLAIM |
| 4 | A | `about.data` (one clause) | … зберігає імʼя та адресу пошти адміністратора — щоб надсилати посилання для входу, — … | … зберігає імʼя та адресу пошти адміністратора, щоб надсилати запрошення, посилання для входу чи нового пароля і повідомлення про зміну пароля, … | The address now also receives the invite, the reset link and the «пароль змінено» notice (`email.invite`, `email.reset`, `email.passwordChanged`; `password-mail.ts`). The stated purpose is narrower than the real use. The rest of the paragraph checks out: sessions 30/90 days (`KABINET_SESSION_LIMITS`), hash only, cleanup every 6 h. | PUBLIC CLAIM |
| 5 | A | `reveal.contactsFootnote` | Контакти збережено такими, якими вони є сьогодні · {date} | Контакти такі, якими були {date}, коли ви їх відкрили. | Shown only for `source: "first_reveal"`, the stored snapshot used when the shelter is not visible (`api/handlers/reveal.ts:144-153`), and `{date}` is the first reveal's date (`ContactRevealDialog.tsx`, `contactsFootnoteOf`). «якими вони є сьогодні» next to a past date says two opposite things. | none |
| 6 | A | `errors.rateLimited` (title, body) | Ви відкрили контакти багатьох притулків сьогодні. / Наступні — завтра. | За останню добу ви відкрили контакти багатьох притулків. / Притулки, чиї контакти ви вже відкривали, можна відкрити знову. Нові — пізніше, коли мине доба від перших. | The window is a rolling 24 h (`reveal-rate-limit.ts:51`), not a calendar day, so «завтра» can be false either way. Re-opening a shelter already opened stays free (decision 14), and the person can't learn that from this screen. Still no retry button, by design. | none |
| 7 | A | `errors.sessionExpired` (eyebrow, title, action) | СЕСІЯ ЗАВЕРШИЛАСЯ / Ми почали стрічку заново. / До стрічки | НЕ ВДАЛОСЯ ПРОДОВЖИТИ / Режим «по одній» почнеться спочатку. / Почати спочатку | The cause is `INVALID_CURSOR`, not a session (`use-feed-deck.ts:109-110`). The restart happens only when the button is pressed (`onRetry`, `use-feed-deck.ts:244-262`), so «почали» is false at the moment it's read. «Ми» and «стрічка» (the public name is «по одній»). Already-hidden animals stay hidden, so «спочатку» doesn't promise to show them again. | none |
| 8 | A | `reveal.backToFeed` | Повернутися до галереї | Повернутися до картки | On the animal page and in the gallery overlay this button only closes the dialog (`RevealFlow.tsx`, `secondaryAction: { onClick: close }`). The person stays on the animal. The mock (R1/R2) has this label, so the alternative is to make the button go to the gallery; that's his call. | none |
| 9 | A | `kabinet.operator.create.firstAdminHint` | Отримає лист із посиланням для входу. Інших адміністраторів можна запросити зі сторінки притулку. | Отримає запрошення на пошту: за посиланням створить пароль і увійде. Інших адміністраторів можна запросити зі сторінки притулку. | Since PW-2 the invite link opens «Створіть пароль» (`SetPasswordCard.tsx`, `invite-password.ts`), not a sign-in link. Operator-facing; the operator is the one who explains it to the shelter on the phone. | none |
| 10 | A | `kabinet.operator.create.whatHappens.step2` | {name} отримає лист для входу. Посилання діє 72 години, його можна надіслати ще раз. | {name} отримає запрошення: посилання, щоб створити пароль, діє 72 години. Його можна надіслати ще раз. | Same as #9. «72 години» stays as typed (plural pin for `INVITATION_TTL_MS`). | none |
| 11 | A | `exhausted.newAnimals` | Нові тварини з'являються, коли притулки оновлюють картки. Зазвичай раз на кілька тижнів. | Нові тварини зʼявляються, щойно притулки публікують картки. | Written before the kabinet. Shelters now publish themselves and a card shows at once (K-Q3, `animalForm.publish.done`). «Зазвичай раз на кілька тижнів» has no source in code or data. | none |
| 12 | A | `exhausted.body` | Притулків тут небагато, тому список короткий — це нормально. | Тих, кого ви пропустили через «Не зараз», режим «по одній» покаже знову через 30 днів. У списку видно всіх. | A claim about the number of shelters that the code can't prove. The deck usually ends because of filters and the person's own hidden animals: `reshowAfterDays: 30` (`seen-set.ts:43`), and the list has no such exclusion (commitment 8). The proposal tells them where to go next. | none |
| 13 | A | `kabinet.profile.intro` | Те, що бачать про вас на кожній картці ті, хто шукає тварину. | Дані притулку: те, що бачать ті, хто шукає тварину, і те, що встановлено під час перевірки. | The page also holds the verification data, which is never public (same page: `profile.addressNote`, `profile.lockedNote`). Contacts aren't on any card; people see them after «Написати притулку» (same page: `profile.contactsNote`). | none |
| 14 | A | `kabinet.profile.voiceLabel` | Ваші слова на картках | Ваші слова на сторінці притулку | True on `main`, false the day S6 merges: DR1-Q1 moves the sentence to the shelter page only, and the S6 branch leaves this label unchanged (`git show origin/feat/dr1-s6-shelter-page:packages/i18n/src/messages/uk.ts`, line 1110). His DR1-Q1 note: "Any other live string this makes false: send it to me". | none |

### B. Unclear

| # | Tier | Key | Current text | Proposed text | Why | Flags |
|---|---|---|---|---|---|---|
| 15 | B | `documents.rabiesPresent`, `documents.chipPresent` | Сказ є / Чип є | Є щеплення від сказу / Є чип | «Сказ є» reads as "has rabies": an alarming misreading on the exact page where someone decides to write. Better-writing: plain words, no ambiguity. | none |
| 16 | B | `medical.shelterDeclared` as the row's status | Комплексне щеплення · Слова притулку | Комплексне щеплення · Зроблено, за словами притулку | The status line names the source but never says the vaccination or sterilisation was done (`medical-labels.ts:53-56, 76-79`; the kabinet form's own word is «Зроблено», `animalForm.health.confirm`). S6 renames it to «Дані притулку», with the same gap, so «Зроблено, за даними притулку» after S6. Needs a separate status key so the source label stays reusable. | none |
| 17 | B | `medical.rabies`, `medical.registry` | Сказ · Державний реєстр тварин | Щеплення від сказу · Зроблено, за даними державного реєстру тварин | Same gap as #16, and «Сказ» alone as a row label has the same misreading as #15. «державний реєстр тварин» is the one allowed use of «реєстр». No seed data reaches this row yet. | none |
| 18 | B | ✕ on the reveal dialog (reads `actions.notNow`) | aria-label: «Не зараз» | aria-label: «Закрити» (reuse `preview.close`) | In the deck «Не зараз» is the action that hides an animal for 30 days. A screen-reader user hears that name on a plain close button (`ContactRevealDialog.tsx:326, 402`). The overlay's ✕ already says «Закрити». One word per action. | none |
| 19 | B | `swipe.right` | Запитати | Написати | A right swipe and the «Написати» button do the same thing (`SwipeDeck.tsx`, `handleCommit("right")`), but carry two names on one screen. The animal page says «Написати притулку». `/prytulkam` ¶3 and the held R4-2 `/pro` sentence name «Запитати», so they change with it. | PUBLIC CLAIM |
| 20 | B | `detail.backToListIn` | ← Усі тварини у {city} | ← Усі тварини · м. {city} | `{city}` is the nominative name, so the page renders «Усі тварини у Бровари» (the code comment quotes it, `animal-page-load.ts:63`). The proposal stays nominative and matches «м. {city}» elsewhere. | none |
| 21 | B | `detail.shelterVerifiedYears` | Перевірений вручну · {years} на Opika | Перевірено вручну · на сайті з {year} року | Counted from the record's creation, floored (`AnimalDetailScreen.tsx:26-28`), so a shelter's whole first year reads «0 років на Opika». Also puts the working name in copy (CLAUDE.md: the name isn't final). Hidden today by `REGISTRY_HAS_NO_REAL_SHELTERS`; live at launch. | none |
| 22 | B | `errors.offline.title` | Зараз немає інтернету. | Немає звʼязку із сайтом. Перевірте інтернет і спробуйте ще раз. | `offline` means the request never reached the server (a `TypeError`, `use-feed-deck.ts`), which can also be the site being unreachable. The current line blames the person's connection as a fact, and gives no step. | none |
| 23 | B | `kabinet.profileStatus.pending` | Очікує | Очікує перевірки | A shelter admin sees «Очікує» on their own status chip with nothing saying what it waits for. | none |
| 24 | B | `kabinet.animalList.notVisible.pending` | Ваші тварини зʼявляться в галереї, щойно притулок пройде перевірку. | Опубліковані картки зʼявляться в галереї, щойно притулок пройде перевірку. | Drafts won't appear after verification either. The current line can read as "they'll show on their own". | none |
| 25 | B | `kabinet.confirm.joinFailed` | Нічого не збережено наполовину. Спробуйте ще раз — а якщо не вийде, спроба повториться автоматично під час наступного входу. | Доступ до притулку ще не додано. Натисніть «Спробувати ще раз». Якщо не вийде, сайт спробує знову, коли ви наступного разу ввійдете. | Opens with an internal guarantee instead of what happened and what to do. The retry-on-next-sign-in claim is true (`invitation-accept.ts:11`) and kept. | none |
| 26 | B | `kabinet.email.invite.action` | Відкрити запрошення | Створити пароль | The link's job since PW-2 is to create a password; the email only says so in its last paragraph (`notYou`). Better-writing: the label names the action. | EMAIL |
| 27 | B | `noMatch.suggestionExplainer` | Кожна пропозиція називає, скільки тварин вона додасть. Порожній екран не питає «спробуйте інше» без числа. | Біля кожної пропозиції — скільки тварин вона додасть. | The second sentence is the design rule, not information for the reader. | none |
| 28 | B | `firstRun.promise` (og:description off demo) | Тварини з перевірених притулків Київщини. Перегляньте список і подивіться, кого шукає дім. | Собаки й коти з перевірених притулків Київщини шукають дім. Перегляньте список. | «кого шукає дім» says the home is looking for someone, the reverse of what's meant. Species is closed at dog/cat (decision 8), so the subject is literal. | none |

### C. Weak

| # | Tier | Key | Current text | Proposed text | Why | Flags |
|---|---|---|---|---|---|---|
| 29 | C | `filters.resultCount`, `filters.resultCountAnyCity` | Підходить {count} {animalWord}. … / Підходить {count} {animalWord} у {shelterCount} {shelterWord}. | Знайдено {count} {animalWord}. Притулків у цьому місті: {shelterCount}. / Знайдено {count} {animalWord} у {shelterCount} {shelterWord}. | «Підходить 3 тварини» breaks number agreement for 2–4 (should be «підходять»). «Знайдено» + `animalWordAccusative` is the rail's construction (`resultCountRail`), which agrees for every count. Same sentence in both places (DRY). | none |
| 30 | C | `cardMeta.fosteredHousing`, `location.lineFostered` | живе у волонтерки, м. {city} / м. {city} · у домі волонтерки | на перетримці, м. {city} / м. {city} · на перетримці | «волонтерки» assumes the carer's gender; the record holds none. «перетримка» is the word volunteers use. | none |
| 31 | C | `errors.loadFailed.title` | Щось не спрацювало на нашому боці. | Збій на боці сайту. | «на нашому боці» is «ми»; the site has one person behind it, who speaks as «я». The body («Це не ваша помилка і не помилка притулку.») stays. | none |
| 32 | C | `outOfRangePage.showingLast` | Показуємо сторінку {total} — останню. Нічого не загубилось. | Це сторінка {total}, остання. Нічого не загубилося. | «Показуємо» is «ми». | none |
| 33 | C | `about.intro` | … Я роблю його сам, поза роботою. … не повинно залежати від того, чи вміє притулок вести застарілий Excel-файл. | Opika — сайт, де тварини з притулків Київщини шукають дім. Його робить одна людина — я, у вільний від роботи час. Немає команди й інвестора. | The Excel clause is unprovable and can read as a jab at the shelters this page wants to win. «сам» is gendered. The one-person fact is the credential (Ogilvy: facts sell), so it stays. | PUBLIC CLAIM |
| 34 | C | `forShelters.cost` | Це безкоштовно. Не «безкоштовно перші три місяці» і не «безкоштовно, поки ми не виростемо» — просто безкоштовно, сьогодні і далі. … | Це безкоштовно: сьогодні і далі, без пробних періодів. Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не з рахунку. | Same promise without the "not X, not Y — Z" build-up (stop-slop) or the operator's «ми». The commitment 3 sentence is unchanged. | PUBLIC CLAIM |
| 35 | C | `forShelters.verificationOpenToVolunteers` | Справжня телефонна розмова, після якої я можу переказати, що почув, теж рахується. | Справжня телефонна розмова, після якої я можу переказати її зміст, теж рахується. | «почув» is a gendered past tense for a person. | PUBLIC CLAIM |
| 36 | C | `forShelters.verification` | Незареєстрована ініціатива — а це більшість волонтерських груп — показує візит і дві незалежні рекомендації. | Незареєстрована ініціатива показує візит і дві незалежні рекомендації. | «більшість волонтерських груп» is a claim about the world no one can check. The policy part matches `DEFAULT_VERIFICATION_POLICY` and stays. | PUBLIC CLAIM |
| 37 | C | `about.contact` | Зв'язатися з розробником: {contact} | Написати мені: {contact} | Everywhere else the operator is «я» or «адміністратор сайту». Also fixes the apostrophe. | none |
| 38 | C | `reveal.reflection1` | Це 10–15 років разом, а не вихідні. | Це роки разом, а не вихідні. | False for a senior animal, and the dialog opens for every age. | none |
| 39 | C | `filters.railFooter` | Немає фільтра «тільки свіжі картки». Тварина, про яку давно не писали, все одно чекає. | Фільтра за датою немає: тварина, про яку давно не писали, теж шукає дім. | Leads with what's missing; «все одно чекає» leans toward guilt. | none |
| 40 | C | `detail.notFound.body` | Тварини вже немає на сайті або посилання застаріле. Це не помилка — просто картки тут більше немає. | Цієї тварини вже немає на сайті, або посилання застаріло. | The second sentence repeats the first and the title. | none |
| 41 | C | `kabinet.animalList.orderNote` | … Повнота картки впливає лише на порядок у стрічці. … | … Повнота картки впливає лише на порядок у режимі «по одній». … | The public site never says «стрічка»; the shelter should recognise what its adopters see. | none |
| 42 | C | `kabinet.operator.history.note` | … Підтвердження «Ще шукає» тут не записуються. | … Підтвердження «Ще шукає» і «Ще домовляються» тут не записуються. | Neither is recorded (`about.data` says so, `handlers.test.ts` "confirm and undo record nothing"). | none |
| 43 | C | `kabinet.animalList.withdrawReason.adopted_elsewhere`, `.transferred` | знайшла дім іншим шляхом / переїхала до іншого притулку | дім знайдено іншим шляхом / переведено до іншого притулку | Shown after a name («Барсик · знайшла…»), so the feminine form clashes with half the animals. Impersonal forms keep animals pronoun-free and gender-free. | none |
| 44 | C | 11 strings with U+0027 | `reveal.title`, `exhausted.newAnimals`, `errors.offline.eyebrow`, `about.contact`, `forShelters.whatHappensToAnimals`, `.verificationOpenToVolunteers`, `.whatToPrepare`, `.howToStart`, `kabinet.signIn.sendFailed`, `kabinet.profile.signOutFailed`, `PENDING_R4_2_ANALYTICS_SENTENCE` | Same text with ʼ (U+02BC) | Voice rule. His DR1-Q4 answer already orders this ("Grep the catalogue for straight apostrophes … fix them in the same PR"), so it's listed, not new. | PUBLIC CLAIM (the `/pro` and `/prytulkam` ones) |
| 45 | C | `about.data` (layout) | One paragraph, ~190 words | The same sentences (after #4) in four paragraphs: what belongs to the shelter; the kabinet sign-in data; the history; the photos | Wording unchanged, so no claim moves. A shelter checking one fact can find it. | PUBLIC CLAIM |
| 46 | C | `kabinet.email.invite.intro` | Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» на сайті. | Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» на сайті {site}. | «на сайті» doesn't say which site, in an email someone may open days later. `{site}` comes from app config, never from the catalogue (the name isn't final). | EMAIL |

## 3. Gaps (the UI shows a state with no words for it)

| # | Where | What's missing | Proposed string |
|---|---|---|---|
| G1 | Reveal and deck, per-IP 429 (`useReveal.ts:128-131`, the route answers a raw 429) | A rate refusal shows `errors.loadFailed`, «Щось не спрацювало на нашому боці». That blames the site for a limit. | Reuse `detail.rateLimited`: «Забагато запитів. Спробуйте ще раз пізніше.» |
| G2 | An adopted animal's page (`animal-page-load.ts`, `not_found`) | `animalList.adoptDialog` promises the page will say the animal is gone; it shows the generic «Цієї картки більше немає», the same as a broken link. Needs a contract change: adopted only, never withdrawn (a withdrawal can mean the animal died). | `detail.adopted.title`: «{name} уже вдома.» · `detail.adopted.body`: «Притулок позначив, що тварина знайшла дім. Інші тварини — у списку.» |
| G3 | Kabinet, shelter status «Очікує» / «На розгляді» | Nothing tells a new shelter how verification happens or who acts next. | `kabinet.profile.pendingNote`: «Перевірку проводжу я: напишу або зателефоную, щоб домовитися. Поки її не завершено, ваших тварин бачите лише ви.» (a claim about the operator's conduct: his call) |
| G4 | Sign-in, set-password and reset forms on a transport failure (`SignInCard.tsx:158`, `SetPasswordCard.tsx:113`, `ResetPasswordCard.tsx:106`) | They borrow the animal list's «Не вдалося. Перевірте зʼєднання…», which doesn't say what failed. | `kabinet.signIn.failed`: «Не вдалося звʼязатися із сайтом. Перевірте зʼєднання і спробуйте ще раз.» Only for a request that got no answer; never for a refused sign-in, which keeps `wrongCredentials`. |
| G5 | Deck end state (`SwipeDeck.tsx`, `ExhaustedState`) | Text only, no next step. | Action `exhausted.toList`: «Переглянути список» (to `/tvaryny` with the same filters) |
| G6 | `FilterSheet.tsx:291` and `app/layout.tsx:48,56` | Strings typed outside the catalogue: the sheet's «Закрити» and the site `<title>`. | Reuse `preview.close`; move the title to app config next to the name. |

## 4. Don't change (looks odd, is deliberate)

- **Same answer for every cause:** `kabinet.signIn.wrongCredentials`, `.throttled`,
  `.sentBody` («Якщо ця адреса є в списку…»), `.addressNote`, `forgot.sent`, `forgot.throttled`,
  `inviteLanding.expired`, `confirm.invalid`. Each one reads the same whether or not the account
  exists (§5/§9, PW-2 Q1).
- **`kabinet.deleteDraft.refused.wasPublished`:** one refusal for "was published" and "has
  activity", so it can never tell a shelter that someone acted on an animal (commitment 2, K-Q9).
- **`freshness.updatedAgo` «Оновлено {days}»:** his K-Q14 (a). A card can look older than it is,
  never fresher.
- **`actions.notAJudgementNotice`, «просто» included:** his shipped sentence, recovered verbatim.
- **`demo.bannerNotice`, `demo.deckLabel`:** tied to `REGISTRY_HAS_NO_REAL_SHELTERS = true`. Watch
  item: once a real shelter is verified, the flag (and with it the banner) must flip.
- **`PENDING_R4_2_ANALYTICS_SENTENCE`:** held off `/pro` on purpose while the pre-launch gate sets
  a second cookie; `seo-flags.ts` trips if it lands early.
- **`forShelters.whatHappensToAnimals` «Це все, що впливає на порядок.»:** true today. The deck's
  `preference` weight is constant while filters stay hard constraints (`scoring.ts:104-108`).
  Watch item if "close matches" ever ship.
- **`forShelters.whatHappensToAnimals` «натиснула»:** agrees with «людина» (grammar), not a
  person's gender.
- **«ми» in `forShelters.whyThatSentence`'s examples («дзвоніть, ми скажемо точно»):** a
  shelter's own voice, which may use «ми».
- **`forShelters.verificationOpenToVolunteers`'s last sentence** («Ваш другий номер телефону — не
  рекомендація»): it's what makes the check read as enforced.
- **`forShelters.noObligation`, `.whoContactsWhom`, `reveal.subtitle` («Нічого не сталося
  автоматично»):** commitments 2 and 4, stated as mechanism.
- **Keys S6 already rewrites from his DR1-Q1 text:** `forShelters.whyThatSentence` ¶1,
  `profileEdit.voice.*`, `.actions.liveOnSave.voice`, `.errors.dateTokenGone`,
  `email.invite.what` / `.whatBeforeVerification`, `operator.history.freshness_sentence_changed`,
  `medical.shelterDeclared` («Дані притулку»). Don't edit them on `main` in parallel.
- **`{імʼя}`, `{дата}` in braces:** literal text the shelter types, not slots.
- **Masculine age words on filter chips, female variants on cards:** his Q9 ("they name
  categories, not one animal").
- **`medical.unknown`, `kabinet.profileNotRecorded` «Не записано»:** fixed by the standing rule
  for unknown fields.
- **Email wording outside #26 and #46:** exact-payload tests and plural pins (`хвилин` for 15,
  `години` for 72) hold them to the TTLs.
- **Not rendered anywhere on `main` (no point editing):** `myReveals.*`,
  `exhausted.addNearbyCities` / `.changeFilters` / `.reviewAgain` / `.footnote`,
  `errors.photoMissing`, `reserved.action`, `location.fostered`, `medical.registryConfirmed`,
  `detail.notFound.eyebrow`. `exhausted.footnote` and `location.fostered` carry «ми»/«нам», which
  matters only if they're wired up.
