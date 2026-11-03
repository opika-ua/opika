import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("the shelter 404", () => {
  it("keeps the site header around its one heading and the way to the gallery", () => {
    render(<NotFound />);

    expect(screen.getByRole("banner")).toBeTruthy();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1 })).toBeTruthy();
    expect(within(main).getByRole("link", { name: "Усі тварини" }).getAttribute("href")).toBe(
      "/tvaryny",
    );
  });
});
