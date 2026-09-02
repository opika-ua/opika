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
 * Not an assertion that the copy is finished — it deliberately is not, and a
 * failing test here would block the very PR that exists to add the structure.
 * This reports the count so it is visible on every run, and pins the exact key
 * set so that adding a section without copy, or quietly deleting a section
 * instead of writing it, both show up as a diff rather than as silence.
 *
 * When the Ukrainian lands, this expectation becomes `toEqual([])` and the
 * `forShelters` page stops rendering placeholders. That edit is the signal
 * that Phase T's copy is done.
 */
describe("«Для притулків» copy status", () => {
  const EXPECTED_PENDING = [
    "cost",
    "howToStart",
    "money",
    "noObligation",
    "verification",
    "verificationOpenToVolunteers",
    "whatHappensToAnimals",
    "whatThisIs",
    "whatToPrepare",
    "whenAnimalFindsHome",
    "whoContactsWhom",
    "whoIsBehindThis",
    "whyThatSentence",
  ];

  it("has exactly the 13 sections docs/prytulkam-argument.md specifies still pending", () => {
    expect(pendingCopyKeys(uk.forShelters)).toEqual(EXPECTED_PENDING);
  });

  it("has a real, written title — the one string that is not pending", () => {
    expect(pendingCopyKeys({ title: uk.forShelters.title })).toEqual([]);
  });
});
