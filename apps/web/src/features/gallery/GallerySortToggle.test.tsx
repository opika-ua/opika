import { NO_FILTERS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GallerySortToggle } from "./GallerySortToggle";

describe("GallerySortToggle", () => {
  it("renders both sorts as real links with their own visible short labels", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);

    expect(screen.getByText("Нові")).toBeTruthy();
    expect(screen.getByText("Зачекались")).toBeTruthy();
  });

  it("marks the active sort with aria-current", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="longest_waiting" citySlugs={new Map()} />);

    expect(screen.getByTestId("sort-freshest").getAttribute("aria-current")).toBeNull();
    expect(screen.getByTestId("sort-longest-waiting").getAttribute("aria-current")).toBe("true");
  });

  /**
   * The exact regression `docs/standing-constraints.md` already records:
   * an aria-label that doesn't contain the visible text is a WCAG 2.5.3
   * accessible-name mismatch. Both links here have visible text, so their
   * aria-label must contain it verbatim.
   */
  it("each link's accessible name contains its own visible text verbatim (WCAG 2.5.3)", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);

    const freshest = screen.getByTestId("sort-freshest");
    expect(freshest.getAttribute("aria-label")).toContain(freshest.textContent);

    const longestWaiting = screen.getByTestId("sort-longest-waiting");
    expect(longestWaiting.getAttribute("aria-label")).toContain(longestWaiting.textContent);
  });

  it("still carries the long sentence in the accessible name, for context", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);

    expect(screen.getByTestId("sort-freshest").getAttribute("aria-label")).toContain(
      uk.filters.sortFreshest,
    );
  });

  it("the track is a real, clickable link, excluded from Tab order and the accessible tree", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);
    const track = screen.getByTestId("sort-track");
    expect(track.tagName).toBe("A");
    expect(track.getAttribute("aria-hidden")).toBe("true");
    expect(track.getAttribute("tabindex")).toBe("-1");
  });

  it("clicking the track leads to whichever sort isn't active right now", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);
    expect(screen.getByTestId("sort-track").getAttribute("href")).toBe(
      "/tvaryny?sort=longest_waiting",
    );

    render(<GallerySortToggle filters={NO_FILTERS} sort="longest_waiting" citySlugs={new Map()} />);
    expect(screen.getAllByTestId("sort-track").at(-1)?.getAttribute("href")).toBe("/tvaryny");
  });

  it("both links navigate with the same filters, only the sort changing", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);

    expect(screen.getByTestId("sort-freshest").getAttribute("href")).toBe("/tvaryny");
    expect(screen.getByTestId("sort-longest-waiting").getAttribute("href")).toBe(
      "/tvaryny?sort=longest_waiting",
    );
  });
});
