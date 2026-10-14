import { describe, expect, it } from "vitest";
import { pendingCopyKeys, pendingCopyPaths } from "./copy-status";
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
 */
describe("kabinet copy status (final, 2026-10-14)", () => {
  it("nothing under kabinet.* is pending", () => {
    expect(pendingCopyPaths(uk.kabinet, "kabinet")).toEqual([]);
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
      profile: 24, // addressNote deleted: it claimed a map adopters never see (review of the final copy)
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
   * (11), the anti-enumeration pair (6, 9), the failed accept (20, 21), the
   * invite landing's ready line and button (24, 25), the support banner (69),
   * commitments #2 and #5 on the profile (41, 44) and the operator's reminder (77).
   */
  const FINAL: Record<string, string> = {
    // row 78
    "email.signIn.subject": "Посилання для входу до кабінету притулку",
    // row 79
    "email.signIn.intro": "На цю адресу запитали посилання для входу до кабінету притулку.",
    // row 80
    "email.signIn.action": "Відкрити сторінку входу",
    // row 81
    "email.signIn.expiry": "Посилання спрацює один раз і діє {minutes} хвилин.",
    // row 82
    "email.signIn.notYou":
      "Якщо ви цього не запитували, просто проігноруйте лист: без посилання нічого не відбудеться.",
    // row 83
    "email.invite.subject": "Ваш доступ до кабінету притулку",
    // row 84
    "email.invite.intro":
      "Добрий день. Відкриваю для цієї адреси доступ до кабінету притулку «{shelter}» у реєстрі.",
    // row 85
    "email.invite.what":
      "Поки що в кабінеті можна переглянути профіль притулку таким, яким його бачать люди. Змінювати дані там ще не можна — для цього напишіть мені.",
    // row 86
    "email.invite.action": "Відкрити запрошення",
    // row 87
    "email.invite.expiry": "Запрошення діє {hours} години. Якщо не встигнете — я надішлю нове.",
    // row 88
    "email.invite.notYou":
      "Якщо ви не чекали цього листа, просто проігноруйте його: без входу з цієї адреси доступу ніхто не отримає.\n— {operator}",
    // row 11
    "signInCard.notArrived": "Якщо лист не прийшов за кілька хвилин, напишіть мені на {contact}.",
    // row 6
    "signIn.addressNote":
      "Адресу додає оператор реєстру, коли запрошує притулок. Якщо адреси немає в списку, лист не прийде — і ця сторінка про це не повідомляє, щоб не розкривати, хто зареєстрований.",
    // row 9
    "signIn.sentBody":
      "Якщо ця адреса є в списку, на {email} прийде посилання для входу. Воно діє 15 хвилин і відкривається на будь-якому пристрої.",
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
    // row 41
    "profile.contactsNote":
      "Ці контакти бачить людина, коли натискає «Написати притулку», — і пише вам сама. Листування йде напряму, не через реєстр.",
    // row 44
    "profile.donationNote":
      "Лише https. Реєстр не приймає і не передає гроші — це зовнішнє посилання.",
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
 * sign-in on."): PR #94 leaves the live text as it was, all three
 * paragraphs. His replacement third paragraph («Кабінет притулку вже є…») is
 * not in the catalogue until that wiring commit, which changes this pin in
 * the same change (`docs/h2-next-prs.md`).
 */
describe("/prytulkam A2 (forShelters.whenAnimalFindsHome)", () => {
  const paragraphs = uk.forShelters.whenAnimalFindsHome.split("\n\n");

  it("has three paragraphs, the third still the current text until production sign-in", () => {
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[2]).toBe(
      "Поки що це просто: напишіть, і я приберу. Окремої кнопки ще немає — не хочу обіцяти кабінет, якого не існує.",
    );
    expect(uk.forShelters.whenAnimalFindsHome).not.toContain("Кабінет притулку вже є");
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
 * Rows 89–91 of the PR #94 copy export are final (Oleksii, 2026-10-14) but
 * ship together in the commit that turns production sign-in on, A1 directly
 * before §7's last paragraph (`docs/h2-copy-sheet.md` A1, A2 and /pro). Until
 * then neither A1's line nor the /pro addition is live; that commit changes
 * these pins with the A2 one above.
 */
describe("A1 and the /pro addition wait for the wiring commit", () => {
  it("§7 does not yet carry A1's line, and still ends on the current last paragraph", () => {
    expect(uk.forShelters.whatToPrepare).not.toContain("Доступ до кабінету я надсилаю сам");
    expect(
      uk.forShelters.whatToPrepare.endsWith(
        "Заповнювати анкету не треба: ви розкажете, а я внесу все сам.",
      ),
    ).toBe(true);
  });

  it("/pro's about.data does not yet carry the kabinet addition", () => {
    expect(uk.about.data).not.toContain("IP-адреси не зберігаються");
    expect(uk.about.data).not.toContain("протягом двох діб");
  });
});
