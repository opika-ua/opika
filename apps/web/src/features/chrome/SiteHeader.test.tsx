import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

/**
 * The critique findings this component exists for (E5, E1, B2, E7) are all
 * "the link is not reachable from here" — so these assert reachability and the
 * destinations, not appearance. Appearance is not tested at all (CLAUDE.md,
 * "Test logic, not looks"; the header's geometry tests were removed
 * 2026-10-20).
 */
describe("SiteHeader", () => {
  it("links to «Про проєкт» — the finding was that this was reachable from one place in the whole app", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    const link = screen.getByRole("link", { name: uk.nav.about });
    expect(link.getAttribute("href")).toBe("/pro");
  });

  it("links to «Для притулків» — the surface a shelter is sent to", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    const link = screen.getByRole("link", { name: uk.nav.forShelters });
    expect(link.getAttribute("href")).toBe("/prytulkam");
  });

  it("carries the wordmark, linking home", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    const link = screen.getByRole("link", { name: "Opika" });
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });

  it("renders the wordmark as plain text, not a self-link, on the page it points at", () => {
    render(<SiteHeader wordmarkIsCurrentPage kabinetSignedIn={false} />);

    expect(screen.queryByRole("link", { name: "Opika" })).toBeNull();
    expect(screen.getByTestId("site-wordmark").textContent).toBe("Opika");
  });

  it("names its nav landmark, so it is distinguishable from the pagination nav on the gallery", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    expect(screen.getByRole("navigation", { name: "Opika" })).toBeTruthy();
  });

  it("renders a surface-specific trailing slot alongside the site nav", () => {
    render(
      <SiteHeader kabinetSignedIn={false}>
        <span>deck entry</span>
      </SiteHeader>,
    );

    expect(screen.getByText("deck entry")).toBeTruthy();
    // Both site links survive the presence of surface chrome — the regression
    // would be a slot that visually or structurally displaces the nav.
    expect(screen.getByRole("link", { name: uk.nav.about })).toBeTruthy();
    expect(screen.getByRole("link", { name: uk.nav.forShelters })).toBeTruthy();
  });

  it("designer feedback batch D: a signed-in shelter admin/operator sees «Кабінет», not «Збережені», and no surface-specific adopter slot", () => {
    render(
      <SiteHeader kabinetSignedIn={true}>
        <span>deck entry</span>
      </SiteHeader>,
    );

    const kabinetLink = screen.getByRole("link", { name: uk.nav.kabinet });
    expect(kabinetLink.getAttribute("href")).toBe("/kabinet");
    expect(screen.queryByRole("link", { name: uk.nav.saved })).toBeNull();
    expect(screen.queryByText("deck entry")).toBeNull();
    // «Для притулків» and «Про проєкт» stay, his own wording for who still sees what.
    expect(screen.getByRole("link", { name: uk.nav.about })).toBeTruthy();
    expect(screen.getByRole("link", { name: uk.nav.forShelters })).toBeTruthy();
  });

  it("a visitor (not signed in) sees «Збережені», not «Кабінет»", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    expect(screen.getByRole("link", { name: uk.nav.saved })).toBeTruthy();
    expect(screen.queryByRole("link", { name: uk.nav.kabinet })).toBeNull();
  });

  it("the logo mark is marked decorative", () => {
    const { container } = render(<SiteHeader kabinetSignedIn={false} />);

    // O-1, updated for the gallery-v3 re-skin: the hand-drawn inline <svg>
    // was replaced by a static <img> (`BrandLogo.tsx`) — asserted directly,
    // not just "the accessible name still comes out right", for the same
    // reason as before: an aria-hidden image with no alt text contributes
    // nothing to the name either way, so that assertion alone would stay
    // green even if `aria-hidden` were dropped entirely. This is the one
    // that actually goes red for that regression.
    const mark = container.querySelector("img");
    expect(mark, "expected the logo mark's <img> to be present").not.toBeNull();
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.getAttribute("alt")).toBe("");
  });

  it("the wordmark link's accessible name stays 'Opika' regardless", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    expect(screen.getByRole("link", { name: "Opika" })).toBeTruthy();
  });
});
