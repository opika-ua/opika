import { describe, expect, it } from "vitest";
import { pendingCopyKeys, pendingCopyPaths } from "./copy-status";
import { en } from "./messages/en";
import { COPY_PENDING, R4_2_ANALYTICS_SENTENCE, uk } from "./messages/uk";

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
    // Prefix, not `includes` - otherwise a paragraph that legitimately quoted
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
  it("has no placeholders left – every section is written", () => {
    expect(pendingCopyKeys(uk.forShelters)).toEqual([]);
  });

  it("still has every section the argument document specifies", () => {
    // Guards the guard: `toEqual([])` above also passes against an empty
    // object, so deleting a section rather than writing it would look
    // identical without this.
    // `signInLink` (PW-2) is the link to the kabinet's sign-in, not a section.
    const sections = Object.keys(uk.forShelters).filter(
      (key) => key !== "title" && key !== "headings" && key !== "signInLink",
    );
    expect(sections.length).toBe(14);
  });

  it("gives every section a heading, and no heading without a section", () => {
    // §4b and §6b are continuations of §4 and §6 and share their headings, so
    // headings are deliberately fewer than sections - pinned, not incidental.
    const headings = Object.keys(uk.forShelters.headings);
    expect(headings.length).toBe(12);
    for (const heading of headings) {
      expect(Object.keys(uk.forShelters)).toContain(heading);
    }
  });
});

/**
 * D-2 (`docs/observations.md`): both strings are now live - `DeckScreen.tsx`
 * shows `deckLabel`, and the root layout defaults to `bannerNotice` as the
 * description while `REGISTRY_HAS_NO_REAL_SHELTERS` (Option B, 2026-09-06:
 * `/prytulkam` and `/pro` override this default with their own opening
 * sentences instead - see `app/prytulkam/page.tsx`/`app/pro/page.tsx`).
 * Provenance: drafted by Claude from an English sense; Oleksii selected
 * these from offered options on 2026-09-05. Same shape as the
 * `forShelters` assertion above: this stays empty, and it fails the moment
 * either string reverts to a placeholder mid-edit.
 */
describe("demo-mode copy status (D-2)", () => {
  it("has no placeholders left – both strings are written", () => {
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
 * Oleksii's Phase D decisions (the not-a-judgement notice - not
 * build-plan.md's D-3 row, an unrelated robots-metadata task): the "«Не
 * зараз» is a filter, not a judgement" sentence - a standing product rule
 * (`docs/standing-constraints.md`), not decoration - lost its only home
 * when `FirstRunBand` was deleted. Landed 2026-09-06: recovered verbatim,
 * including «просто», from the original disclaimer - already-shipped copy
 * of Oleksii's, reproduced exactly rather than redrafted, so it needs no
 * fresh approval. Interim home was the detail page
 * (`AnimalDetailScreen.tsx`); R2 (Phase R, `docs/build-plan.md`) moved it
 * to its permanent one, the deck (`SwipeDeck.tsx`), and dropped `next`
 * (`uk.actions.next`, «Далі») along with the button it labelled - 5 keys
 * became 4, not 5 again with a different member.
 */
describe("deck not-a-judgement notice copy status", () => {
  it("has no placeholder left – the notice is written", () => {
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
   * No exception (PR 6 of the K milestone). CG-Q1's one exempt namespace,
   * `kabinet.testShelterOnly`, went with the allowlist it served (his 0.3a,
   * verbatim: "0.3a: yes, delete the testShelterOnly mechanism."), and CG-B1
   * holds: "A CI test fails when the policy is open and any pending string
   * exists, so PR 6 can't merge with one left." This is that test, unfiltered.
   */
  it("nothing under kabinet.* is pending, and no namespace is exempt", () => {
    expect(pendingCopyPaths(uk.kabinet, "kabinet")).toEqual([]);
    expect(Object.keys(uk.kabinet)).not.toContain("testShelterOnly");
  });

  it("the emails and sign-in stay strict, with no exception", () => {
    expect(pendingCopyPaths(uk.kabinet.email, "kabinet.email")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.signIn, "kabinet.signIn")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.signInCard, "kabinet.signInCard")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.confirm, "kabinet.confirm")).toEqual([]);
    expect(pendingCopyPaths(uk.kabinet.inviteLanding, "kabinet.inviteLanding")).toEqual([]);
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
      shell: ["label", "newTab", "viewSite"],
      // PW-1: `send` (the magic-link button) gave way to his `useLink`; the password keys are his §A.
      signIn: [
        "addressNote",
        "emailLabel",
        "failed",
        "forgot",
        "hidePassword",
        "intro",
        "otherAddress",
        "pageTitle",
        "passwordLabel",
        "resend",
        "resendIn",
        "sendFailed",
        "sentBody",
        "sentTitle",
        "showPassword",
        "spamNote",
        "submitPassword",
        "throttled",
        "title",
        "useLink",
        "wrongCredentials",
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
      // PW-2: the magic-link landing's strings went with it (his copy sheet, B: "removed when
      // PW-2 ships"); the one unusable page keeps these.
      inviteLanding: ["expired", "pageTitle", "signIn", "unusableTitle"],
      // 25 with addressNote back (row 57, his replacement, 2026-10-14): deleted as
      // a false claim (a map no adopter sees), restored once adopters receive
      // the city only (EM-Q10).
      profile: 27,
      profileStatus: ["paused", "pending", "rejected", "suspended", "under_review", "verified"],
      profileChannel: ["email", "phone", "telegram", "viber", "website"],
      support: ["body", "exit", "exitFailed", "signOutDisabled", "title", "viewingAs"],
      emailSignIn: ["action", "expiry", "intro", "notYou", "subject"],
      emailInvite: [
        "action",
        "expiry",
        "intro",
        "notYou",
        "subject",
        "what",
        "whatBeforeVerification",
      ],
      registry: ["tellPersonally"],
      history: ["adminJoined"],
    });
  });

  /**
   * The strings a commitment, a privacy rule or a send depends on, as he
   * wrote them, transcribed from his answer sheet rather than read from
   * `uk.ts` (a test may not compare output with the constant the code
   * renders). The email templates (rows 78-88), the sign-in card's fallback
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
      "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.\n- {operator}",
    // row 83
    "email.invite.subject": "Ваш доступ до кабінету притулку",
    // row 84
    // audit 2026-10-22 #46: «на сайті {site}», the name filled from app config
    "email.invite.intro":
      "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» на сайті {site}.",
    // his PR 6 text (pr6-copy-uk.md §1.4): what the shelter changes itself, once writes open;
    // one phrase replaced by his DR1-Q1 text (2026-10-20): «речення на сторінці притулку»
    "email.invite.what":
      "У кабінеті ви бачите дані притулку – і те, що бачать люди, і дані з перевірки. Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі, і зміни зʼявляються одразу після збереження. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки – юридичну особу, ЄДРПОУ чи адресу, – напишіть мені.",
    // Q-C (Oleksii, 2026-10-19): the before-verification variant, his second sentence, the rest unchanged;
    // the same DR1-Q1 phrase replaced
    "email.invite.whatBeforeVerification":
      "У кабінеті ви бачите дані притулку – і те, що бачать люди, і дані з перевірки. Контакти, речення на сторінці притулку і картки тварин ви змінюєте самі. Ті, хто шукає тварину, побачать їх, щойно притулок пройде перевірку. Посилання на збір запрацює, щойно я його перевірю. Щоб змінити дані з перевірки – юридичну особу, ЄДРПОУ чи адресу, – напишіть мені.",
    // row 86
    // audit 2026-10-22 #26: the link's job is to create a password
    "email.invite.action": "Створити пароль",
    // row 87
    "email.invite.expiry": "Запрошення діє {hours} години. Якщо не встигнете – я надішлю нове.",
    // row 88, replaced by his PW-2 Q2 paragraph (2026-10-20, verbatim), the signature kept
    "email.invite.notYou":
      "Якщо ви не чекали цього листа, просто проігноруйте його і нікому не пересилайте: це посилання один раз дає змогу створити пароль для цієї адреси, поки запрошення діє.\n- {operator}",
    // row 10 (2026-10-14: the sign-in email reached Gmail's Promotions tab)
    "signIn.spamNote":
      "Листа немає? Перевірте «Спам» і «Промоакції». Надіслати ще раз можна через 60 секунд.",
    // row 11
    "signInCard.notArrived": "Якщо лист не прийшов за кілька хвилин, напишіть мені на {contact}.",
    // row 6
    "signIn.addressNote":
      "Адресу додаю я, коли запрошую притулок. Якщо адреси немає в списку, лист не прийде – і ця сторінка про це не повідомляє, щоб не розкривати, хто зареєстрований.",
    // row 9
    "signIn.sentBody":
      "Якщо ця адреса є в списку, на {email} прийде посилання для входу. Воно діє 15 хвилин і відкривається на будь-якому пристрої.",
    // WI-Q3, Oleksii 2026-10-15; the inner quotes are «» per CB-Q1 (2026-10-17), which
    // supersedes WI-B2's nested „“ for this string
    "confirm.rateLimited":
      "Забагато спроб входу за короткий час. Посилання ще дійсне – зачекайте хвилину й знову натисніть «Увійти».",
    // row 20
    "confirm.joinFailedTitle": "Ви увійшли, але приєднати вас до притулку не вдалося",
    // row 21
    // audit 2026-10-22 #25
    "confirm.joinFailed":
      "Доступ до притулку ще не додано. Натисніть «Спробувати ще раз». Якщо не вийде, сайт спробує знову, коли ви наступного разу ввійдете.",
    // row 70: no {shelter}, deliberately
    "support.body": "Так кабінет бачить адміністратор притулку.",
    // row 69
    "support.title":
      "Ви переглядаєте кабінет притулку «{shelter}» – лише перегляд, змінити нічого не можна.",
    // row 41; final sentence replaced by CB-B1 (2026-10-17)
    "profile.contactsNote":
      "Ці контакти бачить людина, коли натискає «Написати притулку», – і пише вам сама. Листування йде напряму, без посередників.",
    // row 57, his replacement (2026-10-14), live once pre-reveal responses carry the city only
    "profile.addressNote": "Ті, хто шукає тварину, не бачать точної адреси – лише місто.",
    // row 44; replaced by CB-B1 (2026-10-17)
    "profile.donationNote": "Лише https. Через сайт гроші не проходять – це зовнішнє посилання.",
    // row 77
    "registry.inviteSent.tellPersonally":
      "Повідомте притулок особисто: запрошення надіслано з {sender}. Якщо листа не видно – хай перевірить вкладку «Промоакції».",
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
    // Kabinet UX round 2 (owner-approved, 2026-10-29): the page save bar.
    "profileEdit.saveBar.unsaved": "Є незбережені зміни",
    "profileEdit.saveBar.cancel": "Скасувати",
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
      "Не збереглося – на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.",
    // k4-copy-uk.md
    "profileEdit.state.retry": "Спробувати ще раз",
    // k4-copy-uk.md
    "profileEdit.errors.conflict":
      "Профіль змінили після того, як ви його відкрили. Ваші зміни не збережено. Ось поточна версія – внесіть зміни ще раз.",
    // k4-copy-uk.md
    "profileEdit.errors.conflictReload": "Показати поточну версію",
    // k4-copy-uk.md
    "profileEdit.errors.illegalTransitionPause":
      "Зараз не вийде поставити прийом на паузу: статус притулку змінився. Оновіть сторінку.",
    // k4-copy-uk.md
    "profileEdit.errors.illegalTransitionResume":
      "Звідси прийом зараз не відновити: статус притулку змінився. Напишіть мені.",
    // Owner, 2026-10-29 (kabinet UX round 2, replaces k4-copy-uk.md's sentence; the Viber one is the same).
    "profileEdit.errors.phoneFormat":
      "Вкажіть український номер: +380 і ще 9 цифр, наприклад +380 67 123 45 67.",
    // k4-copy-uk.md
    "profileEdit.errors.telegramFormat":
      "Імʼя користувача в Telegram: 5-32 латинські літери, цифри або підкреслення. @ можна не писати.",
    // Owner, 2026-10-29 (same sentence as phoneFormat).
    "profileEdit.errors.viberFormat":
      "Вкажіть український номер: +380 і ще 9 цифр, наприклад +380 67 123 45 67.",
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
    // k4-copy-uk.md; replaced by his DR1-Q1 text (2026-10-20)
    "profileEdit.errors.dateTokenGone":
      "Дата оновлення показується на кожній картці, тому {дата} у реченні писати не потрібно.",
    // his DR1-Q5 text (2026-10-20): the editor refuses {імʼя}
    "profileEdit.errors.nameTokenGone":
      "Тепер речення показується на сторінці притулку, тому {імʼя} у ньому не використовується. Приберіть його й збережіть ще раз.",
    // k4-copy-uk.md
    "profileEdit.errors.strayBrace": "Є дужка без пари. Фігурні дужки потрібні лише для {імʼя}.",
    // k4-copy-uk.md
    // K4-B4, answer 3: U+02BC, as in every one of his K4 strings
    "profileEdit.contacts.atLeastOne": "Залиште хоча б один спосіб звʼязку.",
    // replaced by his DR1-Q1 text (2026-10-20); nameStaysHint and insertName deleted with
    // the {імʼя} token they explained (DR1-Q5)
    "profileEdit.voice.hint":
      "Одне речення від першої особи, вашими словами, про те, як часто ви оновлюєте картки. Воно показується на сторінці притулку.",
    // k4-copy-uk.md
    "profileEdit.voice.counter": "{count} / {max}",
    // k4-copy-uk.md
    "profileEdit.voice.counterOver": "Зайвих символів: {over}",
    // his DR1-Q1 text (2026-10-20): {name} dropped; previewNoAnimals deleted by his answer
    "profileEdit.voice.previewLabel": "Так це виглядає на сторінці притулку:",
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
      "Останнє запропоноване посилання не підтверджено. Якщо незрозуміло чому – напишіть мені.",
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
      "Нові контакти побачать одразу після збереження – коли натиснуть «Написати притулку».",
    // his DR1-Q1 text (2026-10-20)
    "profileEdit.actions.liveOnSave.voice":
      "Нове речення зʼявиться на сторінці притулку одразу після збереження.",
    // K4 copy fixes
    "profileEdit.state.saved": "Збережено.",
    // K4 copy fixes
    "profileEdit.pause.noteHint":
      "Коментар бачите ви, інші адміністратори притулку і я. Людям, які шукають тварину, він не показується.",
    // his DR1-Q1 text (2026-10-20)
    "profileEdit.voice.emptyMeans":
      "Якщо залишити порожнім, на сторінці притулку цього речення не буде, а на картках, як і раніше, буде „Оновлено … тому“.",
    // his DR1-Q1 text (2026-10-20)
    "profileEdit.voice.previewEmpty": "Речення немає – на сторінці притулку його не буде.",
    // Pet card PR 3b §C. His final text (2026-10-27): `add`, `rejected` and `failed`
    // replace the builder's draft; the other eight are approved as the builder wrote them.
    "profileEdit.logo.title": "Логотип притулку",
    "profileEdit.logo.add": "Додати логотип",
    "profileEdit.logo.change": "Змінити логотип",
    "profileEdit.logo.remove": "Прибрати логотип",
    "profileEdit.logo.uploading": "Завантаження…",
    "profileEdit.logo.updated": "Логотип оновлено.",
    "profileEdit.logo.removed": "Логотип прибрано.",
    "profileEdit.logo.removeFailed":
      "Не вдалося прибрати логотип. Перевірте зʼєднання і спробуйте ще раз.",
    "profileEdit.logo.rejected": "Цей файл не підходить для логотипа. Спробуйте інше зображення.",
    "profileEdit.logo.rateLimited": "Забагато спроб за короткий час. Спробуйте трохи пізніше.",
    "profileEdit.logo.uploadsUnavailable": "На цій версії сайту логотип завантажити не можна.",
    "profileEdit.logo.failed": "Логотип не завантажився. Перевірте зʼєднання і спробуйте ще раз.",
  };

  const leafPaths = (node: unknown, prefix: string): string[] =>
    typeof node === "string"
      ? [prefix]
      : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
          leafPaths(child, `${prefix}.${key}`),
        );

  it("profileEdit holds exactly his keys, no more and no fewer", () => {
    // P6-Q8 (Oleksii, verbatim: "Q8 / 0.3b: delete `refused_until_edit_screens`,
    // `SHELTER_WRITES_NOT_YET_AVAILABLE` and `profileEdit.errors.notAvailable`.").
    expect(Object.keys(uk.kabinet.profileEdit.errors)).not.toContain("notAvailable");
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
 * have been reworded: his three (CB-B1) and the hits table's rows 5-11, 13-18
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
  // audit 2026-10-22 #33 replaced the whole text; the name is the `{site}` slot, filled from app config
  it("about.intro is his three sentences, the name a slot", () => {
    expect(
      uk.about.intro.startsWith(
        "{site} – сайт, де тварини з притулків України шукають дім. Його робить одна людина – я, у вільний від роботи час. Немає команди й інвестора.",
      ),
    ).toBe(true);
  });
  it("forShelters.whatThisIs is his sentence", () => {
    expect(uk.forShelters.whatThisIs).toBe(
      "{site} – сайт, де тварини з перевірених притулків України шукають дім, а кожен ваш підопічний отримує власну сторінку.",
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
      uk.detail.notFound.body.startsWith(
        "Цієї тварини вже немає на сайті, або посилання застаріло.",
      ),
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
    R4_2_ANALYTICS_SENTENCE: [R4_2_ANALYTICS_SENTENCE, ""],
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
      "Ці поля притулок бачить лише для читання. Зміна юридичної особи чи ЄДРПОУ не змінює статус автоматично – рішення за вами.",
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
    "operator.evidence.noDocument": "Документ не додано – для цього типу доказу це дозволено.",
    "operator.evidence.gaps": "Для схвалення бракує: {kind} – {provided} з {minimum}.",
    "operator.blocked.title": "Адреси, на які поштовий сервіс не доставляє листи",
    "operator.blocked.none": "Перевірено: жодна адреса цього притулку не заблокована.",
    "operator.blocked.line": "{email} – {reason}",
    "operator.blocked.incomplete": "Список заблокованих адрес вдалося отримати лише частково.",
    "operator.blocked.unknown.provider_error": "Поштовий сервіс відповів помилкою.",
    "operator.blocked.unknown.timed_out": "Поштовий сервіс не відповів вчасно.",
    "operator.blocked.unknown.unsupported_provider":
      "Цей поштовий сервіс не дає перевірити блокування.",
    "operator.blocked.asOf": "Станом на {time}",
    "operator.blocked.manualUnblock":
      "Розблокувати адресу можна лише в кабінеті поштового сервісу, не тут.",
    "operator.history.title": "Історія",
    // audit 2026-10-22 #42
    "operator.history.note":
      "Зміни статусу, даних, адміністраторів, збору коштів і тварин. Підтвердження «Ще шукає» і «Ще домовляються» тут не записуються.",
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
    // DR1-Q1, his text (2026-10-20)
    "operator.history.freshness_sentence_changed": "Змінено речення на сторінці притулку",
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
    "operator.create.city": "Населений пункт",
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
    // audit 2026-10-22 #9
    "operator.create.firstAdminHint":
      "Отримає запрошення на пошту: за посиланням створить пароль і увійде. Інших адміністраторів можна запросити зі сторінки притулку.",
    "operator.create.adminName": "Імʼя",
    "operator.create.submit": "Створити й надіслати запрошення",
    "operator.create.submitShort": "Створити",
    "operator.create.cancel": "Скасувати",
    "operator.create.whatHappens.title": "Що буде далі",
    "operator.create.whatHappens.step1": "Притулок зʼявиться у списку зі статусом «Очікує».",
    // audit 2026-10-22 #10
    "operator.create.whatHappens.step2":
      "{name} отримає запрошення: посилання, щоб створити пароль, діє 72 години. Його можна надіслати ще раз.",
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
    "operator.create.errors.unknownCity": "Такого населеного пункту немає у списку.",
    "operator.create.errors.lostAnswer":
      "Відповідь не надійшла. Притулок міг створитися – перевірте список, перш ніж пробувати знову.",
    "operator.create.errors.failed": "Не вдалося створити притулок. Спробуйте ще раз.",
    "operator.create.errors.required": "Це поле потрібне.",
    "operator.create.errors.edrpouFormat": "Код ЄДРПОУ – 8 цифр.",
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
    "operator.verification.approveBlocked": "Схвалити поки не можна – бракує доказів:",
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
    "operator.codes.rejection.out_of_service_area": "Поза територією, де працює сайт",
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
      "Пропозиція змінилася, поки сторінка була відкрита. Тут – поточна.",
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
    "verificationDecision.signature": { his: null, used: "- {operator}" },
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

  /** Pet card PR 3b. His final text (2026-10-27): the builder's draft, approved as written. */
  const PET_CARD_PR3B_LOGO_CHANGED: Record<string, string> = {
    "operator.history.logo_changed": "Змінено логотип притулку",
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
        ...Object.keys(PET_CARD_PR3B_LOGO_CHANGED),
      ].sort(),
    );
  });

  it("sanity: his file's 220 strings (216 as written, 3 replaced in round 2, 1 in round 3) and 4 later keys", () => {
    expect(Object.keys(RUI_FINAL).length).toBe(216);
    expect(Object.keys(ROUND_3_N7)).toHaveLength(2);
    expect(Object.keys(ROUND_4C_RUI4_F2)).toHaveLength(1);
    expect(Object.keys(PET_CARD_PR3B_LOGO_CHANGED)).toHaveLength(1);
    expect(Object.keys(CHECKED_AGAINST_CODE).length).toBe(2);
    expect(Object.values(ROUND_2_REASON_VIEW).filter(({ his }) => his !== null)).toHaveLength(1);
    expect(Object.values(ROUND_2_REASON_VIEW).filter(({ his }) => his === null)).toHaveLength(1);
  });

  it.each(Object.entries(RUI_FINAL))("%s is his final text", (path, text) => {
    expect(valueAt(path)).toBe(text);
  });

  it.each(Object.entries(PET_CARD_PR3B_LOGO_CHANGED))("%s is his final text", (path, text) => {
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
    // Not a K3 word: his designer-round-1 text (2026-10-20), «kabinet.history.field.coatLength».
    "field.coatLength": "Шерсть",
    // Not K3 words either: the pet card redesign's, his approval of 2026-10-26 (`PET_CARD_COPY`).
    "field.temperament": "Характер",
    "field.colour": "Забарвлення",
    "field.medicalNotes": "Медичний стан",
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
      "Найважливіше, що ви можете зробити, – позначити, що тварина знайшла дім.",
    );
    expect(paragraphs[2]).toBe(
      "Кожна опублікована картка в кабінеті має кнопку «Уже вдома». Після неї картка одразу зникає з галереї та стрічки, а у вашому списку лишається з позначкою «Удома».",
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

  /** His Q3 answer (2026-10-18): «на сайті», so ¶2 can't read as ¶3's kabinet list. */
  it("keeps the second paragraph, «в списку» now «на сайті»", () => {
    expect(paragraphs[1]).toBe(
      "Тварина, яка вже вдома, але досі на сайті, – це єдине, що робить усі інші картки недостовірними: людина дзвонить, чує «її забрали три місяці тому», і далі не вірить жодній картці – ні вашій, ні чужій.",
    );
  });
});

/**
 * A1, row 91 (Oleksii, 2026-10-14, verbatim: "Yes, include it: «Доступ до
 * кабінету я надсилаю сам - листом на адресу, яку ви мені вкажете.» Place it
 * directly before the current last paragraph of §7, and ship it in the same
 * commit as row 89."). Its own paragraph, second to last, transcribed; the
 * last paragraph is unchanged.
 */
describe("/prytulkam A1 (forShelters.whatToPrepare)", () => {
  const paragraphs = uk.forShelters.whatToPrepare.split("\n\n");

  it("carries his line directly before §7's last paragraph, which is his PR 6 text", () => {
    expect(paragraphs.at(-2)).toBe(
      "Доступ до кабінету я надсилаю сам – листом на адресу, яку ви мені вкажете.",
    );
    // pr6-copy-uk.md §1.1: the shelter keeps its animals and profile itself (commitment #6).
    expect(paragraphs.at(-1)).toBe(
      "Тварин і профіль притулку ви ведете самі в кабінеті: додаєте картку, публікуєте – і її одразу видно. Якщо тварин багато, на старті можу внести перші картки сам – надішліть список і фото.",
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
 * only (EM-D1). One clause since changed, by his VP-T1 answer (KH-Q12,
 * 2026-10-18), verbatim: "change /pro to «…видаляються протягом доби.»"; the
 * clean-up runs every 6 hours, and `apps/web/src/kabinet/auth-cleanup.test.ts`
 * ties that schedule to the sentence.
 */
describe("/pro about.data (his PR 6 text, and PW-1's two sentences)", () => {
  /**
   * PW-1 adds his two sentences (`docs/shelter-passwords-copy-uk.md` §G, 2026-10-19, verbatim):
   * the password hash after what the cabinet stores, the session's length after «IP-адреси не
   * зберігаються». The placement is the builder's (recorded under "Decisions taken"); the words
   * are his.
   */
  it("carries his two password sentences, word for word", () => {
    expect(uk.about.data).toContain(
      "Для адміністраторів кабінетів притулків зберігається лише незворотний хеш пароля, а не сам пароль.",
    );
    expect(uk.about.data).toContain(
      "Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90 днів, після чого треба увійти знову.",
    );
  });

  // audit 2026-10-22 #4 and #45: the stored address's purposes widened to the invite, the reset link
  // and the «пароль змінено» notice; the same sentences in four paragraphs.
  // S8 (DR1-Q4), his sentence: a fifth paragraph, the saved list's own data-use line.
  // GDPR-F1 (2026-10-24), his own dictated sentence, checked word for word against
  // `eraseUsersAndScrubHistory`: a new paragraph, between the kabinet-access one it
  // continues and the history paragraph it's a specific case of - six in total now.
  it("is his text, byte for byte, in six paragraphs", () => {
    expect(uk.about.data.split("\n\n")).toEqual([
      "Дані, які вносить притулок – адреса, контакти, картки тварин, – належать притулку. Точна адреса ніколи не показується публічно: той, хто шукає тварину, бачить лише місто. Притулок може попросити видалити свій запис у будь-який момент.",
      "Для притулків із доступом до кабінету сайт зберігає імʼя та адресу пошти адміністратора, щоб надсилати запрошення, посилання для входу чи нового пароля і повідомлення про зміну пароля, а також технічний запис про браузер і пристрій, з якого виконано вхід. Для адміністраторів кабінетів притулків зберігається лише незворотний хеш пароля, а не сам пароль. IP-адреси не зберігаються. Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90 днів, після чого треба увійти знову. Адреси, введені у формі входу, і записи про входи, що втратили силу, видаляються протягом доби.",
      "Коли адміністратора притулку прибирають із кабінету, скасовують його запрошення або запрошення так і не прийняли, обліковий запис і адреса пошти видаляються, якщо ця адреса не має доступу до іншого притулку і не запрошена до нього. Тоді ж адресу прибирають з історії притулку: там лишається лише запис про те, що адміністратора запрошено, додано чи прибрано.",
      "Кожна зміна в кабінеті записується в історію притулку: коли її зроблено і хто – адміністратор притулку чи я. Натискання «Ще шукає» чи «Ще домовляються» в історію не потрапляють – їх видно з дати на картці. Для профілю зберігаються попереднє й нове значення, для карток тварин – лише те, які поля змінено. Про людей, які шукають тварину, в історії нічого немає. Історія видаляється разом із записом притулку.",
      "Фото, завантажені в кабінеті, зберігаються без даних про місце зйомки, за адресами, які неможливо вгадати. Фото, прибране з картки, більше не показується, а сам файл я видаляю на прохання притулку.",
      "Список збережених тварин зберігається лише в цьому браузері. Щоб показати його актуальним, сайт запитує дані про цих тварин без кукі й не зберігає, яких саме.",
    ]);
    expect(uk.about.data).not.toContain("реєстр");
    expect(uk.about.data).not.toContain("наближену");
  });

  /** His Q1 answer (2026-10-18): both sentences, one after the other. */
  it("says what history records, and that «Ще шукає» / «Ще домовляються» are not in it", () => {
    expect(uk.about.data).toContain(
      "Кожна зміна в кабінеті записується в історію притулку: коли її зроблено і хто – адміністратор притулку чи я. Натискання «Ще шукає» чи «Ще домовляються» в історію не потрапляють – їх видно з дати на картці.",
    );
  });
});

/**
 * Designer round 1, S6: the strings his DR1-Q1 answer and his shelter-page copy
 * (`docs/designer-round-1.md` §10 and §11 item 4, Oleksii, 2026-10-20) set
 * outside `kabinet.*`, transcribed from that file by script, never read from
 * `uk.ts`. The «Слова притулку» heading and the city line reuse existing
 * strings by his answer ("reuse the existing string, yes"), so those are
 * pinned as unchanged.
 */
describe("designer round 1, S6 (his DR1-Q1 and shelter-page copy)", () => {
  it.each([
    ["medical.shelterDeclared", uk.medical.shelterDeclared, "Дані притулку"],
    // The copy audit of 2026-10-22 (Oleksii: "#14 and every key S6 rewrites: apply them on
    // `feat/dr1-s6-shelter-page` as a separate commit"): #16 and #14, transcribed from the audit.
    [
      "medical.doneShelterDeclared (#16)",
      uk.medical.doneShelterDeclared,
      "Зроблено, за даними притулку",
    ],
    [
      "kabinet.profile.voiceLabel (#14)",
      uk.kabinet.profile.voiceLabel,
      "Ваші слова на сторінці притулку",
    ],
    ["shelterPage.animalsHeading", uk.shelterPage.animalsHeading, "Шукають дім: {count}"],
    ["shelterPage.noAnimals", uk.shelterPage.noAnimals, "Зараз тут немає тварин, які шукають дім."],
    ["shelterPage.sinceYear", uk.shelterPage.sinceYear, "на сайті з {year} року"],
    ["shelterPage.countLine", uk.shelterPage.countLine, "Знайдено {count} {animalWord}"],
    ["detail.shelterRowLink", uk.detail.shelterRowLink, "Сторінка притулку «{name}»"],
    [
      "freshness.attribution (the section heading, reused)",
      uk.freshness.attribution,
      "Слова притулку",
    ],
    // Nationwide copy table row 9 (owner-approved): «м. » moved into the kind-aware `{place}` text.
    ["cardMeta.atShelter (the city line, reused)", uk.cardMeta.atShelter, "{place}"],
  ])("%s is his text", (_key, actual, his) => {
    expect(actual).toBe(his);
  });

  it("«Слова притулку» is no longer the medical rows' source label (option (c))", () => {
    expect(uk.medical.shelterDeclared).not.toBe(uk.freshness.attribution);
  });
});

/**
 * §8 (commitment #7, B1), his PR 6 text (pr6-copy-uk.md §1.3), transcribed:
 * what moves the date (publish, «Ще шукає» / «Ще домовляються», a photo
 * change) and what doesn't (a text edit), and «один раз» gone (his K4 answer
 * 10). `freshness.updatedAgo` stays «Оновлено {days}» (K-Q14 (a)).
 */
describe("/prytulkam §8 B1 (forShelters.whyThatSentence)", () => {
  it("DR1-Q1: no longer says the sentence is on the animal's page", () => {
    expect(uk.forShelters.whyThatSentence).not.toContain("на сторінці тварини");
  });

  const paragraphs = uk.forShelters.whyThatSentence.split("\n\n");

  it("is his three paragraphs", () => {
    expect(paragraphs).toEqual([
      // ¶1: his DR1-Q1 text (2026-10-20), the sentence is on the shelter page
      "Людина, яка обирає між двома собаками, ніяк не дізнається, про кого з них писали минулого тижня, а про кого – позаторік. Тому на картці видно, коли ви востаннє підтвердили, що тварина ще шукає дім, а на сторінці притулку – ваше речення про те, як часто ви це робите, вашими словами.",
      "Дату ніхто не вписує вручну: вона оновлюється, коли ви публікуєте картку, натискаєте «Ще шукає» чи «Ще домовляються» або змінюєте фото. Правки в тексті дату не змінюють – так вона показує саме те, що обіцяє. Речення пишете ви, коли вам зручно, і можете змінити його будь-коли: «оновлюємо щосуботи», «дзвоніть, ми скажемо точно», «влітку рідше».",
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
      "Порядок у списку – за датою: спочатку ті, чиї картки оновлено найновіше, або ті, хто чекає найдовше; людина обирає сама. У режимі «по одній» до дати додається повнота картки – та, де є фотографії, опис і відмітка про щеплення, показується раніше. Це все, що впливає на порядок.",
    );
  });
});

/**
 * GV3-Q3, 2026-10-26 (standing-constraints.md's commitment #8 row). A first
 * attempt at this narrowing added a new builder-written clause about the
 * deck being temporarily unlinked, instead of only deleting the overclaim -
 * which a Tier 1 review caught, since adding copy needs the normal gate
 * regardless of how accurate it reads; only a bare deletion is exempt. This
 * pins the result as an exact match, not `.not.toContain("по одній")`: that
 * first attempt's own clause did still contain the phrase («Перегляд по
 * одній поки не має…»), so a substring check would have happened to catch
 * it too - but only by coincidence of wording. An exact match catches any
 * future replacement sentence, not just ones that happen to reuse this
 * particular phrase.
 */
describe("/prytulkam §3 ¶2 (forShelters.whatHappensToAnimals, GV3-Q3)", () => {
  it("is the bare deletion, not a replacement sentence", () => {
    const paragraphs = uk.forShelters.whatHappensToAnimals.split("\n\n");
    expect(paragraphs[1]).toBe("Тварин можна дивитися списком.");
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
    // 74 since PR 6 deleted errors.notAvailable (P6-Q8); 72 since DR1 deleted
    // voice.nameStaysHint, voice.insertName and voice.previewNoAnimals and added
    // errors.nameTokenGone; 84 since pet card PR 3b added the twelve-key
    // logo.* section (his final text, 2026-10-27).
    expect(k4.length).toBe(86);
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
      "Як тварину кличуть у притулку. Лише імʼя – пояснення краще написати в описі.",
    "kabinet.animalForm.who.namePlaceholder": "Наприклад, Ластівка",
    "kabinet.animalForm.who.speciesLabel": "Вид",
    "kabinet.animalForm.who.sexLabel": "Стать",
    "kabinet.animalForm.who.sexMale": "Хлопчик",
    "kabinet.animalForm.who.sexFemale": "Дівчинка",
    "kabinet.animalForm.who.sizeLabel": "Розмір",
    "kabinet.animalForm.who.sizeNote":
      "Ваги немає навмисно: розмір на око точніший, ніж торішня цифра.",
    "kabinet.animalForm.who.sizeHintUpTo": "до {max} кг",
    "kabinet.animalForm.who.sizeHintRange": "{min}-{max} кг",
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
    "kabinet.animalForm.age.bucketRange": "{min}-{max}",
    "kabinet.animalForm.age.bucketRangeFrom": "{min}+",
    "kabinet.animalForm.age.asOfLabel": "Станом на",
    "kabinet.animalForm.age.asOfHint":
      "Коли ви це оцінили. Зазвичай – день, коли тварина потрапила до притулку.",
    "kabinet.animalForm.age.adopterSees": "Ті, хто шукає тварину, побачать: «{label}».",
    "kabinet.animalForm.age.uncertain":
      "Вік указано станом на {when}. Тепер на картці – «{label}». Якщо тварина вже старша, оновіть вік.",
    "kabinet.animalForm.description.title": "Опис",
    "kabinet.animalForm.description.prompt": "Що б ви сказали людині біля вольєра.",
    "kabinet.animalForm.description.label": "Про тварину",
    "kabinet.animalForm.description.hint": "Простий текст, без форматування.",
    "kabinet.animalForm.description.counter": "{count} з {max} символів",
    "kabinet.animalForm.description.counterOver": "Зайвих символів: {over}",
    "kabinet.animalForm.health.title": "Медичний стан",
    "kabinet.animalForm.health.confirm": "Зроблено",
    "kabinet.animalForm.health.unknownNote":
      "«Не записано» – чесна відповідь. Ті, хто шукає тварину, так і побачать «Не записано», а не «ні».",
    "kabinet.animalForm.health.registryReadOnly":
      "Підтверджено державним реєстром тварин. Тут цей рядок змінити не можна.",
    "kabinet.animalForm.photos.title": "Фото",
    "kabinet.animalForm.photos.ratioNote": "Формат 4:5, перше фото – обкладинка.",
    "kabinet.animalForm.photos.add": "+ Фото",
    "kabinet.animalForm.photos.addHint": "Будь-яке фото, яке відкриває цей телефон чи браузер.",
    "kabinet.animalForm.photos.howItWorks":
      "Перше фото – обкладинка; щоб змінити порядок, перетягніть фото. Для публікації потрібне хоча б одне. Великі фото зменшуються на пристрої до {px} пікселів перед відправкою – так менше мобільного трафіку.",
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
    "kabinet.animalForm.photos.capReached": "Це максимум – {max} фото.",
    "kabinet.animalForm.photos.lastPhotoKept": "Цю картку бачать люди, тож одне фото має лишитися.",
    "kabinet.animalForm.photos.lastPhotoKeptNotShown":
      "Картка опублікована, тож одне фото має лишитися – навіть поки її ще не бачать.",
    "kabinet.animalForm.photos.added": "Фото додано.",
    "kabinet.animalForm.photos.removed": "Фото прибрано.",
    "kabinet.animalForm.photos.reordered": "Порядок змінено.",
    "kabinet.animalForm.photos.conflict":
      "Фото змінилися в іншому вікні. Тут – поточний набір, спробуйте ще раз.",
    "kabinet.animalForm.photos.removedStillReachable":
      "Фото зникло з картки. Сам файл не видаляється одразу – якщо його треба прибрати зовсім, напишіть мені.",
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
      "Чернетку не збережено. Перевірте зʼєднання – усе, що ви ввели, лишається тут.",
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
      "Хтось змінив цю картку після того, як ви її відкрили. Ваші останні зміни не збережено. Ось поточна версія – внесіть їх ще раз.",
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
    "kabinet.animalForm.validation.dateTooOld": "Ця дата надто давня – понад {years} років тому.",
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
      [
        ...Object.keys(K3_FINAL).filter((path) => path.startsWith("kabinet.animalForm.")),
        // His designer-round-1 fur words, pinned in their own block below.
        ...Object.keys(DR1_FUR).filter((path) => path.startsWith("kabinet.animalForm.")),
        // The pet card redesign's words, pinned in their own block below.
        ...Object.keys(PET_CARD_COPY).filter((path) => path.startsWith("kabinet.animalForm.")),
        // Pet card PR 5's own his-approved words (medicalNotes.title/hint), pinned below.
        ...Object.keys(PET_CARD_PR5_COPY).filter((path) => path.startsWith("kabinet.animalForm.")),
        // Pet card PR 5's one builder-drafted validation string - not his words, flagged
        // in the PR for confirm-or-replace, but real text (never COPY_PENDING, see the
        // "Critical gate" reasoning on PET_CARD_PR5_COPY's own comment above).
        "kabinet.animalForm.validation.medicalNotesTooLong",
        // The sex-filter feature's one new gap word, pinned in its own block below.
        ...Object.keys(SEX_FILTER_COPY).filter((path) => path.startsWith("kabinet.animalForm.")),
        // The form's section names (Phase 2 PR 3), pinned in their own block below.
        ...Object.keys(FORM_SECTIONS_COPY),
      ].sort(),
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
    // audit 2026-10-22 #17: the row's status line says it was done, and by whom
    expect(uk.medical.registry).toBe("Зроблено, за даними державного реєстру тварин");
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
      "Скасувати вже не можна: час минув або картку змінено. На картці – сьогоднішня дата.",
    "kabinet.animalList.confirm.failed":
      "Не підтверджено: дата на картці не змінилася. Перевірте зʼєднання і спробуйте ще раз.",
    "kabinet.animalList.actions.reserve": "Почали домовлятися",
    "kabinet.animalList.actions.release": "Не домовилися – знову шукає",
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
    // audit 2026-10-22 #43: impersonal, since the label follows an animal's name
    "kabinet.animalList.withdrawReason.adopted_elsewhere": "дім знайдено іншим шляхом",
    "kabinet.animalList.withdrawReason.transferred": "переведено до іншого притулку",
    "kabinet.animalList.withdrawReason.deceased": "тварини не стало",
    "kabinet.animalList.withdrawReason.listing_error": "додано помилково",
    "kabinet.animalList.withdrawReason.other": "інша причина",
    "kabinet.animalList.actions.restore": "Повернути в чернетки",
    // Kabinet UX round 2 (owner-approved, 2026-10-29).
    "kabinet.animalList.actions.viewOnSite": "Переглянути на сайті",
    "kabinet.animalList.orderInfoLabel": "Як впорядковано список",
    "kabinet.animalList.row.menuLabel": "Дії з карткою {name}",
    "kabinet.animalList.moved.reserved": "{name}: почали домовлятися.",
    "kabinet.animalList.moved.released": "{name}: знову шукає дім.",
    "kabinet.animalList.moved.adopted": "{name}: уже вдома.",
    "kabinet.animalList.moved.withdrawn": "{name}: знято з показу.",
    "kabinet.animalList.moved.restored": "{name}: повернуто в чернетки.",
    "kabinet.animalList.actions.deleteDraft": "Видалити чернетку",
    "kabinet.animalList.deleteDialog.title": "Видалити чернетку «{name}»?",
    "kabinet.animalList.deleteDialog.body": "Вона назавжди зникне з вашого списку.",
    "kabinet.animalList.deleteDialog.photosStay":
      "Файли фото не видаляються одразу – якщо їх треба прибрати зовсім, напишіть мені.",
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
    // audit 2026-10-22 #24
    "kabinet.animalList.notVisible.pending":
      "Опубліковані картки зʼявляться в галереї, щойно притулок пройде перевірку.",
    // audit 2026-10-22 #41: the public name of the deck is «по одній»
    "kabinet.animalList.orderNote":
      "Порядок у галереї – за датою: людина сама обирає, спочатку найсвіжіші картки чи ті, хто чекає найдовше. Повнота картки впливає лише на порядок у режимі «по одній». Тут порядок змінити не можна, і просування немає.",
    "kabinet.animalList.empty.title": "Тут поки немає тварин.",
    "kabinet.animalList.empty.body":
      "Додайте першу. Ті, хто шукає тварину, побачать картку після публікації.",
    "kabinet.animalList.empty.add": "Додати першу тварину",
    "kabinet.animalList.empty.caption":
      "Щоб зберегти чернетку, потрібні імʼя та вид – решту можна дописати пізніше.",
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

/**
 * Q-A (Oleksii, 2026-10-19), verbatim: "detail.photoGalleryLabel «Фотографії тварини»;
 * detail.photoGalleryDot «Фото {n}»; detail.photoGalleryThumbnail «Переглянути фото {n}»." The
 * public animal page's screen-reader labels, transcribed from his message.
 *
 * Pet card PR 5 replaced the dot-indicator/thumbnail-strip gallery with a native scroll-snap
 * slider (Figma `75:425`/`88:1929`): `photoGalleryDot`/`photoGalleryThumbnail` named controls
 * that no longer exist, so they're retired with that UI rather than kept as dead strings.
 * `photoGalleryLabel` survives unchanged - it labels "the photo list" regardless of which
 * control renders the list, so the new slider's scroll container reuses it as-is.
 */
describe("Q-A: the animal page's photo gallery label", () => {
  it("is his string", () => {
    expect(uk.detail.photoGalleryLabel).toBe("Фотографії тварини");
  });

  it("the dot/thumbnail labels are gone with the UI they named", () => {
    expect(Object.keys(uk.detail)).not.toContain("photoGalleryDot");
    expect(Object.keys(uk.detail)).not.toContain("photoGalleryThumbnail");
  });
});

/**
 * PW-1, the shelter passwords (`docs/shelter-passwords-copy-uk.md`, his Ukrainian, 2026-10-19,
 * verbatim, the source every string is copied from; the copy sheet's "yours" rows are his scope's
 * own words). Transcribed from that file, never read from `uk.ts`. Each group's key set is
 * pinned exactly, so a key added without his text, or one of his dropped, fails here. PW-2 adds
 * `setPassword`'s title (his scope item 2), intro and button (§B) with the invitation, and
 * /prytulkam's `forShelters.signInLink` (his scope item 1).
 */
describe("kabinet passwords copy (PW-1, his Ukrainian, 2026-10-19)", () => {
  const HIS: Record<string, string> = {
    // §A (intro: his replacement, verbatim; useLink, forgot: his scope item 3; throttled: §9 answer 5)
    "signIn.intro":
      "Для притулків і адміністратора сайту. Увійти можна з паролем або за посиланням, що приходить на пошту.",
    "signIn.passwordLabel": "Пароль",
    "signIn.showPassword": "Показати пароль",
    "signIn.hidePassword": "Сховати пароль",
    "signIn.submitPassword": "Увійти",
    "signIn.useLink": "Надіслати посилання для входу",
    "signIn.forgot": "Забули пароль?",
    "signIn.wrongCredentials":
      "Не вдалося увійти. Перевірте адресу й пароль або надішліть собі посилання для входу.",
    "signIn.throttled": "Забагато спроб входу. Спробуйте ще раз через {minutes} хв.",
    // §B, the parts PW-1 renders
    "setPassword.newLabel": "Пароль",
    // §B, PW-2's invitation page (title: his scope item 2)
    "setPassword.title": "Створіть пароль",
    "setPassword.intro": "Пароль для кабінету притулку «{shelter}». Адреса для входу: {email}.",
    "setPassword.submit": "Зберегти й увійти",
    "setPassword.repeatLabel": "Повторіть пароль",
    "setPassword.hint": "Символів: {count} з {min}",
    "password.tooShort": "Пароль закороткий. Мінімум символів: {min}.",
    "password.tooLong": "Пароль задовгий. Максимум символів: {max}.",
    "password.common": "Цей пароль надто легко вгадати. Оберіть інший.",
    // changed by him 2026-10-19 (the merged catalogue's text, his rule: the source of truth)
    "password.personal":
      "Пароль не може містити вашу адресу пошти (навіть частину до @), назву притулку чи назву сайту.",
    "password.mismatch": "Паролі не збігаються.",
    // §C
    "forgot.title": "Забули пароль?",
    "forgot.intro": "Вкажіть адресу пошти, з якою ви входите в кабінет.",
    "forgot.submit": "Надіслати посилання",
    "forgot.sent":
      "Якщо це адреса адміністратора кабінету притулку, на неї надіслано посилання для нового пароля. Воно діє {minutes} хв.",
    "forgot.throttled": "Забагато запитів. Спробуйте ще раз пізніше.",
    // §D (`reset.invalidLink.linkText` is the sibling `invalidLinkText`, the sheet's note)
    "reset.title": "Новий пароль",
    "reset.submit": "Зберегти пароль",
    "reset.done": "Пароль змінено, на всіх пристроях виконано вихід. Увійдіть з новим паролем.",
    "reset.invalidLink": "Посилання застаріло або вже використане. {link}",
    "reset.invalidLinkText": "Отримати нове посилання",
    // §E (title: his scope item 7)
    "changePassword.title": "Змінити пароль",
    "changePassword.currentLabel": "Поточний пароль",
    "changePassword.newLabel": "Новий пароль",
    "changePassword.submit": "Змінити пароль",
    "changePassword.done":
      "Пароль змінено. На інших пристроях виконано вихід, тут ви залишаєтеся в кабінеті.",
    "changePassword.wrongCurrent": "Поточний пароль неправильний.",
    "changePassword.noPasswordYet":
      "Пароля ще немає. Створити його можна через «Забули пароль?» на сторінці входу.",
    // F1
    "email.reset.subject": "Новий пароль до кабінету притулку",
    "email.reset.intro": "Надійшов запит на новий пароль до кабінету притулку для цієї адреси.",
    "email.reset.action": "Створити новий пароль",
    "email.reset.expiry": "Посилання спрацює один раз і діє {minutes} хв.",
    "email.reset.notYou":
      "Якщо запит надіслали не ви, просто не зважайте на цей лист: пароль залишиться тим самим.\n- {operator}",
    // F2
    "email.passwordChanged.subject": "Кабінет притулку: пароль змінено",
    "email.passwordChanged.body":
      "Пароль до кабінету притулку для цієї адреси щойно змінено. На інших пристроях виконано вихід.",
    "email.passwordChanged.notYou": "Якщо це не ви – напишіть мені: {contact}\n- {operator}",
  };

  const at = (path: string) =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], uk.kabinet);

  it.each(Object.entries(HIS))("%s is his text", (path, text) => {
    expect(at(path)).toBe(text);
  });

  it("each new group holds exactly his keys", () => {
    const keysOf = (group: object) => Object.keys(group).sort();
    expect({
      setPassword: keysOf(uk.kabinet.setPassword),
      password: keysOf(uk.kabinet.password),
      forgot: keysOf(uk.kabinet.forgot),
      reset: keysOf(uk.kabinet.reset),
      changePassword: keysOf(uk.kabinet.changePassword),
      emailReset: keysOf(uk.kabinet.email.reset),
      emailPasswordChanged: keysOf(uk.kabinet.email.passwordChanged),
    }).toEqual({
      setPassword: ["hint", "intro", "newLabel", "repeatLabel", "submit", "title"],
      password: ["common", "mismatch", "personal", "tooLong", "tooShort"],
      forgot: ["intro", "sent", "submit", "throttled", "title"],
      reset: ["done", "invalidLink", "invalidLinkText", "submit", "title"],
      changePassword: [
        "currentLabel",
        "done",
        "newLabel",
        "noPasswordYet",
        "submit",
        "title",
        "wrongCurrent",
      ],
      emailReset: ["action", "expiry", "intro", "notYou", "subject"],
      emailPasswordChanged: ["body", "notYou", "subject"],
    });
  });

  it("/prytulkam's link to sign-in is his «Увійти в кабінет» (scope item 1)", () => {
    expect(uk.forShelters.signInLink).toBe("Увійти в кабінет");
  });

  it("the sentence the passwords made false is gone", () => {
    expect(uk.kabinet.signIn.intro).not.toContain("Пароля немає");
  });

  it("nothing PW-1 adds is pending, and no U+0027 or U+2019 apostrophe is in it", () => {
    for (const [path] of Object.entries(HIS)) {
      const text = at(path) as string;
      expect(text, path).not.toContain(COPY_PENDING);
      expect(text, path).not.toMatch(/['’]/);
    }
  });
});

/**
 * Designer round 1, S3: his fur copy (`docs/designer-round-1.md` §11,
 * Oleksii, 2026-10-20), transcribed literally.
 *
 * Pet card PR 5 retired `detail.coatLabel`/`coatShort`/`coatLong` (his "The
 * value is «Коротка» / «Довга», the same as the form" instruction): those
 * backed the old `CoatFact` meta-line fact, which the new panel header
 * doesn't render (the Figma meta line is sex · age bucket · size only, no
 * fur segment). Coat length now appears only as a «Про мене» chip, which
 * reuses `filters.coatShort`/`coatLong` - the public words pet card PR 5
 * put there, matching how the chip's accessible name already has to ("the
 * existing age/size/coat labels," his 2026-10-27 instruction), so the two
 * surfaces read the same word rather than two different ones for the same
 * fact. `CoatFact.tsx` itself is deleted with its only caller.
 *
 * **Narrowed, gallery filter restructure:** `filters.coat` (the dropdown's
 * own legend) and `noMatch.relaxCoat` (its no-match sentence) are gone with
 * the fur filter itself - the chip above is the only surface
 * `coatShort`/`coatLong` serve now, and it was never a filter.
 */
const DR1_FUR: Record<string, string> = {
  "kabinet.animalForm.coat.label": "Шерсть",
  "kabinet.animalForm.coat.short": "Коротка",
  "kabinet.animalForm.coat.long": "Довга",
  "kabinet.animalForm.coat.unknown": "Не вказано",
  "kabinet.animalHistoryLabels.field.coatLength": "Шерсть",
  "filters.coatShort": "Короткошерсті",
  "filters.coatLong": "Довгошерсті",
};

describe("designer round 1 fur copy (his text, 2026-10-20)", () => {
  const atRoot = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], uk);

  it.each(Object.entries(DR1_FUR))("%s is his text, exactly", (path, text) => {
    expect(atRoot(path)).toBe(text);
  });

  it("the animal page's own coat words are gone with CoatFact, the component they backed", () => {
    expect(Object.keys(uk.detail)).not.toContain("coatLabel");
    expect(Object.keys(uk.detail)).not.toContain("coatShort");
    expect(Object.keys(uk.detail)).not.toContain("coatLong");
  });
});

/**
 * The pet card redesign, PR 1: the kabinet strings for temperament and coat
 * colour, and three history labels. Oleksii, 2026-10-26, in the coordinating
 * session, verbatim: "Kabinet strings: approved as-is. All 13, exactly as in
 * your table, are now owner-approved final copy." His 13 were these 11 plus
 * the medical note's label and hint, which wait for PR 5 with the note's
 * field (his answer quoted in inbox PC1-D1; both strings are recorded there
 * verbatim).
 *
 * This table was first committed (eb929c6) under a heading that called it
 * owner-approved, before he had answered; that was wrong when written. Since
 * his answer above it is his approved copy, transcribed here literally, never
 * read from `uk.ts`. U+02BC as the apostrophe. The card's own words
 * (`temperament.*`, `coatColour.*`) are pinned in `temperament-labels.test.ts`
 * and `colour-labels.test.ts`.
 */
const PET_CARD_COPY: Record<string, string> = {
  "kabinet.animalForm.temperament.title": "Характер",
  "kabinet.animalForm.temperament.hint": "Можна обрати кілька. Необовʼязково.",
  "kabinet.animalForm.temperament.other": "Інше",
  "kabinet.animalForm.temperament.customPlaceholder": "Своїми словами",
  "kabinet.animalForm.colour.title": "Забарвлення",
  "kabinet.animalForm.colour.unknown": "Не вказано",
  "kabinet.animalForm.colour.other": "Інше",
  "kabinet.animalForm.colour.customPlaceholder": "Своїми словами",
  "kabinet.animalHistoryLabels.field.temperament": "Характер",
  "kabinet.animalHistoryLabels.field.colour": "Забарвлення",
  "kabinet.animalHistoryLabels.field.medicalNotes": "Медичний стан",
};

describe("pet card kabinet copy (his approval, 2026-10-26)", () => {
  const atRoot = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], uk);

  it("holds the 11 of his 13 that ship in PR 1", () => {
    expect(Object.keys(PET_CARD_COPY)).toHaveLength(11);
  });

  it.each(Object.entries(PET_CARD_COPY))("%s is his approved text, exactly", (path, text) => {
    expect(atRoot(path)).toBe(text);
  });

  it("the medical note's two strings ship in PR 5, under their own round below, not this one", () => {
    expect(Object.keys(uk.kabinet.animalForm)).toContain("medicalNotes");
    expect(Object.keys(en.kabinet.animalForm)).toContain("medicalNotes");
  });

  it("the colour's «not given» reads exactly as the fur's", () => {
    expect(uk.kabinet.animalForm.colour.unknown).toBe(uk.kabinet.animalForm.coat.unknown);
  });

  it("nothing the pet card adds is pending, and no U+0027 or U+2019 apostrophe is in it", () => {
    const leaves = (node: unknown, path: string): [string, string][] =>
      typeof node === "string"
        ? [[path, node]]
        : Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
            leaves(child, `${path}.${key}`),
          );
    const added = [
      ...Object.entries(PET_CARD_COPY),
      ...leaves(uk.temperament, "temperament"),
      ...leaves(uk.coatColour, "coatColour"),
    ];
    expect(added.length).toBeGreaterThan(Object.keys(PET_CARD_COPY).length);
    for (const [path, text] of added) {
      expect(text, path).not.toContain(COPY_PENDING);
      expect(text, path).not.toMatch(/['’]/);
    }
  });
});

/**
 * Pet card PR 5 (Figma `75:425`/`88:1929`): the panel chrome strings are the
 * design's own owner-approved words (handoff, 2026-10-26: «Попередній»,
 * «Наступний», «Дати сімʼю», «Поділитись», «Про мене», «Моя історія»,
 * «Медичний стан»); the chip-link template, species words, share-copied
 * confirmation and the medical-notes field's two kabinet strings are his own
 * text, given directly in the coordinating session, 2026-10-27, transcribed
 * here literally rather than read from `uk.ts`, same discipline every other
 * round in this file uses.
 *
 * Two strings this PR also changes are pinned separately, not folded in
 * here: `R4_2_ANALYTICS_SENTENCE`'s new text (its own `describe` below,
 * since it's a held constant, not a `uk.ts` path) and the freshness tag
 * (unchanged text - it reuses `freshnessLabel`/`uk.freshness.updatedAgo`
 * verbatim, already pinned where that key lives, per owner decision 2).
 */
const PET_CARD_PR5_COPY: Record<string, string> = {
  "detail.prev": "Попередній",
  "detail.next": "Наступний",
  "detail.giveHome": "Дати сімʼю",
  "detail.share": "Поділитись",
  "detail.shareCopied": "Посилання скопійовано.",
  "detail.aboutMeHeading": "Про мене",
  "detail.myStoryHeading": "Моя історія",
  "detail.medicalHeading": "Медичний стан",
  "detail.chipLinkName": "Показати схожих {species}: {value}",
  "detail.chipSpeciesCat": "котів",
  "detail.chipSpeciesDog": "собак",
  "kabinet.animalForm.medicalNotes.title": "Що ще варто знати про здоровʼя",
  "kabinet.animalForm.medicalNotes.hint":
    "Необовʼязково. Ті, хто шукає тварину, побачать цей текст у розділі «Медичний стан».",
};

describe("pet card PR 5 copy (owner-approved, 2026-10-26/27)", () => {
  const atRoot = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], uk);

  it("holds his 13 strings for this round", () => {
    expect(Object.keys(PET_CARD_PR5_COPY)).toHaveLength(13);
  });

  it.each(Object.entries(PET_CARD_PR5_COPY))("%s is his approved text, exactly", (path, text) => {
    expect(atRoot(path)).toBe(text);
  });

  it("nothing here is pending, and no U+0027 or U+2019 apostrophe is in it", () => {
    for (const [path, text] of Object.entries(PET_CARD_PR5_COPY)) {
      expect(text, path).not.toContain(COPY_PENDING);
      expect(text, path).not.toMatch(/['’]/);
    }
  });
});

/**
 * Sex-filter feature's 4 strings, all duplicating already-approved words:
 * `filters.sex` is «Стать», approved twice - his K3 field label
 * `who.sexLabel`, and Figma `58:1617` under lean rule 4 (not GV3-Q1, SF-Q2's
 * 2026-10-28 correction); `sexMale`/`sexFemale` duplicate
 * `cardMeta.sexMale`/`sexFemale`; `sexUnknown` duplicates the standing
 * rule's «Не записано». Only the gap-list word («стать») needed fresh
 * approval - his answer, verbatim: "«стать» (Recommended)".
 */
const SEX_FILTER_COPY: Record<string, string> = {
  "filters.sex": "Стать",
  "filters.sexMale": "Хлопчик",
  "filters.sexFemale": "Дівчинка",
  "filters.sexUnknown": "Не записано",
  "kabinet.animalForm.publish.gap.sex": "стать",
};

/**
 * The animal form's four section names (kabinet redesign Phase 2 PR 3), the owner's own words,
 * 2026-10-28/29: "copy approved: «Основне», «Про тварину», «Здоровʼя» (ʼ U+02BC), «Публікація»".
 * The photos section keeps `photos.title`.
 */
const FORM_SECTIONS_COPY: Record<string, string> = {
  "kabinet.animalForm.sections.basics": "Основне",
  "kabinet.animalForm.sections.about": "Про тварину",
  "kabinet.animalForm.sections.health": "Здоровʼя",
  "kabinet.animalForm.sections.publication": "Публікація",
};

describe("animal form section names", () => {
  it.each(Object.entries(FORM_SECTIONS_COPY))("%s is the approved text, exactly", (path, text) => {
    const found = path
      .split(".")
      .slice(1)
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        uk.kabinet,
      );
    expect(found).toBe(text);
  });

  it("writes the apostrophe as U+02BC", () => {
    expect(uk.kabinet.animalForm.sections.health).toContain(String.fromCodePoint(0x2bc));
  });
});

describe("sex-filter copy", () => {
  const atRoot = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], uk);

  it.each(Object.entries(SEX_FILTER_COPY))("%s is the confirmed text, exactly", (path, text) => {
    expect(atRoot(path)).toBe(text);
  });

  it("the filter words are duplicates of already-public words, not new ones", () => {
    expect(uk.filters.sexMale).toBe(uk.cardMeta.sexMale);
    expect(uk.filters.sexFemale).toBe(uk.cardMeta.sexFemale);
    expect(uk.filters.sexUnknown).toBe(uk.medical.unknown);
  });

  it("nothing here is pending, and no U+0027 or U+2019 apostrophe is in it", () => {
    for (const [path] of Object.entries(SEX_FILTER_COPY)) {
      const text = atRoot(path) as string;
      expect(text, path).not.toContain(COPY_PENDING);
      expect(text, path).not.toMatch(/['’]/);
    }
  });
});

/**
 * The gallery filter restructure's one new string: the species toggle's
 * third segment, confirmed in chat, his answer: "«Усі» (Recommended)". Every
 * other word the restructure touches (city/size/age/sex labels, the sort
 * sentences) already existed before this PR; this is the sole addition.
 */
const SPECIES_TOGGLE_COPY: Record<string, string> = {
  "filters.speciesAny": "Усі",
};

describe("species-toggle copy (gallery filter restructure)", () => {
  const atRoot = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], uk);

  it.each(Object.entries(SPECIES_TOGGLE_COPY))(
    "%s is the confirmed text, exactly",
    (path, text) => {
      expect(atRoot(path)).toBe(text);
    },
  );

  it("nothing here is pending, and no U+0027 or U+2019 apostrophe is in it", () => {
    for (const [path] of Object.entries(SPECIES_TOGGLE_COPY)) {
      const text = atRoot(path) as string;
      expect(text, path).not.toContain(COPY_PENDING);
      expect(text, path).not.toMatch(/['’]/);
    }
  });
});

/**
 * R4-2's text, held off `/pro` by the same pre-launch gate it always was -
 * see `uk.ts`'s own doc comment on `R4_2_ANALYTICS_SENTENCE` for the gating
 * mechanism, unchanged by this PR. Only the constant's name (dropped the
 * `PENDING_` prefix - it never meant "pending his approval," only "held
 * behind the gate," and his 2026-10-27 instruction asked for the rename once
 * this round's text made that clearer) and one word of its own text changed:
 * «Написати» → «Дати сімʼю», his exact instruction, "approved as drafted,
 * with «Написати» changed to «Дати сімʼю» and the rest unchanged."
 */
describe("R4_2_ANALYTICS_SENTENCE (owner-approved text, 2026-10-27)", () => {
  it("names «Дати сімʼю», not «Написати»", () => {
    expect(R4_2_ANALYTICS_SENTENCE).toContain("«Не зараз» чи «Дати сімʼю»");
    expect(R4_2_ANALYTICS_SENTENCE).not.toContain("Написати");
  });

  it("is otherwise byte-for-byte his original 2026-10-06 sentence", () => {
    expect(R4_2_ANALYTICS_SENTENCE).toBe(
      "Людині, яка шукає тварину, сайт ставить одне кукі – і тільки після першої дії: " +
        "«Не зараз» чи «Дати сімʼю». У ньому немає імені чи номера телефону, лише " +
        "випадковий ідентифікатор: щоб режим «по одній» памʼятав, кого ви вже бачили, а сайт – " +
        "чиї контакти ви вже відкрили. Він перестає діяти через 7 днів без візитів або через 30 " +
        "днів у будь-якому разі. Окремо від кукі, якщо ви зберігаєте тварин, їхній список лежить " +
        "у цьому браузері.",
    );
  });
});

/**
 * Designer round 1, S4: the preview drawer's strings (`docs/designer-round-1.md`
 * §11, item 3, Oleksii, 2026-10-20), transcribed from that item, never read
 * from `uk.ts`. Item 3, verbatim: "preview.close: yes, reuse the existing
 * «Закрити» label if there is one. If not: «Закрити»." `preview.close` is its
 * own key holding his word (DR1-S4-T5). S4b (the overlay, 2026-10-21) removed
 * the other one, his words verbatim: "Q2: yes, remove «Відкрити повну
 * сторінку» and preview.openFull."
 */
const DR1_PREVIEW: Record<string, string> = {
  "preview.close": "Закрити",
};

describe("designer round 1 animal overlay copy (his text, §11 item 3; S4b)", () => {
  const atRoot = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], uk);

  it.each(Object.entries(DR1_PREVIEW))("%s is his text, exactly", (path, text) => {
    expect(atRoot(path)).toBe(text);
  });

  it("the overlay has no strings beyond its close label", () => {
    expect(
      Object.keys(uk.preview)
        .map((key) => `preview.${key}`)
        .sort(),
    ).toEqual(Object.keys(DR1_PREVIEW).sort());
  });
});

/**
 * RL-F1: the animal page's rate-limited state, on the full page and the
 * gallery's overlay. Oleksii, 2026-10-20, verbatim: "The follow-up (call it
 * RL-1, small, not Tier 1) gives the rate-limited case its own state on both
 * the full page and the drawer, using the existing «Забагато запитів.
 * Спробуйте ще раз пізніше.». It never shows «Це не помилка…» for a rate
 * limit." Transcribed from his message, never read from `uk.ts`.
 */
describe("RL-F1: the animal page's rate-limited state (his text)", () => {
  it("detail.rateLimited is his sentence, exactly", () => {
    expect(uk.detail.rateLimited).toBe("Забагато запитів. Спробуйте ще раз пізніше.");
  });

  it("says nothing the not-found state says about the card being gone", () => {
    expect(uk.detail.rateLimited).not.toContain("Це не помилка");
    expect(uk.detail.rateLimited).not.toContain("більше немає");
  });
});

/**
 * PW-2, the one page every broken invitation link gets: unknown, expired, used, replaced,
 * withdrawn, an operator's, one that already has a password, a member's, a pre-PW-2 id link.
 * Oleksii, 2026-10-21, Q2 (b), verbatim: "The shared “link no longer works” page gets this text:
 * «Посилання вже не діє. Якщо пароль уже створено — увійдіть. Якщо ні — напишіть мені, і я
 * надішлю нове запрошення.» Keep the «Перейти до входу» button. It’s still one identical page for
 * every broken link. Update its test and the exact copy check." Transcribed from his message,
 * never read from `uk.ts`. It replaces «Запрошення більше не дійсне. Напишіть мені — я надішлю
 * нове.» (`docs/h2-invite-copy-sheet.md` L).
 */
describe("the invitation's one unusable page (his 2026-10-21 text, Q2 (b))", () => {
  it("inviteLanding.expired is his text, character for character", () => {
    expect(uk.kabinet.inviteLanding.expired).toBe(
      "Посилання вже не діє. Якщо пароль уже створено – увійдіть. Якщо ні – напишіть мені, і я надішлю нове запрошення.",
    );
  });

  it("the button stays «Перейти до входу»", () => {
    expect(uk.kabinet.inviteLanding.signIn).toBe("Перейти до входу");
  });

  it("the replaced text is gone from the catalogue", () => {
    expect(JSON.stringify(uk)).not.toContain("Запрошення більше не дійсне");
  });
});

/**
 * The copy audit of 2026-10-22 (`docs/copy-audit-2026-10-22.md`), applied with Oleksii's
 * decisions of that day. His words, verbatim: "Accept rows 1–13, 15–32, 35–43, 44 (all straight
 * apostrophes → ʼ U+02BC), 45, 26 and 46, plus gaps G1, G3, G4, G5 and G6, with these edits:
 * #2 `about.free`: exactly «Сайт безкоштовний для притулків, без платних тарифів. Якщо це
 * колись зміниться, кожен притулок дізнається про це заздалегідь, а не постфактум.» No mention
 * of any trial period anywhere. #34 `forShelters.cost`: exactly «Це безкоштовно, сьогодні і
 * далі. Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не з рахунку.» #8: rename to
 * «Повернутися до картки»; the behaviour is unchanged (it closes the dialog). #33: as
 * proposed, keeping «Немає команди й інвестора», but the site's name comes from a `{site}`
 * slot filled from app config, never typed in the catalogue. #19: «Написати» everywhere for
 * the right swipe, including /prytulkam ¶3. The held R4-2 sentence follows when it lands."
 *
 * Every expected text below is transcribed from that message and the audit, never read from
 * `uk.ts`. (The rows whose pins already lived in this file were updated in place, with a
 * comment naming the row.)
 */
describe("the copy audit of 2026-10-22", () => {
  const leaves = (value: unknown, path: string): [string, string][] =>
    typeof value === "string"
      ? [[path, value]]
      : value !== null && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
            leaves(child, path === "" ? key : `${path}.${key}`),
          )
        : [];

  it("#2 about.free and #34 forShelters.cost are exactly his texts", () => {
    expect(uk.about.free).toBe(
      "Сайт безкоштовний для притулків, без платних тарифів. Якщо це колись зміниться, кожен притулок дізнається про це заздалегідь, а не постфактум.",
    );
    expect(uk.forShelters.cost).toBe(
      "Це безкоштовно, сьогодні і далі. Якщо це колись зміниться, ви дізнаєтеся заздалегідь, а не з рахунку.",
    );
  });

  // His rule: "No mention of any trial period anywhere" / "Grep the whole catalogue for «пробн»".
  it("«пробн» appears nowhere in either catalogue", () => {
    const everything = [...leaves(uk, ""), ...leaves(en, "")];
    expect(everything.length).toBeGreaterThan(1000);
    const hits = everything.filter(([, text]) => /пробн/iu.test(text)).map(([path]) => path);
    expect(hits).toEqual([]);
    expect(R4_2_ANALYTICS_SENTENCE).not.toMatch(/пробн/iu);
  });

  it("the guard above would catch the word", () => {
    expect(/пробн/iu.test("без пробного періоду")).toBe(true);
    expect(/пробн/iu.test("спробуйте ще раз")).toBe(false);
  });

  // #33, #21 and #46: the name (and the year) are slots filled from app config, never typed here.
  it("#33, #46 and #21 carry {site} / {year} slots, and none of them types the site's name", () => {
    expect(uk.about.intro).toBe(
      "{site} – сайт, де тварини з притулків України шукають дім. Його робить одна людина – я, у вільний від роботи час. Немає команди й інвестора.",
    );
    expect(uk.kabinet.email.invite.intro).toBe(
      "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» на сайті {site}.",
    );
    expect(uk.detail.shelterVerifiedYears).toBe("Перевірено вручну · на сайті з {year} року");
    for (const text of [
      uk.about.intro,
      uk.kabinet.email.invite.intro,
      uk.detail.shelterVerifiedYears,
    ]) {
      expect(text).not.toMatch(/opika/iu);
    }
  });

  it("#8 the reveal dialog's second button is «Повернутися до картки»", () => {
    expect(uk.reveal.backToFeed).toBe("Повернутися до картки");
  });

  // #19: one name for the right swipe and the button beside it; /prytulkam ¶3 follows it.
  it("#19 the right swipe is «Написати», and /prytulkam ¶3 names it", () => {
    expect(uk.swipe.right).toBe("Написати");
    expect(uk.swipe.right).toBe(uk.actions.write);
    const paragraph3 = uk.forShelters.whatHappensToAnimals.split("\n\n")[2];
    expect(paragraph3).toContain("на кого вже натиснула «Не зараз» чи «Написати»");
    expect(paragraph3).not.toContain("«Запитати»");
  });

  it("#3 forShelters.howToStart describes today's order: invite at creation, cards by the shelter", () => {
    expect(uk.forShelters.howToStart).toBe(
      "Напишіть на {contact}: хто ви і скільки у вас тварин. Після розмови я створю притулок на сайті й надішлю вам доступ до кабінету. Тварин ви додаєте самі, поки триває перевірка, про яку йшлося вище, а ті, хто шукає тварину, бачать картки, щойно її пройдено.",
    );
  });

  it("G1 reuses detail.rateLimited, G3, G4 and G5 are his proposed strings", () => {
    expect(uk.detail.rateLimited).toBe("Забагато запитів. Спробуйте ще раз пізніше.");
    expect(uk.kabinet.profile.pendingNote).toBe(
      "Перевірку проводжу я: напишу або зателефоную, щоб домовитися. Поки її не завершено, ваших тварин бачите лише ви.",
    );
    expect(uk.kabinet.signIn.failed).toBe(
      "Не вдалося звʼязатися із сайтом. Перевірте зʼєднання і спробуйте ще раз.",
    );
    expect(uk.exhausted.toList).toBe("Переглянути список");
  });

  it("#12 and #11: the end state says where hidden animals come back, and no invented cadence", () => {
    expect(uk.exhausted.body).toBe(
      "Тих, кого ви пропустили через «Не зараз», режим «по одній» покаже знову через 30 днів. У списку видно всіх.",
    );
    expect(uk.exhausted.newAnimals).toBe(
      "Нові тварини зʼявляються, щойно притулки публікують картки.",
    );
  });

  it("#44 every Ukrainian value uses U+02BC between letters; none keeps a straight apostrophe", () => {
    const cyr = "Ѐ-ӿ";
    const straight = new RegExp(`(?<=[${cyr}])'(?=[${cyr}])`, "u");
    expect(
      leaves(uk, "")
        .filter(([, text]) => straight.test(text))
        .map(([path]) => path),
    ).toEqual([]);
  });
});

describe("nationwide copy (owner-approved table, N5)", () => {
  it("the site is for Ukraine, not one oblast, in every public sentence that named it", () => {
    expect(uk.firstRun.promise).toBe(
      "Собаки й коти з перевірених притулків України шукають дім. Перегляньте список.",
    );
    expect(uk.forShelters.whatThisIs).toBe(
      "{site} – сайт, де тварини з перевірених притулків України шукають дім, а кожен ваш підопічний отримує власну сторінку.",
    );
    expect(uk.kabinet.operator.codes.rejection.out_of_service_area).toBe(
      "Поза територією, де працює сайт",
    );
  });

  it("the long city list, the codifier credit and the short hromada", () => {
    expect(uk.filters.showAllOptions).toBe("Показати всі ({count})");
    expect(uk.filters.findCity).toBe("Знайти місто");
    expect(uk.place.hromadaShort).toBe("{name} громада");
    expect(uk.footer.dataCredit).toBe(
      "Перелік населених пунктів: Кодифікатор адміністративно-територіальних одиниць (Мінрозвитку), Creative Commons Attribution.",
    );
  });

  it("the two dead exhausted keys are gone", () => {
    expect(Object.keys(uk.exhausted)).not.toContain("addNearbyCities");
    expect(Object.keys(uk.exhausted)).not.toContain("footnote");
  });
});

/** Kabinet UX round 2 (owner-approved, 2026-10-29): the Притулок sub-tabs and links, transcribed. */
describe("kabinet UX round 2 copy (the owner's text)", () => {
  it.each([
    [uk.kabinet.profileTabs.label, "Розділи притулку"],
    [uk.kabinet.profileTabs.profile, "Профіль"],
    [uk.kabinet.profileTabs.verification, "Перевірка"],
    [uk.kabinet.profileTabs.account, "Акаунт"],
    [uk.kabinet.profileTabs.profileNote, "Те, що бачать на сторінці притулку."],
    [uk.kabinet.profileTabs.view, "Переглянути"],
    [uk.kabinet.profile.viewOnSite, "Сторінка притулку на сайті"],
    [uk.kabinet.shell.viewSite, "Переглянути сайт"],
    [uk.kabinet.shell.newTab, "(відкриється в новій вкладці)"],
    [uk.kabinet.shell.label, "Кабінет"],
  ])("%s", (actual, expected) => {
    expect(actual).toBe(expected);
  });
});
