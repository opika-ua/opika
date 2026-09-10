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
