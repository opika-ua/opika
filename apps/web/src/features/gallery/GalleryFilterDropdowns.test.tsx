import { NO_FILTERS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("renders exactly four dropdown triggers - city, age, size, sex (gallery filter restructure)", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByLabelText(`${uk.filters.sex}: ${uk.filters.sex}`)).toBeTruthy();
  });

  it("renders the species toggle's three segments as links, not dropdown buttons", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    const toggle = screen.getByTestId("species-toggle");
    expect(toggle.tagName).toBe("FIELDSET");
    expect(screen.getByTestId("species-any")).toBeTruthy();
    expect(screen.getByTestId("species-dog")).toBeTruthy();
    expect(screen.getByTestId("species-cat")).toBeTruthy();
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

  /**
   * Tier 1 review finding (2881bc2): every key `relaxDimension` takes is a
   * `FeedFilterDimension`, so a dropdown's own ✕ silently clearing the
   * *wrong* dimension still type-checks - nothing catches it but a test
   * that sets two dimensions at once and checks each ✕ by its own href.
   */
  it("each dropdown's own ✕ clears only its own dimension, not another one active at the same time", () => {
    render(
      <GalleryFilterDropdowns
        filters={{
          ...NO_FILTERS,
          sizes: { kind: "oneOf", values: ["large"] },
          ages: { kind: "oneOf", values: ["young"] },
          sexes: { kind: "oneOf", values: ["male"] },
        }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );

    const sizeClear = screen.getByLabelText(
      uk.filters.clearDimension.replace("{dimension}", uk.filters.size),
    );
    expect(sizeClear.getAttribute("href")).toBe("/tvaryny?vik=young&stat=male");

    const ageClear = screen.getByLabelText(
      uk.filters.clearDimension.replace("{dimension}", uk.filters.age),
    );
    expect(ageClear.getAttribute("href")).toBe("/tvaryny?rozmir=large&stat=male");
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

  /**
   * The species toggle's own wiring (gallery filter restructure): exclusive
   * choice (selecting one species replaces, not adds to, any prior one),
   * tapping the active segment clears back to "any", and the inactive
   * segments are always present as real links regardless of filter state -
   * unlike a `Dropdown`, the toggle has no open/closed disclosure to drive.
   */
  it("the species toggle writes vyd=cat for the cat segment", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    const catOption = screen.getByTestId("species-cat");
    expect(catOption.getAttribute("href")).toBe("/tvaryny?vyd=cat");
    expect(catOption.getAttribute("aria-current")).toBeNull();
  });

  it("the species toggle marks the active segment aria-current and replaces it with the other, exclusively", () => {
    render(
      <GalleryFilterDropdowns
        filters={{ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    expect(screen.getByTestId("species-dog").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("species-any").getAttribute("aria-current")).toBeNull();
    // Selecting cat replaces dog - never both, unlike the dropdowns' own multi-select.
    expect(screen.getByTestId("species-cat").getAttribute("href")).toBe("/tvaryny?vyd=cat");
  });

  it("the species toggle's «Усі» segment clears the species filter entirely", () => {
    render(
      <GalleryFilterDropdowns
        filters={{ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    expect(screen.getByTestId("species-any").getAttribute("href")).toBe("/tvaryny");
  });

  it("the sex dropdown lists male, female and unrecorded, and «Дівчинка» writes stat=female", () => {
    render(
      <GalleryFilterDropdowns
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    fireEvent.click(screen.getByLabelText(`${uk.filters.sex}: ${uk.filters.sex}`));
    // Scoped to the sex dropdown's own open panel (an ARIA group named by
    // its legend) - the species toggle's own three links are always on the
    // page too, now that it's a toggle rather than a closed-by-default
    // dropdown, and would otherwise show up in a page-wide link query.
    const panel = screen.getByRole("group", { name: uk.filters.sex });
    expect(
      within(panel)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Хлопчик", "Дівчинка", "Не записано"]);
    expect(screen.getByRole("link", { name: "Дівчинка" }).getAttribute("href")).toBe(
      "/tvaryny?stat=female",
    );
  });

  it("an active sex selection shows its value on the trigger and clears with its own ✕", () => {
    render(
      <GalleryFilterDropdowns
        filters={{ ...NO_FILTERS, sexes: { kind: "oneOf", values: ["male"] } }}
        sort="freshest"
        cities={CITIES}
        citySlugs={CITY_SLUGS}
      />,
    );
    expect(screen.getByRole("button", { name: "Стать: Хлопчик" }).textContent).toBe("Хлопчик");
    expect(screen.getByLabelText("Скинути Стать").getAttribute("href")).toBe("/tvaryny");
  });
});
