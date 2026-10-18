import { describe, expect, it } from "vitest";
import { pendingCopyKeys, pendingCopyPaths } from "./copy-status";
import { en } from "./messages/en";
import { COPY_PENDING, PENDING_R4_2_ANALYTICS_SENTENCE, uk } from "./messages/uk";

describe("pendingCopyKeys", () => {
  it("names the keys still holding a placeholder, sorted", () => {
    const group = {
      written: "Справжній текст.",
      pending: `${COPY_PENDING} something`,
      alsoPending: `${COPY_PENDING} something else`,
    };
    expect(pendingCopyKeys(group)).toEqual(["alsoPending", "pending"]);
  });

  it("returns nothing once every string is real", () => {
    expect(pendingCopyKeys({ a: "Текст", b: "Ще текст" })).toEqual([]);
  });

  it("does not match a string that merely mentions the sentinel mid-sentence", () => {
    // Prefix, not `includes` — otherwise a paragraph that legitimately quoted
    // the marker (this file's own docs, a future style guide) would read as
    // unwritten copy forever.
    expect(pendingCopyKeys({ a: `see ${COPY_PENDING} for details` })).toEqual([]);
  });
});

/**
 * The Ukrainian has landed, so this is now the assertion that it stays landed.
 * It was a count of what was outstanding while the page was structure-only;
 * emptying it is the signal that Phase T's copy is done.
 *
 * It still earns its place: a section added later without copy, or a string
 * reverted to a placeholder mid-edit, fails here rather than reaching the one
 * page in this project that a shelter is *sent* to.
 */
describe("«Для притулків» copy status", () => {
  it("has no placeholders left — every section is written", () => {
    expect(pendingCopyKeys(uk.forShelters)).toEqual([]);
  });

  it("still has every section the argument document specifies", () => {
    // Guards the guard: `toEqual([])` above also passes against an empty
    // object, so deleting a section rather than writing it would look
    // identical without this.
    const sections = Object.keys(uk.forShelters).filter(
      (key) => key !== "title" && key !== "headings",
    );
    expect(sections.length).toBe(14);
  });

  it("gives every section a heading, and no heading without a section", () => {
    // §4b and §6b are continuations of §4 and §6 and share their headings, so
    // headings are deliberately fewer than sections — pinned, not incidental.
    const headings = Object.keys(uk.forShelters.headings);
    expect(headings.length).toBe(12);
    for (const heading of headings) {
      expect(Object.keys(uk.forShelters)).toContain(heading);
    }
  });
});

/**
 * D-2 (`docs/observations.md`): both strings are now live — `DeckScreen.tsx`
 * shows `deckLabel`, and the root layout defaults to `bannerNotice` as the
 * description while `REGISTRY_HAS_NO_REAL_SHELTERS` (Option B, 2026-09-06:
 * `/prytulkam` and `/pro` override this default with their own opening
 * sentences instead — see `app/prytulkam/page.tsx`/`app/pro/page.tsx`).
 * Provenance: drafted by Claude from an English sense; Oleksii selected
 * these from offered options on 2026-09-05. Same shape as the
 * `forShelters` assertion above: this stays empty, and it fails the moment
 * either string reverts to a placeholder mid-edit.
 */
describe("demo-mode copy status (D-2)", () => {
  it("has no placeholders left — both strings are written", () => {
    expect(pendingCopyKeys(uk.demo)).toEqual([]);
  });

  it("still has both keys the D-2 row specifies", () => {
    // Guards the guard: `toEqual([])` above also passes against an empty
    // object, so deleting a key rather than writing it would look identical
    // without this.
    expect(Object.keys(uk.demo).length).toBe(2);
  });
});

/**
 * Oleksii's Phase D decisions (the not-a-judgement notice — not
 * build-plan.md's D-3 row, an unrelated robots-metadata task): the "«Не
 * зараз» is a filter, not a judgement" sentence — a standing product rule
 * (`docs/standing-constraints.md`), not decoration — lost its only home
 * when `FirstRunBand` was deleted. Landed 2026-09-06: recovered verbatim,
 * including «просто», from the original disclaimer — already-shipped copy
 * of Oleksii's, reproduced exactly rather than redrafted, so it needs no
 * fresh approval. Interim home was the detail page
 * (`AnimalDetailScreen.tsx`); R2 (Phase R, `docs/build-plan.md`) moved it
 * to its permanent one, the deck (`SwipeDeck.tsx`), and dropped `next`
 * (`uk.actions.next`, «Далі») along with the button it labelled — 5 keys
 * became 4, not 5 again with a different member.
 */
describe("deck not-a-judgement notice copy status", () => {
  it("has no placeholder left — the notice is written", () => {
    expect(pendingCopyKeys(uk.actions)).toEqual([]);
  });

  it("still has every key `uk.actions` is expected to carry", () => {
    // Guards the guard: `toEqual([])` above also passes against an empty
    // object, so deleting `notAJudgementNotice` rather than writing it would
    // look identical without this.
    expect(Object.keys(uk.actions).length).toBe(4);
  });
});

/**
 * The kabinet's Ukrainian is final: Oleksii's answer of 2026-10-14 to the
 * 91-row copy export for PR #94 (relayed by the coordinating session), applied
 * to `uk.ts` verbatim. Everything under `kabinet.*` is written. Row 70
 * (`support.body`) leaves out `{shelter}` on purpose (his note: "70:
 * deliberately short. Row 69 already names the shelter and says read-only; no
 * person's name.").
 *
 * The production copy gate (`productionSignInOf`, answer 7) reads the same
 * catalogue, so an empty list here is what lets that gate stop being a reason
 * production sign-in is off.
 *
 * One key was pending for a while in the wiring PR: `confirm.rateLimited`, the
 * over-limit card's notice (IN-T15's gate item; inbox WI-Q3). His text landed
 * 2026-10-15 and is pinned in FINAL below, so nothing under `kabinet.*` is
 * pending and the copy gate no longer keeps production sign-in off.
 */
describe("kabinet copy status (final, 2026-10-14; the over-limit notice 2026-10-15)", () => {
  /**
   * CG-Q1 (Oleksii, verbatim: "Pending strings only under
   * uk.kabinet.testShelterOnly.*" and "Public pages, emails, sign-in and every
   * other kabinet.* key stay strict."). The one exception is the namespace
   * only his allowlisted test shelter can see; the sign-in gate exempts it
   * only while the write policy is the refusal or the allowlist
   * (`production-sign-in.test.ts`, `test-shelter-copy-gate.test.ts`).
   */
  it("nothing under kabinet.* outside testShelterOnly is pending", () => {
    expect(
      pendingCopyPaths(uk.kabinet, "kabinet").filter(
        (path) => !path.startsWith("kabinet.testShelterOnly."),
      ),
    ).toEqual([]);
  });

  it("the emails and sign-in stay strict, with no exception", () => {
    expect(pendingCopyPaths(uk.kabinet.email, "kabinet.email")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.signIn, "kabinet.signIn")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.signInCard, "kabinet.signInCard")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.confirm, "kabinet.confirm")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.inviteLanding, "kabinet.inviteLanding")).toEqual([]);
  });

  /**
   * Empty in PR 2. K3 (PR 4) parked one line here, `animalForm.dateUnchanged`,
   * his final text, until K2 shipped the confirmation it names; K2 (PR 5)
   * ships it, so the line lives at `animalForm.listed.dateUnchanged` (sheet
   * P10) and the namespace is empty again. Pinned exactly, so nothing drifts
   * in: the object itself stays (the mechanism is PR 6's to delete).
   */
  it("the testShelterOnly namespace is empty: its one line moved out with K2 (P10)", () => {
    expect(typeof uk.kabinet.testShelterOnly).toBe("object");
    expect(Object.keys(uk.kabinet.testShelterOnly)).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.testShelterOnly, "kabinet.testShelterOnly")).toEqual([]);
  });

  it("the filter exempts that namespace only, not a sibling sharing its letters", () => {
    const fixture = {
      testShelterOnly: { hint: "[COPY PENDING] hint" },
      testShelterOnlyExtra: { hint: "[COPY PENDING] hint" },
      email: { subject: "[COPY PENDING] subject" },
    };
    expect(
      pendingCopyPaths(fixture, "kabinet").filter(
        (path) => !path.startsWith("kabinet.testShelterOnly."),
      ),
    ).toEqual(["kabinet.email.subject", "kabinet.testShelterOnlyExtra.hint"]);
  });

  it("every group keeps exactly its keys, so an emptied group can't pass the line above", () => {
    const keysOf = (group: object) => Object.keys(group).sort();
    expect({
      shell: keysOf(uk.kabinet.shell),
      signIn: keysOf(uk.kabinet.signIn),
      signInCard: keysOf(uk.kabinet.signInCard),
      confirm: keysOf(uk.kabinet.confirm),
      inviteLanding: keysOf(uk.kabinet.inviteLanding),
      profile: keysOf(uk.kabinet.profile).length,
      profileStatus: keysOf(uk.kabinet.profileStatus),
      profileChannel: keysOf(uk.kabinet.profileChannel),
      support: keysOf(uk.kabinet.support),
      emailSignIn: keysOf(uk.kabinet.email.signIn),
      emailInvite: keysOf(uk.kabinet.email.invite),
      registry: keysOf(uk.kabinet.registry.inviteSent),
      history: keysOf(uk.kabinet.history),
    }).toEqual({
      shell: ["label"],
      signIn: [
        "addressNote",
        "emailLabel",
        "intro",
        "otherAddress",
        "pageTitle",
        "resend",
        "resendIn",
        "send",
        "sendFailed",
        "sentBody",
        "sentTitle",
        "spamNote",
        "title",
      ],
      signInCard: ["notArrived"],
      confirm: [
        "intro",
        "invalid",
        "joinFailed",
        "joinFailedTitle",
        "joinRetry",
        "rateLimited",
        "requestNew",
        "submit",
        "title",
      ],
      inviteLanding: [
        "alreadyAccepted",
        "expired",
        "pageTitle",
        "rateLimited",
        "ready",
        "send",
        "sent",
        "signIn",
        "title",
        "unusableTitle",
      ],
      // 25 with addressNote back (row 57, his replacement, 2026-10-14): deleted as
      // a false claim (a map no adopter sees), restored once adopters receive
      // the city only (EM-Q10).
      profile: 25,
      profileStatus: ["paused", "pending", "rejected", "suspended", "under_review", "verified"],
      profileChannel: ["email", "phone", "telegram", "viber", "website"],
      support: ["body", "exit", "exitFailed", "signOutDisabled", "title", "viewingAs"],
      emailSignIn: ["action", "expiry", "intro", "notYou", "subject"],
      emailInvite: ["action", "expiry", "intro", "notYou", "subject", "what"],
      registry: ["tellPersonally"],
      history: ["adminJoined"],
    });
  });

  /**
   * The strings a commitment, a privacy rule or a send depends on, as he
   * wrote them, transcribed from his answer sheet rather than read from
   * `uk.ts` (a test may not compare output with the constant the code
   * renders). The email templates (rows 78–88), the sign-in card's fallback
   * (11) and spam note (10), the anti-enumeration pair (6, 9), the failed accept (20, 21), the
   * invite landing's ready line and button (24, 25), the support banner (69),
   * commitments #2 and #5 on the profile (41, 44) and the operator's reminder (77).
   */
  const FINAL: Record<string, string> = {
    // row 78
    "email.signIn.subject": "Посилання для входу до кабінету притулку",
    // row 79 (reworded 2026-10-14 after delivery test 2: the invite's personal shape)
    "email.signIn.intro":
      "Добрий день. На цю адресу запитали посилання для входу до кабінету притулку.",
    // row 80
    "email.signIn.action": "Відкрити сторінку входу",
    // row 81
    "email.signIn.expiry": "Посилання спрацює один раз і діє {minutes} хвилин.",
    // row 82, signed like row 88 (2026-10-14)
    "email.signIn.notYou":
      "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.\n— {operator}",
    // row 83
    "email.invite.subject": "Ваш доступ до кабінету притулку",
    // row 84
    "email.invite.intro":
      "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» на сайті.",
    // his PR 6 text (pr6-copy-uk.md §1.4): what the shelter changes itself, once writes open
    "email.invite.what":
      "У кабінеті ви бачите дані притулку — і те, що бачать люди, і дані з перевірки. Контакти, речення на картках і картки тварин ви змінюєте самі, і зміни зʼявляються одразу після збереження. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки — юридичну особу, ЄДРПОУ чи адресу, — напишіть мені.",
    // row 86
    "email.invite.action": "Відкрити запрошення",
    // row 87
    "email.invite.expiry": "Запрошення діє {hours} години. Якщо не встигнете — я надішлю нове.",
    // row 88
    "email.invite.notYou":
      "Якщо ви не чекали цього листа, просто проігноруйте його: без входу з цієї адреси доступу ніхто не отримає.\n— {operator}",
    // row 10 (2026-10-14: the sign-in email reached Gmail's Promotions tab)
    "signIn.spamNote":
      "Листа немає? Перевірте «Спам» і «Промоакції». Надіслати ще раз можна через 60 секунд.",
    // row 11
    "signInCard.notArrived": "Якщо лист не прийшов за кілька хвилин, напишіть мені на {contact}.",
    // row 6
    "signIn.addressNote":
      "Адресу додаю я, коли запрошую притулок. Якщо адреси немає в списку, лист не прийде — і ця сторінка про це не повідомляє, щоб не розкривати, хто зареєстрований.",
    // row 9
    "signIn.sentBody":
      "Якщо ця адреса є в списку, на {email} прийде посилання для входу. Воно діє 15 хвилин і відкривається на будь-якому пристрої.",
    // WI-Q3, Oleksii 2026-10-15; the inner quotes are «» per CB-Q1 (2026-10-17), which
    // supersedes WI-B2's nested „“ for this string
    "confirm.rateLimited":
      "Забагато спроб входу за короткий час. Посилання ще дійсне — зачекайте хвилину й знову натисніть «Увійти».",
    // row 20
    "confirm.joinFailedTitle": "Ви увійшли, але приєднати вас до притулку не вдалося",
    // row 21
    "confirm.joinFailed":
      "Нічого не збережено наполовину. Спробуйте ще раз — а якщо не вийде, спроба повториться автоматично під час наступного входу.",
    // row 24
    "inviteLanding.ready":
      "Посилання для входу прийде на адресу, на яку ви отримали це запрошення.",
    // row 25
    "inviteLanding.send": "Надіслати посилання",
    // row 70: no {shelter}, deliberately
    "support.body": "Так кабінет бачить адміністратор притулку.",
    // row 69
    "support.title":
      "Ви переглядаєте кабінет притулку «{shelter}» — лише перегляд, змінити нічого не можна.",
    // row 41; final sentence replaced by CB-B1 (2026-10-17)
    "profile.contactsNote":
      "Ці контакти бачить людина, коли натискає «Написати притулку», — і пише вам сама. Листування йде напряму, без посередників.",
    // row 57, his replacement (2026-10-14), live once pre-reveal responses carry the city only
    "profile.addressNote": "Ті, хто шукає тварину, не бачать точної адреси — лише місто.",
    // row 44; replaced by CB-B1 (2026-10-17)
    "profile.donationNote": "Лише https. Через сайт гроші не проходять — це зовнішнє посилання.",
    // row 77
    "registry.inviteSent.tellPersonally":
      "Повідомте притулок особисто: запрошення надіслано з {sender}. Якщо листа не видно — хай перевірить вкладку «Промоакції».",
  };

  it.each(Object.entries(FINAL))("%s is his final text", (path, text) => {
    const value = path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], uk.kabinet);
    expect(value).toBe(text);
  });

  it("keeps the written strings that predate this answer", () => {
    // R-UI answer 9 (2026-10-17), verbatim: "Role label «адміністратор сайту»
    // (also replaces the «Оператор реєстру» fallback)." Round 2, answer 6,
    // verbatim: "Email signature fallback: capitalise it → «— Адміністратор
    // сайту»." Standing alone it is capitalised; mid-sentence (the locked
    // note) it stays as he wrote the role.
    expect(uk.kabinet.operatorFallbackName).toBe("Адміністратор сайту");
    expect(uk.kabinet.operatorFallbackNameInSentence).toBe("адміністратор сайту");
    // The standing constraints fix this wording for an unknown field.
    expect(uk.kabinet.profileNotRecorded).toBe("Не записано");
  });
});

/**
 * K4 · profile editing (PR 2 of the K milestone). Every `kabinet.profileEdit.*`
 * string, and the `profile.donationPending` rewrite, as Oleksii wrote them:
 * his final Ukrainian (`k4-copy-uk.md`, 2026-10-17) and his later "K4 copy
 * fixes" (2026-10-17), transcribed from those files, not read from `uk.ts`.
 * The key set is pinned exactly, so a key added without his text, or one of
 * his dropped, fails here. Nothing under `kabinet.*` may be pending: that
 * would switch production sign-in off (`productionSignInOf`).
 */
describe("kabinet K4 copy (final, 2026-10-17)", () => {
  const K4_FINAL: Record<string, string> = {
    // k4-copy-uk.md
    "profileEdit.actions.save": "Зберегти",
    // k4-copy-uk.md
    "profileEdit.actions.cancel": "Скасувати зміни",
    // k4-copy-uk.md
    "profileEdit.actions.unsavedLeave": "Зміни не збережено. Все одно вийти?",
    // k4-copy-uk.md
    "profileEdit.state.saving": "Збереження…",
    // k4-copy-uk.md
    "profileEdit.state.savedAt": "Збережено о {time}",
    // k4-copy-uk.md
    "profileEdit.state.failed":
      "Не збереглося — на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
    // k4-copy-uk.md
    "profileEdit.state.retry": "Спробувати ще раз",
    // k4-copy-uk.md
    "profileEdit.errors.conflict":
      "Профіль змінили після того, як ви його відкрили. Ваші зміни не збережено. Ось поточна версія — внесіть зміни ще раз.",
    // k4-copy-uk.md
    "profileEdit.errors.conflictReload": "Показати поточну версію",
    // k4-copy-uk.md
    "profileEdit.errors.illegalTransitionPause":
      "Зараз не вийде поставити прийом на паузу: статус притулку змінився. Оновіть сторінку.",
    // k4-copy-uk.md
    "profileEdit.errors.illegalTransitionResume":
      "Звідси прийом зараз не відновити: статус притулку змінився. Напишіть мені.",
    // k4-copy-uk.md
    "profileEdit.errors.notAvailable":
      "Змінювати дані в кабінеті поки не можна — для цього напишіть мені.",
    // k4-copy-uk.md
    "profileEdit.errors.phoneFormat": "Вкажіть номер із кодом країни, наприклад +380 67 123 45 67.",
    // k4-copy-uk.md
    "profileEdit.errors.telegramFormat":
      "Імʼя користувача в Telegram: 5–32 латинські літери, цифри або підкреслення. @ можна не писати.",
    // k4-copy-uk.md
    "profileEdit.errors.viberFormat":
      "Вкажіть номер Viber із кодом країни, наприклад +380 67 123 45 67.",
    // k4-copy-uk.md
    "profileEdit.errors.emailFormat": "Схоже, це не адреса пошти.",
    // k4-copy-uk.md
    "profileEdit.errors.httpsOnly": "Лише посилання, що починаються з https://.",
    // k4-copy-uk.md
    "profileEdit.errors.notAUrl": "Це не схоже на посилання.",
    // k4-copy-uk.md
    "profileEdit.errors.sentenceTooLong": "Речення довше за {max} символів.",
    // k4-copy-uk.md
    "profileEdit.errors.unknownToken":
      "Підставляється лише {імʼя}. Приберіть «{token}» або напишіть без фігурних дужок.",
    // k4-copy-uk.md
    "profileEdit.errors.dateTokenGone":
      "Дата й так показується над вашим реченням, тому {дата} писати не потрібно.",
    // k4-copy-uk.md
    "profileEdit.errors.strayBrace": "Є дужка без пари. Фігурні дужки потрібні лише для {імʼя}.",
    // k4-copy-uk.md
    // K4-B4, answer 3: U+02BC, as in every one of his K4 strings
    "profileEdit.contacts.atLeastOne": "Залиште хоча б один спосіб звʼязку.",
    // k4-copy-uk.md; second sentence replaced by CB-B1 (2026-10-17)
    "profileEdit.voice.hint":
      "Одне речення від першої особи, вашими словами. На картці підставляється лише імʼя тварини — там, де ви напишете {імʼя}. Більше нічого не змінюється.",
    // k4-copy-uk.md
    "profileEdit.voice.nameStaysHint":
      "Імʼя стоїть як є: Рекс, Мурка. Його не відмінюють, тож пишіть так, щоб воно звучало природно, — наприклад, «{імʼя} досі шукає дім».",
    // k4-copy-uk.md
    "profileEdit.voice.insertName": "Вставити {імʼя}",
    // k4-copy-uk.md
    "profileEdit.voice.counter": "{count} / {max}",
    // k4-copy-uk.md
    "profileEdit.voice.counterOver": "Зайвих символів: {over}",
    // k4-copy-uk.md
    "profileEdit.voice.previewLabel": "Так це виглядає на сторінці тварини: {name}",
    // k4-copy-uk.md
    "profileEdit.voice.previewNoAnimals":
      "Попередній перегляд зʼявиться, щойно у вас буде тварина: тут буде видно, як речення виглядатиме на її сторінці.",
    // k4-copy-uk.md
    "profileEdit.donation.optional": "· необовʼязково",
    // k4-copy-uk.md
    "profileEdit.donation.previewLabel": "Так це побачать люди:",
    // k4-copy-uk.md
    "profileEdit.donation.previewHost": "{host} ↗",
    // k4-copy-uk.md
    "profileEdit.donation.propose": "Надіслати на перевірку",
    // k4-copy-uk.md
    "profileEdit.donation.proposeNote":
      "Нове посилання зʼявиться на картках після того, як я його перевірю. До того люди бачать поточне.",
    // k4-copy-uk.md
    "profileEdit.donation.pendingTitle": "Чекає на перевірку",
    // k4-copy-uk.md
    "profileEdit.donation.pendingHost": "Запропоновано: {host}",
    // k4-copy-uk.md
    "profileEdit.donation.pendingSince": "Надіслано {date}",
    // k4-copy-uk.md
    "profileEdit.donation.cancelProposal": "Скасувати пропозицію",
    // k4-copy-uk.md
    "profileEdit.donation.proposed": "Надіслано. Я перевірю посилання.",
    // k4-copy-uk.md
    "profileEdit.donation.cancelled": "Пропозицію скасовано. Поточне посилання лишається.",
    // k4-copy-uk.md
    "profileEdit.donation.replaceNote":
      "Якщо надіслати інше посилання, воно замінить те, що чекає на перевірку.",
    // k4-copy-uk.md
    "profileEdit.donation.failed": "Не надіслано. Перевірте зʼєднання і спробуйте ще раз.",
    // k4-copy-uk.md
    "profileEdit.donation.declined":
      "Останнє запропоноване посилання не підтверджено. Якщо незрозуміло чому — напишіть мені.",
    // answer 8, rewrite
    "profile.donationPending": "Запропоноване посилання чекає, поки я його перевірю.",
    // k4-copy-uk.md
    "profileEdit.contacts.otherLabel": "Інший спосіб звʼязку",
    // k4-copy-uk.md
    "profileEdit.contacts.otherKind": "Тип",
    // k4-copy-uk.md
    "profileEdit.contacts.phonePlaceholder": "+380 …",
    // k4-copy-uk.md
    "profileEdit.contacts.telegramPlaceholder": "@username",
    // k4-copy-uk.md
    "profileEdit.contacts.removeOther": "Прибрати",
    // k4-copy-uk.md
    "profileEdit.contacts.addOther": "Додати ще один спосіб звʼязку",
    // k4-copy-uk.md
    "profileEdit.pause.button": "Призупинити прийом тварин",
    // k4-copy-uk.md
    "profileEdit.pause.resumeButton": "Відновити прийом тварин",
    // k4-copy-uk.md
    "profileEdit.pause.pausedLine": "Прийом на паузі з {date} · {reason}",
    // k4-copy-uk.md
    "profileEdit.pause.dialogTitle": "Призупинити прийом тварин?",
    // k4-copy-uk.md
    "profileEdit.pause.dialogBody":
      "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає. Відновити можна тут будь-коли.",
    // k4-copy-uk.md
    "profileEdit.pause.reasonLabel": "Причина",
    // k4-copy-uk.md
    "profileEdit.pause.reasonPlaceholder": "Оберіть причину",
    // k4-copy-uk.md
    "profileEdit.pause.reason.seasonal_closure": "Сезонна перерва",
    // k4-copy-uk.md
    "profileEdit.pause.reason.relocation": "Переїзд",
    // k4-copy-uk.md
    "profileEdit.pause.reason.capacity_reached": "Немає місця",
    // k4-copy-uk.md
    "profileEdit.pause.reason.staff_shortage": "Брак людей",
    // k4-copy-uk.md
    "profileEdit.pause.reason.other": "Інше",
    // k4-copy-uk.md
    "profileEdit.pause.noteLabel": "Коментар",
    // k4-copy-uk.md
    "profileEdit.pause.confirm": "Призупинити прийом",
    // k4-copy-uk.md
    "profileEdit.pause.cancel": "Скасувати",
    // k4-copy-uk.md
    "profileEdit.pause.close": "Закрити",
    // k4-copy-uk.md
    "profileEdit.pause.paused": "Прийом на паузі.",
    // k4-copy-uk.md
    "profileEdit.pause.resumed": "Прийом відновлено. Ваших тварин знову видно.",
    // K4 copy fixes
    "profileEdit.actions.liveOnSave.contacts":
      "Нові контакти побачать одразу після збереження — коли натиснуть «Написати притулку».",
    // K4 copy fixes
    "profileEdit.actions.liveOnSave.voice":
      "Нове речення зʼявиться в стрічці та на сторінках тварин одразу після збереження.",
    // K4 copy fixes
    "profileEdit.state.saved": "Збережено.",
    // K4 copy fixes
    "profileEdit.pause.noteHint":
      "Коментар бачите ви, інші адміністратори притулку і я. Людям, які шукають тварину, він не показується.",
    // K4 copy fixes; the quoted label is «» per CB-Q1 (2026-10-17)
    "profileEdit.voice.emptyMeans":
      "Якщо залишити порожнім, на картках буде лише «Оновлено … тому».",
    // K4 copy fixes; the quoted label is «» per CB-Q1 (2026-10-17)
    "profileEdit.voice.previewEmpty": "Речення немає — на картці буде лише «Оновлено … тому».",
  };

  const leafPaths = (node: unknown, prefix: string): string[] =>
    typeof node === "string"
      ? [prefix]
      : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
          leafPaths(child, `${prefix}.${key}`),
        );

  it("profileEdit holds exactly his keys, no more and no fewer", () => {
    expect(leafPaths(uk.kabinet.profileEdit, "profileEdit").sort()).toEqual(
      Object.keys(K4_FINAL)
        .filter((path) => path.startsWith("profileEdit."))
        .sort(),
    );
  });

  it("has no placeholder under profileEdit", () => {
    expect(pendingCopyPaths(uk.kabinet.profileEdit, "kabinet.profileEdit")).toEqual([]);
  });

  it.each(Object.entries(K4_FINAL))("%s is his final text", (path, text) => {
    const value = path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], uk.kabinet);
    expect(value).toBe(text);
  });

  it("no longer carries the shipped donationPending wording", () => {
    expect(uk.kabinet.profile.donationPending).not.toContain("оператора");
  });
});

/**
 * CB-B1 (Oleksii, 2026-10-17), verbatim: "brand rule: no «реєстр» in
 * user-facing copy, as it implies a state service". Scoped to the strings that
 * have been reworded: his three (CB-B1) and the hits table's rows 5–11, 13–18
 * and 21, drafted under his default rule CB-B2 and approved with four changes
 * (CB-Q2, 2026-10-18). Row 12 (`about.data`) is deliberately absent: his
 * answer kept today's paragraph until PR 6 replaces all of it with his text.
 * Rows 4, 19 and 20 are reworded elsewhere
 * (#119; #116, where «державний реєстр тварин» is his explicit exception). The
 * English mirrors follow the same sense, so they are held to "registry". A
 * plain substring match, case-insensitive: «Реєстр» opened several of them.
 */
/**
 * CB-Q2 (Oleksii, 2026-10-18): the four strings he rewrote when approving the
 * CB-B2 drafts, transcribed from his message, never read from `uk.ts`. For
 * `about.intro` and `forShelters.money` he changed one sentence and kept the
 * rest ("keep the rest from «Немає команди…» unchanged"), so those two pin
 * the sentence he wrote and the start of the text he kept.
 */
describe("CB-Q2: his four rewrites of the CB-B2 drafts", () => {
  it("about.intro opens with his two sentences, then the kept text", () => {
    expect(
      uk.about.intro.startsWith(
        "Opika — сайт, де тварини з притулків Київщини шукають дім. Я роблю його сам, поза роботою. Немає команди, немає інвестора — ",
      ),
    ).toBe(true);
  });
  it("forShelters.whatThisIs is his sentence", () => {
    expect(uk.forShelters.whatThisIs).toBe(
      "Opika — сайт, де тварини з перевірених притулків Київщини шукають дім, а кожен ваш підопічний отримує власну сторінку.",
    );
  });
  it("forShelters.money: no donations collected «через сайт»", () => {
    expect(
      uk.forShelters.money.startsWith(
        "Сайт не бере і не переказує грошей: ні комісії, ні оплати, ні збору донатів через сайт. ",
      ),
    ).toBe(true);
  });
  it("detail.notFound.body opens with his sentence, no comma", () => {
    expect(
      uk.detail.notFound.body.startsWith("Тварини вже немає на сайті або посилання застаріле. "),
    ).toBe(true);
  });
});

describe("CB-B1: the replaced strings name no «реєстр»", () => {
  const replaced: Record<string, readonly [uk: string, en: string]> = {
    "kabinet.profile.contactsNote": [
      uk.kabinet.profile.contactsNote,
      en.kabinet.profile.contactsNote,
    ],
    "kabinet.profile.donationNote": [
      uk.kabinet.profile.donationNote,
      en.kabinet.profile.donationNote,
    ],
    "kabinet.profileEdit.voice.hint": [
      uk.kabinet.profileEdit.voice.hint,
      en.kabinet.profileEdit.voice.hint,
    ],
    "kabinet.signIn.intro": [uk.kabinet.signIn.intro, en.kabinet.signIn.intro],
    "kabinet.signIn.addressNote": [uk.kabinet.signIn.addressNote, en.kabinet.signIn.addressNote],
    "kabinet.email.invite.intro": [uk.kabinet.email.invite.intro, en.kabinet.email.invite.intro],
    "kabinet.inviteLanding.expired": [
      uk.kabinet.inviteLanding.expired,
      en.kabinet.inviteLanding.expired,
    ],
    "about.intro": [uk.about.intro, en.about.intro],
    "about.free": [uk.about.free, en.about.free],
    "about.money": [uk.about.money, en.about.money],
    "about.analytics": [uk.about.analytics, en.about.analytics],
    "forShelters.whatThisIs": [uk.forShelters.whatThisIs, en.forShelters.whatThisIs],
    "forShelters.money": [uk.forShelters.money, en.forShelters.money],
    "forShelters.howToStart": [uk.forShelters.howToStart, en.forShelters.howToStart],
    "demo.bannerNotice": [uk.demo.bannerNotice, en.demo.bannerNotice],
    "detail.notFound.body": [uk.detail.notFound.body, en.detail.notFound.body],
    PENDING_R4_2_ANALYTICS_SENTENCE: [PENDING_R4_2_ANALYTICS_SENTENCE, ""],
    // PR 6: his pr6-copy-uk.md §1.5 replaces the whole paragraph (0.3d: «реєстр зберігає» → «сайт зберігає»).
    "about.data": [uk.about.data, en.about.data],
  };

  // «зареєстрований» / «незареєстрована» are legal terms (a registered
  // organisation), not the brand word, so the match skips a preceding «за».
  it.each(Object.entries(replaced))("%s", (_key, [ukText, enText]) => {
    expect(ukText).not.toMatch(/(?<!за)реєстр/iu);
    expect(enText).not.toMatch(/registry/i);
  });
});

/**
 * R-UI · the operator's screens, all three PRs at once (his answer 1,
 * verbatim: "Copy gate: no exemption. Copy for all three PRs is final in
 * D:\opika-worktrees\rui-copy-uk.md."). Every `kabinet.operator.*` and
 * `kabinet.verificationDecision.*` string as he wrote it, transcribed from
 * `rui-copy-uk.md`, not read from `uk.ts`. The key set is pinned exactly, so a
 * key added without his text, or one of his dropped, fails here.
 *
 * Two keys he asked to have checked against the code (answers file, verbatim:
 * "verify blocked.unknown.provider_suppresses and create.descriptionHint
 * against code; if my wording is wrong, use the true wording and log it")
 * were untrue as drafted, and carry his round-2 replacement (answer 5)
 * instead; they are pinned apart, with his first draft named, so neither can
 * drift back unnoticed.
 */
describe("kabinet R-UI copy (final, 2026-10-17)", () => {
  const RUI_FINAL: Record<string, string> = {
    "operator.shell.role": "адміністратор сайту",
    "operator.shell.nav.shelters": "Притулки",
    "operator.shell.nav.newShelter": "Новий притулок",
    "operator.shell.pageTitle.list": "Притулки",
    "operator.shell.pageTitle.create": "Новий притулок",
    "operator.shell.pageTitle.shelter": "{name}",
    "operator.list.title": "Притулки",
    "operator.list.total": "Усього: {count}",
    "operator.list.create": "Новий притулок",
    "operator.list.createShort": "Новий",
    "operator.list.search": "Пошук за назвою",
    "operator.list.orderNote": "Спочатку ті, що чекають на ваше рішення.",
    "operator.list.filterAll": "Усі · {count}",
    "operator.list.filterStatus": "{status} · {count}",
    "operator.list.admins": "Адміністраторів: {count}",
    "operator.list.adminsInvited": "Запрошено: {count}",
    "operator.list.noAdmins": "Немає ні адміністраторів, ні запрошень",
    "operator.list.donationPending": "Посилання на збір чекає на рішення",
    "operator.list.open": "Відкрити",
    "operator.list.empty": "Притулків ще немає. Перший можна додати через «Новий притулок».",
    "operator.list.noMatch": "Нічого не знайдено. Змініть пошук або фільтр.",
    "operator.list.loadMore": "Показати ще",
    "operator.list.loadFailed": "Список не завантажився.",
    "operator.shelter.back": "← Притулки",
    "operator.shelter.meta": "{city} · {admins}",
    "operator.shelter.timeInState": "з {date}",
    "operator.shelter.legalNote":
      "Ці поля притулок бачить лише для читання. Зміна юридичної особи чи ЄДРПОУ не змінює статус автоматично — рішення за вами.",
    "operator.shelter.descriptionTitle": "Опис притулку",
    "operator.donation.live": "Чинне посилання",
    "operator.donation.none": "Посилання немає",
    "operator.donation.proposed": "Притулок запропонував {host} {date}. Чекає на ваше рішення.",
    "operator.admins.title": "Адміністратори",
    "operator.admins.joined": "Має доступ",
    "operator.admins.invitedUntil": "Запрошено · посилання діє до {date}",
    "operator.admins.invitedExpired": "Запрошено · посилання вже не діє",
    "operator.admins.none": "Адміністраторів немає",
    "operator.evidence.title": "Докази для перевірки",
    "operator.evidence.empty": "Доказів поки немає.",
    "operator.evidence.kind.edrpou_registration": "Реєстрація · ЄДРПОУ",
    "operator.evidence.kind.bank_account_holder": "Власник банківського рахунку",
    "operator.evidence.kind.reference_contact": "Рекомендація",
    "operator.evidence.kind.site_visit": "Візит на місце",
    "operator.evidence.kind.supporting_document": "Документ",
    "operator.evidence.added": "додано {date}",
    "operator.evidence.field.registeredName": "Назва в ЄДР",
    "operator.evidence.field.holderName": "Власник рахунку",
    "operator.evidence.field.who": "Хто",
    "operator.evidence.field.channel": "Як звʼязатися",
    "operator.evidence.field.relationship": "Ким доводиться притулку",
    "operator.evidence.relationship.veterinary_clinic": "Ветклініка",
    "operator.evidence.relationship.local_authority": "Місцева влада",
    "operator.evidence.relationship.partner_organisation": "Партнерська організація",
    "operator.evidence.relationship.other": "Інше",
    "operator.evidence.field.visitedOn": "Дата візиту",
    "operator.evidence.field.notes": "Нотатка",
    "operator.evidence.field.label": "Підпис",
    "operator.evidence.noDocument": "Документ не додано — для цього типу доказу це дозволено.",
    "operator.evidence.gaps": "Для схвалення бракує: {kind} — {provided} з {minimum}.",
    "operator.blocked.title": "Адреси, на які поштовий сервіс не доставляє листи",
    "operator.blocked.none": "Перевірено: жодна адреса цього притулку не заблокована.",
    "operator.blocked.line": "{email} — {reason}",
    "operator.blocked.incomplete": "Список заблокованих адрес вдалося отримати лише частково.",
    "operator.blocked.unknown.provider_error": "Поштовий сервіс відповів помилкою.",
    "operator.blocked.unknown.timed_out": "Поштовий сервіс не відповів вчасно.",
    "operator.blocked.unknown.unsupported_provider":
      "Цей поштовий сервіс не дає перевірити блокування.",
    "operator.blocked.asOf": "Станом на {time}",
    "operator.blocked.manualUnblock":
      "Розблокувати адресу можна лише в кабінеті поштового сервісу, не тут.",
    "operator.history.title": "Історія",
    "operator.history.note":
      "Зміни статусу, даних, адміністраторів, збору коштів і тварин. Підтвердження «Ще шукає» тут не записуються.",
    "operator.history.empty": "Записів ще немає.",
    "operator.history.more": "Показати ще",
    "operator.history.actor.you": "ви",
    "operator.history.actor.formerAdmin": "колишній адміністратор",
    "operator.history.actor.operator": "адміністратор сайту",
    "operator.history.shelter_created": "Притулок створено",
    "operator.history.shelter_created_script": "Притулок додано з файлу",
    "operator.history.verification.start_review": "Взято на розгляд",
    "operator.history.verification.approve": "Схвалено → «Перевірено»",
    "operator.history.verification.reject": "Відхилено: {code}. {note}",
    "operator.history.verification.suspend": "Призупинено: {code}. {note}",
    "operator.history.verification.reinstate": "Відновлено → «{status}»",
    "operator.history.verification.resubmit": "Повернуто на перевірку",
    "operator.history.verification.pause": "Прийом тварин призупинено",
    "operator.history.verification.resume": "Паузу знято",
    "operator.history.admin_invited": "Надіслано запрошення: {name}, {email}",
    "operator.history.admin_invitation_resent": "Запрошення надіслано ще раз: {name}",
    "operator.history.admin_removed": "Доступ закрито: {name}",
    "operator.history.admin_removed_pending": "Запрошення скасовано: {name}",
    "operator.history.contact_changed": "Змінено контакти",
    "operator.history.freshness_sentence_changed": "Змінено речення на картках",
    "operator.history.description_changed": "Змінено опис притулку",
    "operator.history.donation_proposed": "Запропоновано посилання на збір: {host}",
    "operator.history.donation_proposal_cancelled": "Пропозицію посилання скасовано",
    "operator.history.donation_approved": "Посилання на збір схвалено",
    "operator.history.donation_rejected": "Посилання на збір відхилено",
    "operator.history.verified_data_changed.legal_entity": "Змінено юридичні дані",
    "operator.history.verified_data_changed.exact_address": "Змінено адресу приміщення",
    "operator.history.animals_imported": "Додано тварин з файлу: {count}",
    "operator.history.animal_created": "Створено картку: {name}",
    "operator.history.animal_edited": "Змінено картку {name}: {fields}",
    "operator.history.animal_listing_changed": "{name}: «{from}» → «{to}»",
    "operator.history.animal_deleted": "Видалено чернетку: {name}",
    "operator.create.title": "Новий притулок",
    "operator.create.intro":
      "Тут ви вносите все про притулок: назву, адресу, юридичні дані й докази. Перший адміністратор отримає запрошення на пошту.",
    "operator.create.name": "Назва притулку",
    // Narrowed by R-UI 4: the rename made «Після створення назву поки змінити не можна» false.
    "operator.create.nameHint": "Як притулок називає себе.",
    "operator.create.description": "Опис притулку",
    "operator.create.city": "Місто",
    "operator.create.address.line1": "Вулиця, будинок",
    "operator.create.address.line2": "Корпус, приміщення · необовʼязково",
    "operator.create.address.postalCode": "Індекс · необовʼязково",
    "operator.create.coordinates": "Координати",
    "operator.create.coordinatesHint":
      "Скопіюйте з карти у форматі «широта, довгота». Ніде не показуються: люди бачать лише місто.",
    "operator.create.legalTitle": "Юридичні дані",
    "operator.create.legalKind.registered_ngo": "Громадська організація чи фонд",
    "operator.create.legalKind.sole_proprietor": "ФОП",
    "operator.create.legalKind.unregistered_initiative": "Ініціатива без реєстрації",
    "operator.create.registeredAt": "Дата реєстрації",
    "operator.create.firstAdminTitle": "Перший адміністратор",
    "operator.create.firstAdminHint":
      "Отримає лист із посиланням для входу. Інших адміністраторів можна запросити зі сторінки притулку.",
    "operator.create.adminName": "Імʼя",
    "operator.create.submit": "Створити й надіслати запрошення",
    "operator.create.submitShort": "Створити",
    "operator.create.cancel": "Скасувати",
    "operator.create.whatHappens.title": "Що буде далі",
    "operator.create.whatHappens.step1": "Притулок зʼявиться у списку зі статусом «Очікує».",
    "operator.create.whatHappens.step2":
      "{name} отримає лист для входу. Посилання діє 72 години, його можна надіслати ще раз.",
    "operator.create.whatHappens.step3":
      "Тварин притулку не буде в галереї, доки ви не схвалите перевірку.",
    "operator.evidence.add": "+ Додати доказ",
    "operator.evidence.remove": "Прибрати",
    "operator.evidence.typePicker": "Тип доказу",
    "operator.evidence.siteVisitDateHint": "Дата візиту не може бути в майбутньому.",
    "operator.create.created": "Притулок створено.",
    "operator.email.sent": "Запрошення надіслано на {email}.",
    "operator.email.sentUnchecked":
      "Запрошення надіслано. Перевірити, чи адреса не заблокована, не вдалося.",
    "operator.email.blocked.unsubscribed":
      "Запрошення не надіслано: людина з цієї адреси відписалася від листів.",
    "operator.email.blocked.hard_bounce":
      "Запрошення не надіслано: адреса не існує або не приймає пошту.",
    "operator.email.blocked.spam_complaint":
      "Запрошення не надіслано: на попередній лист з цієї адреси поскаржилися як на спам.",
    "operator.email.blocked.admin_blocked":
      "Запрошення не надіслано: адресу заблоковано вручну в поштовому сервісі.",
    "operator.email.failed.provider_error":
      "Запрошення не надіслано: поштовий сервіс відповів помилкою. Спробуйте надіслати ще раз.",
    "operator.email.failed.copy_pending": "Запрошення не надіслано: текст листа ще не готовий.",
    "operator.create.createdNoInvite":
      "Притулок створено, але без адміністратора. Запросіть його зі сторінки притулку.",
    "operator.create.inviteValidUntil": "Посилання діє до {date}, {time}.",
    "operator.create.resend": "Надіслати ще раз",
    "operator.create.openShelter": "Відкрити притулок",
    "operator.create.errors.addressHasARole.shelter_admin":
      "Ця адреса вже має доступ до іншого притулку.",
    "operator.create.errors.addressHasARole.operator":
      "Це адреса адміністратора сайту. Для притулку потрібна інша.",
    "operator.create.errors.addressHasARole.invited_elsewhere":
      "На цю адресу вже надіслано чинне запрошення до іншого притулку.",
    "operator.create.errors.siteVisitInFuture": "Дата візиту не може бути в майбутньому.",
    "operator.create.errors.unknownCity": "Такого міста немає у списку.",
    "operator.create.errors.lostAnswer":
      "Відповідь не надійшла. Притулок міг створитися — перевірте список, перш ніж пробувати знову.",
    "operator.create.errors.failed": "Не вдалося створити притулок. Спробуйте ще раз.",
    "operator.create.errors.required": "Це поле потрібне.",
    "operator.create.errors.edrpouFormat": "Код ЄДРПОУ — 8 цифр.",
    "operator.create.errors.coordinatesFormat":
      "Вкажіть координати як «широта, довгота», наприклад «50.4501, 30.5234».",
    "operator.verification.decisionTitle": "Рішення",
    "operator.verification.decisionCaption":
      "Притулок побачить рішення і пояснення дослівно у своєму кабінеті.",
    "operator.verification.startReview": "Взяти на розгляд",
    "operator.verification.approve": "Схвалити → «Перевірено»",
    "operator.verification.approveShort": "Схвалити",
    "operator.verification.approveNote":
      "Після схвалення тварини притулку одразу зʼявляються в галереї. Для відхилення потрібне пояснення.",
    "operator.verification.approveBlocked": "Схвалити поки не можна — бракує доказів:",
    "operator.verification.reject": "Відхилити…",
    "operator.verification.suspend": "Призупинити…",
    "operator.verification.reinstate": "Відновити → «{status}»",
    "operator.verification.resubmit": "Повернути на перевірку",
    "operator.verification.suspended.title": "Притулок призупинено",
    "operator.verification.suspended.reasonLabel": "Пояснення, яке бачить притулок",
    "operator.verification.suspended.priorLabel": "До призупинення статус був",
    "operator.verification.suspended.priorPausedSince": "з {date} притулок сам поставив паузу",
    "operator.verification.suspended.reinstateExplainPaused":
      "Кнопка «Відновити» поверне притулок на паузу, а не в «Перевірено». Тварини лишаться прихованими, доки притулок сам не зніме паузу.",
    "operator.verification.suspended.reinstateExplainVerified":
      "Кнопка «Відновити» поверне статус «Перевірено», і тварини знову зʼявляться в галереї.",
    "operator.verification.noConfirm": "Підтвердження не потрібне: ця дія нічого не приховує.",
    "operator.verification.rejected.title": "Відхилено",
    "operator.verification.rejected.reason": "{code}. {note}",
    "operator.reasonDialog.rejectTitle": "Відхилити «{shelter}»?",
    "operator.reasonDialog.suspendTitle": "Призупинити «{shelter}»?",
    "operator.reasonDialog.rejectBody":
      "Притулок побачить це пояснення дослівно у своєму кабінеті. Його тварин не буде в галереї.",
    "operator.reasonDialog.suspendBody":
      "Тварини притулку одразу зникнуть із галереї. Притулок побачить це пояснення у своєму кабінеті. Відновити можна будь-коли.",
    "operator.reasonDialog.codeLabel": "Причина",
    "operator.reasonDialog.reasonLabel": "Пояснення",
    "operator.reasonDialog.reasonHint":
      "Обовʼязково. Пишіть так, щоб людина знала, що робити далі.",
    "operator.reasonDialog.confirmReject": "Відхилити",
    "operator.reasonDialog.confirmSuspend": "Призупинити",
    "operator.codes.rejection.insufficient_evidence": "Недостатньо доказів",
    "operator.codes.rejection.identity_unverifiable":
      "Не вдалося підтвердити, хто стоїть за притулком",
    "operator.codes.rejection.duplicate_submission": "Повторна заявка",
    "operator.codes.rejection.out_of_service_area": "Поза областю, де працює сайт",
    "operator.codes.rejection.spam": "Спам",
    "operator.codes.rejection.other": "Інше",
    "operator.codes.suspension.unresponsive": "Немає звʼязку з притулком",
    "operator.codes.suspension.complaint_upheld": "Скарга підтвердилася",
    "operator.codes.suspension.listing_quality": "Картки не відповідають дійсності",
    "operator.codes.suspension.suspected_fraud": "Підозра на шахрайство",
    "operator.codes.suspension.other": "Інше",
    "operator.donation.approve": "Схвалити",
    "operator.donation.reject": "Відхилити",
    "operator.donation.approved": "Посилання схвалено.",
    "operator.donation.rejected": "Посилання відхилено.",
    "operator.donation.conflict":
      "Пропозиція змінилася, поки сторінка була відкрита. Тут — поточна.",
    "operator.admins.remove": "Прибрати",
    "operator.admins.removeConfirm.body":
      "Доступ до кабінету закриється одразу, усі сеанси завершаться.",
    "operator.admins.inviteAnother": "Запросити ще одного",
    "operator.admins.resend": "Надіслати ще раз",
    "operator.admins.gone": "Цей доступ уже закрито.",
    "operator.errors.illegalTransition": "З поточного статусу так не можна. Сторінку оновлено.",
    "operator.errors.conflictReload":
      "Дані змінилися, поки сторінка була відкрита. Сторінку оновлено.",
    "operator.errors.failed": "Не вдалося. Спробуйте ще раз.",
    "operator.errors.lostAnswer": "Відповідь не надійшла. Сторінка перевіряє, чи дію виконано.",
    "operator.support.enter": "Переглянути як притулок · лише читання",
    "verificationDecision.rejectedTitle": "Перевірку не пройдено",
    "verificationDecision.suspendedTitle": "Притулок тимчасово призупинено",
    "verificationDecision.reason": "Причина: {code}.",
    "verificationDecision.contact": "Якщо маєте питання, напишіть мені.",
    "verificationDecision.suspendedEffect":
      "Поки притулок призупинено, його тварин немає в галереї.",
    "verificationDecision.rejectedEffect":
      "Тварин притулку не буде в галереї, доки перевірку не пройдено.",
  };

  /**
   * His first drafts (untrue against the code, see `uk.ts` at each key), and
   * his round-2 replacements, verbatim from his answer 5.
   */
  const CHECKED_AGAINST_CODE: Record<string, { his: string; used: string }> = {
    "operator.blocked.unknown.provider_suppresses": {
      his: "Поштовий сервіс не показує список заблокованих адрес.",
      used: "Поштовий сервіс має власний список заблокованих адрес; сайт його не перевіряє.",
    },
    "operator.create.descriptionHint": {
      his: "Його бачать ті, хто шукає тварину, на сторінках тварин цього притулку.",
      used: "Короткий опис притулку. Він може бути публічним, тож не пишіть тут нічого приватного.",
    },
  };

  /**
   * His round-2 answer 2, verbatim: "Reason view on the shelter side:
   * «Пояснення:», then my note verbatim, then a signature line «— {operator}»
   * (nominative, as in the emails). No new env var." The label replaces his
   * §3.4 text, named here so it can't drift back; the signature is a key his
   * file didn't have.
   */
  const ROUND_2_REASON_VIEW: Record<string, { his: string | null; used: string }> = {
    "verificationDecision.noteLabel": { his: "Пояснення від {operator}:", used: "Пояснення:" },
    "verificationDecision.signature": { his: null, used: "— {operator}" },
  };

  /**
   * N7 (Oleksii, 2026-10-18), verbatim: "admins.removeConfirm.title → «Закрити доступ? {name}
   * більше не зможе входити в кабінет.» - invite button: 0 admins and 0 invitations → «Запросити
   * адміністратора»; otherwise «Запросити ще одного»." `his` is the string it replaces (null: new).
   */
  const ROUND_3_N7: Record<string, { his: string | null; used: string }> = {
    "operator.admins.removeConfirm.title": {
      his: "Прибрати {name}?",
      used: "Закрити доступ? {name} більше не зможе входити в кабінет.",
    },
    "operator.admins.inviteFirst": { his: null, used: "Запросити адміністратора" },
  };

  /**
   * RUI4-F2 (Oleksii, 2026-10-18), verbatim: "Error copy: «Назва довша за {max} символів.»
   * (plural pin for 100)." A new key; the filled sentence is pinned in `copy-plural-pins.test.ts`.
   */
  const ROUND_4C_RUI4_F2: Record<string, string> = {
    "operator.create.errors.nameTooLong": "Назва довша за {max} символів.",
  };

  const leafPaths = (node: unknown, prefix: string): string[] =>
    typeof node === "string"
      ? [prefix]
      : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
          leafPaths(child, `${prefix}.${key}`),
        );
  const valueAt = (path: string) =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], uk.kabinet);

  it("operator and verificationDecision hold exactly his keys, no more and no fewer", () => {
    expect(
      [
        ...leafPaths(uk.kabinet.operator, "operator"),
        ...leafPaths(uk.kabinet.verificationDecision, "verificationDecision"),
      ].sort(),
    ).toEqual(
      [
        ...Object.keys(RUI_FINAL),
        ...Object.keys(CHECKED_AGAINST_CODE),
        ...Object.keys(ROUND_2_REASON_VIEW),
        ...Object.keys(ROUND_3_N7),
        ...Object.keys(ROUND_4C_RUI4_F2),
      ].sort(),
    );
  });

  it("sanity: his file's 220 strings (216 as written, 3 replaced in round 2, 1 in round 3) and 3 later keys", () => {
    expect(Object.keys(RUI_FINAL).length).toBe(216);
    expect(Object.keys(ROUND_3_N7)).toHaveLength(2);
    expect(Object.keys(ROUND_4C_RUI4_F2)).toHaveLength(1);
    expect(Object.keys(CHECKED_AGAINST_CODE).length).toBe(2);
    expect(Object.values(ROUND_2_REASON_VIEW).filter(({ his }) => his !== null)).toHaveLength(1);
    expect(Object.values(ROUND_2_REASON_VIEW).filter(({ his }) => his === null)).toHaveLength(1);
  });

  it.each(Object.entries(RUI_FINAL))("%s is his final text", (path, text) => {
    expect(valueAt(path)).toBe(text);
  });

  it.each(Object.entries(CHECKED_AGAINST_CODE))(
    "%s carries his round-2 wording, true against the code, not his first draft",
    (path, { his, used }) => {
      expect(valueAt(path)).toBe(used);
      expect(valueAt(path)).not.toBe(his);
    },
  );

  it.each(Object.entries(ROUND_3_N7))("%s carries his N7 wording (round 3)", (path, { used }) => {
    expect(valueAt(path)).toBe(used);
  });

  it.each(Object.entries(ROUND_4C_RUI4_F2))("%s is his RUI4-F2 text", (path, text) => {
    expect(valueAt(path)).toBe(text);
  });

  it.each(
    Object.entries(ROUND_3_N7).flatMap(([path, { his }]) => (his === null ? [] : [[path, his]])),
  )("%s no longer carries the string N7 replaced", (path, his) => {
    expect(valueAt(path)).not.toBe(his);
  });

  it.each(Object.entries(ROUND_2_REASON_VIEW))(
    "%s carries his round-2 answer 2",
    (path, { his, used }) => {
      expect(valueAt(path)).toBe(used);
      if (his !== null) expect(valueAt(path)).not.toBe(his);
    },
  );

  it("nothing under operator or verificationDecision is pending", () => {
    expect(pendingCopyPaths(uk.kabinet.operator, "kabinet.operator")).toEqual([]);
    expect(
      pendingCopyPaths(uk.kabinet.verificationDecision, "kabinet.verificationDecision"),
    ).toEqual([]);
  });

  it("uses U+02BC only: no U+0027 and no U+2019 in any of them", () => {
    const ASCII_APOSTROPHE = String.fromCodePoint(0x27);
    const TYPOGRAPHIC_APOSTROPHE = String.fromCodePoint(0x2019);
    const offending = [
      ...Object.keys(RUI_FINAL),
      ...Object.keys(CHECKED_AGAINST_CODE),
      ...Object.keys(ROUND_2_REASON_VIEW),
    ].filter((path) => {
      const text = valueAt(path) as string;
      return text.includes(ASCII_APOSTROPHE) || text.includes(TYPOGRAPHIC_APOSTROPHE);
    });
    expect(offending).toEqual([]);
    // Sanity: the letter-apostrophe is really there.
    expect(uk.kabinet.operator.evidence.field.channel).toContain(String.fromCodePoint(0x2bc));
  });
});

/**
 * The words the operator's animal history lines fill in (`{from}`/`{to}`,
 * `{fields}`): his R-UI file gives the lines, not the words, so these are his
 * K3 words (`k3-copy-uk.md`, 2026-10-17), transcribed from that file:
 * `kabinet.listingStatus.*` and the K3 form's field labels. Exactly these
 * keys, so a word added without his text fails here.
 */
describe("kabinet animal history labels (his K3 words, 2026-10-17)", () => {
  const K3_WORDS: Record<string, string> = {
    // kabinet.listingStatus.draft
    "listing.draft": "Чернетка",
    // kabinet.listingStatus.published
    "listing.published": "Опубліковано",
    // kabinet.listingStatus.reserved
    "listing.reserved": "Домовляються",
    // kabinet.listingStatus.adopted
    "listing.adopted": "Удома",
    // kabinet.listingStatus.withdrawn
    "listing.withdrawn": "Знято з показу",
    // who.nameLabel
    "field.name": "Імʼя",
    // who.speciesLabel
    "field.species": "Вид",
    // who.sexLabel
    "field.sex": "Стать",
    // who.sizeLabel
    "field.size": "Розмір",
    // age.title
    "field.age": "Вік",
    // description.title
    "field.description": "Опис",
    // photos.title
    "field.photos": "Фото",
  };

  it("holds exactly these words, as he wrote them", () => {
    const labels = uk.kabinet.animalHistoryLabels;
    expect({
      ...Object.fromEntries(Object.entries(labels.listing).map(([k, v]) => [`listing.${k}`, v])),
      ...Object.fromEntries(Object.entries(labels.field).map(([k, v]) => [`field.${k}`, v])),
    }).toEqual(K3_WORDS);
  });

  it("the medical fields are the public labels his K3 answer 6 reuses", () => {
    expect(uk.medical.vaccination).toBe("Комплексне щеплення");
    expect(uk.medical.spayNeuter).toBe("Стерилізація");
  });
});

describe("pendingCopyPaths", () => {
  it("walks nested groups and names each placeholder by its full path, sorted", () => {
    const group = {
      written: "Текст",
      email: { subject: `${COPY_PENDING} s`, body: "Текст" },
      deep: { deeper: { line: `${COPY_PENDING} l` } },
    };
    expect(pendingCopyPaths(group, "kabinet")).toEqual([
      "kabinet.deep.deeper.line",
      "kabinet.email.subject",
    ]);
  });

  it("is empty once nothing is pending, and matches the sentinel as a prefix only", () => {
    expect(pendingCopyPaths({ a: { b: "Текст" } }, "x")).toEqual([]);
    expect(pendingCopyPaths({ a: `see ${COPY_PENDING}` }, "x")).toEqual([]);
  });
});

/**
 * /prytulkam A2 (EM-Q1, Oleksii, 2026-10-14, verbatim: "(b). A2 keeps the
 * current text; the new paragraph ships in the commit that turns production
 * sign-in on."; row 89, verbatim: "FINAL YES as drafted"). Shipped by that
 * wiring commit: the third paragraph is his, transcribed from his answer, and
 * the sentence it replaces («Окремої кнопки ще немає — не хочу обіцяти
 * кабінет, якого не існує»), false once a shelter can open the kabinet, is
 * gone. Commitment #6 (`docs/standing-constraints.md`) says the same.
 */
/**
 * §9 (commitment #6), his PR 6 text (pr6-copy-uk.md §1.2), transcribed: ¶1
 * and ¶3 replace the read-only cabinet's «напишіть, і я приберу» (A2, row
 * 89), since from PR 6 the shelter marks an animal home itself with K2's
 * «Уже вдома». ¶2 is unchanged.
 */
describe("/prytulkam §9 (forShelters.whenAnimalFindsHome)", () => {
  const paragraphs = uk.forShelters.whenAnimalFindsHome.split("\n\n");

  it("has three paragraphs, the first and third his PR 6 text", () => {
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe(
      "Найважливіше, що ви можете зробити, — позначити, що тварина знайшла дім.",
    );
    expect(paragraphs[2]).toBe(
      "Кожна тварина в кабінеті має кнопку «Уже вдома». Після неї картка одразу зникає з галереї та стрічки, а у вашому списку лишається з позначкою «Удома».",
    );
  });

  it("no longer says the operator removes it, or that the cabinet is read-only", () => {
    for (const gone of [
      "напишіть, і я приберу",
      "лише для перегляду",
      "що ви можете мені сказати",
      "Окремої кнопки ще немає",
      "якого не існує",
    ]) {
      expect(uk.forShelters.whenAnimalFindsHome, gone).not.toContain(gone);
    }
  });

  it("keeps the second paragraph as it was", () => {
    expect(paragraphs[1]).toBe(
      "Тварина, яка вже вдома, але досі в списку, — це єдине, що робить усі інші картки недостовірними: людина дзвонить, чує «її забрали три місяці тому», і далі не вірить жодній картці — ні вашій, ні чужій.",
    );
  });
});

/**
 * A1, row 91 (Oleksii, 2026-10-14, verbatim: "Yes, include it: «Доступ до
 * кабінету я надсилаю сам — листом на адресу, яку ви мені вкажете.» Place it
 * directly before the current last paragraph of §7, and ship it in the same
 * commit as row 89."). Its own paragraph, second to last, transcribed; the
 * last paragraph is unchanged.
 */
describe("/prytulkam A1 (forShelters.whatToPrepare)", () => {
  const paragraphs = uk.forShelters.whatToPrepare.split("\n\n");

  it("carries his line directly before §7's last paragraph, which is his PR 6 text", () => {
    expect(paragraphs.at(-2)).toBe(
      "Доступ до кабінету я надсилаю сам — листом на адресу, яку ви мені вкажете.",
    );
    // pr6-copy-uk.md §1.1: the shelter keeps its animals and profile itself (commitment #6).
    expect(paragraphs.at(-1)).toBe(
      "Тварин і профіль притулку ви ведете самі в кабінеті: додаєте картку, публікуєте — і її одразу видно. Якщо тварин багато, на старті можу внести перші картки сам — надішліть список і фото.",
    );
    expect(uk.forShelters.whatToPrepare).not.toContain("я внесу все сам");
    expect(uk.forShelters.whatToPrepare).not.toContain("Заповнювати анкету не треба");
    expect(paragraphs.at(-3)).toBe("Фотографії використовуються тільки для сторінок ваших тварин.");
    expect(
      paragraphs.filter((paragraph) => paragraph.includes("Доступ до кабінету")),
      "once",
    ).toHaveLength(1);
  });
});

/**
 * /pro `about.data`, his PR 6 text (pr6-copy-uk.md §1.5), transcribed byte for
 * byte: the kabinet history and photo facts added (his Q6, Q7, Q5), «реєстр»
 * gone (0.3d), «лише місто» since every adopter-facing view carries the city
 * only (EM-D1). On Vercel Pro «протягом двох діб» would revert to «протягом
 * доби» (KH-C1).
 */
describe("/pro about.data (his PR 6 text)", () => {
  it("is his paragraph, byte for byte", () => {
    expect(uk.about.data).toBe(
      "Дані, які вносить притулок — адреса, контакти, картки тварин, — належать притулку. Точна адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише місто. Притулок може попросити видалити свій запис у будь-який момент. Для притулків із доступом до кабінету сайт зберігає імʼя та адресу пошти адміністратора — щоб надсилати посилання для входу, — а також технічний запис про браузер і пристрій, з якого виконано вхід. IP-адреси не зберігаються. Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом двох діб. Кожна зміна в кабінеті записується в історію притулку: коли її зроблено і хто — адміністратор притулку чи я. Для профілю зберігаються попереднє й нове значення, для карток тварин — лише те, які поля змінено. Про людей, які шукають тварину, в історії нічого немає. Історія видаляється разом із записом притулку. Фото, завантажені в кабінеті, зберігаються без даних про місце зйомки, за адресами, які неможливо вгадати. Фото, прибране з картки, більше не показується, а сам файл я видаляю на прохання притулку.",
    );
    expect(uk.about.data).not.toContain("реєстр");
    expect(uk.about.data).not.toContain("наближену");
  });
});

/**
 * §8 (commitment #7, B1), his PR 6 text (pr6-copy-uk.md §1.3), transcribed:
 * what moves the date (publish, «Ще шукає» / «Ще домовляються», a photo
 * change) and what doesn't (a text edit), and «один раз» gone (his K4 answer
 * 10). `freshness.updatedAgo` stays «Оновлено {days}» (K-Q14 (a)).
 */
describe("/prytulkam §8 B1 (forShelters.whyThatSentence)", () => {
  const paragraphs = uk.forShelters.whyThatSentence.split("\n\n");

  it("is his three paragraphs", () => {
    expect(paragraphs).toEqual([
      "Людина, яка обирає між двома собаками, ніяк не дізнається, про кого з них писали минулого тижня, а про кого — позаторік. Тому на картці видно, коли ви востаннє підтвердили, що тварина ще шукає дім, а на сторінці тварини — ваше речення про те, як часто ви це робите, вашими словами.",
      "Дату ніхто не вписує вручну: вона оновлюється, коли ви публікуєте картку, натискаєте «Ще шукає» чи «Ще домовляються» або змінюєте фото. Правки в тексті дату не змінюють — так вона показує саме те, що обіцяє. Речення пишете ви, коли вам зручно, і можете змінити його будь-коли: «оновлюємо щосуботи», «дзвоніть, ми скажемо точно», «влітку рідше».",
      "Саме це робить решту карток вартими довіри. Коли видно, що ви підтверджуєте картки щосуботи, ваше «ця тварина ще шукає дім» означає рівно те, що написано.",
    ]);
  });

  it("no longer claims an edit moves the date, or that the sentence is written once", () => {
    for (const gone of ["коли інформацію востаннє оновлювали", "один раз", "Дата ставиться сама"]) {
      expect(uk.forShelters.whyThatSentence, gone).not.toContain(gone);
    }
  });

  it("K-Q14 (a): the cards keep «Оновлено {days}»", () => {
    expect(uk.freshness.updatedAgo).toBe("Оновлено {days}");
  });
});

/**
 * §3 ¶4 (commitment #1), his PR 6 text (pr6-copy-uk.md §1.6), transcribed:
 * the ordering inputs are unchanged, and «оновлено» reads as the cards'
 * confirmation date (K-Q14 (a)).
 */
describe("/prytulkam §3 ¶4 (forShelters.whatHappensToAnimals)", () => {
  it("is his ordering paragraph, still closing on «Це все, що впливає на порядок.»", () => {
    const paragraphs = uk.forShelters.whatHappensToAnimals.split("\n\n");
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[3]).toBe(
      "Порядок у списку — за датою: спочатку ті, чиї картки оновлено найновіше, або ті, хто чекає найдовше; людина обирає сама. У режимі «по одній» до дати додається повнота картки — та, де є фотографії, опис і відмітка про щеплення, показується раніше. Це все, що впливає на порядок.",
    );
  });
});

/**
 * K4-B4, answer 3 (Oleksii, verbatim: "ʼ (U+02BC) in all my strings, incl.
 * contacts.atLeastOne «звʼязку»."): his K4 strings use the letter-apostrophe
 * only. Scoped to PR 2's keys; older catalogue strings keep U+0027
 * (`apostrophes.test.ts`), and a catalogue-wide change is his to make.
 */
describe("his K4 strings use U+02BC only (K4-B4, answer 3)", () => {
  const leaves = (node: unknown, path: string): [string, string][] =>
    typeof node === "string"
      ? [[path, node]]
      : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
          leaves(child, `${path}.${key}`),
        );
  const k4 = [
    ...leaves(uk.kabinet.profileEdit, "kabinet.profileEdit"),
    ["kabinet.profile.donationPending", uk.kabinet.profile.donationPending] as [string, string],
  ];
  const ASCII_APOSTROPHE = String.fromCodePoint(0x27);
  const TYPOGRAPHIC_APOSTROPHE = String.fromCodePoint(0x2019);

  it("no U+0027 and no U+2019 in any of them", () => {
    expect(
      k4
        .filter(
          ([, text]) => text.includes(ASCII_APOSTROPHE) || text.includes(TYPOGRAPHIC_APOSTROPHE),
        )
        .map(([path]) => path),
    ).toEqual([]);
  });

  it("sanity: the walk reaches his strings, and the letter-apostrophe is in them", () => {
    expect(k4.length).toBe(75);
    expect(uk.kabinet.profileEdit.contacts.atLeastOne).toContain(String.fromCodePoint(0x2bc));
  });
});

/**
 * K3 (PR 4): Oleksii's final Ukrainian for the animal form, transcribed
 * literally from his answer file (`k3-copy-uk.md`, 2026-10-17) by script,
 * never retyped, and compared with the catalogue key by key. His note
 * there, verbatim: "Final unless marked. Apostrophe ʼ (U+02BC). Top-level
 * quotes «…», nested „…“." `listed.dateUnchanged` lived under
 * `testShelterOnly` by his own note until K2 (PR 5), which moved it back to
 * `animalForm.listed` (K2 sheet P10); `dismissFailedName` is
 * the accessible name his `dismissFailed` answer gives in brackets.
 * `photos.lastPhotoKeptNotShown` and `publish.publishedNotShown` are his
 * final text from a later answer (round 2b, answer 3, 2026-10-17),
 * transcribed the same way.
 */
describe("kabinet K3 copy (final, 2026-10-17)", () => {
  const K3_FINAL: Record<string, string> = {
    "kabinet.animalForm.pageTitleNew": "Нова тварина",
    "kabinet.animalForm.pageTitleEdit": "{name}",
    "kabinet.animalForm.titleNew": "Нова тварина",
    "kabinet.animalForm.backToList": "← Тварини",
    "kabinet.animalForm.header.createdNotPublished": "Створено {when} · ще не в галереї",
    "kabinet.listingStatus.draft": "Чернетка",
    "kabinet.listingStatus.published": "Опубліковано",
    "kabinet.listingStatus.reserved": "Домовляються",
    "kabinet.listingStatus.adopted": "Удома",
    "kabinet.listingStatus.withdrawn": "Знято з показу",
    "kabinet.animalForm.who.title": "Хто це",
    "kabinet.animalForm.who.nameLabel": "Імʼя",
    "kabinet.animalForm.who.nameHint":
      "Як тварину кличуть у притулку. Лише імʼя — пояснення краще написати в описі.",
    "kabinet.animalForm.who.namePlaceholder": "Наприклад, Ластівка",
    "kabinet.animalForm.who.speciesLabel": "Вид",
    "kabinet.animalForm.who.sexLabel": "Стать",
    "kabinet.animalForm.who.sexMale": "Хлопчик",
    "kabinet.animalForm.who.sexFemale": "Дівчинка",
    "kabinet.animalForm.who.sizeLabel": "Розмір",
    "kabinet.animalForm.who.sizeNote":
      "Ваги немає навмисно: розмір на око точніший, ніж торішня цифра.",
    "kabinet.animalForm.who.sizeHintUpTo": "до {max} кг",
    "kabinet.animalForm.who.sizeHintRange": "{min}–{max} кг",
    "kabinet.animalForm.who.sizeHintFrom": "від {min} кг",
    "kabinet.animalForm.age.title": "Вік",
    "kabinet.animalForm.age.modeLabel": "Що відомо про вік",
    "kabinet.animalForm.age.modeBirthDate": "Відома дата народження",
    "kabinet.animalForm.age.modeBucket": "Відомий вік на певну дату",
    "kabinet.animalForm.age.modeBirthDateShort": "Дата народження",
    "kabinet.animalForm.age.modeBucketShort": "Вік на дату",
    "kabinet.animalForm.age.modeNote":
      "Обидва способи рівноцінні. Сайт зберігає саме те, що ви вказали, і далі рахує вік сам.",
    "kabinet.animalForm.age.birthDateLabel": "Дата народження",
    "kabinet.animalForm.age.bucketLabel": "Вік на ту дату",
    "kabinet.animalForm.age.bucketRangeUnder": "до {max}",
    "kabinet.animalForm.age.bucketRange": "{min}–{max}",
    "kabinet.animalForm.age.bucketRangeFrom": "{min}+",
    "kabinet.animalForm.age.asOfLabel": "Станом на",
    "kabinet.animalForm.age.asOfHint":
      "Коли ви це оцінили. Зазвичай — день, коли тварина потрапила до притулку.",
    "kabinet.animalForm.age.adopterSees": "Ті, хто шукає тварину, побачать: «{label}».",
    "kabinet.animalForm.age.uncertain":
      "Вік указано станом на {when}. Тепер на картці — «{label}». Якщо тварина вже старша, оновіть вік.",
    "kabinet.animalForm.description.title": "Опис",
    "kabinet.animalForm.description.prompt": "Що б ви сказали людині біля вольєра.",
    "kabinet.animalForm.description.label": "Про тварину",
    "kabinet.animalForm.description.hint": "Простий текст, без форматування.",
    "kabinet.animalForm.description.counter": "{count} з {max} символів",
    "kabinet.animalForm.description.counterOver": "Зайвих символів: {over}",
    "kabinet.animalForm.health.title": "Медичний стан",
    "kabinet.animalForm.health.confirm": "Зроблено",
    "kabinet.animalForm.health.unknownNote":
      "«Не записано» — чесна відповідь. Ті, хто шукає тварину, так і побачать «Не записано», а не «ні».",
    "kabinet.animalForm.health.registryReadOnly":
      "Підтверджено державним реєстром тварин. Тут цей рядок змінити не можна.",
    "kabinet.animalForm.photos.title": "Фото",
    "kabinet.animalForm.photos.ratioNote": "Формат 4:5, перше фото — обкладинка.",
    "kabinet.animalForm.photos.add": "+ Фото",
    "kabinet.animalForm.photos.addHint": "Будь-яке фото, яке відкриває цей телефон чи браузер.",
    "kabinet.animalForm.photos.howItWorks":
      "Перше фото — обкладинка; щоб змінити порядок, перетягніть фото. Для публікації потрібне хоча б одне. Великі фото зменшуються на пристрої до {px} пікселів перед відправкою — так менше мобільного трафіку.",
    "kabinet.animalForm.photos.privacyNote":
      "З фото прибираються дані про місце зйомки та інші приховані дані.",
    "kabinet.animalForm.photos.preparing": "Фото готується…",
    "kabinet.animalForm.photos.uploading": "Фото завантажується…",
    "kabinet.animalForm.photos.uploadingProgress": "Завантаження · {percent} · {sent} з {total} МБ",
    "kabinet.animalForm.photos.done": "Готово",
    "kabinet.animalForm.photos.cover": "Обкладинка",
    "kabinet.animalForm.photos.failed": "Не завантажилось",
    "kabinet.animalForm.photos.dismissFailed": "Прибрати",
    "kabinet.animalForm.photos.tileLabel": "Фото {n} з {total}",
    "kabinet.animalForm.photos.makeCover": "Зробити обкладинкою",
    "kabinet.animalForm.photos.moveEarlier": "Перемістити вперед",
    "kabinet.animalForm.photos.moveLater": "Перемістити назад",
    "kabinet.animalForm.photos.remove": "Прибрати фото {n}",
    "kabinet.animalForm.photos.capReached": "Це максимум — {max} фото.",
    "kabinet.animalForm.photos.lastPhotoKept": "Цю картку бачать люди, тож одне фото має лишитися.",
    "kabinet.animalForm.photos.lastPhotoKeptNotShown":
      "Картка опублікована, тож одне фото має лишитися — навіть поки її ще не бачать.",
    "kabinet.animalForm.photos.added": "Фото додано.",
    "kabinet.animalForm.photos.removed": "Фото прибрано.",
    "kabinet.animalForm.photos.reordered": "Порядок змінено.",
    "kabinet.animalForm.photos.conflict":
      "Фото змінилися в іншому вікні. Тут — поточний набір, спробуйте ще раз.",
    "kabinet.animalForm.photos.removedStillReachable":
      "Фото зникло з картки. Сам файл не видаляється одразу — якщо його треба прибрати зовсім, напишіть мені.",
    "kabinet.animalForm.photos.dateMoves":
      "На картці, яку бачать люди, будь-яка зміна фото оновлює дату «Оновлено».",
    "kabinet.animalForm.photoErrors.heicUnsupported":
      "Цей телефон чи браузер не відкриває фото у форматі HEIC. Виберіть, будь ласка, JPG або PNG.",
    "kabinet.animalForm.photoErrors.unreadable": "Цей файл не вдалося відкрити як фото.",
    "kabinet.animalForm.photoErrors.tooLarge":
      "Навіть після зменшення це фото завелике. Спробуйте інше.",
    "kabinet.animalForm.photoErrors.rejected": "Сайт не може використати цей файл як фото.",
    "kabinet.animalForm.photoErrors.limitReached": "У цієї тварини вже {max} фото.",
    "kabinet.animalForm.photoErrors.rateLimited":
      "Забагато фото за короткий час. Спробуйте трохи пізніше.",
    "kabinet.animalForm.photoErrors.uploadsUnavailable":
      "На цій версії сайту фото завантажити не можна.",
    "kabinet.animalForm.draft.savedAt": "Чернетку збережено о {time}",
    "kabinet.animalForm.draft.notVisible": "Ті, хто шукає тварину, цю чернетку не бачать.",
    "kabinet.animalForm.draft.notSavedYet": "Щоб зберегти чернетку, потрібні імʼя та вид.",
    "kabinet.animalForm.draft.saveFailed":
      "Чернетку не збережено. Перевірте зʼєднання — усе, що ви ввели, лишається тут.",
    "kabinet.animalForm.draft.save": "Зберегти чернетку",
    "kabinet.animalForm.draft.saveShort": "Зберегти",
    "kabinet.animalForm.listed.liveOnSave": "Зміни зʼявляться на картці одразу після збереження.",
    "kabinet.animalForm.listed.notShownNow": "Цю картку зараз ніхто не бачить.",
    "kabinet.animalForm.listed.dateUnchanged":
      "Правки тексту не змінюють дату «Оновлено». Її змінює ваше підтвердження в списку тварин і будь-яка зміна фото.",
    "kabinet.animalForm.publish.button": "Опублікувати",
    "kabinet.animalForm.publish.missing": "Щоб опублікувати, ще потрібно: {list}.",
    "kabinet.animalForm.publish.gap.size": "розмір",
    "kabinet.animalForm.publish.gap.age": "вік",
    "kabinet.animalForm.publish.gap.description": "опис",
    "kabinet.animalForm.publish.gap.photo": "фото",
    "kabinet.animalForm.publish.done": "Опубліковано. Тепер картку бачать ті, хто шукає тварину.",
    "kabinet.animalForm.publish.publishedNotShown":
      "Опубліковано. Ті, хто шукає тварину, побачать картку, щойно притулок пройде перевірку.",
    "kabinet.animalForm.publish.viewPublic": "Відкрити сторінку тварини",
    "kabinet.animalForm.publish.stateChanged":
      "Картка змінилася в іншому вікні. Оновіть сторінку, щоб побачити поточну версію.",
    "kabinet.animalForm.errors.conflict":
      "Хтось змінив цю картку після того, як ви її відкрили. Ваші останні зміни не збережено. Ось поточна версія — внесіть їх ще раз.",
    "kabinet.animalForm.errors.registryConfirmed":
      "Це підтверджено державним реєстром тварин, тут змінити не можна.",
    "kabinet.animalForm.errors.requiredOnceListed":
      "Картку вже публікували, тож опис не може бути порожнім.",
    "kabinet.animalForm.errors.notFound":
      "Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.",
    "kabinet.animalForm.errors.loadFailed":
      "Картка не завантажилась. Перевірте зʼєднання і спробуйте ще раз.",
    "kabinet.animalForm.validation.nameRequired": "Щоб зберегти чернетку, потрібне імʼя.",
    "kabinet.animalForm.validation.speciesRequired":
      "Виберіть, собака це чи кіт, щоб зберегти чернетку.",
    "kabinet.animalForm.validation.nameBrace": "В імені не може бути фігурних дужок.",
    "kabinet.animalForm.validation.nameTooLong": "Імʼя довше за {max} символів.",
    "kabinet.animalForm.validation.descriptionTooLong": "Опис довший за {max} символів.",
    "kabinet.animalForm.validation.birthDateFuture": "Дата народження не може бути в майбутньому.",
    "kabinet.animalForm.validation.asOfFuture": "Дата «Станом на» не може бути в майбутньому.",
    "kabinet.animalForm.validation.dateTooOld": "Ця дата надто давня — понад {years} років тому.",
    "kabinet.animalForm.photos.dismissFailedName": "Прибрати фото, яке не завантажилось",
  };

  const at = (path: string): unknown =>
    path
      .split(".")
      .slice(1)
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        uk.kabinet,
      );

  it.each(Object.entries(K3_FINAL))("%s is his text, exactly", (path, text) => {
    expect(at(path)).toBe(text);
  });

  it("every K3 key the form reads is one of his (no string of ours under animalForm)", () => {
    const leaves = (node: unknown, path: string): string[] =>
      typeof node === "string"
        ? [path]
        : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
            leaves(child, `${path}.${key}`),
          );
    expect(leaves(uk.kabinet.animalForm, "kabinet.animalForm").sort()).toEqual(
      Object.keys(K3_FINAL)
        .filter((path) => path.startsWith("kabinet.animalForm."))
        .sort(),
    );
    expect(Object.keys(uk.kabinet.listingStatus).sort()).toEqual([
      "adopted",
      "draft",
      "published",
      "reserved",
      "withdrawn",
    ]);
  });

  it("nothing under animalForm or listingStatus is pending", () => {
    expect(pendingCopyPaths(uk.kabinet.animalForm, "kabinet.animalForm")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.listingStatus, "kabinet.listingStatus")).toEqual([]);
  });

  /**
   * His Q5 answer, verbatim: "«реєстр» is allowed ONLY as the explicit name
   * of the state register: «державний реєстр тварин». Update the public keys
   * too: `medical.registry` → «Державний реєстр тварин»,
   * `medical.registryConfirmed` → «Підтверджено державним реєстром тварин».
   * Never «реєстр» alone."
   */
  it("the public registry keys name the state register (Q5)", () => {
    expect(uk.medical.registry).toBe("Державний реєстр тварин");
    expect(uk.medical.registryConfirmed).toBe("Підтверджено державним реєстром тварин");
  });

  it("«реєстр» appears in K3's strings only inside «державн… реєстр… тварин» (Q5)", () => {
    const k3 = Object.values(K3_FINAL).join("\n");
    const bare = k3.replace(/державн\S* реєстр\S* тварин/giu, "");
    expect(/реєстр/iu.test(bare)).toBe(false);
    // The walk sees the strings that do name it.
    expect(k3).toContain("державним реєстром тварин");
  });

  it("no U+0027 or U+2019 apostrophe in any K3 string (his U+02BC only)", () => {
    const offenders = Object.entries(K3_FINAL)
      .filter(
        ([, text]) =>
          text.includes(String.fromCodePoint(0x27)) || text.includes(String.fromCodePoint(0x2019)),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
    expect(uk.kabinet.animalForm.who.nameLabel).toContain(String.fromCodePoint(0x2bc));
  });

  /**
   * His answers 3 and 4: never «адоптери», no «ми» voice. (Answer 2, no
   * pronoun for the animal, isn't checkable by a word list: «її» and «його»
   * do occur, for the card, the date and the file.)
   */
  it("no «ми» voice and no «адоптер» (his answers 3 and 4)", () => {
    const k3 = Object.values(K3_FINAL).join(" ");
    expect(/(^|[^\p{L}])(ми|адоптер\p{L}*)([^\p{L}]|$)/iu.test(k3)).toBe(false);
  });
});

/**
 * K2 (PR 5): Oleksii's final Ukrainian for the animal list, transcribed
 * literally from his answer file (`k2-copy-uk.md`, 2026-10-18) by script,
 * never retyped, and compared with the catalogue key by key. His note there,
 * verbatim: "Final. ʼ (U+02BC). «…» top level, „…“ nested. No «ми», no
 * «адоптери», no «реєстр», pronoun-free for the animal." `captionCards.*` and
 * `stale.countCards.*` are the three forms his `{cards}` takes in `caption`
 * and `stale.count` (one, few, many, in his order).
 */
describe("kabinet K2 copy (final, 2026-10-18)", () => {
  const K2_FINAL: Record<string, string> = {
    "kabinet.animalList.pageTitle": "Тварини",
    "kabinet.animalList.title": "Тварини",
    "kabinet.animalList.caption": "{shelter} · {cards}",
    "kabinet.animalList.captionCards.one": "{count} картка",
    "kabinet.animalList.captionCards.few": "{count} картки",
    "kabinet.animalList.captionCards.many": "{count} карток",
    "kabinet.animalList.add": "Додати тварину",
    "kabinet.animalList.addShort": "Додати",
    "kabinet.nav.label": "Розділи кабінету",
    "kabinet.nav.animals": "Тварини",
    "kabinet.animalList.filter.label": "Показати",
    "kabinet.animalList.filter.all": "Усі",
    "kabinet.animalList.filter.draft": "Чернетки",
    "kabinet.animalList.filter.published": "Опубліковано",
    "kabinet.animalList.filter.reserved": "Домовляються",
    "kabinet.animalList.filter.adopted": "Удома",
    "kabinet.animalList.filter.withdrawn": "Знято з показу",
    "kabinet.animalList.filter.withCount": "{label} · {count}",
    "kabinet.animalList.row.adoptedSince": "Удома з {date}",
    "kabinet.animalList.row.withdrawnOn": "Знято з показу {date} · {reason}",
    "kabinet.animalList.row.more": "Ще",
    "kabinet.animalList.actions.edit": "Редагувати",
    "kabinet.animalList.confirm.stillLooking": "Ще шукає",
    "kabinet.animalList.confirm.stillArranging": "Ще домовляються",
    "kabinet.animalList.confirm.done": "Підтверджено сьогодні",
    "kabinet.animalList.confirm.undo": "Скасувати · {seconds} с",
    "kabinet.animalList.confirm.undone": "Скасовано: на картці знову попередня дата.",
    "kabinet.animalList.confirm.undoExpired":
      "Скасувати вже не можна: час минув або картку змінено. На картці — сьогоднішня дата.",
    "kabinet.animalList.confirm.failed":
      "Не підтверджено: дата на картці не змінилася. Перевірте зʼєднання і спробуйте ще раз.",
    "kabinet.animalList.actions.reserve": "Почали домовлятися",
    "kabinet.animalList.actions.release": "Не домовилися — знову шукає",
    "kabinet.animalList.actions.adopt": "Уже вдома",
    "kabinet.animalList.adoptDialog.title": "{name} уже вдома?",
    "kabinet.animalList.adoptDialog.body":
      "Картка зникне з галереї та стрічки, а її сторінка повідомлятиме, що тварини там уже немає. У вашому списку картка лишиться з позначкою «Удома». Скасувати це не можна: якщо тварина повернеться, додайте її як нову картку.",
    "kabinet.animalList.adoptDialog.confirm": "Так, уже вдома",
    "kabinet.animalList.actions.withdraw": "Зняти з показу",
    "kabinet.animalList.withdrawDialog.title": "Зняти з показу: {name}?",
    "kabinet.animalList.withdrawDialog.body":
      "Ті, хто шукає тварину, більше не бачитимуть картку, а її сторінка повідомлятиме, що тварини там уже немає. У вашому списку картка лишиться, її можна повернути в чернетки. Якщо опублікувати її знову, дата й час очікування почнуться з того дня.",
    "kabinet.animalList.withdrawDialog.adoptedHint":
      "Якщо тварина знайшла дім, позначте краще «Уже вдома».",
    "kabinet.animalList.withdrawDialog.confirm": "Зняти з показу",
    "kabinet.animalList.withdrawReason.adopted_elsewhere": "знайшла дім іншим шляхом",
    "kabinet.animalList.withdrawReason.transferred": "переїхала до іншого притулку",
    "kabinet.animalList.withdrawReason.deceased": "тварини не стало",
    "kabinet.animalList.withdrawReason.listing_error": "додано помилково",
    "kabinet.animalList.withdrawReason.other": "інша причина",
    "kabinet.animalList.actions.restore": "Повернути в чернетки",
    "kabinet.animalList.moved.reserved": "{name}: почали домовлятися.",
    "kabinet.animalList.moved.released": "{name}: знову шукає дім.",
    "kabinet.animalList.moved.adopted": "{name}: уже вдома.",
    "kabinet.animalList.moved.withdrawn": "{name}: знято з показу.",
    "kabinet.animalList.moved.restored": "{name}: повернуто в чернетки.",
    "kabinet.animalList.actions.deleteDraft": "Видалити чернетку",
    "kabinet.animalList.deleteDialog.title": "Видалити чернетку «{name}»?",
    "kabinet.animalList.deleteDialog.body": "Вона назавжди зникне з вашого списку.",
    "kabinet.animalList.deleteDialog.photosStay":
      "Файли фото не видаляються одразу — якщо їх треба прибрати зовсім, напишіть мені.",
    "kabinet.animalList.deleteDialog.confirm": "Видалити",
    "kabinet.animalList.deleted": "Чернетку «{name}» видалено.",
    "kabinet.deleteDraft.refused.wasPublished":
      "Цю картку вже публікували, тож видалити її не можна. Вона лишається у вашому списку як чернетка, і ті, хто шукає тварину, її не бачать.",
    "kabinet.animalList.stale.count": "{cards} ви не підтверджували понад {days} днів.",
    "kabinet.animalList.stale.countCards.one": "{count} картку",
    "kabinet.animalList.stale.countCards.few": "{count} картки",
    "kabinet.animalList.stale.countCards.many": "{count} карток",
    "kabinet.animalList.stale.caption":
      "Ті, хто шукає тварину, бачать на них давню дату. Якщо нічого не змінилося, достатньо натиснути «Ще шукає» чи «Ще домовляються».",
    "kabinet.animalList.stale.show": "Показати ці {count}",
    "kabinet.animalList.stale.showAll": "Показати всі",
    "kabinet.animalList.paused.hidden":
      "Поки прийом на паузі, ваших тварин не бачать ті, хто шукає.",
    "kabinet.animalList.notVisible.pending":
      "Ваші тварини зʼявляться в галереї, щойно притулок пройде перевірку.",
    "kabinet.animalList.orderNote":
      "Порядок у галереї — за датою: людина сама обирає, спочатку найсвіжіші картки чи ті, хто чекає найдовше. Повнота картки впливає лише на порядок у стрічці. Тут порядок змінити не можна, і просування немає.",
    "kabinet.animalList.empty.title": "Тут поки немає тварин.",
    "kabinet.animalList.empty.body":
      "Додайте першу. Ті, хто шукає тварину, побачать картку після публікації.",
    "kabinet.animalList.empty.add": "Додати першу тварину",
    "kabinet.animalList.empty.caption":
      "Щоб зберегти чернетку, потрібні імʼя та вид — решту можна дописати пізніше.",
    "kabinet.animalList.loading": "Завантаження",
    "kabinet.animalList.loadMore": "Показати ще",
    "kabinet.animalList.filterEmpty": "У цій групі поки немає карток.",
    "kabinet.animalList.loadFailed":
      "Список не завантажився. Перевірте зʼєднання і спробуйте ще раз.",
    "kabinet.animalList.errors.rateLimited":
      "Забагато дій за короткий час. Зачекайте хвилину й спробуйте ще раз.",
    "kabinet.animalList.errors.actionFailed": "Не вдалося. Перевірте зʼєднання і спробуйте ще раз.",
  };

  const at = (path: string): unknown =>
    path
      .split(".")
      .slice(1)
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        uk.kabinet,
      );

  const leaves = (node: unknown, path: string): string[] =>
    typeof node === "string"
      ? [path]
      : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
          leaves(child, `${path}.${key}`),
        );

  it.each(Object.entries(K2_FINAL))("%s is his text, exactly", (path, text) => {
    expect(at(path)).toBe(text);
  });

  it("every key K2 adds is one of his (no string of ours under animalList, nav or deleteDraft)", () => {
    expect(
      [
        ...leaves(uk.kabinet.animalList, "kabinet.animalList"),
        ...leaves(uk.kabinet.nav, "kabinet.nav"),
        ...leaves(uk.kabinet.deleteDraft, "kabinet.deleteDraft"),
      ].sort(),
    ).toEqual(Object.keys(K2_FINAL).sort());
  });

  it("nothing K2 adds is pending", () => {
    expect(pendingCopyPaths(uk.kabinet.animalList, "kabinet.animalList")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.nav, "kabinet.nav")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.deleteDraft, "kabinet.deleteDraft")).toEqual([]);
  });

  it("no U+0027 or U+2019 apostrophe in any K2 string (his U+02BC only)", () => {
    const offenders = Object.entries(K2_FINAL)
      .filter(
        ([, text]) =>
          text.includes(String.fromCodePoint(0x27)) || text.includes(String.fromCodePoint(0x2019)),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
    expect(uk.kabinet.animalList.loadFailed).toContain(String.fromCodePoint(0x2bc));
  });

  it("no «ми» voice, no «адоптер» and no «реєстр» (his note)", () => {
    const k2 = Object.values(K2_FINAL).join(" ");
    expect(/(^|[^\p{L}])(ми|адоптер\p{L}*)([^\p{L}]|$)/iu.test(k2)).toBe(false);
    expect(/реєстр/iu.test(k2)).toBe(false);
  });
});
