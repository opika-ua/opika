import { NO_FILTERS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryFilterDropdowns } from "./GalleryFilterDropdowns";

const BROVARY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never;
const CITIES = [
  { id: BROVARY_ID, name: "Бровари" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never, name: "Ірпінь" },
];
const CITY_SLUGS = new Map([
  ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never, "brovary" as never],
  ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as never, "irpin" as never],
]);

describe("GalleryFilterDropdowns", () => {
  it("renders exactly three dropdown triggers — city, age, size, never a fourth 'sex' one", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("shows the group name as a muted placeholder when nothing is selected", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    const cityButton = screen.getByLabelText(`${uk.filters.city}: ${uk.filters.city}`);
    expect(cityButton.textContent).toContain(uk.filters.city);
    expect(cityButton.className).toContain("text-brand-muted");
  });

  it("shows the selected value's own label, not the placeholder, once set", () => {
    render(
      <GalleryFilterDropdowns
        filters={{ ...NO_FILTERS, cities: { kind: "oneOf", values: [BROVARY_ID] } }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    const cityButton = screen.getByLabelText(`${uk.filters.city}: Бровари`);
    expect(cityButton.textContent).toBe("Бровари");
    expect(cityButton.className).toContain("text-brand-ink");
  });

  it("options are hidden until the trigger is clicked, then appear as real full-width links", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    expect(screen.queryByRole("link", { name: "Бровари" })).toBeNull();

    fireEvent.click(screen.getByLabelText(`${uk.filters.city}: ${uk.filters.city}`));
    const option = screen.getByRole("link", { name: "Бровари" });
    expect(option).toBeTruthy();
    expect(option.className).toContain("w-full");
    expect(option.getAttribute("href")).toBe("/tvaryny?misto=brovary");
  });

  it("clicking outside the open dropdown closes it", () => {
    render(
      <div>
        <GalleryFilterDropdowns
          filters={NO_FILTERS}
          sort="freshest"
          cities={CITIES}
          citySlugs={CITY_SLUGS}
        />
        <div data-testid="outside">outside</div>
      </div>,
    );

    fireEvent.click(screen.getByLabelText(`${uk.filters.city}: ${uk.filters.city}`));
    expect(screen.getByRole("link", { name: "Бровари" })).toBeTruthy();

    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("link", { name: "Бровари" })).toBeNull();
  });

  it("pressing Escape closes the open dropdown and returns focus to its trigger", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );

    const trigger = screen.getByLabelText(`${uk.filters.city}: ${uk.filters.city}`);
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: "Бровари" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link", { name: "Бровари" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("the trigger's accessible name includes the visible selected value (WCAG 2.5.3)", () => {
    render(
      <GalleryFilterDropdowns
        filters={{ ...NO_FILTERS, cities: { kind: "oneOf", values: [BROVARY_ID] } }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    const cityButton = screen.getByRole("button", { name: `${uk.filters.city}: Бровари` });
    expect(cityButton.textContent).toContain("Бровари");
  });

  /**
   * Oleksii, mid-build, verbatim: "replacing chevron icon with X to clear
   * all filters [in] 1 click... if multiple filters are chosen its hard
   * to reset all of them because it requires tons of clicks." One click
   * on the ✕ drops the whole dimension back to `ANY`, not just the last
   * toggled value.
   */
  it("shows a clear-all ✕ once a value is set, which resets the whole dimension in one click", () => {
    render(
      <GalleryFilterDropdowns
        filters={{ ...NO_FILTERS, cities: { kind: "oneOf", values: [BROVARY_ID] } }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    const clearButtons = screen.getAllByTestId("dropdown-clear");
    expect(clearButtons).toHaveLength(1);
    expect(clearButtons[0]?.getAttribute("href")).toBe("/tvaryny");
  });

  it("shows no clear-all ✕ while a dimension is unconstrained", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    expect(screen.queryByTestId("dropdown-clear")).toBeNull();
  });

  it("marks the selected option with aria-current", () => {
    render(
      <GalleryFilterDropdowns
        filters={{ ...NO_FILTERS, ages: { kind: "oneOf", values: ["young"] } }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    fireEvent.click(screen.getByLabelText(`${uk.filters.age}: ${uk.filters.ageYoung}`));
    const option = screen.getByRole("link", { name: /Молодий/ });
    expect(option.getAttribute("aria-current")).toBe("true");
  });
});
