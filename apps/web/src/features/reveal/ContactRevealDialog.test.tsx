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
  shelterSnapshot: {
    shelterId: ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa"),
    displayName: "Притулок «Домівка»",
    contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
    publicLocation: { cityId: CityIdSchema.parse("12121212-3434-4565-8787-909090909090") },
    verificationStatusAtReveal: "verified",
    donation: null,
  },
  animalSnapshot: { name: "Пес $& $1", primaryPhoto: null },
};

/**
 * Names become shelter-typed in K2, and a string second argument to
 * `.replace()` reads "$&" as "the matched placeholder" and "$`" as "the text
 * before it" (review finding 2). The animal and city names are printed as
 * given.
 */
describe("ContactRevealDialog prints names literally", () => {
  it("does not read $& or $1 in the animal or city name as replacement patterns", () => {
    render(
      <ContactRevealDialog
        state={{
          kind: "open",
          animalId: ANIMAL_ID,
          animalName: "Пес $& $1",
          cityName: "Місто $& $1",
          reveal,
        }}
        onClose={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("Ви запитали про Пес $& $1.")).toBeTruthy();
    expect(screen.getByText("м. Місто $& $1 · ", { exact: false })).toBeTruthy();
  });
});
