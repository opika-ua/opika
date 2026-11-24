import { DEFAULT_FRESHNESS_POLICY, NO_FILTERS } from "@opika/domain";
import { uk } from "@opika/i18n";
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

  it("never offers a removal that would add nothing", () => {
    render(
      <NoMatch
        filters={{ ...filters, species: { kind: "oneOf", values: ["dog"] } }}
        sort="freshest"
        citySlugs={slugs}
        relaxations={[
          { dimension: "regions", additional: 12 },
          { dimension: "species", additional: 0 },
        ]}
      />,
    );
    expect(screen.getAllByTestId("no-match-suggestion")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Показати всі області (+12 тварин)" })).toBeTruthy();
    expect(screen.queryByText(/\+0/)).toBeNull();
    expect(screen.queryByTestId("no-match-reset")).toBeNull();
  });

  it("with only zero-gain removals: no suggestion, no explainer, and «Скинути» to every filter off", () => {
    render(
      <NoMatch
        filters={{ ...filters, species: { kind: "oneOf", values: ["dog"] } }}
        sort="longest_waiting"
        citySlugs={slugs}
        relaxations={[
          { dimension: "regions", additional: 0 },
          { dimension: "species", additional: 0 },
        ]}
      />,
    );
    expect(screen.queryByTestId("no-match-suggestion")).toBeNull();
    expect(screen.queryByText(/\+0/)).toBeNull();
    expect(screen.getByTestId("gallery-no-match")).toBeTruthy();
    const reset = screen.getByRole("link", { name: "Скинути" });
    expect(reset.getAttribute("href")).toBe("/tvaryny?sort=longest_waiting");
  });

  it("keeps «Скинути» on a shelter page's own path", () => {
    render(
      <NoMatch
        filters={{ ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } }}
        sort="freshest"
        citySlugs={slugs}
        relaxations={[{ dimension: "species", additional: 0 }]}
        basePath="/prytulky/abc"
      />,
    );
    expect(screen.getByRole("link", { name: "Скинути" }).getAttribute("href")).toBe(
      "/prytulky/abc",
    );
  });
});

describe("NoMatch: an empty registry versus filters that exclude everything", () => {
  const slugs = new Map<never, string>();

  it("with no filter set says the registry is empty and offers no reset", () => {
    render(<NoMatch filters={NO_FILTERS} sort="freshest" citySlugs={slugs} relaxations={[]} />);
    expect(screen.getByRole("heading", { name: "Тут поки немає тварин." })).toBeTruthy();
    expect(
      screen.getByText("Притулки тільки починають додавати картки. Зазирніть трохи згодом."),
    ).toBeTruthy();
    expect(screen.queryByText("Це не помилка пошуку.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Скинути" })).toBeNull();
  });

  it("with a filter set keeps the filter wording and the reset, whatever the registry holds", () => {
    render(
      <NoMatch
        filters={{ ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } }}
        sort="freshest"
        citySlugs={slugs}
        relaxations={[]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Під ці фільтри зараз нікого немає." }),
    ).toBeTruthy();
    expect(screen.getByText("Це не помилка пошуку.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Скинути" })).toBeTruthy();
  });
});

/** Owner-approved copy (2026-11-24), transcribed from his message, not read from the catalogue. */
const FRESH_ONLY_HEADING = "Зараз немає карток, оновлених за останні 30 днів.";
const FRESH_ONLY_LINE = "Перемкніть на «Нові», щоб побачити всіх.";

describe("NoMatch: an empty «Зачекались» with no filter", () => {
  it("on the gallery says no card is fresh and points to «Нові», with no reset that changes nothing", () => {
    render(
      <NoMatch
        filters={NO_FILTERS}
        sort="longest_waiting"
        citySlugs={new Map()}
        relaxations={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: FRESH_ONLY_HEADING })).toBeTruthy();
    expect(screen.getByText(FRESH_ONLY_LINE)).toBeTruthy();
    expect(screen.queryByText("Під ці фільтри зараз нікого немає.")).toBeNull();
    expect(screen.queryByText("Тут поки немає тварин.")).toBeNull();
    expect(screen.queryByTestId("no-match-reset")).toBeNull();
  });

  it("on a shelter page says the same", () => {
    render(
      <NoMatch
        filters={NO_FILTERS}
        sort="longest_waiting"
        citySlugs={new Map()}
        relaxations={[]}
        basePath="/prytulky/abc"
      />,
    );
    expect(screen.getByRole("heading", { name: FRESH_ONLY_HEADING })).toBeTruthy();
    expect(screen.getByText(FRESH_ONLY_LINE)).toBeTruthy();
  });

  it("names «Нові» exactly as the sort toggle labels it", () => {
    expect(FRESH_ONLY_LINE).toContain(`«${uk.filters.sortFreshestShort}»`);
  });

  // This line, /prytulkam §3 and the kabinet order note all say 30 days: a new bound needs new copy.
  it("says 30 days because a card turns stale after 30", () => {
    expect(DEFAULT_FRESHNESS_POLICY.agingMaxDays).toBe(30);
    for (const text of [
      uk.noMatch.freshOnlyHeading,
      uk.forShelters.whatHappensToAnimals,
      uk.kabinet.animalList.orderNote,
    ]) {
      expect(text).toContain("оновлених за останні 30 днів");
    }
  });

  it("with a filter set keeps «Під ці фільтри…» and the reset", () => {
    render(
      <NoMatch
        filters={{ ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } }}
        sort="longest_waiting"
        citySlugs={new Map()}
        relaxations={[]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Під ці фільтри зараз нікого немає." }),
    ).toBeTruthy();
    expect(screen.getByText("Це не помилка пошуку.")).toBeTruthy();
    expect(screen.queryByText(FRESH_ONLY_HEADING)).toBeNull();
    expect(screen.getByRole("link", { name: "Скинути" })).toBeTruthy();
  });

  it("under the freshest sort the same empty page is the empty registry", () => {
    render(<NoMatch filters={NO_FILTERS} sort="freshest" citySlugs={new Map()} relaxations={[]} />);
    expect(screen.getByRole("heading", { name: "Тут поки немає тварин." })).toBeTruthy();
  });
});
