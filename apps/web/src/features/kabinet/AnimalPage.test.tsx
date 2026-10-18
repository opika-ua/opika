import type { KabinetShelterView } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnimalPage } from "./AnimalPage";

/**
 * K3's page shell around the form, behaviour only: what an id that isn't this
 * shelter's animal shows, where «←» leads until K2's list exists, and the
 * support mode's signals. The form itself is `AnimalForm.test.tsx`'s; who gets
 * which page is `animal-page.test.ts`'s. Ukrainian transcribed from his files.
 */

const shelter = {
  id: "51000000-0000-4000-8000-000000000001",
  displayName: "Притулок «Домівка»",
  verification: { status: "verified", since: new Date("2025-03-14T10:00:00Z") },
} as unknown as KabinetShelterView;

describe("AnimalPage", () => {
  it("an id that isn't this shelter's animal: his not-found sentence, and the way back", () => {
    render(<AnimalPage page={{ kind: "missing", shelter, viewer: "admin" }} />);
    expect(
      screen.getByText(
        "Цієї тварини немає у вашому списку: картку видалено або посилання неправильне.",
      ),
    ).toBeTruthy();
    // Until K2's list (PR 5), «←» returns to the profile, the only kabinet page there is.
    expect(screen.getByRole("link", { name: "← Профіль притулку" }).getAttribute("href")).toBe(
      "/kabinet",
    );
    expect(screen.getByRole("button", { name: "Вийти" })).toBeTruthy();
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
    expect(
      screen.getByText(
        "Ви переглядаєте кабінет притулку «Притулок «Домівка»» — лише перегляд, змінити нічого не можна.",
      ),
    ).toBeTruthy();
  });
});
