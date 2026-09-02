# «Для притулків» — Ukrainian copy, DRAFT

**Status: draft, not signed off, not in `packages/i18n`.** The catalogue still
holds `COPY_PENDING` placeholders and `copy-status.test.ts` still expects all 13
keys to be pending. Nothing here ships until the owner has read it.

**Whose voice this is.** The settled decision was that the owner writes the
Ukrainian and the agent writes only the argument (`docs/prytulkam-argument.md`),
because translating is how calques get in — the copy critique's D3 already found
one construction in the live catalogue that reads translated. This draft was
written by the agent after the request was restated. It is a starting point to
react to, **not** copy to approve as-is; the register is the agent's, and that
was the specific thing the original decision was meant to avoid.

Apostrophes are U+0027, matching the rest of the catalogue (verified: 65
occurrences in `uk.ts`, zero U+2019 anywhere in `packages/i18n`).

---

## §1 — Що це · `whatThisIs`

Opika — реєстр тварин із перевірених притулків Київщини, де кожен ваш підопічний отримує власну сторінку.

## §2 — Скільки це коштує · `cost`

Це безкоштовно. Не «безкоштовно перші три місяці» і не «безкоштовно, поки ми не виростемо» — просто безкоштовно, сьогодні і далі. Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не з рахунку.

## §3 — Що буде з вашими тваринами · `whatHappensToAnimals`

Кожна тварина отримує власну сторінку з фотографіями і власною адресою — її можна надіслати в Telegram, показати знайомим, залишити під дописом.

Тварин можна дивитися списком або по одній. Обидва способи показують усіх.

Порядок у списку — за датою: спочатку ті, кого оновлювали найновіше, або ті, хто чекає найдовше; людина обирає сама. У режимі «по одній» до дати додається повнота картки — та, де є фотографії, опис і відмітка про щеплення, показується раніше. Це все, що впливає на порядок.

Якщо тварину вже комусь пообіцяли, картка лишається на місці з позначкою: домовленості зриваються, і тоді краще, щоб її було видно, ніж щоб вона зникла і повернулася.

> **Third paragraph is a description of mechanism, not a promise — deliberately.**
> An earlier draft said «немає місця, яке можна купити чи виграти», which is a
> promise about the future in a document that otherwise makes none, and Phase 2
> of the plan is ad revenue (`docs/stack-decision.md:509`). A promise fails
> silently; a description of behaviour fails loudly, because anyone reading the
> ordering code sees the page contradicting it.
>
> Verified against the real code, not assumed:
> - **List** (`/tvaryny`) — `GallerySortSchema` is closed at `freshest` /
>   `longest_waiting`, and `gallery-repo.ts` deliberately does **not** call
>   `scoreAnimal`. Date only.
> - **Deck** (`/tvaryny/gortaty`) — keyset on `lastUpdatedAt`, then
>   `scoreAnimal` re-ranks within the page. `DEFAULT_SCORING_POLICY` weights
>   freshness 0.5, completeness 0.3, preference 0.2; completeness is earned from
>   photos (0.5), a description ≥40 chars (0.25), and known vaccination (0.25).
>
> So "date, plus card completeness in the deck" is the whole truth. If this
> wording is signed off it becomes a commitment to record in
> `docs/standing-constraints.md`, with a pointer from `stack-decision.md`'s
> Phase 2 section.

## §4 — Хто кому пише · `whoContactsWhom`

Людина, яка хоче взяти тварину, пише вам напряму — на той контакт, який ви вкажете. Ми не пишемо за вас, не пишемо від вашого імені і не спілкуємося з нею замість вас.

## §4b — Ніяких зобов'язань · `noObligation`

Ви не дізнаєтеся, що хтось дивився картку, поки ця людина сама вам не напише. Немає списку заявок, немає непрочитаних, немає нічого, на що треба відповідати. Якщо вам ніхто не написав — значить, справді ніхто не написав, і ви нічого не пропустили.

## §5 — Гроші · `money`

Ми не беремо і не переказуємо грошей: ні комісії, ні оплати, ні збору донатів через нас. Якщо у вас є власна сторінка для донатів — банка в monobank, наприклад — ми поставимо на неї посилання, і людина побачить, куди воно веде, ще до того як натисне.

## §6 — Що означає «перевірений» · `verification`

«Перевірений» означає, що вас перевіряла людина. Ось що це означає конкретно.

Зареєстрована організація показує ЄДРПОУ, банківські реквізити на ту саму організацію і одну незалежну рекомендацію.

Незареєстрована ініціатива — а це більшість волонтерських груп — показує візит і дві незалежні рекомендації.

## §6b — · `verificationOpenToVolunteers`

«Візит» не означає, що хтось обов'язково приїде. Справжня телефонна розмова, після якої я можу переказати, що почув, теж рахується. Рекомендація має бути від когось іншого, ніж ви: сусідній притулок, ветклініка, з якою ви працюєте, будь-хто, хто може підтвердити, що ви існуєте і робите те, що кажете. Ваш другий номер телефону — не рекомендація.

## §7 — Що підготувати · `whatToPrepare`

Щоб почати, потрібно небагато:

фотографії тварин — справжні файли, а не скріншоти;
кілька речень про кожну: ім'я, приблизний вік, розмір, вдача;
контакт, на який ви справді відповідаєте;
посилання на донати, якщо воно у вас є;
і одне речення про те, як часто ви оновлюєте інформацію — про нього нижче.

Заповнювати анкету не треба. Ми проговоримо це, і я внесу все сам.

## §8 — Навіщо те речення · `whyThatSentence`

Людина, яка обирає між двома собаками, ніяк не дізнається, про кого з них писали минулого тижня, а про кого — позаторік. Тому на сторінці видно, коли ви востаннє підтверджували, що інформація актуальна, — і поруч ваше речення про те, як часто ви це робите, вашими словами.

Дата ставиться сама. Речення пишете ви — один раз, як вам зручно: «оновлюємо щосуботи», «дзвоніть, ми скажемо точно», «влітку рідше».

Саме це робить решту карток вартими довіри. Коли видно, що ви оновлюєте інформацію щосуботи, ваше «ця тварина ще шукає дім» означає рівно те, що написано.

> **Cut from the middle paragraph:** «Що завгодно, аби це було правдою.» Not
> because it read as too demanding, but because it was redundant with a better
> sentence one paragraph later — «Саме це робить решту карток вартими довіри»
> carries the same truth requirement as a benefit to the shelter rather than as
> a condition on them.
>
> Nothing in this section says what it isn't. No «це не для того, щоб когось
> соромити», no «ми розуміємо, що у вас багато роботи» — pre-empting the
> objection is what plants it.

## §9 — Коли тварина знайшла дім · `whenAnimalFindsHome`

Найважливіше, що ви можете нам сказати, — що тварина знайшла дім. Важливіше, ніж додати нову.

Тварина, яка вже вдома, але досі в списку, — це єдине, що робить усі інші картки недостовірними: людина дзвонить, чує «її забрали три місяці тому», і далі не вірить жодній картці — ні вашій, ні чужій.

Поки що це просто: напишіть, і я приберу. Окремої кнопки ще немає — не хочу обіцяти кабінет, якого не існує.

## §10 — Хто це робить · `whoIsBehindThis`

Opika робить одна людина — я, поза основною роботою. Немає команди, немає інвестора, немає відділу підтримки: коли ви пишете на цю адресу, відповідаю я.

> **Needs the owner's actual name.** Written first-person singular like
> `about.intro` rather than inventing one. The argument document asks for a
> named person, not "our team"; this is as close as the agent can honestly get.

## §11 — Як почати · `howToStart`

Напишіть на {contact}. Достатньо розказати, хто ви і скільки у вас тварин. Далі — розмова, перевірка, про яку йшлося вище, і ваші тварини з'являються в реєстрі.

> `{contact}` is substituted by the page (`hello@opika.org.ua`), matching how
> `about.contact` already works.

---

## Open question the owner has to settle: «ми» vs «я»

Not a typo — a voice decision, flagged rather than silently resolved.

The draft says **«ми»** in §4 («Ми не пишемо за вас»), §5 («Ми не беремо») and
§7 («Ми проговоримо це»), then §10 says **«Немає команди»**. §7 contains both in
one sentence: «Ми проговоримо це, і я внесу все сам».

A volunteer can notice that. Either:
- **All «я»** — consistent with §10 and with `about.intro`'s «який я роблю сам,
  поза роботою», and the smallness is the credential here rather than something
  to dress up; or
- **«ми» stays as the registry's voice** for the things that are properties of
  the product rather than of a person (§5's money rules especially), and §10
  simply explains who is behind it.

The first is more honest and matches the existing catalogue. The second is more
conventional. The agent did not pick, because it is the owner's voice.

**First appearance of «я» is §6b**, not §9 — so the reader does meet an
unintroduced first-person singular before §10 introduces who that person is, but
three sections earlier than feared, and inside a sentence about the verification
call rather than about a manual process they are being asked to rely on.
