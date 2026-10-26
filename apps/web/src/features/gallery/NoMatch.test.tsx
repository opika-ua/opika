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

/**
 * Pet card PR 1b: temperament and colour take fur's pattern, a sentence of
 * their own. Expected text is his approved copy (inbox PC1b-C1), typed out
 * here.
 */
describe("NoMatch: the temperament and colour suggestions", () => {
  const filters: FeedFilters = {
    ...NO_FILTERS,
    species: { kind: "oneOf", values: ["cat"] },
    temperaments: { kind: "oneOf", values: ["playful"] },
    colours: { kind: "oneOf", values: ["cream"] },
  };

  it("names each one's count in its own sentence, in the contract's order", () => {
    render(
      <NoMatch
        filters={filters}
        sort="freshest"
        citySlugs={new Map()}
        relaxations={[
          { dimension: "colours", additional: 12 },
          { dimension: "temperaments", additional: 5 },
          { dimension: "species", additional: 1 },
        ]}
      />,
    );
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Будь-яке забарвлення: +12",
      "Будь-який характер: +5",
      "Прибрати «вид» (+1 тварина)",
    ]);
  });

  it("each links to the same filters with only its own dimension dropped", () => {
    render(
      <NoMatch
        filters={filters}
        sort="longest_waiting"
        citySlugs={new Map()}
        relaxations={[
          { dimension: "temperaments", additional: 5 },
          { dimension: "colours", additional: 12 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Будь-який характер: +5" }).getAttribute("href")).toBe(
      "/tvaryny?vyd=cat&zabarvlennia=cream&sort=longest_waiting",
    );
    expect(
      screen.getByRole("link", { name: "Будь-яке забарвлення: +12" }).getAttribute("href"),
    ).toBe("/tvaryny?vyd=cat&kharakter=playful&sort=longest_waiting");
  });
});
