import type { ContactRevealView } from "@opika/contracts";
import { AnimalIdSchema, CityIdSchema, RevealIdSchema, ShelterIdSchema } from "@opika/domain";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContactRevealDialog } from "./ContactRevealDialog";

const ANIMAL_ID = AnimalIdSchema.parse("11111111-2222-4333-8444-555555555555");

const reveal: ContactRevealView = {
  id: RevealIdSchema.parse("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"),
  animalId: ANIMAL_ID,
  revealedAt: new Date("2026-08-08T10:00:00Z"),
  shelterContact: {
    source: "current",
    displayName: "Притулок «Домівка»",
    contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
  },
  shelterAtFirstReveal: {
    shelterId: ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa"),
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
 * The footnote «Контакти такі, якими були {date}, коли ви їх відкрили.» is
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
    renderOpen({
      ...reveal,
      shelterContact: { source: "current", displayName: "Притулок «Домівка»", contact: NEW_NUMBER },
    });
    expect(screen.getByText("@new_number")).toBeTruthy();
    expect(screen.queryByText(/коли ви їх відкрили/)).toBeNull();
    expect(screen.queryByText(/серпня 2026/)).toBeNull();
  });

  it("first-reveal contacts: the footnote, dated by the first reveal", () => {
    renderOpen({
      ...reveal,
      shelterContact: {
        source: "first_reveal",
        displayName: "Притулок «Домівка»",
        contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
      },
    });
    expect(screen.getByText("+380671234567")).toBeTruthy();
    // Audit 2026-10-22 #5: «є сьогодні» beside a past date said two opposite things.
    expect(
      screen.getByText("Контакти такі, якими були 8 серпня 2026 р., коли ви їх відкрили."),
    ).toBeTruthy();
  });
});

/**
 * Audit 2026-10-22 #18: in the deck «Не зараз» hides an animal for 30 days, so a screen
 * reader must not hear it on a plain close button. The ✕ is «Закрити», in the open dialog
 * and in the error dialog alike.
 */
describe("the ✕ is named «Закрити», never «Не зараз»", () => {
  it("in the open dialog", () => {
    renderOpen(reveal);
    expect(screen.getByRole("button", { name: "Закрити" }).textContent).toBe("✕");
    expect(screen.queryByRole("button", { name: "Не зараз" })).toBeNull();
  });

  it("in the error dialog", () => {
    render(
      <ContactRevealDialog
        state={{
          kind: "error",
          reason: "loadFailed",
          animalId: ANIMAL_ID,
          animalName: "Мурчик",
          cityName: null,
        }}
        onClose={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Закрити" }).textContent).toBe("✕");
    expect(screen.queryByRole("button", { name: "Не зараз" })).toBeNull();
  });
});

/**
 * RUI4-F1: the shelter's name is the one that came with the contacts, from the
 * same moment: the current name over the current channels, the first
 * reveal's over the first reveal's. Before, the dialog read the name from the
 * first-reveal record whatever the channels were, so after an operator rename
 * (R-UI 4) a repeat reveal named the shelter by its old name over its current
 * number.
 */
describe("the shelter's name comes with its contacts (RUI4-F1)", () => {
  const NEW_NUMBER = {
    primary: { kind: "telegram", handle: "new_number" },
    additional: [],
  } as const;

  it.each(["current", "first_reveal"] as const)(
    "%s: the name beside the channels is the one sent with them",
    (source) => {
      renderOpen({
        ...reveal,
        shelterContact: { source, displayName: "Притулок «Лапа допомоги»", contact: NEW_NUMBER },
      });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Притулок «Лапа допомоги»")).toBeTruthy();
      expect(within(dialog).getByText("@new_number")).toBeTruthy();
      expect(within(dialog).queryByText("Притулок «Домівка»")).toBeNull();
    },
  );

  it("handed a stale name in the first-reveal object (a regressed server), shows only the name beside the contacts", () => {
    const regressed = {
      ...reveal,
      shelterContact: {
        source: "current" as const,
        displayName: "Притулок «Лапа допомоги»",
        contact: NEW_NUMBER,
      },
      shelterAtFirstReveal: { ...reveal.shelterAtFirstReveal, displayName: "Притулок «Лапа»" },
    };
    renderOpen(regressed);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Притулок «Лапа допомоги»")).toBeTruthy();
    expect(within(dialog).queryByText("Притулок «Лапа»")).toBeNull();
  });
});
