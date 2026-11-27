import { ukPublic as uk } from "@opika/i18n/public";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalDetailContent } from "./AnimalDetailScreen";
import type { SameShelterAnimals } from "./animal-page-load";
import { CITY_LABEL, makeDetailAnimal, makeDetailShelter, makeSiblingCard } from "./test-fixtures";

// The contact reveal reaches for the browser API client; it is not what this file is about.
vi.mock("./RevealFlow", () => ({ RevealFlow: () => null }));

afterEach(cleanup);

const cityNames = new Map([[CITY_LABEL.id, "Бровари"]]);

function renderContent(sameShelter: SameShelterAnimals | null) {
  render(
    <AnimalDetailContent
      animal={makeDetailAnimal()}
      shelter={makeDetailShelter()}
      cityName="Бровари"
      cityPlace="м. Бровари"
      sameShelter={sameShelter}
    />,
  );
}

describe("the same shelter's other animals on the animal page", () => {
  it("is a named section of links, one per animal, to each animal's own page", () => {
    const cards = [makeSiblingCard(1), makeSiblingCard(2)];
    renderContent({ cards, cityNames });

    const section = screen.getByRole("region", { name: uk.sameShelter.heading });
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe(
      "Ще тварини цього притулку",
    );
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      cards.map((card) => `/tvaryny/${card.id}`),
    );
    expect(links[0]?.textContent).toContain("Сусід 1");
  });

  it("shows no section and no heading when there are none", () => {
    renderContent(null);
    expect(screen.queryByRole("region", { name: uk.sameShelter.heading })).toBeNull();
    expect(screen.queryByText(uk.sameShelter.heading)).toBeNull();
  });
});
