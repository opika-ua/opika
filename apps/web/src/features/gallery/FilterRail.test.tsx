import { type CityId, CityIdSchema, NO_FILTERS } from "@opika/domain";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterRail } from "./FilterRail";

const BROVARY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const KYIV = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const CITIES: ReadonlyArray<{ id: CityId; name: string }> = [
  { id: BROVARY, name: "Бровари" },
  { id: KYIV, name: "Київ" },
];

describe("FilterRail", () => {
  it("shows 'Уся Київщина' active and no other chip active when nothing is filtered", () => {
    render(<FilterRail filters={NO_FILTERS} sort="freshest" cities={CITIES} resultCount={34} shelterCount={7} />);
    const rail = within(screen.getByTestId("filter-rail"));

    // This is the regression test for the bug a real run caught: reusing
    // matchesSelection (which treats "any" as matching everything) here
    // would render every species/size/age chip active too.
    expect(rail.getByRole("link", { name: /Уся Київщина/ }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(rail.getByRole("link", { name: "Собаки" }).getAttribute("aria-current")).toBeNull();
    expect(rail.getByRole("link", { name: "Коти" }).getAttribute("aria-current")).toBeNull();
    expect(rail.getByRole("link", { name: "Малий" }).getAttribute("aria-current")).toBeNull();
    expect(rail.getByRole("link", { name: "Малюк" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks only the explicitly-selected species chip active", () => {
    const filters = {
      ...NO_FILTERS,
      species: { kind: "oneOf" as const, values: ["dog"] as const },
    };
    render(<FilterRail filters={filters} sort="freshest" cities={CITIES} resultCount={34} shelterCount={7} />);
    const rail = within(screen.getByTestId("filter-rail"));

    // The active chip's accessible name gains a "✓ " prefix, so an exact
    // "Собаки" match would (correctly) fail for the active chip — /Собаки/
    // matches either state, and aria-current is the actual assertion.
    expect(rail.getByRole("link", { name: /Собаки/ }).getAttribute("aria-current")).toBe("true");
    expect(rail.getByRole("link", { name: "Коти" }).getAttribute("aria-current")).toBeNull();
  });

  it("a city chip's href toggles that city into the filter set", () => {
    render(<FilterRail filters={NO_FILTERS} sort="freshest" cities={CITIES} resultCount={34} shelterCount={7} />);
    const rail = within(screen.getByTestId("filter-rail"));

    const href = rail.getByRole("link", { name: "Бровари" }).getAttribute("href");
    expect(href).toBe(`/tvaryny?misto=${BROVARY}`);
  });

  it("Скинути links to the bare route when no sort override is set", () => {
    render(<FilterRail filters={NO_FILTERS} sort="freshest" cities={CITIES} resultCount={34} shelterCount={7} />);
    expect(screen.getByRole("link", { name: "Скинути" }).getAttribute("href")).toBe("/tvaryny");
  });

  it("closes with the sheet's own result-count sentence and the freshness-filter footnote", () => {
    render(
      <FilterRail
        filters={NO_FILTERS}
        sort="freshest"
        cities={CITIES}
        resultCount={34}
        shelterCount={7}
      />,
    );
    const rail = within(screen.getByTestId("filter-rail"));
    expect(rail.getByText("Підходить 34 тварини у 7 притулках.")).toBeTruthy();
    expect(
      rail.getByText(/Немає фільтра «тільки свіжі картки»/),
    ).toBeTruthy();
  });

  it("Скинути preserves the current sort", () => {
    render(<FilterRail filters={NO_FILTERS} sort="longest_waiting" cities={CITIES} resultCount={34} shelterCount={7} />);
    expect(screen.getByRole("link", { name: "Скинути" }).getAttribute("href")).toBe(
      "/tvaryny?sort=longest_waiting",
    );
  });
});
