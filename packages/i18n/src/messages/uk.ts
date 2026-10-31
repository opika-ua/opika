/**
 * The whole Ukrainian catalogue: the adopter-facing namespaces (`./uk-public`) plus the shelter
 * pages (`forShelters`) and the kabinet, which together are over half of it. Server code and the
 * copy tests import this; a client component on a public page imports `ukPublic` instead, so
 * neither namespace is shipped to a phone that cannot see it.
 */
import { ukPublic } from "./uk-public";

export {
  ADMIN_ERASURE_SENTENCE,
  COPY_PENDING,
  R4_2_ANALYTICS_SENTENCE,
  ukPublic,
} from "./uk-public";

export const uk = {
  ...ukPublic,

  /**
   * «Для притулків» (Phase T) - the first surface in this project written
   * for shelters rather than adopters, and the page an outreach message
   * links to.
   *
   * ⚠ EVERY VALUE BELOW IS A PLACEHOLDER AND MUST NOT SHIP. The Ukrainian is
   * written by the maintainer, from `docs/prytulkam-argument.md`'s structure
   * - *from* it, not translated from the English hints here. Translating
   * sentence-by-sentence is how calques get in, and the copy critique (D3)
   * already found one construction in this catalogue that reads translated.
   *
   * `forSheltersPlaceholdersRemaining()` (packages/i18n) counts what is left
   * and `messages.test.ts` reports it, so the number is visible rather than
   * discovered later. The argument document is the spec for what each key
   * has to establish and - for `whyThatSentence`, the hardest one - what it
   * must not sound like.
   */
  forShelters: {
    title: "Для притулків",
    /**
     * Real copy, not placeholders - promoted from the section names in
     * `docs/prytulkam-argument.md`, which were already phrased as the
     * reader's own questions rather than as labels. That phrasing is the
     * point: «Вартість» / «Контакти» / «Верифікація» would turn a letter
     * into a marketing page, which is the one thing this page is carefully
     * not being.
     *
     * They exist because linear reading is not the only use case. Someone
     * comes back a week later to re-check what was said about money before
     * committing, and without headings they re-read eleven sections or give
     * up.
     *
     * Two were adjusted from the draft's own labels to keep the question
     * form consistent: §5 was «Гроші» and §8 was «Навіщо те речення».
     */
    headings: {
      whatThisIs: "Що це",
      cost: "Скільки це коштує",
      whatHappensToAnimals: "Що буде з вашими тваринами",
      whoContactsWhom: "Хто кому пише",
      money: "Що з грошима",
      verification: "Що означає «перевірений»",
      whatToPrepare: "Що підготувати",
      whyThatSentence: "Навіщо те речення про оновлення",
      whenAnimalFindsHome: "Коли тварина знайшла дім",
      howToLeave: "Якщо ви захочете піти",
      whoIsBehindThis: "Хто це робить",
      howToStart: "Як почати",
    },
    /** §1 - one sentence. What this is. Nothing else. */
    whatThisIs:
      "{site} – сайт, де тварини з перевірених притулків України шукають дім, а кожен ваш підопічний отримує власну сторінку.",
    /** §2 - free now and later. Early, because it is what they are bracing for. */
    cost: "Це безкоштовно, сьогодні і далі. Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не з рахунку.",
    /**
     * §3 - a page each, shareable, and the ordering rule.
     *
     * The third paragraph is a description of mechanism, not a promise about
     * the future, and that is the point: a promise fails silently, a
     * description fails loudly the moment someone reading the ordering code
     * sees the page contradicting it. See `docs/standing-constraints.md`,
     * "Commitments the «Для притулків» page makes", commitment 1.
     *
     * R4-1 (`docs/decisions-inbox.md`), 2026-10-06: the second paragraph is
     * commitment 8's restored, fuller sentence, replacing the narrowed
     * version R1 shipped on 2026-09-09 - both «Не зараз» (`pass`, expires
     * after `DEFAULT_SEEN_SET_POLICY.reshowAfterDays`, 30) and «Запитати»
     * (`interested`, excluded permanently) are named, per
     * `packages/domain/src/discovery/seen-set.ts`'s own `stillExcludes`,
     * rather than only the weaker "doesn't re-serve what you skipped" the
     * English sense in `docs/observations.md` originally drafted. Oleksii's
     * own Ukrainian, verbatim - not drafted or polished here.
     *
     * **GV3-Q3 (Oleksii, 2026-10-26, verbatim: "go with (b) on all three"), narrowed again:** the
     * first sentence used to promise «списком або по одній» unconditionally.
     * The gallery-v3 redesign hid the deck's own entry link from the gallery
     * (Oleksii, mid-build: "let's hide access to Гортати по одній page for
     * now as well"), so a shelter reading this page could no longer verify
     * the second method from the site itself. Narrowed to a pure deletion -
     * «або по одній» cut, nothing added in its place - per
     * `docs/standing-constraints.md`'s "removing a false claim is not the
     * same gate as adding one": a Tier 1 reviewer (2881bc2's review) caught
     * that this row's first attempt added a new builder-written sentence
     * about the deck instead, which is new copy and does need the normal
     * gate regardless of how narrow or accurate it reads. A bare deletion
     * needs neither his words nor a round trip. `/tvaryny/gortaty` itself
     * is untouched and still works, so this is a **temporary narrowing, not
     * a withdrawal**: restore «або по одній» once the deck has a real entry
     * point again.
     */
    whatHappensToAnimals:
      "Кожна тварина отримує власну сторінку з фотографіями і власною адресою – її можна надіслати " +
      "в Telegram, показати знайомим, залишити під дописом.\n\n" +
      "Тварин можна дивитися списком.\n\n" +
      "Список завжди показує всіх. У режимі «по одній» людина більше не бачить тих, на кого вже " +
      "натиснула «Не зараз» чи «Написати», – це памʼять лише її пристрою, і після «Не зараз» " +
      "тварина згодом зʼявляється знову. Від людини не ховається нічого, крім того, що вона " +
      "сховала сама.\n\n" +
      // ¶4: his PR 6 text (pr6-copy-uk.md §1.6), «оновлено» meaning the
      // confirmation date, as K-Q14 (a) keeps it on the cards.
      "Порядок у списку – за датою: спочатку ті, чиї картки оновлено найновіше, або ті, хто чекає найдовше; людина обирає сама. У режимі «по одній» до дати додається повнота картки – та, де є фотографії, опис і відмітка про щеплення, показується раніше. Це все, що впливає на порядок.\n\n" +
      "Якщо тварину вже комусь пообіцяли, картка лишається на місці з позначкою: домовленості " +
      "зриваються, і тоді краще, щоб її було видно, ніж щоб вона зникла і повернулася.",
    /** §4 - the trust section. The actor is the system, so «Opika», never «я». */
    whoContactsWhom:
      "Людина, яка хоче взяти тварину, пише вам напряму – на той контакт, який ви вкажете. " +
      "Opika не пише за вас, не пише від вашого імені і не спілкується з нею замість вас.",
    /** §4b - no lead queue. Commitment 2; H2 is where this breaks by accident. */
    noObligation:
      "Ви не дізнаєтеся, що хтось дивився картку, поки ця людина сама вам не напише. Немає списку " +
      "заявок, немає непрочитаних, немає нічого, на що треба відповідати. Якщо вам ніхто не " +
      "написав – значить, справді ніхто не написав, і ви нічого не пропустили.",
    /**
     * §5 - the actor is the registry, not a person. The visibility claim is
     * verified: `AnimalDetailScreen` renders `donationHost()` as visible text
     * beside the label, so it holds on a phone with no hover and no status bar.
     */
    money:
      "Сайт не бере і не переказує грошей: ні комісії, ні оплати, ні збору донатів через сайт. " +
      "Якщо у вас є власна сторінка для донатів – банка в monobank, наприклад – на сторінці тварини " +
      "буде посилання на неї, і людина побачить, куди воно веде, ще до того як натисне.",
    /** §6 - checked against DEFAULT_VERIFICATION_POLICY, not against prose. */
    verification:
      "«Перевірений» означає, що вас перевіряла людина. Ось що це означає конкретно.\n\n" +
      "Зареєстрована організація показує ЄДРПОУ, банківські реквізити на ту саму організацію і одну " +
      "незалежну рекомендацію.\n\n" +
      "Незареєстрована ініціатива показує візит і дві незалежні рекомендації.",
    /**
     * §6b - ends on «Ваш другий номер телефону - не рекомендація», the only
     * sentence that anticipates someone gaming the process. It proves the
     * verification is enforced rather than described; a general version («ми
     * перевіряємо рекомендації на справжність») would read as suspicious where
     * this reads as experienced. It means §6 closes on fraud, which is why §7
     * opening on «потрібно небагато» must stay adjacent to it.
     */
    verificationOpenToVolunteers:
      "«Візит» не означає, що хтось обовʼязково приїде. Справжня телефонна розмова, після якої я " +
      "можу переказати її зміст, теж рахується. Рекомендація має бути від когось іншого, ніж ви: " +
      "сусідній притулок, ветклініка, з якою ви працюєте, будь-хто, хто може підтвердити, що ви " +
      "існуєте і робите те, що кажете. Ваш другий номер телефону – не рекомендація.",
    /**
     * §7 - practical, answerable in ten seconds. Not a form. Commitment 6.
     * The last paragraph is his PR 6 text (pr6-copy-uk.md §1.1): from PR 6 a
     * shelter keeps its own animals and profile in the kabinet, and a card it
     * publishes shows at once (K-Q3). The offer to enter the first cards is
     * an `onboard:shelter` run, which adds new animals only (his Q3).
     */
    whatToPrepare:
      "Щоб почати, потрібно небагато:\n\n" +
      "фотографії тварин – справжні файли, а не скріншоти;\n" +
      "кілька речень про кожну: імʼя, приблизний вік, розмір, вдача;\n" +
      "контакт, на який ви справді відповідаєте;\n" +
      "посилання на донати, якщо воно у вас є;\n" +
      "і одне речення про те, як часто ви оновлюєте інформацію – про нього нижче.\n\n" +
      "Фотографії використовуються тільки для сторінок ваших тварин.\n\n" +
      // A1 (row 91, final, Oleksii 2026-10-14): directly before the last
      // paragraph, shipped with the commit that turns production sign-in on.
      "Доступ до кабінету я надсилаю сам – листом на адресу, яку ви мені вкажете.\n\n" +
      "Тварин і профіль притулку ви ведете самі в кабінеті: додаєте картку, публікуєте – і її одразу видно. Якщо тварин багато, на старті можу внести перші картки сам – надішліть список і фото.",
    /**
     * §8 - the section needing the most care. Says what the date IS, never
     * what the feature isn't: pre-empting the objection is what plants it.
     *
     * B1, his PR 6 text (pr6-copy-uk.md §1.3), live with the switch that
     * opens shelter writes: the date is `listing.confirmedAt`
     * (`last_confirmed_at`), set on publish, by «Ще шукає» / «Ще
     * домовляються» (one animal per tap, no bulk) and by a photo change on a
     * card people can see (RH-B7); a text edit never moves it. Each of those
     * is named here, so the sentence can be read literally. See commitment 7.
     * ¶1 is his DR1-Q1 text (designer round 1, S6): the sentence is on the
     * shelter page now, not the animal's; ¶2 and ¶3 are unchanged.
     */
    whyThatSentence:
      "Людина, яка обирає між двома собаками, ніяк не дізнається, про кого з них писали минулого тижня, а про кого – позаторік. Тому на картці видно, коли ви востаннє підтвердили, що тварина ще шукає дім, а на сторінці притулку – ваше речення про те, як часто ви це робите, вашими словами.\n\n" +
      "Дату ніхто не вписує вручну: вона оновлюється, коли ви публікуєте картку, натискаєте «Ще шукає» чи «Ще домовляються» або змінюєте фото. Правки в тексті дату не змінюють – так вона показує саме те, що обіцяє. Речення пишете ви, коли вам зручно, і можете змінити його будь-коли: «оновлюємо щосуботи», «дзвоніть, ми скажемо точно», «влітку рідше».\n\n" +
      "Саме це робить решту карток вартими довіри. Коли видно, що ви підтверджуєте картки щосуботи, ваше «ця тварина ще шукає дім» означає рівно те, що написано.",
    /**
     * §9 - what a shelter does when an animal finds a home. Commitment 6.
     * ¶1 and ¶3 are his PR 6 text (pr6-copy-uk.md §1.2, ¶3's first sentence
     * from his Q2 answer): the shelter marks it itself with K2's «Уже вдома»
     * (published and reserved cards), the card leaves the gallery and the
     * deck at once, and the kabinet list keeps it as «Удома». ¶2 says «на
     * сайті» since his Q3 answer, so it can't be read as that kabinet list.
     */
    whenAnimalFindsHome:
      "Найважливіше, що ви можете зробити, – позначити, що тварина знайшла дім.\n\n" +
      "Тварина, яка вже вдома, але досі на сайті, – це єдине, що робить усі інші картки " +
      "недостовірними: людина дзвонить, чує «її забрали три місяці тому», і далі не вірить жодній " +
      "картці – ні вашій, ні чужій.\n\n" +
      "Кожна опублікована картка в кабінеті має кнопку «Уже вдома». Після неї картка одразу зникає з галереї та стрічки, а у вашому списку лишається з позначкою «Удома».",
    /**
     * §9b - how to leave. The largest unspoken objection on the page: the
     * first question anyone asks before handing their data to a stranger with
     * a website, and previously unanswered anywhere in eleven sections.
     */
    howToLeave:
      "І якщо ви колись захочете піти – напишіть, і я приберу все: тварин, фотографії, ваш запис. " +
      "Без питань і без умов. Ви нічого не підписували і нічого не втрачаєте.",
    /** §10 - one person. `about.intro`'s framing; the smallness is the credential. */
    whoIsBehindThis:
      "Opika робить одна людина – я, поза основною роботою. Немає команди, немає інвестора, немає " +
      "відділу підтримки: коли ви пишете на цю адресу, відповідаю я.",
    /** §11 - one instruction, and what happens next. `{contact}` filled by the page. */
    howToStart:
      "Напишіть на {contact}: хто ви і скільки у вас тварин. Після розмови я створю притулок на сайті " +
      "й надішлю вам доступ до кабінету. Тварин ви додаєте самі, поки триває перевірка, про яку " +
      "йшлося вище, а ті, хто шукає тварину, бачать картки, щойно її пройдено.",
    /** PW-2: the link to the kabinet's sign-in, `/kabinet/vkhid` (his scope item 1, verbatim). */
    signInLink: "Увійти в кабінет",
  },
  kabinet: {
    /**
     * The settlement picker (nationwide N4). The owner's approved rows of the Phase 0 copy table
     * (2026-10-29): label «Населений пункт», «Оберіть населений пункт зі списку», «Пошук…».
     */
    cityPicker: {
      placeholder: "Почніть вводити назву…",
      empty: "Нічого не знайдено",
      mustPick: "Оберіть населений пункт зі списку",
      tooShort: "Введіть щонайменше дві літери",
      loading: "Пошук…",
      error: "Список не завантажився.",
      retry: "Спробувати ще раз",
      found: "Знайдено: {count}",
      clear: "Очистити",
      close: "Закрити",
    },
    /**
     * The operator's name when `KABINET_OPERATOR_DISPLAY_NAME` is unset
     * (RS-Q2), nominative, in two forms (`kabinet/operator.ts` picks). Oleksii's
     * R-UI answer 9, verbatim: "Role label «адміністратор сайту» (also replaces
     * the «Оператор реєстру» fallback)." Then round 2, answer 6, verbatim:
     * "Email signature fallback: capitalise it → «— Адміністратор сайту»."
     *
     * `operatorFallbackName` stands alone, so it is capitalised: both emails'
     * «- {operator}» signature, the shelter-facing history actor, the
     * operator's header. `operatorFallbackNameInSentence` sits mid-sentence
     * (`profile.lockedNote`'s «встановлює {operator}»), in lower case as he
     * wrote the role, where a capital would read as a proper name.
     */
    operatorFallbackName: "Адміністратор сайту",
    operatorFallbackNameInSentence: "адміністратор сайту",
    /**
     * Every kabinet string below is Oleksii's final Ukrainian (2026-10-14,
     * answering the 91-row copy export for PR #94), applied verbatim. The designer's
     * drafts in `docs/design/KABINET.md` were drafts only. `copy-status.test.ts`
     * pins the load-bearing strings against his text, transcribed.
     */
    shell: {
      /** The tag chip next to the logo in the header (K1, N2). */
      label: "Кабінет",
      /** Header link to the public gallery; opens in a new tab so unsaved kabinet work is not lost. */
      viewSite: "Переглянути сайт",
      /** Hidden text after a link that opens a new tab, for screen readers. */
      newTab: "(відкриється в новій вкладці)",
    },
    /**
     * K1 · sign-in (N1), both states. Since the passwords build (PW-1,
     * `docs/shelter-passwords-copy-uk.md` §A, his Ukrainian, 2026-10-19,
     * verbatim): the password form first, «Надіслати посилання для входу» (the
     * magic link, his scope item 3) second, and «Забули пароль?». `intro` is his
     * replacement for «…Пароля немає: посилання для входу приходить на пошту.»,
     * which the passwords made false; it stays true for the operator, who has no
     * password («або за посиланням»). `wrongCredentials` is the one answer to
     * every failed sign-in (§5): it suggests the link, which honestly covers an
     * admin with no password yet and the operator without hinting at either.
     * `throttled` is his §9 answer 5, the same for every address; «хв.» avoids a
     * plural, and `copy-plural-pins.test.ts` pins it for several values anyway.
     */
    signIn: {
      pageTitle: "Вхід до кабінету",
      title: "Вхід до кабінету",
      intro:
        "Для притулків і адміністратора сайту. Увійти можна з паролем або за посиланням, що приходить на пошту.",
      emailLabel: "Електронна пошта",
      passwordLabel: "Пароль",
      showPassword: "Показати пароль",
      hidePassword: "Сховати пароль",
      submitPassword: "Увійти",
      useLink: "Надіслати посилання для входу",
      forgot: "Забули пароль?",
      wrongCredentials:
        "Не вдалося увійти. Перевірте адресу й пароль або надішліть собі посилання для входу.",
      /** `{minutes}` is the wait, whole minutes rounded up. */
      throttled: "Забагато спроб входу. Спробуйте ще раз через {minutes} хв.",
      addressNote:
        "Адресу додаю я, коли запрошую притулок. Якщо адреси немає в списку, лист не прийде – і ця сторінка про це не повідомляє, щоб не розкривати, хто зареєстрований.",
      /**
       * G4 (audit 2026-10-22): a request that got no answer at all (the fetch threw),
       * on the sign-in, set-password and reset forms. Never for a refused sign-in,
       * which keeps `wrongCredentials`.
       */
      failed: "Не вдалося звʼязатися із сайтом. Перевірте зʼєднання і спробуйте ще раз.",
      sendFailed: "Не вдалося надіслати посилання. Перевірте зʼєднання і спробуйте ще раз.",
      sentTitle: "Перевірте пошту",
      /** `{email}` is the address, shown in 500 weight. */
      sentBody:
        "Якщо ця адреса є в списку, на {email} прийде посилання для входу. Воно діє 15 хвилин і відкривається на будь-якому пристрої.",
      spamNote:
        "Листа немає? Перевірте «Спам» і «Промоакції». Надіслати ще раз можна через 60 секунд.",
      resend: "Надіслати ще раз",
      /** `{time}` is the countdown, m:ss. Shown while the 60s resend lockout runs. */
      resendIn: "Надіслати ще раз · {time}",
      otherAddress: "Інша адреса",
    },
    /**
     * The password fields every password form shares (`docs/shelter-passwords-copy-uk.md` §B,
     * his Ukrainian, 2026-10-19, verbatim). PW-1 renders these three on the reset page and in
     * «Змінити пароль»; the invitation's «Створіть пароль» (PW-2) adds its title, intro and
     * button. `hint` is the live hint under the field: «Символів: {count} з {min}», the length so
     * far against the minimum, worded to avoid a plural.
     */
    setPassword: {
      /** PW-2: the invitation link's page (his scope item 2, verbatim). */
      title: "Створіть пароль",
      /** `{shelter}` is the invitation's shelter; `{email}` its address, masked (o•••@gmail.com). */
      intro: "Пароль для кабінету притулку «{shelter}». Адреса для входу: {email}.",
      newLabel: "Пароль",
      repeatLabel: "Повторіть пароль",
      hint: "Символів: {count} з {min}",
      submit: "Зберегти й увійти",
    },
    /**
     * The policy's refusals and the mismatch (§B, his Ukrainian, verbatim), shared by every
     * password form. `personal` is his changed text (2026-10-19, verbatim), naming the part before
     * the @ outright. `{min}` and `{max}` are 10 and 128, filled from the policy's constants.
     */
    password: {
      tooShort: "Пароль закороткий. Мінімум символів: {min}.",
      tooLong: "Пароль задовгий. Максимум символів: {max}.",
      common: "Цей пароль надто легко вгадати. Оберіть інший.",
      personal:
        "Пароль не може містити вашу адресу пошти (навіть частину до @), назву притулку чи назву сайту.",
      mismatch: "Паролі не збігаються.",
    },
    /**
     * «Забули пароль?» (`/kabinet/vkhid/zabuly`, §C, his Ukrainian, verbatim). `sent` is the one
     * answer for every address, the operator's included (his note: «Якщо це адреса…» keeps it
     * true for every address); `{minutes}` is the link's lifetime, 60.
     */
    forgot: {
      title: "Забули пароль?",
      intro: "Вкажіть адресу пошти, з якою ви входите в кабінет.",
      submit: "Надіслати посилання",
      sent: "Якщо це адреса адміністратора кабінету притулку, на неї надіслано посилання для нового пароля. Воно діє {minutes} хв.",
      throttled: "Забагато запитів. Спробуйте ще раз пізніше.",
    },
    /**
     * The new password from a reset link (`/kabinet/vkhid/novyi-parol`, §D, his Ukrainian,
     * verbatim). `invalidLink`'s `{link}` is `invalidLinkText`, a link to «Забули пароль?»; his key
     * `reset.invalidLink.linkText` can't sit beside the string in this nested catalogue, so it is a
     * sibling (the copy sheet's own note), his wording unchanged.
     */
    reset: {
      title: "Новий пароль",
      submit: "Зберегти пароль",
      done: "Пароль змінено, на всіх пристроях виконано вихід. Увійдіть з новим паролем.",
      invalidLink: "Посилання застаріло або вже використане. {link}",
      invalidLinkText: "Отримати нове посилання",
    },
    /**
     * «Змінити пароль» on `/kabinet` (§E, his Ukrainian, verbatim; `title` is his scope item 7).
     * `noPasswordYet` is for an admin who signs in by link and has never set a password (his scope
     * item 9: existing admins use «Забули пароль?»).
     */
    changePassword: {
      title: "Змінити пароль",
      currentLabel: "Поточний пароль",
      newLabel: "Новий пароль",
      submit: "Змінити пароль",
      done: "Пароль змінено. На інших пристроях виконано вихід, тут ви залишаєтеся в кабінеті.",
      wrongCurrent: "Поточний пароль неправильний.",
      noPasswordYet:
        "Пароля ще немає. Створити його можна через «Забули пароль?» на сторінці входу.",
    },
    /**
     * KS-Q1 (Oleksii: "A"): the read-only "your shelter" page at `/kabinet`,
     * K4's sections with every value as a label-value row (N10's pattern).
     */
    profile: {
      /**
       * Притулок (kabinet redesign Phase 2 PR 1, renamed from «Профіль
       * притулку»; owner-approved copy, 2026-10-28): the page moved off
       * `SHELTER_HOME` to its own path, `SHELTER_PROFILE_PATH`, and Головна
       * took the landing slot. `pageTitle` is the `<title>` tag's own
       * template, filled with the shelter's name (his decision, verbatim:
       * "The `<title>` on the shelter-profile page is «Притулок · {shelter}».");
       * `title`/`phoneTitle` are the on-page heading and the nav label, both
       * just «Притулок».
       */
      pageTitle: "Притулок · {shelter}",
      title: "Притулок",
      /** The phone header's short page name. */
      phoneTitle: "Притулок",
      intro:
        "Дані притулку: те, що бачать ті, хто шукає тварину, і те, що встановлено під час перевірки.",
      role: "адміністратор притулку",
      signOut: "Вийти",
      /** Next to the title: the shelter's public page, in a new tab (owner-approved 2026-10-29). */
      viewOnSite: "Сторінка притулку на сайті",
      signOutFailed:
        "Вийти не вдалося – ви досі в кабінеті. Перевірте зʼєднання і спробуйте ще раз.",
      contactsTitle: "Контакти",
      /**
       * CB-B1 (Oleksii, 2026-10-17): no «реєстр» in user-facing copy, since it
       * implies a state service. Applies to this note, `donationNote` and
       * `profileEdit.voice.hint`; the other strings are his separate call.
       */
      contactsNote:
        "Ці контакти бачить людина, коли натискає «Написати притулку», – і пише вам сама. Листування йде напряму, без посередників.",
      donationTitle: "Збір коштів",
      donationLink: "Посилання на збір",
      donationNote: "Лише https. Через сайт гроші не проходять – це зовнішнє посилання.",
      /**
       * A proposed link the operator hasn't approved yet (N20). Rewritten in the
       * operator's «я» (K4 sheet, answer 8, Oleksii, 2026-10-17).
       */
      donationPending: "Запропоноване посилання чекає, поки я його перевірю.",
      voiceTitle: "Голос притулку",
      voiceLabel: "Ваші слова на сторінці притулку",
      /**
       * The second sentence (that the registry fills in {date} and {name})
       * was deleted 2026-10-15 as false: nothing substitutes anything, the
       * sentence renders verbatim (`textIn`). A fuller replacement, if K2
       * ever builds substitution, is new copy and goes through the gate.
       */
      voiceNote: "Одне речення від першої особи, написане вами.",
      /**
       * G3 (audit 2026-10-22): shown while the shelter is «Очікує перевірки» or «На розгляді».
       * A claim about the operator's conduct, accepted by Oleksii as proposed.
       */
      pendingNote:
        "Перевірку проводжу я: напишу або зателефоную, щоб домовитися. Поки її не завершено, ваших тварин бачите лише ви.",
      lockedTitle: "Встановлено під час перевірки",
      /** `{operator}` is the operator's display name (RS-Q2). */
      lockedNote:
        "Ці дані встановлює {operator} під час перевірки притулку. Тут вони лише для перегляду.",
      legalName: "Юридична особа",
      edrpou: "Код ЄДРПОУ",
      /** An unregistered initiative has a contact person, not a legal name. No mock frame. */
      contactPerson: "Контактна особа",
      registrationStatus: "Статус реєстрації",
      /** `{status}` is the chip's label, `{date}` the date it took effect. */
      statusSince: "{status} · з {date}",
      address: "Адреса приміщення",
      /**
       * Row 57, Oleksii's replacement (2026-10-14), applied once adopters
       * receive the city only before a reveal (EM-Q10, answer (a)). True of
       * the pages and of the data: no pre-reveal response carries the
       * district or coordinates (`pre-reveal-location.test.ts`, twice).
       */
      addressNote: "Ті, хто шукає тварину, не бачать точної адреси – лише місто.",
    },
    /** N12's verification chip labels, as KABINET.md drafts them. */
    profileStatus: {
      pending: "Очікує перевірки",
      under_review: "На розгляді",
      verified: "Перевірено",
      rejected: "Відхилено",
      paused: "На паузі",
      suspended: "Призупинено",
    },
    /** Contact channel row labels on the profile. */
    profileChannel: {
      phone: "Телефон",
      telegram: "Telegram",
      viber: "Viber",
      email: "Ел. пошта",
      website: "Сайт",
    },
    /**
     * Shown for any value the record doesn't hold. The standing constraints
     * fix this wording for an unknown field («Не записано», "never as 'no'"),
     * so it is not pending.
     */
    profileNotRecorded: "Не записано",
    /**
     * K4 · editing the shelter profile (`docs/k4-copy-sheet.md`). Oleksii's
     * final Ukrainian (`k4-copy-uk.md`, 2026-10-17) with his later fixes
     * (2026-10-17, "K4 copy fixes": `actions.liveOnSave` split per section,
     * `state.saved`, `pause.noteHint`, `voice.emptyMeans`/`previewEmpty`),
     * applied verbatim, with U+02BC as the apostrophe in every one of them
     * (K4-B4, answer 3, verbatim: "ʼ (U+02BC) in all my strings, incl.
     * contacts.atLeastOne «звʼязку». User input keeps accepting ' and [U+2019]
     * (token normalisation unchanged)."), his second apostrophe written as
     * [U+2019] because this file may not contain that character
     * (`apostrophes.test.ts`). Older catalogue strings keep U+0027. `errors.phoneRequired` is not here:
     * his answer 3 needs no required phone.
     *
     * **Literal braces.** `{імʼя}` and `{дата}` below are text the shelter
     * types, not slots. Slots are filled by `fillTemplate` (`../template.ts`),
     * whose slot names are ASCII letters only (`{time}`, `{max}`, `{token}`…),
     * so a Cyrillic name in braces can never match one, and a filled value is
     * never scanned again (a `{token}` value of «{max}» stays as typed).
     */
    /** The Притулок page's sub-tabs (owner-approved 2026-10-29); «Контакти» and «Збір коштів» are `profile.contactsTitle` and `profile.donationTitle`. */
    profileTabs: {
      label: "Розділи притулку",
      profile: "Профіль",
      verification: "Перевірка",
      account: "Акаунт",
      profileNote: "Те, що бачать на сторінці притулку.",
      /** The confirmation's link to the public page, in a new tab. */
      view: "Переглянути",
    },
    profileEdit: {
      saveBar: {
        unsaved: "Є незбережені зміни",
        cancel: "Скасувати",
        /** The quiet status line when nothing is waiting to be saved. */
        allSaved: "Усі зміни збережено",
        /** `{n}` fields still need fixing; one form per `Intl.PluralRules("uk")` category. */
        checkFields: {
          one: "Перевірте {n} поле",
          few: "Перевірте {n} поля",
          many: "Перевірте {n} полів",
        },
        /** Jumps to the first field that needs fixing. */
        show: "Показати",
        /** The pill's short status; the retry button is `state.retry`. */
        failed: "Не вдалося зберегти",
      },
      actions: {
        save: "Зберегти",
        cancel: "Скасувати зміни",
        /** Per section (answer 1). */
        liveOnSave: {
          /**
           * True since K4-B4, answer 1: reveal views and «Мої запити» carry the
           * shelter's current contacts while it is visible (`shelterContact`,
           * `source: "current"`, K4-B5, chosen in
           * `apps/web/src/api/handlers/reveal.ts`), so a person who asked
           * before the change gets the new ones too.
           */
          contacts:
            "Нові контакти побачать одразу після збереження – коли натиснуть «Написати притулку».",
          voice: "Нове речення зʼявиться на сторінці притулку одразу після збереження.",
        },
        unsavedLeave: "Зміни не збережено. Все одно вийти?",
      },
      state: {
        saving: "Збереження…",
        saved: "Збережено.",
        /** `{time}` is HH:mm, Kyiv. */
        savedAt: "Збережено о {time}",
        failed:
          "Не збереглося – на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
        retry: "Спробувати ще раз",
      },
      errors: {
        conflict:
          "Профіль змінили після того, як ви його відкрили. Ваші зміни не збережено. Ось поточна версія – внесіть зміни ще раз.",
        conflictReload: "Показати поточну версію",
        illegalTransitionPause:
          "Зараз не вийде поставити прийом на паузу: статус притулку змінився. Оновіть сторінку.",
        illegalTransitionResume:
          "Звідси прийом зараз не відновити: статус притулку змінився. Напишіть мені.",
        phoneFormat: "Вкажіть український номер: +380 і ще 9 цифр, наприклад +380 67 123 45 67.",
        telegramFormat:
          "Імʼя користувача в Telegram: 5-32 латинські літери, цифри або підкреслення. @ можна не писати.",
        viberFormat: "Вкажіть український номер: +380 і ще 9 цифр, наприклад +380 67 123 45 67.",
        emailFormat: "Схоже, це не адреса пошти.",
        httpsOnly: "Лише посилання, що починаються з https://.",
        notAUrl: "Це не схоже на посилання.",
        /** `{max}` is 280. */
        sentenceTooLong: "Речення довше за {max} символів.",
        /** `{token}` is the braced text the shelter typed. `{імʼя}` is literal. */
        unknownToken:
          "Підставляється лише {імʼя}. Приберіть «{token}» або напишіть без фігурних дужок.",
        /** Answer 5; DR1-Q1, his text. `{дата}` is literal. */
        dateTokenGone:
          "Дата оновлення показується на кожній картці, тому {дата} у реченні писати не потрібно.",
        /**
         * DR1-Q5, his text: the sentence shows on the shelter page only, so
         * `{імʼя}` (literal here) is refused in any spelling.
         */
        nameTokenGone:
          "Тепер речення показується на сторінці притулку, тому {імʼя} у ньому не використовується. Приберіть його й збережіть ще раз.",
        strayBrace: "Є дужка без пари. Фігурні дужки потрібні лише для {імʼя}.",
      },
      contacts: {
        otherLabel: "Інший спосіб звʼязку",
        otherKind: "Тип",
        phonePlaceholder: "+380 …",
        telegramPlaceholder: "@username",
        removeOther: "Прибрати",
        /** Answer 3. */
        addOther: "Додати ще один спосіб звʼязку",
        /** Answer 3: no required phone, at least one channel. */
        atLeastOne: "Залиште хоча б один спосіб звʼязку.",
      },
      voice: {
        /**
         * DR1-Q1, his text. `nameStaysHint` and `insertName` («Вставити
         * {імʼя}») are deleted with the token they explained (DR1-Q5): the
         * editor refuses it now, so a button inserting it would be broken.
         */
        hint: "Одне речення від першої особи, вашими словами, про те, як часто ви оновлюєте картки. Воно показується на сторінці притулку.",
        counter: "{count} / {max}",
        counterOver: "Зайвих символів: {over}",
        /** DR1-Q1, his text (and the next two); `previewNoAnimals` deleted by his answer. */
        emptyMeans:
          "Якщо залишити порожнім, на сторінці притулку цього речення не буде, а на картках, як і раніше, буде „Оновлено … тому“.",
        previewLabel: "Так це виглядає на сторінці притулку:",
        previewEmpty: "Речення немає – на сторінці притулку його не буде.",
      },
      donation: {
        optional: "· необовʼязково",
        previewLabel: "Так це побачать люди:",
        previewHost: "{host} ↗",
        propose: "Надіслати на перевірку",
        proposeNote:
          "Нове посилання зʼявиться на картках після того, як я його перевірю. До того люди бачать поточне.",
        /** Answer 8. */
        pendingTitle: "Чекає на перевірку",
        pendingHost: "Запропоновано: {host}",
        pendingSince: "Надіслано {date}",
        cancelProposal: "Скасувати пропозицію",
        proposed: "Надіслано. Я перевірю посилання.",
        cancelled: "Пропозицію скасовано. Поточне посилання лишається.",
        replaceNote: "Якщо надіслати інше посилання, воно замінить те, що чекає на перевірку.",
        failed: "Не надіслано. Перевірте зʼєднання і спробуйте ще раз.",
        /** Answer 12: shown while the newest donation line is the operator declining. */
        declined:
          "Останнє запропоноване посилання не підтверджено. Якщо незрозуміло чому – напишіть мені.",
      },
      pause: {
        button: "Призупинити прийом тварин",
        resumeButton: "Відновити прийом тварин",
        /** `{date}` the pause's date, `{reason}` the code's label only, never the note (fix 5). */
        pausedLine: "Прийом на паузі з {date} · {reason}",
        dialogTitle: "Призупинити прийом тварин?",
        dialogBody:
          "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає. Відновити можна тут будь-коли.",
        reasonLabel: "Причина",
        reasonPlaceholder: "Оберіть причину",
        reason: {
          seasonal_closure: "Сезонна перерва",
          relocation: "Переїзд",
          capacity_reached: "Немає місця",
          staff_shortage: "Брак людей",
          other: "Інше",
        },
        noteLabel: "Коментар",
        /**
         * Fix 2. True since K4-B4, answer 2: the note shows under the paused
         * line, labelled «Коментар», on the shelter's kabinet page, which only
         * its admins and the operator's support view reach; no public view
         * carries it.
         */
        noteHint:
          "Коментар бачите ви, інші адміністратори притулку і я. Людям, які шукають тварину, він не показується.",
        confirm: "Призупинити прийом",
        cancel: "Скасувати",
        close: "Закрити",
        paused: "Прийом на паузі.",
        resumed: "Прийом відновлено. Ваших тварин знову видно.",
      },
      /**
       * Pet card PR 3b §C. His final Ukrainian (2026-10-27): `add`,
       * `rejected` and `failed` are his own text, replacing the builder's
       * draft; every other key is approved as the builder wrote it. The
       * compression-stage refusals (HEIC, unreadable, too large) reuse
       * `kabinet.animalForm.photoErrors`'s own three, since they describe the
       * same device-side step for the same reason; only the upload-stage
       * outcomes below are new, written for a logo rather than a photo.
       */
      logo: {
        title: "Логотип притулку",
        /** Shown when there's no logo yet; `change` (below) takes over once one is set. */
        add: "Додати логотип",
        change: "Змінити логотип",
        remove: "Прибрати логотип",
        uploading: "Завантаження…",
        updated: "Логотип оновлено.",
        removed: "Логотип прибрано.",
        removeFailed: "Не вдалося прибрати логотип. Перевірте зʼєднання і спробуйте ще раз.",
        rejected: "Цей файл не підходить для логотипа. Спробуйте інше зображення.",
        rateLimited: "Забагато спроб за короткий час. Спробуйте трохи пізніше.",
        uploadsUnavailable: "На цій версії сайту логотип завантажити не можна.",
        failed: "Логотип не завантажився. Перевірте зʼєднання і спробуйте ще раз.",
      },
    },
    /**
     * The five listing states as K3's header chip and K2's rows name them
     * (N3). Oleksii's final Ukrainian (k3-copy-uk.md §2; answer 15, verbatim:
     * "Yes, all five below.").
     */
    listingStatus: {
      draft: "Чернетка",
      published: "Опубліковано",
      reserved: "Домовляються",
      adopted: "Удома",
      withdrawn: "Знято з показу",
    },
    /**
     * K3 · the animal form (`docs/k3-copy-sheet.md`): Oleksii's final
     * Ukrainian (`k3-copy-uk.md`, 2026-10-17), verbatim, U+02BC as the
     * apostrophe. His rules for it, verbatim: "Pronoun-free wording
     * everywhere. No sex-keyed variants."; "«ті, хто шукає тварину» (or
     * «люди» where shorter). Never «адоптери»."; "the site is the subject
     * («сайт»), or impersonal / passive forms". Keys his answers reuse from
     * elsewhere (sex «Не записано», «Комплексне щеплення», «Спробувати ще
     * раз», «Зберегти») are read from their own homes, not copied here.
     */
    animalForm: {
      pageTitleNew: "Нова тварина",
      pageTitleEdit: "{name}",
      titleNew: "Нова тварина",
      backToList: "← Тварини",
      header: {
        createdNotPublished: "Створено {when} · ще не в галереї",
      },
      /**
       * The form's section names (kabinet redesign Phase 2 PR 3). Owner-approved
       * 2026-10-28/29 ("copy approved: «Основне», «Про тварину», «Здоровʼя»,
       * «Публікація»"). The photos section keeps `photos.title`.
       */
      sections: {
        basics: "Основне",
        about: "Про тварину",
        health: "Здоровʼя",
        publication: "Публікація",
        tabsLabel: "Розділи картки",
        /** Accessible names of the ✓ and ! on a tab: derived from the publish rules, never a second list. */
        badgeComplete: "усе потрібне заповнено",
        badgeIncomplete: "потрібно доповнити",
      },
      who: {
        title: "Хто це",
        nameLabel: "Імʼя",
        nameHint: "Як тварину кличуть у притулку. Лише імʼя – пояснення краще написати в описі.",
        namePlaceholder: "Наприклад, Ластівка",
        speciesLabel: "Вид",
        sexLabel: "Стать",
        sexMale: "Хлопчик",
        sexFemale: "Дівчинка",
        sizeLabel: "Розмір",
        sizeNote: "Ваги немає навмисно: розмір на око точніший, ніж торішня цифра.",
        sizeHintUpTo: "до {max} кг",
        sizeHintRange: "{min}–{max} кг",
        sizeHintFrom: "від {min} кг",
      },
      /** DR1 (S3), his text (2026-10-20). Optional, and clearable back to «Не вказано». */
      coat: {
        label: "Шерсть",
        short: "Коротка",
        long: "Довга",
        unknown: "Не вказано",
      },
      /**
       * Pet card redesign. These four, `temperament`'s four below and the
       * three history labels are his approved copy. Oleksii, 2026-10-26, in
       * the coordinating session, verbatim: "Kabinet strings: approved
       * as-is. All 13, exactly as in your table, are now owner-approved final
       * copy." His 13 also held the medical note's label and hint, which
       * wait for PR 5 with the note's field (inbox PC1-D1). The first commit
       * of these strings (eb929c6) already called them owner-approved, before
       * he had answered: that claim was wrong when it was written, and his
       * answer above is the approval it lacked.
       *
       * `unknown` is `coat.unknown`'s own words, written out again: the two
       * fields' «not given» must read the same.
       */
      colour: {
        title: "Забарвлення",
        unknown: "Не вказано",
        other: "Інше",
        customPlaceholder: "Своїми словами",
      },
      age: {
        title: "Вік",
        modeLabel: "Що відомо про вік",
        modeBirthDate: "Відома дата народження",
        modeBucket: "Відомий вік на певну дату",
        modeBirthDateShort: "Дата народження",
        modeBucketShort: "Вік на дату",
        modeNote:
          "Обидва способи рівноцінні. Сайт зберігає саме те, що ви вказали, і далі рахує вік сам.",
        birthDateLabel: "Дата народження",
        bucketLabel: "Вік на ту дату",
        bucketRangeUnder: "до {max}",
        bucketRange: "{min}-{max}",
        bucketRangeFrom: "{min}+",
        asOfLabel: "Станом на",
        /** True with D3 (Oleksii: "keep the chosen «Станом на» date"): the server stores it. */
        asOfHint: "Коли ви це оцінили. Зазвичай – день, коли тварина потрапила до притулку.",
        /** `{label}` is the card's own word (`ageWordFor`, the form's sex); his answer 9: quoted as it is. */
        adopterSees: "Ті, хто шукає тварину, побачать: «{label}».",
        uncertain:
          "Вік указано станом на {when}. Тепер на картці – «{label}». Якщо тварина вже старша, оновіть вік.",
      },
      description: {
        title: "Опис",
        prompt: "Що б ви сказали людині біля вольєра.",
        label: "Про тварину",
        hint: "Простий текст, без форматування.",
        /** «символів» is the form for 1,500 (pinned in `copy-plural-pins.test.ts`). */
        counter: "{count} з {max} символів",
        counterOver: "Зайвих символів: {over}",
      },
      /** Pet card redesign; his approval is quoted at `colour` above. The chips' words are `temperament.*`. */
      temperament: {
        title: "Характер",
        hint: "Можна обрати кілька. Необовʼязково.",
        other: "Інше",
        customPlaceholder: "Своїми словами",
      },
      health: {
        title: "Медичний стан",
        confirm: "Зроблено",
        unknownNote:
          "«Не записано» – чесна відповідь. Ті, хто шукає тварину, так і побачать «Не записано», а не «ні».",
        registryReadOnly: "Підтверджено державним реєстром тварин. Тут цей рядок змінити не можна.",
      },
      /**
       * Pet card PR 5. His own words, given directly (2026-10-27): "Two
       * strings are already approved: «Що ще варто знати про здоровʼя» and
       * «Необовʼязково. Ті, хто шукає тварину, побачать цей текст у розділі
       * «Медичний стан».»" `title` doubles as both the card's `<h2>` and the
       * field's own `label`, the same pattern `description` above uses for
       * its `title`/`label` pair - here they're identical text rather than
       * two different ones, which is fine, nothing requires them to differ.
       * The structured facts (vaccination, spay/neuter) stay in `health`
       * above and move to the public page's chip row (A3); this is the
       * shelter's own free-text note, distinct from both.
       */
      medicalNotes: {
        title: "Що ще варто знати про здоровʼя",
        hint: "Необовʼязково. Ті, хто шукає тварину, побачать цей текст у розділі «Медичний стан».",
      },
      photos: {
        title: "Фото",
        counter: "{n} з {max}",
        /** Shown once, chosen by pointer capability: a mouse drags, a finger holds. */
        orderHintMouse: "Перетягніть, щоб змінити порядок.",
        orderHintTouch: "Утримуйте фото, щоб перетягнути.",
        infoLabel: "Про фото",
        infoText:
          "Підійде будь-яке фото з телефона чи компʼютера. Великі знімки стискаються ще до відправлення, тож мобільного трафіку піде менше. Місце зйомки та інші приховані дані з фото прибираються автоматично.",
        addTile: "Додати фото",
        addLeft: "Ще {left}",
        addDrop: "можна перетягнути файли сюди",
        menuLabel: "Дії з фото {n}",
        dragPickUp: "Фото {n} підняте. Позиція {pos} з {total}.",
        dragMove: "Позиція {pos} з {total}.",
        dragDrop: "Фото {n} на позиції {pos} з {total}.",
        dragCancel: "Переміщення скасовано.",
        preparing: "Фото готується…",
        uploading: "Фото завантажується…",
        uploadingProgress: "Завантаження · {percent} · {sent} з {total} МБ",
        done: "Готово",
        cover: "Обкладинка",
        failed: "Не завантажилось",
        dismissFailed: "Прибрати",
        /** The accessible name for `dismissFailed`, his answer: «Прибрати фото, яке не завантажилось». */
        dismissFailedName: "Прибрати фото, яке не завантажилось",
        tileLabel: "Фото {n} з {total}",
        makeCover: "Зробити обкладинкою",
        moveEarlier: "Посунути раніше",
        moveLater: "Посунути пізніше",
        remove: "Прибрати",
        capReached: "Це максимум – {max} фото.",
        /**
         * Also `PHOTOS_REQUIRED_WHILE_VISIBLE`'s message (his answer: "same
         * key/text"). Only while the shelter's cards are shown (verified, not
         * paused); otherwise `lastPhotoKeptNotShown`.
         */
        lastPhotoKept: "Цю картку бачать люди, тож одне фото має лишитися.",
        /**
         * In place of `lastPhotoKept` while the shelter's cards are on no
         * public surface (paused, suspended or not verified,
         * `FEED_VISIBLE_VERIFICATION_STATUSES`), where «бачать люди» would be
         * false. One line for every hidden cause: «поки її ще не бачать»
         * claims nothing about verification. The rule holds either way: the
         * server keeps the last photo of any published or reserved card
         * (P-Q8). His final text (round 2b, answer 3).
         */
        lastPhotoKeptNotShown:
          "Картка опублікована, тож одне фото має лишитися – навіть поки її ще не бачать.",
        added: "Фото додано.",
        removed: "Фото прибрано.",
        reordered: "Порядок змінено.",
        conflict: "Фото змінилися в іншому вікні. Тут – поточний набір, спробуйте ще раз.",
        removedStillReachable:
          "Фото зникло з картки. Сам файл не видаляється одразу – якщо його треба прибрати зовсім, напишіть мені.",
        /** True with RH-B7 (D4 option (i)). Shown for a published or reserved card only. */
        dateNote:
          "Кожна зміна у фото оновлює дату на картці, і вона знову зʼявляється серед найсвіжіших.",
      },
      photoErrors: {
        heicUnsupported:
          "Цей телефон чи браузер не відкриває фото у форматі HEIC. Виберіть, будь ласка, JPG або PNG.",
        unreadable: "Цей файл не вдалося відкрити як фото.",
        tooLarge: "Навіть після зменшення це фото завелике. Спробуйте інше.",
        rejected: "Сайт не може використати цей файл як фото.",
        limitReached: "У цієї тварини вже {max} фото.",
        rateLimited: "Забагато фото за короткий час. Спробуйте трохи пізніше.",
        uploadsUnavailable: "На цій версії сайту фото завантажити не можна.",
      },
      draft: {
        savedAt: "Чернетку збережено о {time}",
        /** F-B2, his, verbatim; backed by `incomplete-draft-invisible.test.ts`. */
        notVisible: "Ті, хто шукає тварину, цю чернетку не бачать.",
        notSavedYet: "Щоб зберегти чернетку, потрібні імʼя та вид.",
        saveFailed: "Чернетку не збережено. Перевірте зʼєднання – усе, що ви ввели, лишається тут.",
        save: "Зберегти чернетку",
        saveShort: "Зберегти",
      },
      listed: {
        liveOnSave: "Зміни зʼявляться на картці одразу після збереження.",
        notShownNow: "Цю картку зараз ніхто не бачить.",
        /**
         * His final text (k3-copy-uk.md §10). It waited under
         * `testShelterOnly` by his own note ("If K2's confirmation buttons
         * aren't shipped yet when PR 4 merges, this line waits under
         * testShelterOnly until PR 5.") and is true since K2 (PR 5): an edit
         * never moves `confirmedAt`; «Ще шукає» / «Ще домовляються» in the
         * list and a photo change (RH-B7) do. Published and reserved cards only.
         */
        dateUnchanged:
          "Правки тексту не змінюють дату «Оновлено». Її змінює ваше підтвердження в списку тварин і будь-яка зміна фото.",
      },
      publish: {
        button: "Опублікувати",
        missing: "Щоб опублікувати, ще потрібно: {list}.",
        /** Beside a required field's label while it is empty (after a middle dot). */
        requiredTag: "потрібно для публікації",
        missingTitle: "Щоб опублікувати, ще потрібно:",
        /** `{field}` is the field's own label, `{tab}` the tab that holds it; the whole item is the link. */
        missingItem: "{field} ({tab})",
        allSet: "Усе потрібне заповнено. Можна публікувати.",
        gap: {
          // Sex-filter feature, reversing D2: the same word as `filters.sex`
          // («Стать»), lowercase, in this list's own register (every other
          // entry here is a bare lowercase noun).
          sex: "стать",
          size: "розмір",
          age: "вік",
          description: "опис",
          photo: "фото",
        },
        /**
         * Shown only while the shelter is publicly visible (verified, not
         * paused): a paused or unverified shelter's cards are on no public
         * surface, and «Тепер картку бачать…» would be false. Which line
         * replaces it depends on why (`publishedAnnouncementOf` in the
         * form's `labels.ts`).
         */
        done: "Опубліковано. Тепер картку бачать ті, хто шукає тварину.",
        /**
         * In place of `done` while the shelter has not passed verification
         * (pending, under review, or rejected and free to resubmit), the one
         * state where «щойно притулок пройде перевірку» is true. Never for a
         * paused or suspended shelter, which has passed: that one gets
         * `listingStatus.published` and `listed.notShownNow`, composed
         * (K3-T15). His final text (round 2b, answer 3).
         */
        publishedNotShown:
          "Опубліковано. Ті, хто шукає тварину, побачать картку, щойно притулок пройде перевірку.",
        viewPublic: "Відкрити сторінку тварини",
        stateChanged:
          "Картка змінилася в іншому вікні. Оновіть сторінку, щоб побачити поточну версію.",
      },
      errors: {
        conflict:
          "Хтось змінив цю картку після того, як ви її відкрили. Ваші останні зміни не збережено. Ось поточна версія – внесіть їх ще раз.",
        registryConfirmed: "Це підтверджено державним реєстром тварин, тут змінити не можна.",
        requiredOnceListed: "Картку вже публікували, тож опис не може бути порожнім.",
        notFound: "Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.",
        loadFailed: "Картка не завантажилась. Перевірте зʼєднання і спробуйте ще раз.",
      },
      validation: {
        nameRequired: "Щоб зберегти чернетку, потрібне імʼя.",
        speciesRequired: "Виберіть, собака це чи кіт, щоб зберегти чернетку.",
        nameBrace: "В імені не може бути фігурних дужок.",
        /** «символів» is the form for 60 (pinned). */
        nameTooLong: "Імʼя довше за {max} символів.",
        /** «символів» is the form for 1,500 (pinned). */
        descriptionTooLong: "Опис довший за {max} символів.",
        /**
         * Pet card PR 5, builder's own draft - not his words, mirroring
         * `descriptionTooLong` exactly (same cap, `MEDICAL_NOTES_MAX_CHARACTERS
         * === ANIMAL_DESCRIPTION_MAX_CHARACTERS`), flagged in the PR for his
         * confirm-or-replace rather than held as `[COPY PENDING]` - a pending
         * `kabinet.*` string would turn production sign-in off entirely
         * (`copy-status.test.ts`'s gate), which a cosmetic validation message
         * doesn't warrant risking.
         */
        medicalNotesTooLong: "Текст про здоровʼя довший за {max} символів.",
        birthDateFuture: "Дата народження не може бути в майбутньому.",
        asOfFuture: "Дата «Станом на» не може бути в майбутньому.",
        /** «років» is the form for 30, `AGE_DATE_MAX_YEARS_BACK` (his note: "pin the plural for 30"). */
        dateTooOld: "Ця дата надто давня – понад {years} років тому.",
      },
    },
    /**
     * K2 · the animal list at `/kabinet/tvaryny` (`docs/k2-copy-sheet.md`):
     * Oleksii's final Ukrainian (`k2-copy-uk.md`, 2026-10-18), verbatim, U+02BC
     * as the apostrophe. His rules there, verbatim: "No «ми», no «адоптери», no
     * «реєстр», pronoun-free for the animal." Keys his answers reuse from
     * elsewhere (the draft line `animalForm.draft.notVisible`, a row publish's
     * `animalForm.publish.*`, the suspended and rejected lines
     * `verificationDecision.*Effect`, the dialog fields `profileEdit.pause.*`)
     * are read from their own homes, not copied here.
     *
     * - `captionCards` / `stale.countCards` are the three forms his `{cards}`
     *   takes (nominative for the header, accusative for the strip), picked by
     *   `pluralizeUk`.
     * - `stale.count` types «днів» for `{days}` = `agingMaxDays` (30), pinned in
     *   `copy-plural-pins.test.ts`.
     * - `stale.caption` and `empty.body` say people see the cards, so they show
     *   only while the shelter is verified (his answer 5); otherwise one line
     *   says why (`paused.hidden`, `notVisible.pending`, or R-UI's lines).
     * - `withdrawReason.adopted_elsewhere` is a label only: the dialog offers
     *   the other four codes (`KABINET_WITHDRAWAL_CODES`, his answer 10).
     */
    animalList: {
      pageTitle: "Тварини",
      title: "Тварини",
      caption: "{shelter} · {cards}",
      captionCards: {
        one: "{count} картка",
        few: "{count} картки",
        many: "{count} карток",
      },
      add: "Додати тварину",
      addShort: "Додати",
      filter: {
        label: "Показати",
        all: "Усі",
        draft: "Чернетки",
        published: "Опубліковано",
        reserved: "Домовляються",
        adopted: "Удома",
        withdrawn: "Знято з показу",
        withCount: "{label} · {count}",
      },
      row: {
        adoptedSince: "Удома з {date}",
        withdrawnOn: "Знято з показу {date} · {reason}",
        more: "Ще",
        /** The ⋯ button's accessible name; `{name}` is the animal's name as stored (nominative, never inflected). */
        menuLabel: "Дії з карткою {name}",
      },
      /** The ordering note moved behind a «?» button; this is that button's accessible name. */
      orderInfoLabel: "Як впорядковано список",
      actions: {
        edit: "Редагувати",
        viewOnSite: "Переглянути на сайті",
        reserve: "Почали домовлятися",
        release: "Не домовилися – знову шукає",
        adopt: "Уже вдома",
        withdraw: "Зняти з показу",
        restore: "Повернути в чернетки",
        deleteDraft: "Видалити чернетку",
      },
      confirm: {
        stillLooking: "Ще шукає",
        stillArranging: "Ще домовляються",
        done: "Підтверджено сьогодні",
        undo: "Скасувати · {seconds} с",
        undone: "Скасовано: на картці знову попередня дата.",
        undoExpired:
          "Скасувати вже не можна: час минув або картку змінено. На картці – сьогоднішня дата.",
        failed:
          "Не підтверджено: дата на картці не змінилася. Перевірте зʼєднання і спробуйте ще раз.",
      },
      adoptDialog: {
        title: "{name} уже вдома?",
        body: "Картка зникне з галереї та стрічки, а її сторінка повідомлятиме, що тварини там уже немає. У вашому списку картка лишиться з позначкою «Удома». Скасувати це не можна: якщо тварина повернеться, додайте її як нову картку.",
        confirm: "Так, уже вдома",
      },
      withdrawDialog: {
        title: "Зняти з показу: {name}?",
        body: "Ті, хто шукає тварину, більше не бачитимуть картку, а її сторінка повідомлятиме, що тварини там уже немає. У вашому списку картка лишиться, її можна повернути в чернетки. Якщо опублікувати її знову, дата й час очікування почнуться з того дня.",
        adoptedHint: "Якщо тварина знайшла дім, позначте краще «Уже вдома».",
        confirm: "Зняти з показу",
      },
      withdrawReason: {
        adopted_elsewhere: "дім знайдено іншим шляхом",
        transferred: "переведено до іншого притулку",
        deceased: "тварини не стало",
        listing_error: "додано помилково",
        other: "інша причина",
      },
      moved: {
        reserved: "{name}: почали домовлятися.",
        released: "{name}: знову шукає дім.",
        adopted: "{name}: уже вдома.",
        withdrawn: "{name}: знято з показу.",
        restored: "{name}: повернуто в чернетки.",
      },
      deleteDialog: {
        title: "Видалити чернетку «{name}»?",
        body: "Вона назавжди зникне з вашого списку.",
        photosStay:
          "Файли фото не видаляються одразу – якщо їх треба прибрати зовсім, напишіть мені.",
        confirm: "Видалити",
      },
      deleted: "Чернетку «{name}» видалено.",
      stale: {
        count: "{cards} ви не підтверджували понад {days} днів.",
        countCards: {
          one: "{count} картку",
          few: "{count} картки",
          many: "{count} карток",
        },
        caption:
          "Ті, хто шукає тварину, бачать на них давню дату. Якщо нічого не змінилося, достатньо натиснути «Ще шукає» чи «Ще домовляються».",
        show: "Показати ці {count}",
        showAll: "Показати всі",
      },
      paused: {
        hidden: "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає.",
      },
      notVisible: {
        pending: "Опубліковані картки зʼявляться в галереї, щойно притулок пройде перевірку.",
      },
      orderNote:
        "Порядок у галереї – за датою: людина сама обирає, спочатку найсвіжіші картки чи ті, хто чекає найдовше. Повнота картки впливає лише на порядок у режимі «по одній». Тут порядок змінити не можна, і просування немає.",
      empty: {
        title: "Тут поки немає тварин.",
        body: "Додайте першу. Ті, хто шукає тварину, побачать картку після публікації.",
        add: "Додати першу тварину",
        caption: "Щоб зберегти чернетку, потрібні імʼя та вид – решту можна дописати пізніше.",
      },
      loading: "Завантаження",
      loadMore: "Показати ще",
      filterEmpty: "У цій групі поки немає карток.",
      loadFailed: "Список не завантажився. Перевірте зʼєднання і спробуйте ще раз.",
      errors: {
        rateLimited: "Забагато дій за короткий час. Зачекайте хвилину й спробуйте ще раз.",
        actionFailed: "Не вдалося. Перевірте зʼєднання і спробуйте ще раз.",
      },
    },
    /**
     * The kabinet's section nav (N2, kabinet redesign Phase 2 PR 1):
     * «Тварини» · «Притулок» (`profile.title`, renamed from
     * «Профіль притулку»). Owner-approved copy, 2026-10-28.
     */
    nav: {
      label: "Розділи кабінету",
      animals: "Тварини",
    },
    /**
     * `WAS_PUBLISHED`, the one answer for both causes (K-Q9). His Q2: the first
     * clause kept, «лише зняти з показу» dropped. Nothing in it may vary with
     * whether anyone swiped or asked about the animal (commitment #2).
     */
    deleteDraft: {
      refused: {
        wasPublished:
          "Цю картку вже публікували, тож видалити її не можна. Вона лишається у вашому списку як чернетка, і ті, хто шукає тварину, її не бачать.",
      },
    },
    /** S5 · support mode (N16): the operator's read-only view of this page. */
    support: {
      /**
       * Renamed per Oleksii's answer 3 (2026-10-14), in place of changing the
       * /prytulkam A3 sentence. EM-Q2 (Oleksii, 2026-10-14, verbatim: "the
       * banner addresses the operator; no name hard-coded"): the banner is on
       * the operator's own screen, so it speaks to them. Final as his draft
       * stood (2026-10-14). `{shelter}` is the shelter's name, filled by
       * `SupportBanner`.
       */
      title:
        "Ви переглядаєте кабінет притулку «{shelter}» – лише перегляд, змінити нічого не можна.",
      /**
       * Row 70, final (2026-10-14). It deliberately leaves out `{shelter}`: the
       * title already names the shelter and says read-only. Oleksii's note,
       * verbatim: "70: deliberately short. Row 69 already names the shelter
       * and says read-only; no person's name."
       */
      body: "Так кабінет бачить адміністратор притулку.",
      exit: "Вийти з режиму перегляду",
      exitFailed: "Не вдалося вийти з режиму перегляду. Спробуйте ще раз.",
      viewingAs: "як адміністратор притулку",
      signOutDisabled: "Вихід вимкнено",
    },
    /**
     * The two kabinet emails (`docs/h2-invite-copy-sheet.md` E1/E2), Oleksii's
     * final Ukrainian (2026-10-14). The invite email is a personal note in his
     * «я» voice (IN-E14), signed `- {operator}` on its last line (`notYou`):
     * the display name, nominative, from the same config as the history
     * actor. The sign-in email took the same personal shape on 2026-10-14
     * (his delivery test 2: the invite reached Gmail's Primary tab, the short
     * impersonal sign-in email Promotions): «Добрий день.» opens it and the
     * same `- {operator}` signs its `notYou`. The plural nouns in `signIn.expiry` («хвилин», 15) and
     * `invite.expiry` («години», 72) are typed for those exact values;
     * `copy-plural-pins.test.ts` fails if a TTL changes under them. `action`
     * is the link's label in the HTML part: a label, never the URL itself
     * (IN-E8: link text naming one domain over an href naming another is a
     * phishing signal). Values in `{braces}` are filled by the builder.
     * `invite.what` is his PR 6 text (pr6-copy-uk.md §1.4): what a shelter
     * changes itself once its writes are open, and what still goes through
     * him. `invite.intro`'s «у реєстрі» is #123's to change (CB-B2), not
     * PR 6's.
     */
    email: {
      signIn: {
        subject: "Посилання для входу до кабінету притулку",
        intro: "Добрий день. На цю адресу запитали посилання для входу до кабінету притулку.",
        action: "Відкрити сторінку входу",
        expiry: "Посилання спрацює один раз і діє {minutes} хвилин.",
        notYou:
          "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.\n- {operator}",
      },
      invite: {
        subject: "Ваш доступ до кабінету притулку",
        intro:
          "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» на сайті {site}.",
        /**
         * Q-C (Oleksii, 2026-10-19): the invite's second sentence depends on the
         * shelter's verification status at send time. `what` for a verified or
         * paused shelter; `whatBeforeVerification` for pending, under review,
         * suspended and rejected (PC-T10), which includes the first invite, sent
         * at create. The rest of the paragraph is
         * the same in both.
         */
        what: "У кабінеті ви бачите дані притулку – і те, що бачать люди, і дані з перевірки. Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі, і зміни зʼявляються одразу після збереження. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки – юридичну особу, ЄДРПОУ чи адресу, – напишіть мені.",
        whatBeforeVerification:
          "У кабінеті ви бачите дані притулку – і те, що бачать люди, і дані з перевірки. Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі. Ті, хто шукає тварину, побачать їх, щойно притулок пройде перевірку. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки – юридичну особу, ЄДРПОУ чи адресу, – напишіть мені.",
        action: "Створити пароль",
        expiry: "Запрошення діє {hours} години. Якщо не встигнете – я надішлю нове.",
        /**
         * PW-2 (Oleksii, 2026-10-20, Q2, verbatim): the link sets a password, so whoever holds it
         * can; the paragraph says so, and not to forward it. Signed `- {operator}` as before.
         */
        notYou:
          "Якщо ви не чекали цього листа, просто проігноруйте його і нікому не пересилайте: це посилання один раз дає змогу створити пароль для цієї адреси, поки запрошення діє.\n- {operator}",
      },
      /**
       * F1, the reset link (`docs/shelter-passwords-copy-uk.md`, his Ukrainian, 2026-10-19,
       * verbatim), sent only to a shelter admin's address. `{minutes}` is the link's lifetime,
       * 60; «хв.» needs no plural. `action` is the link's label in the HTML part (IN-E8). Signed
       * `- {operator}` like the other emails.
       */
      reset: {
        subject: "Новий пароль до кабінету притулку",
        intro: "Надійшов запит на новий пароль до кабінету притулку для цієї адреси.",
        action: "Створити новий пароль",
        expiry: "Посилання спрацює один раз і діє {minutes} хв.",
        notYou:
          "Якщо запит надіслали не ви, просто не зважайте на цей лист: пароль залишиться тим самим.\n- {operator}",
      },
      /**
       * F2, the notice after a reset and after a change (his §9 answer 4, verbatim: "Yes:
       * «пароль змінено» after a change too."), his Ukrainian, verbatim. No link. `{contact}` is
       * the Reply-To address (`EMAIL_REPLY_TO`), filled from config.
       */
      passwordChanged: {
        subject: "Кабінет притулку: пароль змінено",
        body: "Пароль до кабінету притулку для цієї адреси щойно змінено. На інших пристроях виконано вихід.",
        notYou: "Якщо це не ви – напишіть мені: {contact}\n- {operator}",
      },
    },
    /**
     * Under the sign-in card's «check your email» (IN-E7's resolution): the
     * same card for every address, so the fallback names a person to write
     * to instead of saying which addresses failed. `{contact}` is filled by
     * the page from config, never typed here. Rendered on the K1 card in this
     * PR (IN-T9).
     */
    signInCard: {
      notArrived: "Якщо лист не прийшов за кілька хвилин, напишіть мені на {contact}.",
    },
    /**
     * The invitation link's page (`/kabinet/vkhid?zaproshennia=<token>`) when the link can't be
     * used: unknown, expired, used or withdrawn all read the same (PW-2 Q1). His strings from
     * `docs/h2-invite-copy-sheet.md` L; the form itself is `setPassword` (PW-2). `pageTitle` is the
     * page's `<title>` in every state. The magic-link landing's own strings (`ready`, `send`,
     * `sent`, `title`, `alreadyAccepted`, `rateLimited`) went with it (his copy sheet, B:
     * "removed when PW-2 ships").
     */
    inviteLanding: {
      pageTitle: "Запрошення до кабінету",
      /** Heading of the one page every link that can't be used gets (PW-2 Q1). */
      unusableTitle: "Цим запрошенням не можна скористатися",
      /**
       * His 2026-10-21 revision (PW-2 review, Q2 (b)): one text for every broken link, whether
       * the password was already set with it or not (`docs/h2-invite-copy-sheet.md` L).
       */
      expired:
        "Посилання вже не діє. Якщо пароль уже створено – увійдіть. Якщо ні – напишіть мені, і я надішлю нове запрошення.",
      signIn: "Перейти до входу",
    },
    /**
     * What the operator's side shows after an invite (IN-E13). The sending
     * address is `{sender}`, filled from config (the From address), never
     * typed here: the name is not final. Oleksii's final text (2026-10-14) is
     * a reminder to the operator, impersonal, with no gendered past.
     */
    registry: {
      inviteSent: {
        tellPersonally:
          "Повідомте притулок особисто: запрошення надіслано з {sender}. Якщо листа не видно – хай перевірить вкладку «Промоакції».",
      },
    },
    /**
     * The page an emailed sign-in link opens (IN-Q11): one button, and only
     * its POST signs in, so a mail scanner opening the link burns nothing.
     * Keys and English sense: `docs/h2-invite-copy-sheet.md` P.
     */
    confirm: {
      title: "Вхід до кабінету притулку",
      intro: "Натисніть кнопку, щоб завершити вхід.",
      submit: "Увійти",
      invalid: "Це посилання вже використане або втратило силу.",
      requestNew: "Отримати нове посилання",
      /**
       * IN-Q12: signed in, but the invitation's accept failed. Shown on the
       * «Увійти» response and on `/kabinet`; the person stays signed in.
       */
      joinFailed:
        "Доступ до притулку ще не додано. Натисніть «Спробувати ще раз». Якщо не вийде, сайт спробує знову, коли ви наступного разу ввійдете.",
      /**
       * The failure answer's heading, on the «Увійти» response and on
       * `/kabinet`'s `JoinFailedCard` (IN-T12 item 7, Oleksii 2026-10-14:
       * "reuse K1's card (approved), with its own heading key"). Final as his
       * draft stood (2026-10-14).
       */
      joinFailedTitle: "Ви увійшли, але приєднати вас до притулку не вдалося",
      joinRetry: "Спробувати ще раз",
      /**
       * The over-limit card (IN-T15, Oleksii: "the over-limit card ships
       * before production sign-in is turned on"): «Увійти» refused by the
       * kabinet's per-IP limit (300 a minute, `hooks.before`) before Better
       * Auth read the token, so the link is still good and the card offers
       * the same button again. Oleksii's text, 2026-10-15 (inbox WI-Q3), with
       * «Увійти» in «» since CB-Q1 (2026-10-17),
       * shipped after both of its claims were checked: the per-IP window is
       * 60 s, so «хвилину» holds, and a refused press never reaches the
       * token, so «Посилання ще дійсне» holds until the 15-minute expiry
       * (`auth.test.ts`, "a press refused at t goes through … 60 s later").
       * A longer window would make «хвилину» false: then it reads «трохи».
       */
      rateLimited:
        "Забагато спроб входу за короткий час. Посилання ще дійсне – зачекайте хвилину й знову натисніть «Увійти».",
    },
    /**
     * History lines (IN-Q14). Only `admin_joined` has a key so far; no
     * history renderer exists yet. Ukrainian past tense is gendered, so the
     * line avoids «приєднався/приєдналася» (final, 2026-10-14). Keys:
     * `docs/h2-invite-copy-sheet.md` H.
     */
    history: {
      adminJoined: "{email} отримує доступ до кабінету",
    },
    /**
     * R-UI · the operator's own screens (`docs/r-ui-copy-sheet.md`, keys and
     * English sense; `docs/r-ui-plan.md`, the screens). Every string is
     * Oleksii's final Ukrainian (`rui-copy-uk.md`, 2026-10-17), applied
     * verbatim for all three R-UI PRs at once, U+02BC as the apostrophe. His
     * answer 1, verbatim: "Copy gate: no exemption. Copy for all three PRs is
     * final in D:\opika-worktrees\rui-copy-uk.md." These screens address the
     * operator as «ви»; history lines are impersonal, the actor shown apart
     * («{line} · {actor}»).
     *
     * Two strings were checked against the code at his request ("verify
     * blocked.unknown.provider_suppresses and create.descriptionHint against
     * code; if my wording is wrong, use the true wording and log it"), found
     * untrue as drafted, and replaced by his round-2 answer 5; each says why
     * at its key. Reused, no key here:
     * `profile.donationTitle`, `profile.addressNote`, `profile.legalName`,
     * `profile.edrpou`, `profile.contactPerson`, `profileEdit.state.retry`.
     */
    operator: {
      shell: {
        role: "адміністратор сайту",
        nav: {
          shelters: "Притулки",
          newShelter: "Новий притулок",
        },
        pageTitle: {
          list: "Притулки",
          create: "Новий притулок",
          shelter: "{name}",
        },
      },
      list: {
        title: "Притулки",
        total: "Усього: {count}",
        create: "Новий притулок",
        createShort: "Новий",
        search: "Пошук за назвою",
        orderNote: "Спочатку ті, що чекають на ваше рішення.",
        filterAll: "Усі · {count}",
        filterStatus: "{status} · {count}",
        admins: "Адміністраторів: {count}",
        adminsInvited: "Запрошено: {count}",
        noAdmins: "Немає ні адміністраторів, ні запрошень",
        donationPending: "Посилання на збір чекає на рішення",
        open: "Відкрити",
        empty: "Притулків ще немає. Перший можна додати через «Новий притулок».",
        noMatch: "Нічого не знайдено. Змініть пошук або фільтр.",
        loadMore: "Показати ще",
        loadFailed: "Список не завантажився.",
      },
      shelter: {
        back: "← Притулки",
        meta: "{city} · {admins}",
        /** `{date}`, the day the current status began (Kyiv), not a day count: no plural, no drift. */
        timeInState: "з {date}",
        legalNote:
          "Ці поля притулок бачить лише для читання. Зміна юридичної особи чи ЄДРПОУ не змінює статус автоматично – рішення за вами.",
        descriptionTitle: "Опис притулку",
      },
      donation: {
        live: "Чинне посилання",
        none: "Посилання немає",
        proposed: "Притулок запропонував {host} {date}. Чекає на ваше рішення.",
        approve: "Схвалити",
        reject: "Відхилити",
        approved: "Посилання схвалено.",
        rejected: "Посилання відхилено.",
        conflict: "Пропозиція змінилася, поки сторінка була відкрита. Тут – поточна.",
      },
      admins: {
        title: "Адміністратори",
        joined: "Має доступ",
        invitedUntil: "Запрошено · посилання діє до {date}",
        invitedExpired: "Запрошено · посилання вже не діє",
        none: "Адміністраторів немає",
        remove: "Прибрати",
        removeConfirm: {
          title: "Закрити доступ? {name} більше не зможе входити в кабінет.",
          body: "Доступ до кабінету закриється одразу, усі сеанси завершаться.",
        },
        inviteAnother: "Запросити ще одного",
        /** The invite button while the shelter has no admin and no invitation (N7). */
        inviteFirst: "Запросити адміністратора",
        resend: "Надіслати ще раз",
        gone: "Цей доступ уже закрито.",
      },
      evidence: {
        title: "Докази для перевірки",
        empty: "Доказів поки немає.",
        kind: {
          edrpou_registration: "Реєстрація · ЄДРПОУ",
          bank_account_holder: "Власник банківського рахунку",
          reference_contact: "Рекомендація",
          site_visit: "Візит на місце",
          supporting_document: "Документ",
        },
        added: "додано {date}",
        field: {
          registeredName: "Назва в ЄДР",
          holderName: "Власник рахунку",
          who: "Хто",
          channel: "Як звʼязатися",
          relationship: "Ким доводиться притулку",
          visitedOn: "Дата візиту",
          notes: "Нотатка",
          label: "Підпис",
        },
        relationship: {
          veterinary_clinic: "Ветклініка",
          local_authority: "Місцева влада",
          partner_organisation: "Партнерська організація",
          other: "Інше",
        },
        noDocument: "Документ не додано – для цього типу доказу це дозволено.",
        gaps: "Для схвалення бракує: {kind} – {provided} з {minimum}.",
        add: "+ Додати доказ",
        remove: "Прибрати",
        typePicker: "Тип доказу",
        siteVisitDateHint: "Дата візиту не може бути в майбутньому.",
      },
      blocked: {
        title: "Адреси, на які поштовий сервіс не доставляє листи",
        none: "Перевірено: жодна адреса цього притулку не заблокована.",
        line: "{email} – {reason}",
        incomplete: "Список заблокованих адрес вдалося отримати лише частково.",
        unknown: {
          provider_error: "Поштовий сервіс відповів помилкою.",
          timed_out: "Поштовий сервіс не відповів вчасно.",
          unsupported_provider: "Цей поштовий сервіс не дає перевірити блокування.",
          /**
           * His round-2 replacement (answer 5), verbatim. His first draft
           * («Поштовий сервіс не показує список заблокованих адрес.») said the
           * provider shows no list. What the code means (`email-provider.ts`,
           * `BlockedStatus`): Resend keeps its own suppression list, and this
           * site doesn't read it (follow-up EM-F1). This wording says exactly
           * that.
           */
          provider_suppresses:
            "Поштовий сервіс має власний список заблокованих адрес; сайт його не перевіряє.",
        },
        asOf: "Станом на {time}",
        manualUnblock: "Розблокувати адресу можна лише в кабінеті поштового сервісу, не тут.",
      },
      history: {
        title: "Історія",
        note: "Зміни статусу, даних, адміністраторів, збору коштів і тварин. Підтвердження «Ще шукає» і «Ще домовляються» тут не записуються.",
        empty: "Записів ще немає.",
        more: "Показати ще",
        actor: {
          you: "ви",
          formerAdmin: "колишній адміністратор",
          operator: "адміністратор сайту",
        },
        shelter_created: "Притулок створено",
        shelter_created_script: "Притулок додано з файлу",
        verification: {
          start_review: "Взято на розгляд",
          approve: "Схвалено → «Перевірено»",
          reject: "Відхилено: {code}. {note}",
          suspend: "Призупинено: {code}. {note}",
          reinstate: "Відновлено → «{status}»",
          resubmit: "Повернуто на перевірку",
          pause: "Прийом тварин призупинено",
          resume: "Паузу знято",
        },
        admin_invited: "Надіслано запрошення: {name}, {email}",
        admin_invitation_resent: "Запрошення надіслано ще раз: {name}",
        admin_removed: "Доступ закрито: {name}",
        admin_removed_pending: "Запрошення скасовано: {name}",
        contact_changed: "Змінено контакти",
        freshness_sentence_changed: "Змінено речення на сторінці притулку",
        description_changed: "Змінено опис притулку",
        /**
         * Pet card PR 3b. Shipped as the builder's own draft (not
         * `[COPY PENDING]` - no `kabinet.*` string may be, since PR 6:
         * `copy-status.test.ts`), same pattern as the other `*_changed`
         * lines above it. Flagged for Oleksii's confirm-or-replace.
         */
        logo_changed: "Змінено логотип притулку",
        donation_proposed: "Запропоновано посилання на збір: {host}",
        donation_proposal_cancelled: "Пропозицію посилання скасовано",
        donation_approved: "Посилання на збір схвалено",
        donation_rejected: "Посилання на збір відхилено",
        verified_data_changed: {
          legal_entity: "Змінено юридичні дані",
          exact_address: "Змінено адресу приміщення",
        },
        animals_imported: "Додано тварин з файлу: {count}",
        animal_created: "Створено картку: {name}",
        animal_edited: "Змінено картку {name}: {fields}",
        animal_listing_changed: "{name}: «{from}» → «{to}»",
        animal_deleted: "Видалено чернетку: {name}",
      },
      create: {
        title: "Новий притулок",
        intro:
          "Тут ви вносите все про притулок: назву, адресу, юридичні дані й докази. Перший адміністратор отримає запрошення на пошту.",
        name: "Назва притулку",
        /**
         * His sentence, narrowed. R-UI 4 lets the operator rename a shelter
         * on S4, which made his second sentence («Після створення назву поки
         * змінити не можна - перевірте написання.») false; his answer 8,
         * verbatim: "Update create.nameHint when it ships." The false sentence
         * is deleted and nothing is added (a deletion needs no new copy); a
         * fuller hint, if he wants one, is his to write.
         */
        nameHint: "Як притулок називає себе.",
        description: "Опис притулку",
        /**
         * His round-2 replacement (answer 5), verbatim. His first draft said
         * people looking for an animal see it on the shelter's animal pages,
         * which no page does: the animal page reads the shelter's
         * `freshnessSentence` instead (`AnimalDetailScreen.tsx`), and only the
         * operator's own S4 renders the description. It can be public all the
         * same: the public `shelters.byId` returns it for a verified shelter.
         * «Може бути публічним» claims exactly that much.
         */
        descriptionHint:
          "Короткий опис притулку. Він може бути публічним, тож не пишіть тут нічого приватного.",
        city: "Населений пункт",
        address: {
          line1: "Вулиця, будинок",
          line2: "Корпус, приміщення · необовʼязково",
          postalCode: "Індекс · необовʼязково",
        },
        coordinates: "Координати",
        coordinatesHint:
          "Скопіюйте з карти у форматі «широта, довгота». Ніде не показуються: люди бачать лише місто.",
        legalTitle: "Юридичні дані",
        legalKind: {
          registered_ngo: "Громадська організація чи фонд",
          sole_proprietor: "ФОП",
          unregistered_initiative: "Ініціатива без реєстрації",
        },
        registeredAt: "Дата реєстрації",
        firstAdminTitle: "Перший адміністратор",
        firstAdminHint:
          "Отримає запрошення на пошту: за посиланням створить пароль і увійде. Інших адміністраторів можна запросити зі сторінки притулку.",
        adminName: "Імʼя",
        submit: "Створити й надіслати запрошення",
        submitShort: "Створити",
        cancel: "Скасувати",
        whatHappens: {
          title: "Що буде далі",
          step1: "Притулок зʼявиться у списку зі статусом «Очікує».",
          /** «72 години» is typed for INVITATION_TTL_MS; `copy-plural-pins.test.ts` pins it. */
          step2:
            "{name} отримає запрошення: посилання, щоб створити пароль, діє 72 години. Його можна надіслати ще раз.",
          step3: "Тварин притулку не буде в галереї, доки ви не схвалите перевірку.",
        },
        created: "Притулок створено.",
        createdNoInvite:
          "Притулок створено, але без адміністратора. Запросіть його зі сторінки притулку.",
        inviteValidUntil: "Посилання діє до {date}, {time}.",
        resend: "Надіслати ще раз",
        openShelter: "Відкрити притулок",
        errors: {
          addressHasARole: {
            shelter_admin: "Ця адреса вже має доступ до іншого притулку.",
            operator: "Це адреса адміністратора сайту. Для притулку потрібна інша.",
            invited_elsewhere: "На цю адресу вже надіслано чинне запрошення до іншого притулку.",
          },
          siteVisitInFuture: "Дата візиту не може бути в майбутньому.",
          unknownCity: "Такого населеного пункту немає у списку.",
          lostAnswer:
            "Відповідь не надійшла. Притулок міг створитися – перевірте список, перш ніж пробувати знову.",
          failed: "Не вдалося створити притулок. Спробуйте ще раз.",
          required: "Це поле потрібне.",
          /**
           * RUI4-F2 (his answer, 2026-10-18, verbatim: "Error copy: «Назва довша
           * за {max} символів.» (plural pin for 100)"). The display name, on S2
           * and on S4's rename; `{max}` is `SHELTER_DISPLAY_NAME_MAX_CHARACTERS`,
           * and «символів» is the form for 100 (`copy-plural-pins.test.ts`).
           */
          nameTooLong: "Назва довша за {max} символів.",
          edrpouFormat: "Код ЄДРПОУ – 8 цифр.",
          coordinatesFormat:
            "Вкажіть координати як «широта, довгота», наприклад «50.4501, 30.5234».",
        },
      },
      email: {
        sent: "Запрошення надіслано на {email}.",
        sentUnchecked: "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
        blocked: {
          unsubscribed: "Запрошення не надіслано: людина з цієї адреси відписалася від листів.",
          hard_bounce: "Запрошення не надіслано: адреса не існує або не приймає пошту.",
          spam_complaint:
            "Запрошення не надіслано: на попередній лист з цієї адреси поскаржилися як на спам.",
          admin_blocked: "Запрошення не надіслано: адресу заблоковано вручну в поштовому сервісі.",
        },
        failed: {
          provider_error:
            "Запрошення не надіслано: поштовий сервіс відповів помилкою. Спробуйте надіслати ще раз.",
          copy_pending: "Запрошення не надіслано: текст листа ще не готовий.",
        },
      },
      verification: {
        decisionTitle: "Рішення",
        /** His note: true once Q7's shelter-side view (`verificationDecision`) ships, in R-UI 3. */
        decisionCaption: "Притулок побачить рішення і пояснення дослівно у своєму кабінеті.",
        startReview: "Взяти на розгляд",
        approve: "Схвалити → «Перевірено»",
        approveShort: "Схвалити",
        approveNote:
          "Після схвалення тварини притулку одразу зʼявляються в галереї. Для відхилення потрібне пояснення.",
        approveBlocked: "Схвалити поки не можна – бракує доказів:",
        reject: "Відхилити…",
        suspend: "Призупинити…",
        reinstate: "Відновити → «{status}»",
        resubmit: "Повернути на перевірку",
        suspended: {
          title: "Притулок призупинено",
          reasonLabel: "Пояснення, яке бачить притулок",
          priorLabel: "До призупинення статус був",
          priorPausedSince: "з {date} притулок сам поставив паузу",
          reinstateExplainPaused:
            "Кнопка «Відновити» поверне притулок на паузу, а не в «Перевірено». Тварини лишаться прихованими, доки притулок сам не зніме паузу.",
          reinstateExplainVerified:
            "Кнопка «Відновити» поверне статус «Перевірено», і тварини знову зʼявляться в галереї.",
        },
        noConfirm: "Підтвердження не потрібне: ця дія нічого не приховує.",
        rejected: {
          title: "Відхилено",
          reason: "{code}. {note}",
        },
      },
      reasonDialog: {
        rejectTitle: "Відхилити «{shelter}»?",
        suspendTitle: "Призупинити «{shelter}»?",
        rejectBody:
          "Притулок побачить це пояснення дослівно у своєму кабінеті. Його тварин не буде в галереї.",
        suspendBody:
          "Тварини притулку одразу зникнуть із галереї. Притулок побачить це пояснення у своєму кабінеті. Відновити можна будь-коли.",
        codeLabel: "Причина",
        reasonLabel: "Пояснення",
        reasonHint: "Обовʼязково. Пишіть так, щоб людина знала, що робити далі.",
        confirmReject: "Відхилити",
        confirmSuspend: "Призупинити",
      },
      codes: {
        rejection: {
          insufficient_evidence: "Недостатньо доказів",
          identity_unverifiable: "Не вдалося підтвердити, хто стоїть за притулком",
          duplicate_submission: "Повторна заявка",
          out_of_service_area: "Поза територією, де працює сайт",
          spam: "Спам",
          other: "Інше",
        },
        suspension: {
          unresponsive: "Немає звʼязку з притулком",
          complaint_upheld: "Скарга підтвердилася",
          listing_quality: "Картки не відповідають дійсності",
          suspected_fraud: "Підозра на шахрайство",
          other: "Інше",
        },
      },
      errors: {
        illegalTransition: "З поточного статусу так не можна. Сторінку оновлено.",
        conflictReload: "Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.",
        failed: "Не вдалося. Спробуйте ще раз.",
        lostAnswer: "Відповідь не надійшла. Сторінка перевіряє, чи дію виконано.",
      },
      support: {
        enter: "Переглянути як притулок · лише читання",
      },
    },
    /**
     * R-UI 3 · the shelter's side of a rejection or suspension (RU-Q7, his
     * answer 7, verbatim: "Yes: a minimal shelter-side view in R-UI 3 showing
     * the code and my note verbatim (keys in rui-copy-uk.md §3.4)."), his
     * final Ukrainian. The note follows `noteLabel` verbatim, as a quote,
     * then `signature`.
     */
    verificationDecision: {
      rejectedTitle: "Перевірку не пройдено",
      suspendedTitle: "Притулок тимчасово призупинено",
      reason: "Причина: {code}.",
      /**
       * His round-2 answer 2, verbatim: "Reason view on the shelter side:
       * «Пояснення:», then my note verbatim, then a signature line «— {operator}»
       * (nominative, as in the emails). No new env var." It replaces his §3.4
       * «Пояснення від {operator}:», whose «від» needed a genitive name that
       * isn't configured (RS-Q2 holds the nominative only).
       */
      noteLabel: "Пояснення:",
      /**
       * The line under the note (round-2 answer 2, above). `{operator}` is the
       * name standing alone, as both emails sign: `standaloneOperatorName`, the
       * configured name, else «Адміністратор сайту».
       */
      signature: "- {operator}",
      contact: "Якщо маєте питання, напишіть мені.",
      suspendedEffect: "Поки притулок призупинено, його тварин немає в галереї.",
      rejectedEffect: "Тварин притулку не буде в галереї, доки перевірку не пройдено.",
    },
    /**
     * The words `operator.history.animal_listing_changed` («{name}: «{from}» →
     * «{to}»») and `animal_edited` («Змінено картку {name}: {fields}») fill in.
     * His R-UI file gives those lines but not the words, so these are his own
     * K3 words, verbatim from his K3 answers (`k3-copy-uk.md`, 2026-10-17):
     * `kabinet.listingStatus.*` for a listing's state, and the K3 form's field
     * labels (`who.nameLabel`, `who.speciesLabel`, `who.sexLabel`,
     * `who.sizeLabel`, `age.title`, `description.title`, `photos.title`). The
     * two medical fields reuse `medical.vaccination` and `medical.spayNeuter`,
     * which his K3 answer 6 makes the form's own labels too. Held here, not
     * under the K3 keys, because PR 4 adds those keys itself; once both have
     * merged, one copy of each word is enough (follow-up).
     */
    animalHistoryLabels: {
      listing: {
        draft: "Чернетка",
        published: "Опубліковано",
        reserved: "Домовляються",
        adopted: "Удома",
        withdrawn: "Знято з показу",
      },
      field: {
        name: "Імʼя",
        species: "Вид",
        sex: "Стать",
        size: "Розмір",
        age: "Вік",
        description: "Опис",
        photos: "Фото",
        /** DR1 (S3), his text (2026-10-20). */
        coatLength: "Шерсть",
        /** Pet card redesign; his approval is quoted at `animalForm.colour`. */
        temperament: "Характер",
        colour: "Забарвлення",
        /**
         * Here though the note's form field waits for PR 5 (inbox PC1-D1): a
         * history line only names the field, which is true whenever the note
         * is written, and `shelter.animals.update` already takes it.
         */
        medicalNotes: "Медичний стан",
      },
    },
  },
} as const;
