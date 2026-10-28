import { NO_FILTERS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GallerySortToggle } from "./GallerySortToggle";

describe("GallerySortToggle", () => {
  it("shows the current sort's short label on the trigger, never a placeholder", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);
    const trigger = screen.getByRole("button", { name: `${uk.filters.sortLabel}: Нові` });
    expect(trigger.textContent).toBe("Нові");
    // Always the "active" ink colour, never the muted placeholder one -
    // sort always carries a real value, unlike a filter dropdown's "any".
    expect(trigger.className).toContain("text-brand-ink");
    expect(trigger.className).not.toContain("text-brand-muted");
  });

  it("has no clear ✕ - there is nothing to clear a sort back to", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} />);
    expect(screen.queryByTestId("dropdown-clear")).toBeNull();
  });

  it("opens to both sorts as real links, the current one marked aria-current", () => {
    render(<GallerySortToggle filters={NO_FILTERS} sort="longest_waiting" citySlugs={new Map()} />);
    fireEvent.click(screen.getByRole("button", { name: `${uk.filters.sortLabel}: Зачекались` }));

    // RegExp, not the bare sentence: the active option's accessible name
    // also carries DropdownOption's own "✓ " prefix (every other dropdown's
    // selected option already does the same).
    const longestWaiting = screen.getByRole("link", {
      name: new RegExp(uk.filters.sortLongestWaiting),
    });
    const freshest = screen.getByRole("link", { name: new RegExp(uk.filters.sortFreshest) });
    expect(longestWaiting.getAttribute("aria-current")).toBe("true");
    expect(freshest.getAttribute("aria-current")).toBeNull();
  });

  it("each option navigates to its own sort, filters carried through unchanged", () => {
    render(
      <GallerySortToggle
        filters={{ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } }}
        sort="freshest"
        citySlugs={new Map()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: `${uk.filters.sortLabel}: Нові` }));

    expect(
      screen
        .getByRole("link", { name: new RegExp(uk.filters.sortLongestWaiting) })
        .getAttribute("href"),
    ).toBe("/tvaryny?rozmir=small&sort=longest_waiting");
    // freshest is the default sort, so galleryHref omits the param; it's
    // the active option here, so its name carries the "✓ " prefix too.
    expect(
      screen.getByRole("link", { name: new RegExp(uk.filters.sortFreshest) }).getAttribute("href"),
    ).toBe("/tvaryny?rozmir=small");
  });
});
