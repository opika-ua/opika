import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("carries the e-Ukraine attribution verbatim", () => {
    render(<Footer />);

    expect(screen.getByText(uk.footer.fontCredit)).toBeTruthy();
  });

  // 2026-10-28 responsive audit: both nav-echo links («Для притулків» /
  // «Про проєкт») were removed - they duplicated SiteHeader's own nav and
  // read as an accident, not a real footer. The footer is credit-only now.
  it("carries no links - the attribution line only", () => {
    render(<Footer />);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("ignores currentPage - kept on the type for the caller, has no effect", () => {
    render(<Footer currentPage="pro" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(uk.footer.fontCredit)).toBeTruthy();
  });
});
