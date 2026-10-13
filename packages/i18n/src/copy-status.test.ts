import { describe, expect, it } from "vitest";
import { pendingCopyKeys } from "./copy-status";
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
 * (`docs/h2-invite-copy-sheet.md` C). Pinned as pending so a key added
 * without copy, or one written without the sheet, shows up here.
 */
describe("kabinet confirm page copy status (IN-Q11)", () => {
  it("is all [COPY PENDING], every key", () => {
    expect(pendingCopyKeys(uk.kabinet.confirm)).toEqual([
      "intro",
      "invalid",
      "requestNew",
      "submit",
      "title",
    ]);
  });
});
