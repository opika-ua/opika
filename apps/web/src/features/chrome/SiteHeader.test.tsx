import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

/**
 * The critique findings this component exists for (E5, E1, B2, E7) are all
 * "the link is not reachable from here" — so these assert reachability and the
 * destinations, not appearance. Geometry (the 64/88 heights, A2) is measured
 * in `test/harness/site-header.harness.ts` instead, where a real browser lays
 * it out; asserting a Tailwind class string here would be the markup-shaped
 * check `docs/standing-constraints.md` exists to forbid.
 */
describe("SiteHeader", () => {
  it("links to «Про проєкт» — the finding was that this was reachable from one place in the whole app", () => {
    render(<SiteHeader />);

    const link = screen.getByRole("link", { name: uk.nav.about });
    expect(link.getAttribute("href")).toBe("/pro");
  });

  it("links to «Для притулків» — the surface a shelter is sent to", () => {
    render(<SiteHeader />);

    const link = screen.getByRole("link", { name: uk.nav.forShelters });
    expect(link.getAttribute("href")).toBe("/prytulkam");
  });

  it("carries the wordmark, linking home", () => {
    render(<SiteHeader />);

    const link = screen.getByRole("link", { name: "Opika" });
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });

  it("renders the wordmark as plain text, not a self-link, on the page it points at", () => {
    render(<SiteHeader wordmarkIsCurrentPage />);

    expect(screen.queryByRole("link", { name: "Opika" })).toBeNull();
    expect(screen.getByTestId("site-wordmark").textContent).toBe("Opika");
  });

  it("names its nav landmark, so it is distinguishable from the pagination nav on the gallery", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("navigation", { name: "Opika" })).toBeTruthy();
  });

  it("every link carries focus-visible styling", () => {
    render(<SiteHeader />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("focus-visible:outline");
    }
  });

  it("renders a surface-specific trailing slot alongside the site nav", () => {
    render(
      <SiteHeader>
        <span>deck entry</span>
      </SiteHeader>,
    );

    expect(screen.getByText("deck entry")).toBeTruthy();
    // Both site links survive the presence of surface chrome — the regression
    // would be a slot that visually or structurally displaces the nav.
    expect(screen.getByRole("link", { name: uk.nav.about })).toBeTruthy();
    expect(screen.getByRole("link", { name: uk.nav.forShelters })).toBeTruthy();
  });

  it("the logo mark is marked decorative", () => {
    const { container } = render(<SiteHeader />);

    // O-1: asserted directly, not just "the accessible name still comes out
    // right" — an svg with no accessible text of its own contributes nothing
    // to the name either way today, so that assertion alone would stay green
    // even if `aria-hidden` were dropped entirely. This is the one that
    // actually goes red for that regression.
    const mark = container.querySelector("svg");
    expect(mark, "expected the logo mark's <svg> to be present").not.toBeNull();
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });

  it("the wordmark link's accessible name stays 'Opika' regardless", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Opika" })).toBeTruthy();
  });
});
