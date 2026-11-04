import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnimalDetailContent } from "../animal-detail/AnimalDetailScreen";
import { makeDetailAnimal, makeDetailShelter } from "../animal-detail/test-fixtures";
import { WithMockRouter } from "../gallery/test-router";
import { ShelterPageScreen } from "./ShelterPageScreen";
import { makeShelterPageShelter, makeShelterPageView } from "./test-fixtures";

/**
 * What a visitor meets on a paused shelter's pages: the fixed notice, the reason label only, and
 * nothing that cannot work. Strings are the owner-approved ones (2026-11-04).
 */
const NOTICE = "Притулок тимчасово не приймає нових звернень";

const pausedShelter = (reason: "relocation" | "other" | "capacity_reached" | "staff_shortage") =>
  makeShelterPageShelter({ availability: { kind: "paused", reason } });

function renderShelterPage(reason: Parameters<typeof pausedShelter>[0]) {
  render(
    <WithMockRouter>
      <ShelterPageScreen {...makeShelterPageView({ shelter: pausedShelter(reason) })} />
    </WithMockRouter>,
  );
}

describe("the shelter page of a paused shelter", () => {
  it("shows the notice and the reason label, and explains the missing list", () => {
    renderShelterPage("relocation");
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText("Причина: Переїзд")).toBeTruthy();
    expect(
      screen.getByText("Тварини з цього притулку зараз не показуються в галереї."),
    ).toBeTruthy();
  });

  it("claims no animals and offers no filters or sort", () => {
    renderShelterPage("relocation");
    expect(screen.queryByTestId("shelter-no-animals")).toBeNull();
    expect(screen.queryByText(/Шукають дім/)).toBeNull();
    expect(screen.queryByText(/Зараз тут немає тварин/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Фільтри/ })).toBeNull();
  });

  it("keeps the donation link", () => {
    renderShelterPage("relocation");
    expect(screen.getByTestId("donate-link")).toBeTruthy();
  });

  it.each([
    ["seasonal_closure", "Причина: Сезонна перерва"],
    ["relocation", "Причина: Переїзд"],
    ["capacity_reached", "Причина: Немає вільних місць"],
    ["staff_shortage", "Причина: Бракує волонтерів"],
  ] as const)("labels the code %s", (reason, line) => {
    render(
      <WithMockRouter>
        <ShelterPageScreen
          {...makeShelterPageView({
            shelter: makeShelterPageShelter({ availability: { kind: "paused", reason } }),
          })}
        />
      </WithMockRouter>,
    );
    expect(screen.getByText(line)).toBeTruthy();
  });

  it("shows no reason line for the code other", () => {
    renderShelterPage("other");
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByTestId("pause-reason")).toBeNull();
    expect(screen.queryByText(/Причина/)).toBeNull();
  });

  it("an open shelter shows no notice", () => {
    render(
      <WithMockRouter>
        <ShelterPageScreen {...makeShelterPageView()} />
      </WithMockRouter>,
    );
    expect(screen.queryByTestId("pause-notice")).toBeNull();
  });
});

describe("the animal page of a paused shelter", () => {
  const renderPaused = (reason: "relocation" | "other" = "relocation") =>
    render(
      <AnimalDetailContent
        animal={makeDetailAnimal({ availability: { kind: "paused" } })}
        shelter={makeDetailShelter({ availability: { kind: "paused", reason } })}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );

  it("replaces «Дати сімʼю» with the notice and keeps share and save", () => {
    renderPaused();
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText("Причина: Переїзд")).toBeTruthy();
    expect(screen.queryByTestId("reveal-trigger")).toBeNull();
    expect(screen.queryByRole("button", { name: "Дати сімʼю" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Поділитись/ }).length).toBeTruthy();
  });

  it("shows no reason line for the code other", () => {
    renderPaused("other");
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByTestId("pause-reason")).toBeNull();
  });

  it("an open shelter's animal keeps «Дати сімʼю» and shows no notice", () => {
    render(
      <AnimalDetailContent
        animal={makeDetailAnimal()}
        shelter={makeDetailShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    expect(screen.getByTestId("reveal-trigger")).toBeTruthy();
    expect(screen.queryByTestId("pause-notice")).toBeNull();
  });
});
