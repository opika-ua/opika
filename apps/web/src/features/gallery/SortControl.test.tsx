import { NO_FILTERS } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CitySlugsById } from "./filter-url";
import { SortControl } from "./SortControl";

const CITY_SLUGS: CitySlugsById = new Map();

describe("SortControl", () => {
  it("marks the current sort as current and the other one not", () => {
    render(<SortControl filters={NO_FILTERS} sort="freshest" citySlugs={CITY_SLUGS} />);
    expect(
      screen.getByRole("link", { name: "Спочатку найсвіжіші картки" }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "Найдовше чекають" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("the non-default option's href carries the sort param, the default one's does not", () => {
    render(<SortControl filters={NO_FILTERS} sort="freshest" citySlugs={CITY_SLUGS} />);
    expect(
      screen.getByRole("link", { name: "Спочатку найсвіжіші картки" }).getAttribute("href"),
    ).toBe("/tvaryny");
    expect(screen.getByRole("link", { name: "Найдовше чекають" }).getAttribute("href")).toBe(
      "/tvaryny?sort=longest_waiting",
    );
  });

  it("preserves existing filters in both hrefs", () => {
    const filters = {
      ...NO_FILTERS,
      species: { kind: "oneOf" as const, values: ["dog"] as const },
    };
    render(<SortControl filters={filters} sort="freshest" citySlugs={CITY_SLUGS} />);
    expect(screen.getByRole("link", { name: "Найдовше чекають" }).getAttribute("href")).toBe(
      "/tvaryny?vyd=dog&sort=longest_waiting",
    );
  });
});
