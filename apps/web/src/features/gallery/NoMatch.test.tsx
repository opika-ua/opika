import { NO_FILTERS } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoMatch } from "./NoMatch";

/**
 * Every dimension is a closed universe over a never-null field (gallery
 * filter restructure removed fur, temperament and colour - the three that
 * used to need a sentence of their own), so the generic «Прибрати «…»»
 * template covers all of them, species/size/age/sex alike.
 */
describe("NoMatch: the sex suggestion", () => {
  it("uses the generic 'Прибрати' template, not a sentence of its own", () => {
    render(
      <NoMatch
        filters={{ ...NO_FILTERS, sizes: { kind: "oneOf", values: ["small"] } }}
        sort="freshest"
        citySlugs={new Map()}
        relaxations={[{ dimension: "sexes", additional: 3 }]}
      />,
    );
    expect(screen.getByRole("link", { name: "Прибрати «стать» (+3 тварини)" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Прибрати «стать» (+3 тварини)" }).getAttribute("href"),
    ).toBe("/tvaryny?rozmir=small");
  });
});

describe("NoMatch: an empty oblast", () => {
  const LVIV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as never;
  const KYIV = "814661e1-67de-532e-a38e-2216d8b521ff" as never;
  const slugs = new Map<never, string>([
    [LVIV, "lvivska"],
    [KYIV, "kyivska"],
  ]);
  const filters = { ...NO_FILTERS, regions: { kind: "oneOf", values: [LVIV] } } as const;

  it("says the oblast holds no animals only when the page says so", () => {
    const { rerender } = render(
      <NoMatch filters={filters} sort="freshest" citySlugs={slugs} relaxations={[]} />,
    );
    expect(screen.queryByText("У вибраних областях поки немає тварин.")).toBeNull();

    rerender(
      <NoMatch filters={filters} sort="freshest" citySlugs={slugs} relaxations={[]} regionEmpty />,
    );
    expect(screen.getByText("У вибраних областях поки немає тварин.")).toBeTruthy();
  });

  it("offers each next-door oblast with the animals it would show, replacing the chosen one", () => {
    render(
      <NoMatch
        filters={{ ...filters, species: { kind: "oneOf", values: ["dog"] } }}
        sort="freshest"
        citySlugs={slugs}
        relaxations={[]}
        neighbourRegions={[{ id: KYIV, label: "Київська", count: 5 }]}
      />,
    );
    const link = screen.getByRole("link", { name: "Сусідня область: Київська (+5 тварин)" });
    expect(link.getAttribute("href")).toBe("/tvaryny?obl=kyivska&vyd=dog");
  });

  it("names the oblast relaxation like the city one", () => {
    render(
      <NoMatch
        filters={filters}
        sort="freshest"
        citySlugs={slugs}
        relaxations={[{ dimension: "regions", additional: 12 }]}
      />,
    );
    const link = screen.getByRole("link", { name: "Показати всі області (+12 тварин)" });
    expect(link.getAttribute("href")).toBe("/tvaryny");
  });
});
