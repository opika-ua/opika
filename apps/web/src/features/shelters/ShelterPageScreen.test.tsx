import { NO_FILTERS } from "@opika/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WithMockRouter } from "../gallery/test-router";
import { ShelterPageScreen } from "./ShelterPageScreen";
import {
  makeCardView,
  makeFacetCounts,
  makeListOutput,
  makeShelterPageShelter,
  makeShelterPageView,
  SHELTER_ID,
} from "./test-fixtures";

/**
 * The shelter page (designer round 1, S6), as a reader and a keyboard meet
 * it: by role, label and text. His copy is transcribed from his message
 * (`docs/designer-round-1.md` §11 item 4), never read from the catalogue.
 */
const ABOUT_HEADING = "Про притулок";
const PAGE = `/prytulky/${SHELTER_ID}`;

function renderScreen(overrides: Parameters<typeof makeShelterPageView>[0] = {}) {
  render(
    <WithMockRouter>
      <ShelterPageScreen {...makeShelterPageView(overrides)} />
    </WithMockRouter>,
  );
}

describe("the shelter page", () => {
  it("names the shelter in its only h1, and gives its city only", () => {
    renderScreen();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((h) => h.textContent)).toEqual(["Лапа допомоги"]);
    expect(screen.getByText("м. Бровари")).toBeTruthy();
  });

  it("shows the shelter's text under «Про притулок», plain: no quotes, line breaks kept", () => {
    renderScreen({
      shelter: makeShelterPageShelter({
        description: { uk: "Волонтери з Броварів.\n\nОновлюємо картки щосуботи.", en: null },
      }),
    });
    const section = screen.getByRole("region", { name: ABOUT_HEADING });
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe(ABOUT_HEADING);
    const text = within(section).getByText(/Волонтери з Броварів/);
    expect(text.textContent).toBe("Волонтери з Броварів.\n\nОновлюємо картки щосуботи.");
    expect(section.textContent).not.toMatch(/[«»]/);
  });

  it("shows braces as written", () => {
    renderScreen({
      shelter: makeShelterPageShelter({ description: { uk: "Пишіть {щодня}.", en: null } }),
    });
    expect(screen.getByText("Пишіть {щодня}.")).toBeTruthy();
  });

  it("shows a stored text over 1,500 characters in full", () => {
    const long = "а".repeat(1800);
    renderScreen({ shelter: makeShelterPageShelter({ description: { uk: long, en: null } }) });
    expect(screen.getByText(long)).toBeTruthy();
  });

  it("draws no section, heading or placeholder when the shelter has no text", () => {
    renderScreen({ shelter: makeShelterPageShelter({ description: null }) });
    expect(screen.queryByRole("region", { name: ABOUT_HEADING })).toBeNull();
    expect(screen.queryByText(ABOUT_HEADING)).toBeNull();
    expect(screen.queryByText("Не записано")).toBeNull();
  });

  it("treats a text of only blanks as none", () => {
    renderScreen({ shelter: makeShelterPageShelter({ description: { uk: "   ", en: null } }) });
    expect(screen.queryByRole("region", { name: ABOUT_HEADING })).toBeNull();
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
    renderScreen({ query: { sort: "freshest", page: 1, filters: NO_FILTERS } });
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
      query: { sort: "longest_waiting", page: 2, filters: NO_FILTERS },
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
  it("an older verified shelter reads «Перевірений вручну · на Opika з 2023 р.»", () => {
    renderScreen({ shelter: makeShelterPageShelter({ verification: "verified" }) });
    expect(screen.getByTestId("shelter-trust-line").textContent).toContain(
      "Перевірений вручну · на Opika з 2023 р.",
    );
  });

  it("a first-year shelter reads the current year, never «0 років»", () => {
    const year = new Date().getFullYear();
    renderScreen({
      shelter: makeShelterPageShelter({ verification: "verified", createdAt: new Date() }),
    });
    const line = screen.getByTestId("shelter-trust-line").textContent ?? "";
    expect(line).toContain(`Перевірений вручну · на Opika з ${year} р.`);
    expect(line).not.toContain("0 рок");
  });

  it("an unverified shelter reads only «на сайті з {year} року»", () => {
    renderScreen({ shelter: makeShelterPageShelter({ verification: "unverified" }) });
    const line = screen.getByTestId("shelter-trust-line").textContent ?? "";
    expect(line).toBe("на сайті з 2023 року");
    expect(line).not.toContain("Перевірено");
  });

  it("a shelter under review reads «Притулок на перевірці», never the verified line", () => {
    renderScreen({
      shelter: makeShelterPageShelter({ verification: "listed_before_verification" }),
    });
    const line = screen.getByTestId("shelter-trust-line").textContent ?? "";
    expect(line).toBe("Притулок на перевірці");
    expect(line).not.toContain("Перевірений вручну");
    expect(screen.queryByTestId("shelter-verified-badge")).toBeNull();
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

  it("with no animals: no animals heading, no sort, a note and a link to all animals", () => {
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

describe("the shelter page, filters", () => {
  const UI = { counts: makeFacetCounts(), total: 41, hasBothSpecies: true, relaxations: [] };
  const many = makeListOutput([makeCardView(1), makeCardView(2)]);

  it("shows no filter controls without filterUi", () => {
    renderScreen({ animals: many });
    expect(screen.queryByRole("button", { name: /Фільтри/ })).toBeNull();
    expect(screen.queryByTestId("species-toggle-mobile")).toBeNull();
  });

  it("with filterUi: the species switch, the «Фільтри» sheet and the desktop selectors, but no Область or Місто", async () => {
    renderScreen({ animals: many, filterUi: UI });
    expect(screen.getByTestId("species-toggle-mobile")).toBeTruthy();
    expect(await screen.findByTestId("filter-sheet-trigger")).toBeTruthy();
    const desktop = screen.getByTestId("gallery-filter-dropdowns");
    expect(within(desktop).getByRole("button", { name: /^Вік/ })).toBeTruthy();
    expect(within(desktop).queryByRole("combobox", { name: /Область|Місто/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Область|Місто/ })).toBeNull();
    // The heading carries the shelter's whole count, not the filtered one.
    expect(screen.getByRole("heading", { level: 2, name: "Шукають дім: 41" })).toBeTruthy();
  });

  it("shows the species switch only when the shelter has both species", () => {
    renderScreen({ animals: many, filterUi: { ...UI, hasBothSpecies: false } });
    expect(screen.queryByTestId("species-toggle-mobile")).toBeNull();
    expect(screen.queryByTestId("species-toggle")).toBeNull();
  });

  it("keeps the links on this shelter's page: species and sort stay on its path", () => {
    renderScreen({
      animals: many,
      filterUi: UI,
      query: {
        sort: "freshest",
        page: 1,
        filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: ["baby"] } },
      },
    });
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    const species = hrefs.filter((href) => href.includes("vyd="));
    expect(species.length).toBeGreaterThan(0);
    for (const href of species) expect(href.startsWith(PAGE)).toBe(true);
    for (const href of hrefs.filter((h) => h.includes("sort=longest_waiting"))) {
      expect(href.startsWith(PAGE)).toBe(true);
    }
  });

  it("with a filter on: chips with «Скинути» back to the bare shelter page, and the count line", () => {
    renderScreen({
      animals: makeListOutput([makeCardView(1)]),
      filterUi: UI,
      query: {
        sort: "freshest",
        page: 1,
        filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: ["baby"] } },
      },
    });
    expect(screen.getByRole("link", { name: /Прибрати фільтр/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Скинути" }).getAttribute("href")).toBe(PAGE);
    expect(screen.getAllByText("Знайдено 1 тварину").length).toBeGreaterThan(0);
  });

  it("with no match: the gallery's no-match block, no list", () => {
    renderScreen({
      animals: makeListOutput([]),
      filterUi: { ...UI, relaxations: [{ dimension: "ages", additional: 7 }] },
      query: {
        sort: "freshest",
        page: 1,
        filters: { ...NO_FILTERS, ages: { kind: "oneOf", values: ["senior"] } },
      },
    });
    expect(screen.getByTestId("gallery-no-match")).toBeTruthy();
    expect(screen.queryByRole("list", { name: /Шукають дім/ })).toBeNull();
    const suggestion = screen.getByTestId("no-match-suggestion");
    expect(suggestion.getAttribute("href")?.startsWith(PAGE)).toBe(true);
    expect(screen.queryByTestId("shelter-no-animals")).toBeNull();
  });

  it("a one-species shelter with ?vyd= shows a species chip, «Скинути» and the count line, though there is no switch", () => {
    renderScreen({
      animals: makeListOutput([makeCardView(1), makeCardView(2)]),
      filterUi: { ...UI, hasBothSpecies: false },
      query: {
        sort: "freshest",
        page: 1,
        filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
      },
    });
    expect(screen.queryByTestId("species-toggle-mobile")).toBeNull();
    expect(screen.getByRole("link", { name: "Прибрати фільтр Коти" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Скинути" }).getAttribute("href")).toBe(PAGE);
    expect(screen.getAllByText("Знайдено 2 тварини").length).toBeGreaterThan(0);
  });

  it("no match with only zero-gain suggestions: none shown, «Скинути» back to the bare shelter page", () => {
    renderScreen({
      animals: makeListOutput([]),
      filterUi: { ...UI, relaxations: [{ dimension: "species", additional: 0 }] },
      query: {
        sort: "freshest",
        page: 1,
        filters: { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } },
      },
    });
    expect(screen.queryByTestId("no-match-suggestion")).toBeNull();
    expect(screen.getByTestId("no-match-reset").getAttribute("href")).toBe(PAGE);
  });
});
