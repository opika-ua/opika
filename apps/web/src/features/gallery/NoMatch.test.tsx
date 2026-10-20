import type { FeedFilters } from "@opika/domain";
import { NO_FILTERS } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoMatch } from "./NoMatch";

/**
 * Fur (DR1, S2) is a filter dimension before it has Ukrainian: its suggestion
 * can't arise from the gallery's URL yet, and if one ever reaches this
 * component it is left out rather than shown with an invented or
 * `[COPY PENDING]` label on a public page.
 */
describe("NoMatch and a dimension with no label yet", () => {
  const filters: FeedFilters = {
    ...NO_FILTERS,
    sizes: { kind: "oneOf", values: ["small"] },
    coatLengths: { kind: "oneOf", values: ["long"] },
  };

  it("offers only the labelled suggestion, even when the unlabelled one would yield more", () => {
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
    expect(links.map((link) => link.textContent)).toEqual(["Прибрати «розмір» (+3 тварини)"]);
    expect(document.body.textContent).not.toContain("COPY PENDING");
  });

  it("shows no suggestion block at all when the only relaxation is unlabelled", () => {
    render(
      <NoMatch
        filters={filters}
        sort="freshest"
        citySlugs={new Map()}
        relaxations={[{ dimension: "coatLengths", additional: 7 }]}
      />,
    );
    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
