import type { ContactRevealView } from "@opika/contracts";
import { AnimalIdSchema, CityIdSchema, RevealIdSchema, ShelterIdSchema } from "@opika/domain";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    renderOpen(reveal, { animal: "Пес $& $1", city: "м. Місто $& $1" });
    expect(screen.getByText("Пес $& $1")).toBeTruthy();
    expect(screen.getByText("м. Місто $& $1 · місце узгодите в листуванні")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Закрити" })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Закрити" })).toBeTruthy();
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

const BOTH = {
  primary: { kind: "phone", e164: "+380671234567" },
  additional: [
    { kind: "telegram", handle: "domivka_brovary" },
    { kind: "viber", e164: "+380671234567" },
  ],
} as const;

function revealWith(contact: ContactRevealView["shelterContact"]["contact"]): ContactRevealView {
  return {
    ...reveal,
    shelterContact: { source: "current", displayName: "Притулок «Домівка»", contact },
  };
}

/** Reveal redesign (owner-approved copy): header row, one ✕, action rows, one location line. */
describe("the redesigned reveal", () => {
  it("heads the dialog with the animal's name and «{shelter} · {city}», then the title and the reassurance", () => {
    renderOpen(revealWith(BOTH), { animal: "Мурчик", city: "м. Бровари" });
    const dialog = screen.getByRole("dialog", { name: "Як звʼязатися з притулком" });
    expect(within(dialog).getByText("Мурчик")).toBeTruthy();
    expect(dialog.textContent).toContain("Притулок «Домівка» · м. Бровари");
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe(
      "Як звʼязатися з притулком",
    );
    expect(
      within(dialog).getByText(
        "Притулок не знає про цей запит, поки ви не напишете самі. Нічого не сталося автоматично.",
      ),
    ).toBeTruthy();
  });

  it("has exactly one ✕", () => {
    renderOpen(revealWith(BOTH));
    expect(screen.getAllByRole("button", { name: "Закрити" })).toHaveLength(1);
  });

  it("gives each channel an action row with its own label and link, phone first", () => {
    renderOpen(revealWith(BOTH));
    const links = screen
      .getAllByTestId("reveal-contact-row")
      .map((row) => within(row).getByRole("link"));
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Подзвонити+380671234567", "tel:+380671234567"],
      ["Написати в Telegram@domivka_brovary", "https://t.me/domivka_brovary"],
      ["Написати у Viber+380671234567", "viber://chat?number=%2B380671234567"],
    ]);
  });

  it("names each copy button by its channel, starting with the visible «Копіювати»", () => {
    renderOpen(revealWith(BOTH));
    for (const name of [
      "Копіювати номер телефону",
      "Копіювати нікнейм у Telegram",
      "Копіювати номер у Viber",
    ]) {
      expect(screen.getByRole("button", { name }).textContent).toBe("Копіювати");
    }
  });

  it("copies the value and confirms with «Скопійовано.» in a polite live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderOpen(revealWith(BOTH));

    fireEvent.click(screen.getByRole("button", { name: "Копіювати нікнейм у Telegram" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("@domivka_brovary"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Скопійовано."));
  });

  it("says nothing when the clipboard is refused, and the value stays on screen", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderOpen(revealWith(BOTH));

    fireEvent.click(screen.getByRole("button", { name: "Копіювати номер телефону" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getAllByText("+380671234567").length).toBeGreaterThan(0);
  });

  it("opens a website, with no copy button on that row", () => {
    renderOpen(
      revealWith({ primary: { kind: "website", url: "https://domivka.example" }, additional: [] }),
    );
    const row = screen.getByTestId("reveal-contact-row");
    expect(within(row).getByRole("link").getAttribute("href")).toBe("https://domivka.example");
    expect(within(row).getByText("Відкрити сайт")).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

/** «Перед тим як писати – три речі»: open on a desktop, collapsed on a phone. */
describe("the «Перед тим як писати» disclosure", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });
  const media = (matches: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };

  it("starts open from the desktop breakpoint", () => {
    media(true);
    renderOpen(revealWith(BOTH));
    const details = screen.getByText("Перед тим як писати – три речі").closest("details");
    expect(details?.open).toBe(true);
  });

  it("starts collapsed on a phone", () => {
    media(false);
    renderOpen(revealWith(BOTH));
    const details = screen.getByText("Перед тим як писати – три речі").closest("details");
    expect(details?.open).toBe(false);
  });
});

describe("«Повернутися до картки»", () => {
  it("is a text button that runs the action it is given, and is absent without one", () => {
    const onClick = vi.fn();
    const { unmount } = render(
      <ContactRevealDialog
        state={{ kind: "open", animalId: ANIMAL_ID, animalName: "Мурчик", cityName: null, reveal }}
        onClose={() => {}}
        onRetry={() => {}}
        secondaryAction={{ label: "Повернутися до картки", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Повернутися до картки" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
    renderOpen(reveal);
    expect(screen.queryByRole("button", { name: "Повернутися до картки" })).toBeNull();
  });
});
