import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("carries the e-Ukraine attribution verbatim", () => {
    render(<Footer />);

    expect(screen.getByText(uk.footer.fontCredit)).toBeTruthy();
  });

  it("links to both secondary pages when rendered on neither", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: uk.nav.about }).getAttribute("href")).toBe("/pro");
    expect(screen.getByRole("link", { name: uk.nav.forShelters }).getAttribute("href")).toBe(
      "/prytulkam",
    );
  });

  it("suppresses the /pro link when rendered on /pro — no self-link", () => {
    render(<Footer currentPage="pro" />);

    expect(screen.queryByRole("link", { name: uk.nav.about })).toBeNull();
    expect(screen.getByRole("link", { name: uk.nav.forShelters })).toBeTruthy();
  });

  it("suppresses the /prytulkam link when rendered on /prytulkam — no self-link", () => {
    render(<Footer currentPage="prytulkam" />);

    expect(screen.queryByRole("link", { name: uk.nav.forShelters })).toBeNull();
    expect(screen.getByRole("link", { name: uk.nav.about })).toBeTruthy();
  });

  it("every link carries focus-visible styling", () => {
    render(<Footer />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("focus-visible:outline");
    }
  });
});
