import { type CityId, CityIdSchema, NO_FILTERS } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FirstRunBand } from "./FirstRunBand";

const BROVARY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const KYIV = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
const CITIES: ReadonlyArray<{ id: CityId; name: string }> = [
  { id: BROVARY, name: "Бровари" },
  { id: KYIV, name: "Київ" },
];

describe("FirstRunBand", () => {
  it("renders the promise, the disclaimer, and every city as a real link when no city is chosen", () => {
    render(<FirstRunBand filters={NO_FILTERS} sort="freshest" cities={CITIES} />);

    expect(
      screen.getByText(
        "Тварини з перевірених притулків Київщини. Перегляньте список і подивіться, кого шукає дім.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Без реєстрації. Ми не беремо і не переказуємо грошей. «Не зараз» — це просто фільтр, а не оцінка тварини.",
      ),
    ).toBeTruthy();

    const brovaryLink = screen.getByRole("link", { name: "Бровари" });
    expect(brovaryLink.getAttribute("href")).toBe(`/tvaryny?misto=${BROVARY}`);
    const kyivLink = screen.getByRole("link", { name: "Київ" });
    expect(kyivLink.getAttribute("href")).toBe(`/tvaryny?misto=${KYIV}`);
  });

  it("is gone once a city is chosen — the design's own condition, not an extra dismiss control", () => {
    const { container } = render(
      <FirstRunBand
        filters={{ ...NO_FILTERS, cities: { kind: "oneOf", values: [BROVARY] } }}
        sort="freshest"
        cities={CITIES}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("still shows when other filter dimensions are set but no city is — the condition is city-specific", () => {
    render(
      <FirstRunBand
        filters={{ ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } }}
        sort="freshest"
        cities={CITIES}
      />,
    );
    // Species-only filtering leaves `cities` at "any", so the band still
    // renders — this is what makes the condition "gone once a city is
    // chosen" rather than "gone once any filter is set."
    expect(screen.getByText(/Тварини з перевірених притулків/)).toBeTruthy();
  });
});
