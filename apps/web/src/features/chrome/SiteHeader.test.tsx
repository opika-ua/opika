import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { toggleSavedAnimal } from "../likes/likes-store";
import { SiteHeader } from "./SiteHeader";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-has-saved");
});

/**
 * The critique findings this component exists for (E5, E1, B2, E7) are all
 * "the link is not reachable from here" - so these assert reachability and the
 * destinations, not appearance. Appearance is not tested at all (CLAUDE.md,
 * "Test logic, not looks"; the header's geometry tests were removed
 * 2026-10-20).
 */
describe("SiteHeader", () => {
  it("links to «Про проєкт» - the finding was that this was reachable from one place in the whole app", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    const link = screen.getByRole("link", { name: uk.nav.about });
    expect(link.getAttribute("href")).toBe("/pro");
  });

  it("links to «Для притулків» - the surface a shelter is sent to", () => {
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
    // Both site links survive the presence of surface chrome - the regression
    // would be a slot that visually or structurally displaces the nav.
    expect(screen.getByRole("link", { name: uk.nav.about })).toBeTruthy();
    expect(screen.getByRole("link", { name: uk.nav.forShelters })).toBeTruthy();
  });

  it("links «Тварини» to the gallery and marks the current entry with aria-current", () => {
    render(<SiteHeader kabinetSignedIn={false} current="about" />);

    expect(screen.getByRole("link", { name: uk.nav.animals }).getAttribute("href")).toBe(
      "/tvaryny",
    );
    expect(screen.getByRole("link", { name: uk.nav.about }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: uk.nav.animals }).getAttribute("aria-current")).toBe(
      null,
    );
  });

  it("on the saved page no text link is current", () => {
    render(<SiteHeader kabinetSignedIn={false} current="saved" />);

    for (const name of [uk.nav.animals, uk.nav.forShelters, uk.nav.about]) {
      expect(screen.getByRole("link", { name }).getAttribute("aria-current")).toBe(null);
    }
  });

  it("a visitor has no «Кабінет» entry anywhere, and signs in from «Для притулків»", () => {
    render(<SiteHeader kabinetSignedIn={false} />);

    expect(screen.queryByTestId("nav-kabinet")).toBeNull();
    expect(screen.queryByTestId("nav-kabinet-menu")).toBeNull();
    expect(screen.queryByRole("link", { name: uk.nav.kabinet, hidden: true })).toBeNull();
  });

  it("a signed-in shelter gets the «Кабінет» pill and the same links as a visitor, plus no deck entry", () => {
    render(
      <SiteHeader kabinetSignedIn={true}>
        <span>deck entry</span>
      </SiteHeader>,
    );

    const pill = screen.getByTestId("nav-kabinet");
    expect(pill.getAttribute("href")).toBe("/kabinet");
    expect(pill.textContent).toBe(uk.nav.kabinet);
    expect(screen.getByTestId("nav-kabinet-menu").getAttribute("href")).toBe("/kabinet");
    expect(screen.queryByText("deck entry")).toBeNull();
    expect(screen.getByRole("link", { name: uk.nav.about })).toBeTruthy();
    expect(screen.getByRole("link", { name: uk.nav.forShelters })).toBeTruthy();
    expect(screen.getByRole("link", { name: uk.nav.animals })).toBeTruthy();
  });

  /**
   * `SavedButton` reads `localStorage` in an effect (the same constraint `SaveButton` documents),
   * so these use `findBy`/`queryBy`, not an assertion right after `render`. It is the same for a
   * visitor and a shelter: the count comes from this browser's storage, not from the audience.
   */
  it.each([
    ["visitor", false],
    ["shelter", true],
  ])("a %s with 3 saved sees the bookmark named «Збережені, 3»", async (_name, signedIn) => {
    for (const id of ["a1", "a2", "a3"]) toggleSavedAnimal(id, new Date());
    render(<SiteHeader kabinetSignedIn={signedIn} />);

    const button = await screen.findByRole("link", { name: "Збережені, 3" });
    expect(button.getAttribute("href")).toBe("/zberezheni");
    expect(button.textContent).toBe("3");
    expect(document.documentElement.hasAttribute("data-has-saved")).toBe(true);
  });

  it.each([
    ["visitor", false],
    ["shelter", true],
  ])("a %s with nothing saved has no saved entry at all", async (_name, signedIn) => {
    render(<SiteHeader kabinetSignedIn={signedIn} />);

    // Give the effect its tick, so the absence is not just "not checked yet".
    await screen.findByRole("link", { name: uk.nav.about });
    expect(screen.queryByRole("link", { name: /^Збережені/, hidden: true })).toBeNull();
    expect(document.documentElement.hasAttribute("data-has-saved")).toBe(false);
  });

  it("the badge reads «99+» above 99 while the accessible name keeps the real number", async () => {
    for (let i = 0; i < 100; i++) toggleSavedAnimal(`a${i}`, new Date());
    render(<SiteHeader kabinetSignedIn={false} />);

    const button = await screen.findByRole("link", { name: "Збережені, 100" });
    expect(button.textContent).toBe("99+");
  });

  it("on the saved page the bookmark is the current page", async () => {
    toggleSavedAnimal("a1", new Date());
    render(<SiteHeader kabinetSignedIn={false} current="saved" />);

    const button = await screen.findByRole("link", { name: "Збережені, 1" });
    expect(button.getAttribute("aria-current")).toBe("page");
  });

  it("the drawer carries the same entries: a «Збережені» row with its count, and «Кабінет» last for a shelter", async () => {
    toggleSavedAnimal("a1", new Date());
    toggleSavedAnimal("a2", new Date());
    render(<SiteHeader kabinetSignedIn={true} />);

    const row = await screen.findByTestId("nav-saved-menu");
    expect(row.getAttribute("aria-label")).toBe("Збережені, 2");
    expect(row.getAttribute("href")).toBe("/zberezheni");
    const rows = Array.from(screen.getByTestId("nav-menu-sheet").querySelectorAll("nav > a"));
    expect(rows.at(-1)?.getAttribute("data-testid")).toBe("nav-kabinet-menu");
    expect(rows.map((r) => r.getAttribute("href"))).toEqual([
      "/tvaryny",
      "/prytulkam",
      "/pro",
      "/zberezheni",
      "/kabinet",
    ]);
  });

  /**
   * The real scenario this whole feature is for: a visitor saves something on the page they're
   * already looking at, header included - not a reload, not another tab. `likes-store.ts`'s
   * `SAME_TAB_CHANGE_EVENT` is what makes this work at all.
   */
  it("a save made after the header has mounted makes the bookmark appear, no reload", async () => {
    render(<SiteHeader kabinetSignedIn={false} />);
    await screen.findByRole("link", { name: uk.nav.about });
    expect(screen.queryByRole("link", { name: /^Збережені/ })).toBeNull();

    toggleSavedAnimal("a1", new Date());

    expect(await screen.findByRole("link", { name: "Збережені, 1" })).toBeTruthy();
  });

  it("the logo mark is marked decorative", () => {
    const { container } = render(<SiteHeader kabinetSignedIn={false} />);

    // O-1, updated for the gallery-v3 re-skin: the hand-drawn inline <svg>
    // was replaced by a static <img> (`BrandLogo.tsx`) - asserted directly,
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
