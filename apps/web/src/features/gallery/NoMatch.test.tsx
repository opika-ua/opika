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
