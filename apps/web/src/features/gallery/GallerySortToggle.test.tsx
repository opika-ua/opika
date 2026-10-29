import { NO_FILTERS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GallerySortToggle } from "./GallerySortToggle";

const FRESHEST = `${uk.filters.sortFreshestShort}. ${uk.filters.sortFreshest}`;
const LONGEST = `${uk.filters.sortLongestWaitingShort}. ${uk.filters.sortLongestWaiting}`;

describe("GallerySortToggle", () => {
  it("renders both sorts as links with their own visible short labels", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);
    expect(screen.getByText("Нові")).toBeTruthy();
    expect(screen.getByText("Зачекались")).toBeTruthy();
  });

  it("marks the active sort with aria-current", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="longest_waiting" citySlugs={new Map()} />);
    expect(screen.getByRole("link", { name: FRESHEST }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: LONGEST }).getAttribute("aria-current")).toBe("true");
  });

  it("each accessible name starts with its visible text (WCAG 2.5.3) and keeps the long sentence", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);
    expect(screen.getByRole("link", { name: FRESHEST }).textContent).toBe("Нові");
    expect(screen.getByRole("link", { name: LONGEST }).textContent).toBe("Зачекались");
  });

  it("both links navigate with the same filters, only the sort changing", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);
    expect(screen.getByRole("link", { name: FRESHEST }).getAttribute("href")).toBe("/tvaryny");
    expect(screen.getByRole("link", { name: LONGEST }).getAttribute("href")).toBe(
      "/tvaryny?sort=longest_waiting",
    );
  });

  it("the decorative track leads to the sort that is not active and is out of the tab order", () => {
    const { container } = render(
      <GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />,
    );
    const track = container.querySelector("a[aria-hidden='true']");
    expect(track?.getAttribute("tabindex")).toBe("-1");
    expect(track?.getAttribute("href")).toBe("/tvaryny?sort=longest_waiting");
  });
});
