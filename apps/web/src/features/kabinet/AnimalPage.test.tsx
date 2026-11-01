import type { KabinetShelterView } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnimalPage } from "./AnimalPage";

/**
 * K3's page shell around the form, behaviour only: what an id that isn't this
 * shelter's animal shows, where «←» leads (K2's list where it is shown), and the
 * support mode's signals. The form itself is `AnimalForm.test.tsx`'s; who gets
 * which page is `animal-page.test.ts`'s. Ukrainian transcribed from his files.
 */

const shelter = {
  id: "51000000-0000-4000-8000-000000000001",
  displayName: "Притулок «Домівка»",
  verification: { status: "verified", since: new Date("2025-03-14T10:00:00Z") },
} as unknown as KabinetShelterView;

describe("AnimalPage", () => {
  it("an id that isn't this shelter's animal: his not-found sentence, and the way back to the list", () => {
    render(
      <AnimalPage
        page={{
          kind: "missing",
          shelter,
          viewer: "admin",
          editing: { kind: "open" },
        }}
      />,
    );
    expect(
      screen.getByText(
        "Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.",
      ),
    ).toBeTruthy();
    // His `backToList` (K3 file), to K2's list, which this admin is shown.
    expect(screen.getByRole("link", { name: "← Тварини" }).getAttribute("href")).toBe(
      "/kabinet/tvaryny",
    );
    expect(screen.getByRole("button", { name: "Вийти" })).toBeTruthy();
  });

  /** P1: the list 404s for a shelter whose writes are refused, so «←» can't point there. */
  it("a shelter outside the allowlist, which has no list, goes back to its profile", () => {
    render(
      <AnimalPage
        page={{ kind: "missing", shelter, viewer: "admin", editing: { kind: "read_only" } }}
      />,
    );
    expect(screen.getByRole("link", { name: "← Притулок" }).getAttribute("href")).toBe(
      "/kabinet/prytulok",
    );
    expect(screen.queryByRole("link", { name: "← Тварини" })).toBeNull();
  });

  it("the support view: the banner instead of sign-out, and no form controls to write with", () => {
    render(
      <AnimalPage
        page={{
          kind: "form",
          shelter,
          view: null,
          viewer: "support",
          editing: { kind: "read_only" },
          shelterVisibility: "visible",
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Вийти" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Опублікувати" })).toBeNull();
    // The support view is shown the list (read-only), so «←» leads there.
    expect(screen.getByRole("link", { name: "← Тварини" }).getAttribute("href")).toBe(
      "/kabinet/tvaryny",
    );
    expect(
      screen.getByText(
        "Ви переглядаєте кабінет притулку «Притулок «Домівка»» – лише перегляд, змінити нічого не можна.",
      ),
    ).toBeTruthy();
  });
});
