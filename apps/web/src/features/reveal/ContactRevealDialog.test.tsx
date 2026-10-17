import type { ContactRevealView } from "@opika/contracts";
import { AnimalIdSchema, CityIdSchema, RevealIdSchema, ShelterIdSchema } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContactRevealDialog } from "./ContactRevealDialog";

const ANIMAL_ID = AnimalIdSchema.parse("11111111-2222-4333-8444-555555555555");

const reveal: ContactRevealView = {
  id: RevealIdSchema.parse("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"),
  animalId: ANIMAL_ID,
  revealedAt: new Date("2026-08-08T10:00:00Z"),
  shelterContact: {
    source: "current",
    contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
  },
  shelterAtFirstReveal: {
    shelterId: ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa"),
    displayName: "Притулок «Домівка»",
    publicLocation: { cityId: CityIdSchema.parse("12121212-3434-4565-8787-909090909090") },
    verificationStatusAtReveal: "verified",
    donation: null,
  },
  animalSnapshot: { name: "Пес $& $1", primaryPhoto: null },
};

const renderOpen = (view: ContactRevealView, names = { animal: "Мурчик", city: "Бровари" }) =>
  render(
    <ContactRevealDialog
      state={{
        kind: "open",
        animalId: ANIMAL_ID,
        animalName: names.animal,
        cityName: names.city,
        reveal: view,
      }}
      onClose={() => {}}
      onRetry={() => {}}
    />,
  );

/**
 * Names become shelter-typed in K2, and a string second argument to
 * `.replace()` reads "$&" as "the matched placeholder" and "$`" as "the text
 * before it" (review finding 2). The animal and city names are printed as
 * given.
 */
describe("ContactRevealDialog prints names literally", () => {
  it("does not read $& or $1 in the animal or city name as replacement patterns", () => {
    renderOpen(reveal, { animal: "Пес $& $1", city: "Місто $& $1" });
    expect(screen.getByText("Ви запитали про Пес $& $1.")).toBeTruthy();
    expect(screen.getByText("м. Місто $& $1 · ", { exact: false })).toBeTruthy();
  });
});

/**
 * The footnote «Контакти збережено такими, якими вони є сьогодні · {date}» is
 * dated by the first reveal. Under the shelter's current contacts (K4-B4)
 * that date would caption channels it never saw, so it is shown only under
 * the first-reveal record's (Tier 1 review, finding 1; inbox K4-B5, K4-Q11).
 * The expected text is the catalogue's copy written out, not read from it.
 */
describe("the contacts footnote shows only under the first-reveal record (K4-B5)", () => {
  const NEW_NUMBER = {
    primary: { kind: "telegram", handle: "new_number" },
    additional: [],
  } as const;

  it("current contacts: the channels are shown, and no footnote", () => {
    renderOpen({ ...reveal, shelterContact: { source: "current", contact: NEW_NUMBER } });
    expect(screen.getByText("@new_number")).toBeTruthy();
    expect(screen.queryByText(/Контакти збережено/)).toBeNull();
    expect(screen.queryByText(/серпня 2026/)).toBeNull();
  });

  it("first-reveal contacts: the footnote, dated by the first reveal", () => {
    renderOpen({
      ...reveal,
      shelterContact: {
        source: "first_reveal",
        contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
      },
    });
    expect(screen.getByText("+380671234567")).toBeTruthy();
    expect(
      screen.getByText("Контакти збережено такими, якими вони є сьогодні · 8 серпня 2026 р."),
    ).toBeTruthy();
  });
});
