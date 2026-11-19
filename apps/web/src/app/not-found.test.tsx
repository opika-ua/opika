import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "./not-found";

/** The minimal root 404 (`notFound()` with no nearer boundary); unknown addresses get `[...rest]`'s. */
describe("the root 404", () => {
  it("is kept out of search results", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("says what happened and leads home, under the plain header", () => {
    render(<NotFound />);

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Такої сторінки немає." }),
    ).toBeTruthy();
    expect(within(main).getByRole("link", { name: "На головну" }).getAttribute("href")).toBe(
      "/tvaryny",
    );
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "Тварини" })).toBeTruthy();
  });
});
