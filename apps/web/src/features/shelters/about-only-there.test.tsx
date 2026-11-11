import type { AnimalDetailView, FeedCardView, ShelterSummaryView } from "@opika/contracts";
import { DEFAULT_GALLERY_SORT, NO_FILTERS } from "@opika/domain";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnimalDetailScreen } from "../animal-detail/AnimalDetailScreen";
import { makeDetailAnimal } from "../animal-detail/test-fixtures";
import { AnimalOverlay } from "../animal-overlay/AnimalOverlay";
import { GalleryCard } from "../gallery/GalleryCard";
import { WithMockRouter } from "../gallery/test-router";
import { ShelterPageScreen } from "./ShelterPageScreen";
import {
  DESCRIPTION,
  makeCardView,
  makeShelterPageShelter,
  makeShelterPageView,
} from "./test-fixtures";

vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: { session: { bootstrap: vi.fn() }, animals: { reveal: vi.fn() } },
}));

/**
 * Oleksii's DR1-Q1, verbatim: "«Слова притулку» only on the shelter page. What moves: the shelter's
 * words leave the deck and animal pages and show only on the shelter page. «Оновлено … тому» stays
 * on every card." Since the shelter description absorbed the sentence, those words are the
 * «Про притулок» text.
 *
 * Every surface an adopter meets an animal on is rendered for a shelter that HAS a text, handed the
 * text even where the view no longer carries it (a regressed handler or view would do exactly
 * that), and the rendered text is read: neither the text nor «Про притулок» may appear, and the day
 * count must. The shelter page is the control: the same data shows both there. The heading is a
 * literal from the owner's approved string, never the catalogue constant.
 */
const ABOUT_HEADING = "Про притулок";
/** «Оновлено …» in whatever words the day count takes (its exact form is `freshnessLabel`'s, tested there). */
const DAY_COUNT = /Оновлено /;

/** A card summary as a regressed view would hand it: the text still on it. */
const summaryWithText = (summary: ShelterSummaryView): ShelterSummaryView => {
  const handed = { ...summary, description: { uk: DESCRIPTION, en: null } };
  return handed;
};

const card: FeedCardView = (() => {
  const base = makeCardView(1);
  return { ...base, shelter: summaryWithText(base.shelter) };
})();

const animal: AnimalDetailView = (() => {
  const base = makeDetailAnimal();
  return { ...base, shelter: summaryWithText(base.shelter) };
})();

function expectNoAbout(surface: string, root: HTMLElement) {
  const text = root.textContent ?? "";
  expect(text, `${surface} shows the shelter's text`).not.toContain(DESCRIPTION);
  expect(text, `${surface} shows «${ABOUT_HEADING}»`).not.toContain(ABOUT_HEADING);
}

describe("the shelter's text and «Про притулок» show only on the shelter page", () => {
  it("the animal page: neither, and its day count stays", () => {
    const { container } = render(
      <AnimalDetailScreen
        animal={animal}
        shelter={makeShelterPageShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    expectNoAbout("the animal page", container);
    expect(container.textContent).toMatch(DAY_COUNT);
  });

  it("the gallery's overlay of the animal page: neither", () => {
    render(
      <WithMockRouter>
        <AnimalOverlay
          label={animal.name}
          openerHref={`/tvaryny/${animal.id}`}
          neighbours={{ prev: null, next: null }}
        >
          <AnimalDetailScreen
            animal={animal}
            shelter={makeShelterPageShelter()}
            cityName="Бровари"
            cityPlace="м. Бровари"
          />
        </AnimalOverlay>
      </WithMockRouter>,
    );
    expectNoAbout("the overlay", document.body);
    expect(document.body.textContent).toMatch(DAY_COUNT);
  });

  it("the gallery card: neither", () => {
    const { container } = render(
      <GalleryCard
        card={card}
        cityName="Бровари"
        filters={NO_FILTERS}
        sort={DEFAULT_GALLERY_SORT}
        citySlugs={new Map()}
      />,
    );
    expectNoAbout("the gallery card", container);
  });

  it("the shelter page (the control): both, from the same shelter", () => {
    const { container } = render(<ShelterPageScreen {...makeShelterPageView()} />);
    expect(container.textContent).toContain(DESCRIPTION);
    expect(container.textContent).toContain(ABOUT_HEADING);
  });
});
