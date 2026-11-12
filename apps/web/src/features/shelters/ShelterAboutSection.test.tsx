import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShelterAboutSection } from "./ShelterAboutSection";

describe("ShelterAboutSection", () => {
  it("makes a link in the shelter's text clickable", () => {
    render(<ShelterAboutSection text={"Наш сайт: https://example.org/pro.\nДякуємо!"} />);
    const link = screen.getByRole("link", { name: "example.org/pro" });
    expect(link.getAttribute("href")).toBe("https://example.org/pro");
  });
});
