import { describe, expect, it } from "vitest";
import { pendingCopyKeys, pendingCopyPaths } from "./copy-status";
import { en } from "./messages/en";
import { COPY_PENDING, uk } from "./messages/uk";

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

  it("the testShelterOnly namespace exists, as an object (empty in PR 2)", () => {
    expect(typeof uk.kabinet.testShelterOnly).toBe("object");
    expect(Object.keys(uk.kabinet.testShelterOnly)).toEqual([]);
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
      "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» у реєстрі.",
    // row 85 (reworded 2026-10-14, EM-Q8: the kabinet also shows the verification data)
    "email.invite.what":
      "Поки що в кабінеті можна переглянути дані притулку — і те, що бачать люди, і дані з перевірки. Змінювати їх там ще не можна — для цього напишіть мені.",
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
      "Адресу додає оператор реєстру, коли запрошує притулок. Якщо адреси немає в списку, лист не прийде — і ця сторінка про це не повідомляє, щоб не розкривати, хто зареєстрований.",
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
    expect(uk.kabinet.operatorFallbackName).toBe("Оператор реєстру");
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
 * user-facing copy, as it implies a state service". Scoped to the three strings
 * his copy batch replaced: the catalogue's other «реєстр» strings are his
 * separate call, so this is deliberately not a sweep. Their English mirrors
 * follow the same sense, so they are held to "registry". A plain substring
 * match, case-insensitive: «Реєстр» opened the old donation note.
 */
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
  };

  it.each(Object.entries(replaced))("%s", (_key, [ukText, enText]) => {
    expect(ukText).not.toMatch(/реєстр/iu);
    expect(enText).not.toMatch(/registry/i);
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
describe("/prytulkam A2 (forShelters.whenAnimalFindsHome)", () => {
  const paragraphs = uk.forShelters.whenAnimalFindsHome.split("\n\n");

  it("has three paragraphs, the third his row 89 text since production sign-in", () => {
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[2]).toBe(
      "Поки що це просто: напишіть, і я приберу. Кабінет притулку вже є, але лише для перегляду — змінити чи прибрати щось у ньому поки не можна.",
    );
    expect(uk.forShelters.whenAnimalFindsHome).not.toContain("Окремої кнопки ще немає");
    expect(uk.forShelters.whenAnimalFindsHome).not.toContain("якого не існує");
  });

  it("keeps the first two paragraphs as they were", () => {
    expect(paragraphs[0]).toBe(
      "Найважливіше, що ви можете мені сказати, — що тварина знайшла дім. Важливіше, ніж додати нову.",
    );
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

  it("carries his line directly before §7's last paragraph, which is unchanged", () => {
    expect(paragraphs.at(-2)).toBe(
      "Доступ до кабінету я надсилаю сам — листом на адресу, яку ви мені вкажете.",
    );
    expect(paragraphs.at(-1)).toBe("Заповнювати анкету не треба: ви розкажете, а я внесу все сам.");
    expect(paragraphs.at(-3)).toBe("Фотографії використовуються тільки для сторінок ваших тварин.");
    expect(
      paragraphs.filter((paragraph) => paragraph.includes("Доступ до кабінету")),
      "once",
    ).toHaveLength(1);
  });
});

/**
 * /pro `about.data`, row 90 (KH-C1), his text transcribed: the original
 * paragraph unchanged, then the kabinet addition appended to it. Every claim
 * in it was checked against the code (inbox EM-T17); on Vercel Pro the last
 * clause would revert to «протягом доби» (KH-C1).
 */
describe("/pro about.data carries the kabinet addition (row 90)", () => {
  it("is the original paragraph followed by his addition, byte for byte", () => {
    expect(uk.about.data).toBe(
      [
        "Дані, які вносить притулок — адреса, контакти, картки тварин — належать притулку. Точна адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише наближену локацію. Притулок може попросити видалити свій запис у будь-який момент.",
        "Для притулків із доступом до кабінету реєстр зберігає ім'я та адресу пошти адміністратора — щоб надсилати посилання для входу, — а також технічний запис про браузер і пристрій, з якого виконано вхід. IP-адреси не зберігаються. Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом двох діб.",
      ].join(" "),
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
