import type { FilterSelection } from "@opika/domain";
import { type CityId, CityIdSchema, NO_FILTERS } from "@opika/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CityFacetChoices } from "./CityFacetChoices";
import type { FacetOption } from "./facet-options";

/** Fifteen cities, "Місто 01" first (most animals), so the order is fixed. */
const nth = (n: number) =>
  CityIdSchema.parse(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const OPTIONS: FacetOption<CityId>[] = Array.from({ length: 15 }, (_, i) => ({
  value: nth(i + 1),
  label: `Місто ${String(i + 1).padStart(2, "0")}`,
  count: 20 - i,
}));

function renderChoices(options = OPTIONS, selection: FilterSelection<CityId> = NO_FILTERS.cities) {
  render(
    <CityFacetChoices
      idPrefix="t"
      options={options}
      selection={selection}
      renderOption={(option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selection.kind === "oneOf" && selection.values.includes(option.value)}
        >
          {option.label}
        </button>
      )}
    />,
  );
}

const names = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((text) => text !== null && !text.startsWith("Показати всі"));

/** The no-JS fallback of the filter sheet and the only user of this windowed list now. */
describe("the windowed city list", () => {
  it("shows the first twelve, a «Показати всі (15)» button and a labelled field", () => {
    renderChoices();
    expect(names()).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Показати всі (15)" })).toBeTruthy();
    expect(screen.getByLabelText("Знайти місто")).toBeTruthy();
  });

  it("«Показати всі» draws every city and goes away", () => {
    renderChoices();
    fireEvent.click(screen.getByRole("button", { name: "Показати всі (15)" }));
    expect(names()).toHaveLength(15);
    expect(screen.queryByRole("button", { name: /Показати всі/ })).toBeNull();
  });

  it("the field narrows the whole list locally and announces the number found", () => {
    renderChoices();
    fireEvent.change(screen.getByLabelText("Знайти місто"), { target: { value: "місто 1" } });
    expect(names()).toEqual([
      "Місто 10",
      "Місто 11",
      "Місто 12",
      "Місто 13",
      "Місто 14",
      "Місто 15",
    ]);
    expect(screen.getByRole("status").textContent).toBe("Знайдено: 6");
  });

  it("says so when nothing matches", () => {
    renderChoices();
    fireEvent.change(screen.getByLabelText("Знайти місто"), { target: { value: "zzz" } });
    expect(screen.getByText("Нічого не знайдено")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Знайдено: 0");
  });

  it("keeps a chosen city past the twelfth visible while collapsed and while filtering", () => {
    const chosen = nth(15);
    renderChoices(OPTIONS, { kind: "oneOf", values: [chosen] });
    const pressed = () =>
      screen.getByRole("button", { name: "Місто 15" }).getAttribute("aria-pressed");
    expect(pressed()).toBe("true");
    fireEvent.change(screen.getByLabelText("Знайти місто"), { target: { value: "01" } });
    expect(pressed()).toBe("true");
  });

  it("has neither field nor button when the list fits in twelve", () => {
    renderChoices(OPTIONS.slice(0, 12));
    expect(names()).toHaveLength(12);
    expect(screen.queryByLabelText("Знайти місто")).toBeNull();
    expect(screen.queryByRole("button", { name: /Показати всі/ })).toBeNull();
  });

  it("Enter in the field does not submit a surrounding form", () => {
    renderChoices();
    expect(fireEvent.keyDown(screen.getByLabelText("Знайти місто"), { key: "Enter" })).toBe(false);
  });
});
