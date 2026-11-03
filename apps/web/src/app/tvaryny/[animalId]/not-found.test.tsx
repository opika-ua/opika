import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("the card 404", () => {
  it("says the card is gone inside the site chrome, with a way back", () => {
    render(<NotFound />);

    expect(screen.getByRole("banner")).toBeTruthy();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Цієї картки більше немає." }),
    ).toBeTruthy();
    expect(within(main).getByRole("link", { name: "Усі тварини" }).getAttribute("href")).toBe(
      "/tvaryny",
    );
  });
});
