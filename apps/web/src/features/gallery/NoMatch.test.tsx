import type { FeedFilters } from "@opika/domain";
import { NO_FILTERS } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoMatch } from "./NoMatch";

/**
 * Fur (DR1, S3) has its own suggestion sentence, his «Будь-яка шерсть:
 * +{count}», not the «Прибрати «…»» template the other dimensions share.
 * Expected text is his literal copy, not the catalogue constant.
 */
describe("NoMatch: the fur suggestion", () => {
  const filters: FeedFilters = {
    ...NO_FILTERS,
    sizes: { kind: "oneOf", values: ["small"] },
    coatLengths: { kind: "oneOf", values: ["long"] },
  };

  it("names how many more animals dropping the fur filter shows, in the contract's order", () => {
    render(
      <NoMatch
        filters={filters}
        sort="freshest"
        citySlugs={new Map()}
        relaxations={[
          { dimension: "coatLengths", additional: 7 },
          { dimension: "sizes", additional: 3 },
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Будь-яка шерсть: +7",
      "Прибрати «розмір» (+3 тварини)",
    ]);
    expect(document.body.textContent).not.toContain("COPY PENDING");
  });

  it("links to the same filters with fur dropped and nothing else changed", () => {
    render(
      <NoMatch
        filters={filters}
        sort="freshest"
        citySlugs={new Map()}
        relaxations={[{ dimension: "coatLengths", additional: 7 }]}
      />,
    );
    expect(screen.getByRole("link", { name: "Будь-яка шерсть: +7" }).getAttribute("href")).toBe(
      "/tvaryny?rozmir=small",
    );
  });
});
