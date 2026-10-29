import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "./not-found";

/** Strings transcribed from the owner's QA-fix copy table, not read from the catalogue. */
describe("the root 404", () => {
  it("is kept out of search results", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("says what happened and leads home, inside the site chrome", async () => {
    render(await NotFound());

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Такої сторінки немає." }),
    ).toBeTruthy();
    expect(within(main).getByText("Не знайдено")).toBeTruthy();
    expect(
      within(main).getByText("Можливо, посилання застаріло або в адресі помилка."),
    ).toBeTruthy();
    expect(within(main).getByRole("link", { name: "На головну" }).getAttribute("href")).toBe(
      "/tvaryny",
    );
    // The header is outside main: a visitor still has navigation.
    expect(screen.getByRole("banner")).toBeTruthy();
  });
});
