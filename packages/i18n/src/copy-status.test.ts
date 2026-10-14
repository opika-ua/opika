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
 * The kabinet screens PR: every UI string ships `[COPY PENDING]`
 * (`docs/h2-copy-sheet.md` §F), Oleksii writes the Ukrainian. Pinned as the
 * exact list, so a string that lands (or a new placeholder) shows up here as a
 * diff someone has to accept, and `operatorFallbackName` (his own wording,
 * RS-Q2) is pinned as written. Keys and English sense:
 * `docs/decisions-inbox/feat-h2-kabinet-screens.md`.
 */
describe("kabinet copy status", () => {
  it("K1 sign-in: every string is still pending, by name", () => {
    expect(pendingCopyKeys(uk.kabinet.signIn)).toEqual([
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
    ]);
  });

  it("the read-only profile (KS-Q1): every string pending, by name; «Не записано» written", () => {
    expect(pendingCopyKeys(uk.kabinet.profile)).toEqual([
      "address",
      "addressNote",
      "contactPerson",
      "contactsNote",
      "contactsTitle",
      "donationLink",
      "donationNote",
      "donationPending",
      "donationTitle",
      "edrpou",
      "intro",
      "legalName",
      "lockedNote",
      "lockedTitle",
      "pageTitle",
      "phoneTitle",
      "registrationStatus",
      "role",
      "signOut",
      "signOutFailed",
      "statusSince",
      "title",
      "voiceLabel",
      "voiceNote",
      "voiceTitle",
    ]);
    expect(pendingCopyKeys(uk.kabinet.profileStatus)).toEqual([
      "paused",
      "pending",
      "rejected",
      "suspended",
      "under_review",
      "verified",
    ]);
    expect(pendingCopyKeys(uk.kabinet.profileChannel)).toEqual([
      "email",
      "phone",
      "telegram",
      "viber",
      "website",
    ]);
    // The standing constraints fix this wording for an unknown field.
    expect(uk.kabinet.profileNotRecorded).toBe("Не записано");
  });

  it("support mode (S5): every string pending, by name", () => {
    expect(pendingCopyKeys(uk.kabinet.support)).toEqual([
      "body",
      "exit",
      "exitFailed",
      "signOutDisabled",
      "title",
      "viewingAs",
    ]);
  });

  it("the shell label is pending; the operator fallback name is Oleksii's and written", () => {
    expect(pendingCopyKeys(uk.kabinet.shell)).toEqual(["label"]);
    expect(pendingCopyKeys(uk.kabinet)).toEqual([]);
    expect(uk.kabinet.operatorFallbackName).toBe("Оператор реєстру");
  });
});

/**
 * The kabinet emails and the sign-in card's fallback line (IN-Q5, IN-E7,
 * IN-E8): every key ships as a placeholder until Oleksii's Ukrainian lands
 * on `docs/h2-invite-copy-sheet.md`, and none is ever drafted here. Pinned
 * by name both ways: a string that gains real text without passing through
 * the sheet changes this list (so the test is updated in the same commit
 * that lands it), and a key deleted rather than written fails the
 * key-list half. Oleksii's own drafts (e.g. «Відкрити сторінку входу» for
 * `signIn.action`) are recorded on the sheet as drafts, not shipped.
 */
describe("kabinet email copy status (IN-Q5)", () => {
  const groups = {
    "email.signIn": uk.kabinet.email.signIn,
    "email.invite": uk.kabinet.email.invite,
    signInCard: uk.kabinet.signInCard,
  };

  it("every key is still a placeholder", () => {
    expect(
      Object.fromEntries(Object.entries(groups).map(([n, g]) => [n, pendingCopyKeys(g)])),
    ).toEqual({
      "email.signIn": ["action", "expiry", "intro", "notYou", "subject"],
      "email.invite": ["action", "expiry", "intro", "notYou", "subject", "what"],
      signInCard: ["notArrived"],
    });
  });

  it("each group has exactly the keys the copy sheet lists", () => {
    // Guards the guard: an emptied group would leave pendingCopyKeys empty too.
    expect(
      Object.fromEntries(Object.entries(groups).map(([n, g]) => [n, Object.keys(g).sort()])),
    ).toEqual({
      "email.signIn": ["action", "expiry", "intro", "notYou", "subject"],
      "email.invite": ["action", "expiry", "intro", "notYou", "subject", "what"],
      signInCard: ["notArrived"],
    });
  });
});

/**
 * IN-Q11's confirm page: every string still waits for Oleksii's Ukrainian
 * (`docs/h2-invite-copy-sheet.md` P). Pinned as pending so a key added
 * without copy, or one written without the sheet, shows up here.
 */
describe("kabinet confirm page copy status (IN-Q11)", () => {
  it("is all [COPY PENDING], every key", () => {
    expect(pendingCopyKeys(uk.kabinet.confirm)).toEqual([
      "intro",
      "invalid",
      "joinFailed",
      "joinFailedTitle",
      "joinRetry",
      "requestNew",
      "submit",
      "title",
    ]);
  });

  /**
   * IN-Q12: Oleksii gave the accept-failure message as a draft for the copy
   * sheet (`docs/h2-invite-copy-sheet.md` P), so it ships pending with the
   * draft quoted inside, as `submit` carries «Увійти».
   */
  it("keeps Oleksii's accept-failure draft inside the placeholder", () => {
    expect(uk.kabinet.confirm.joinFailed).toContain(
      "«не вдалося приєднатися до притулку, спробуйте ще раз»",
    );
  });

  /**
   * IN-T12 item 7 (Oleksii, 2026-10-14, verbatim: "Failed-accept: reuse K1's
   * card (approved), with its own heading key kabinet.confirm.joinFailedTitle.
   * Drafts: title «Ви увійшли, але приєднати вас до притулку не вдалося»,
   * button «Спробувати ще раз»."): drafts, so pending with the draft inside.
   */
  it("keeps Oleksii's failed-accept heading and button drafts inside the placeholders", () => {
    expect(uk.kabinet.confirm.joinFailedTitle).toContain(
      "«Ви увійшли, але приєднати вас до притулку не вдалося»",
    );
    expect(uk.kabinet.confirm.joinRetry).toContain("«Спробувати ще раз»");
  });
});

/**
 * IN-Q14's `admin_joined` history line: Oleksii gave a draft, not final copy
 * (`docs/h2-invite-copy-sheet.md` H), so it ships pending with the draft
 * quoted inside the placeholder, as `confirm.submit` carries its working label.
 */
describe("kabinet history copy status (IN-Q14)", () => {
  it("is all [COPY PENDING], every key", () => {
    expect(pendingCopyKeys(uk.kabinet.history)).toEqual(["adminJoined"]);
  });

  it("keeps Oleksii's draft and its alternative inside the placeholder", () => {
    expect(uk.kabinet.history.adminJoined).toContain("«{email} отримує доступ до кабінету»");
    expect(uk.kabinet.history.adminJoined).toContain("«Новий адміністратор: {email}»");
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
 * The invite landing (IN-T10) and the operator's reminder (IN-E13): pending
 * until Oleksii's Ukrainian lands on `docs/h2-invite-copy-sheet.md` L and R.
 * The reminder carries his draft inside the placeholder, as the history line
 * does, with the sending address left to config as `{sender}`.
 */
describe("kabinet invite landing and reminder copy status (IN-T10, IN-E13)", () => {
  it("every invite-landing string is pending, by name", () => {
    expect(pendingCopyKeys(uk.kabinet.inviteLanding)).toEqual([
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
    ]);
  });

  it("the reminder is pending, keeps Oleksii's draft, and leaves the address to config", () => {
    expect(pendingCopyKeys(uk.kabinet.registry.inviteSent)).toEqual(["tellPersonally"]);
    expect(uk.kabinet.registry.inviteSent.tellPersonally).toContain(
      '«Надіслав вам запрошення з noreply@mail.opika.org.ua — якщо не бачите, гляньте у вкладці "Промоакції"»',
    );
    expect(uk.kabinet.registry.inviteSent.tellPersonally).toContain("{sender}");
  });

  /**
   * EM-Q2 (Oleksii, 2026-10-14, verbatim: "the banner addresses the operator;
   * no name hard-coded. Draft: «Ви переглядаєте кабінет притулку «{shelter}» —
   * лише перегляд, змінити нічого не можна.»"). His earlier draft named him
   * and spoke to the shelter; it is gone.
   */
  it("the support banner's title carries Oleksii's operator-facing draft, still pending", () => {
    expect(pendingCopyKeys(uk.kabinet.support)).toContain("title");
    expect(uk.kabinet.support.title).toContain(
      "«Ви переглядаєте кабінет притулку «{shelter}» — лише перегляд, змінити нічого не можна.»",
    );
    expect(uk.kabinet.support.title).not.toContain("Олексій");
  });

  /**
   * EM-Q3 (Oleksii, 2026-10-14, verbatim: "(b). The invite landing shows one
   * «Надіслати посилання» button; only its POST sends."): his label is the
   * draft inside the placeholder.
   */
  it("the landing's one button carries Oleksii's label as a draft, still pending", () => {
    expect(uk.kabinet.inviteLanding.send).toContain("«Надіслати посилання»");
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
