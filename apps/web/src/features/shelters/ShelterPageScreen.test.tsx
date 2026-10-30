import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShelterPageScreen } from "./ShelterPageScreen";
import {
  DESCRIPTION,
  makeCardView,
  makeListOutput,
  makeShelterPageShelter,
  makeShelterPageView,
  SENTENCE,
  SHELTER_ID,
} from "./test-fixtures";

/**
 * The shelter page (designer round 1, S6), as a reader and a keyboard meet
 * it: by role, label and text. His copy is transcribed from his message
 * (`docs/designer-round-1.md` §11 item 4), never read from the catalogue.
 */
const WORDS_HEADING = "Слова притулку";
const PAGE = `/prytulky/${SHELTER_ID}`;

function renderScreen(overrides: Parameters<typeof makeShelterPageView>[0] = {}) {
  render(<ShelterPageScreen {...makeShelterPageView(overrides)} />);
}

describe("the shelter page", () => {
  it("names the shelter in its only h1, and gives its city only", () => {
    renderScreen();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((h) => h.textContent)).toEqual(["Лапа допомоги"]);
    expect(screen.getByText("м. Бровари")).toBeTruthy();
  });

  it("holds the description and the sentence under «Слова притулку»", () => {
    renderScreen();
    const section = screen.getByRole("region", { name: WORDS_HEADING });
    expect(within(section).getByText(DESCRIPTION)).toBeTruthy();
    expect(within(section).getByText(`«${SENTENCE}»`)).toBeTruthy();
  });

  it("shows the section with only the part the shelter wrote", () => {
    renderScreen({ shelter: makeShelterPageShelter({ freshnessSentence: null }) });
    const section = screen.getByRole("region", { name: WORDS_HEADING });
    expect(within(section).getByText(DESCRIPTION)).toBeTruthy();
    expect(within(section).queryByText(/«/)).toBeNull();
  });

  it("omits the section entirely when the shelter wrote neither: no heading over nothing", () => {
    renderScreen({
      shelter: makeShelterPageShelter({
        description: { uk: "   ", en: null },
        freshnessSentence: null,
      }),
    });
    expect(screen.queryByRole("region", { name: WORDS_HEADING })).toBeNull();
    expect(screen.queryByText(WORDS_HEADING)).toBeNull();
  });

  it("leaves out a sentence still carrying {імʼя}, rather than show the braces (DR1-Q5)", () => {
    renderScreen({
      shelter: makeShelterPageShelter({
        freshnessSentence: { uk: "Чи {імʼя} ще з нами? Пишіть.", en: null },
      }),
    });
    expect(screen.queryByText(/імʼя/)).toBeNull();
    expect(screen.getByRole("region", { name: WORDS_HEADING })).toBeTruthy();
  });

  it("shows the donation link's domain as text before the tap (commitment 5)", () => {
    renderScreen({
      shelter: makeShelterPageShelter({
        donation: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" },
      }),
    });
    const donate = screen.getByRole("link", { name: /Підтримати притулок/ });
    expect(donate.getAttribute("href")).toBe("https://send.monobank.ua/jar/abc");
    expect(donate.textContent).toContain("send.monobank.ua");
  });

  it("has no donation link when the shelter has none", () => {
    renderScreen({ shelter: makeShelterPageShelter({ donation: null }) });
    expect(screen.queryByRole("link", { name: /Підтримати притулок/ })).toBeNull();
  });

  it("lists the animals as a list named by its heading, «Шукають дім: {count}»", () => {
    renderScreen({ animals: makeListOutput([makeCardView(1), makeCardView(2), makeCardView(3)]) });
    const list = screen.getByRole("list", { name: "Шукають дім: 3" });
    const cards = within(list).getAllByRole("link");
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.getAttribute("href"))).toEqual([
      "/tvaryny/00000000-0000-4000-8000-000000000001",
      "/tvaryny/00000000-0000-4000-8000-000000000002",
      "/tvaryny/00000000-0000-4000-8000-000000000003",
    ]);
  });

  it("says «Зараз тут немає тварин, які шукають дім.» when the list is empty, with no list or sort", () => {
    renderScreen({ animals: makeListOutput([]) });
    expect(screen.getByText("Зараз тут немає тварин, які шукають дім.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Сортування" })).toBeNull();
  });

  it("offers the gallery's two date sorts, each leading back to this shelter's page", () => {
    renderScreen({ query: { sort: "freshest", page: 1 } });
    const sorts = within(screen.getByRole("navigation", { name: "Сортування" })).getAllByRole(
      "link",
    );
    expect(sorts.map((link) => link.getAttribute("href"))).toEqual([
      PAGE,
      `${PAGE}?sort=longest_waiting`,
    ]);
    expect(sorts[0]?.getAttribute("aria-current")).toBe("true");
  });

  it("keeps its pagination within this shelter, in the chosen sort", () => {
    renderScreen({
      query: { sort: "longest_waiting", page: 2 },
      animals: makeListOutput([makeCardView(25)], 2, 3),
    });
    const pagination = screen.getByRole("navigation", { name: "Сторінки" });
    const hrefs = within(pagination)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href?.startsWith(`${PAGE}?sort=longest_waiting`)).toBe(true);
    expect(hrefs).toContain(`${PAGE}?sort=longest_waiting&stor=3`);
    expect(hrefs).toContain(`${PAGE}?sort=longest_waiting`);
  });
});

describe("the shelter page, states", () => {
  it("a verified shelter reads «Перевірено вручну · на сайті з {year} року» as plain text", () => {
    renderScreen({ shelter: makeShelterPageShelter({ verification: "verified" }) });
    expect(screen.getByTestId("shelter-trust-line").textContent).toContain(
      "Перевірено вручну · на сайті з 2023 року",
    );
  });

  it("an unverified shelter reads only «на сайті з {year} року»", () => {
    renderScreen({ shelter: makeShelterPageShelter({ verification: "unverified" }) });
    const line = screen.getByTestId("shelter-trust-line").textContent ?? "";
    expect(line).toBe("на сайті з 2023 року");
    expect(line).not.toContain("Перевірено");
  });

  it("has no «Шукають дім» count chip: the heading is the only place the count shows", () => {
    renderScreen({ animals: makeListOutput([makeCardView(1), makeCardView(2)]) });
    expect(screen.getAllByText("Шукають дім: 2")).toHaveLength(1);
  });

  it("hides the sort at one animal and shows it from two", () => {
    renderScreen({ animals: makeListOutput([makeCardView(1)]) });
    expect(screen.queryByRole("navigation", { name: "Сортування" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Шукають дім: 1" })).toBeTruthy();
    cleanup();
    renderScreen({ animals: makeListOutput([makeCardView(1), makeCardView(2)]) });
    expect(screen.getByRole("navigation", { name: "Сортування" })).toBeTruthy();
  });

  it("with no animals: no animals heading, no sort, the sentence and a link to all animals", () => {
    renderScreen({ animals: makeListOutput([]) });
    expect(screen.queryByRole("heading", { level: 2, name: /Шукають дім/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Сортування" })).toBeNull();
    const note = screen.getByTestId("shelter-no-animals");
    expect(within(note).getByText("Зараз тут немає тварин, які шукають дім.")).toBeTruthy();
    expect(within(note).getByRole("link", { name: "Усі тварини" }).getAttribute("href")).toBe(
      "/tvaryny",
    );
  });

  it("shows no card text beyond the card, and no per-card button", () => {
    renderScreen({ animals: makeListOutput([makeCardView(1)]) });
    expect(screen.queryByText("Познайомитися")).toBeNull();
  });
});
