import { ukPublic as uk } from "@opika/i18n/public";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayHopContext } from "../animal-overlay/overlay-hop";
import { AnimalDetailContent } from "./AnimalDetailScreen";
import type { SameShelterAnimals } from "./animal-page-load";
import { CITY_LABEL, makeDetailAnimal, makeDetailShelter, makeSiblingCard } from "./test-fixtures";

// The contact reveal reaches for the browser API client; it is not what this file is about.
vi.mock("./RevealFlow", () => ({ RevealFlow: () => null }));

afterEach(cleanup);

const cityNames = new Map([[CITY_LABEL.id, "Бровари"]]);

function renderContent(
  sameShelter: SameShelterAnimals | null,
  wrap: (content: ReactNode) => ReactNode = (content) => content,
) {
  render(
    wrap(
      <AnimalDetailContent
        animal={makeDetailAnimal()}
        shelter={makeDetailShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
        sameShelter={sameShelter}
      />,
    ),
  );
}

function firstBlockLink() {
  const section = screen.getByRole("region", { name: uk.sameShelter.heading });
  const link = within(section).getAllByRole("link")[0];
  if (!link) throw new Error("the block has no link");
  return link;
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

  // The harness proves the Link's own soft navigation never runs here; happy-dom can't show it.
  it("on the full page, a click is left to the browser: not prevented", () => {
    renderContent({ cards: [makeSiblingCard(1)], cityNames });

    expect(fireEvent.click(firstBlockLink()), "the browser follows the href itself").toBe(true);
  });

  it("inside the overlay, a click swaps the animal through the overlay's hop", () => {
    const hop = vi.fn();
    const card = makeSiblingCard(1);
    renderContent({ cards: [card], cityNames }, (content) => (
      <OverlayHopContext value={hop}>{content}</OverlayHopContext>
    ));

    const notPrevented = fireEvent.click(firstBlockLink());

    expect(notPrevented, "no document navigation").toBe(false);
    expect(hop).toHaveBeenCalledExactlyOnceWith(`/tvaryny/${card.id}`);
  });

  it("a modified click (new tab) is left to the browser, even inside the overlay", () => {
    const hop = vi.fn();
    renderContent({ cards: [makeSiblingCard(1)], cityNames }, (content) => (
      <OverlayHopContext value={hop}>{content}</OverlayHopContext>
    ));

    fireEvent.click(firstBlockLink(), { ctrlKey: true });

    expect(hop).not.toHaveBeenCalled();
  });
});
