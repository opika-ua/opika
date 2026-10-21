import type { AnimalDetailView, FeedCardView, ShelterSummaryView } from "@opika/contracts";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnimalDetailScreen } from "../animal-detail/AnimalDetailScreen";
import { makeDetailAnimal } from "../animal-detail/test-fixtures";
import { AnimalOverlay } from "../animal-overlay/AnimalOverlay";
import { SwipeCard } from "../discovery/SwipeCard";
import { AnimalCard } from "../gallery/AnimalCard";
import { WithMockRouter } from "../gallery/test-router";
import { ShelterPageScreen } from "./ShelterPageScreen";
import {
  makeCardView,
  makeShelterPageShelter,
  makeShelterPageView,
  SENTENCE,
} from "./test-fixtures";

vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: { session: { bootstrap: vi.fn() }, animals: { reveal: vi.fn() } },
}));

/**
 * Oleksii's DR1-Q1, verbatim: "«Слова притулку» only on the shelter page.
 * What moves: the shelter’s freshness sentence leaves the deck and animal pages
 * and shows only on the shelter page. «Оновлено … тому» stays on every card."
 *
 * Every surface an adopter meets an animal on is rendered for a shelter that
 * HAS a sentence, handed the sentence even where the view no longer carries it
 * (a regressed handler or view would do exactly that), and the rendered text
 * is read: neither the sentence nor «Слова притулку» may appear, and the day
 * count must. The shelter page is the control: the same data shows both there.
 * The words are literals from his message and the shelter's sentence, never
 * the catalogue constant.
 */
const ATTRIBUTION = "Слова притулку";
/** «Оновлено …» in whatever words the day count takes (its exact form is `freshnessLabel`'s, tested there). */
const DAY_COUNT = /Оновлено /;

/** A card summary as a regressed view would hand it: the sentence still on it. */
const summaryWithSentence = (summary: ShelterSummaryView): ShelterSummaryView => {
  const handed = { ...summary, freshnessSentence: { uk: SENTENCE, en: null } };
  return handed;
};

const card: FeedCardView = (() => {
  const base = makeCardView(1);
  return { ...base, shelter: summaryWithSentence(base.shelter) };
})();

const animal: AnimalDetailView = (() => {
  const base = makeDetailAnimal();
  return { ...base, shelter: summaryWithSentence(base.shelter) };
})();

function expectNoSentence(surface: string, root: HTMLElement) {
  const text = root.textContent ?? "";
  expect(text, `${surface} shows the shelter's sentence`).not.toContain(SENTENCE);
  expect(text, `${surface} shows «${ATTRIBUTION}»`).not.toContain(ATTRIBUTION);
}

describe("the shelter's sentence and «Слова притулку» show only on the shelter page", () => {
  it("the animal page: neither, and its day count stays", () => {
    const { container } = render(
      <AnimalDetailScreen
        animal={animal}
        shelter={makeShelterPageShelter()}
        now={new Date("2026-10-21T00:00:00Z")}
        cityName="Бровари"
        backToGalleryHref="/tvaryny"
      />,
    );
    expectNoSentence("the animal page", container);
    expect(container.textContent).toMatch(DAY_COUNT);
  });

  it("the gallery's overlay of the animal page: neither", () => {
    render(
      <WithMockRouter>
        <AnimalOverlay label={animal.name} openerHref={`/tvaryny/${animal.id}`}>
          <AnimalDetailScreen
            animal={animal}
            shelter={makeShelterPageShelter()}
            now={new Date("2026-10-21T00:00:00Z")}
            cityName="Бровари"
            backToGalleryHref="/tvaryny"
          />
        </AnimalOverlay>
      </WithMockRouter>,
    );
    expectNoSentence("the overlay", document.body);
    expect(document.body.textContent).toMatch(DAY_COUNT);
  });

  it("the deck card: neither, and its day count stays", () => {
    const { container } = render(
      <SwipeCard card={card} gestureRef={() => {}} dx={0} stackIndex={0} />,
    );
    expectNoSentence("the deck card", container);
    expect(container.textContent).toMatch(DAY_COUNT);
  });

  it("the gallery card: neither", () => {
    const { container } = render(<AnimalCard card={card} cityName="Бровари" />);
    expectNoSentence("the gallery card", container);
  });

  it("the shelter page (the control): both, from the same shelter", () => {
    const { container } = render(<ShelterPageScreen {...makeShelterPageView()} />);
    expect(container.textContent).toContain(SENTENCE);
    expect(container.textContent).toContain(ATTRIBUTION);
  });
});
