import type { KabinetAnimalView } from "@opika/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { KabinetAnimalClient } from "../../../api/kabinet-browser-client";
import { AnimalForm } from "./AnimalForm";
import type { AnimalTab } from "./animal-tabs";

/**
 * The editor's tabs, behaviour only: which tab shows, what the badges say, where the missing-items
 * links go. The real tabs run here (only the selected panel shows). Copy is transcribed from the
 * owner-approved table, not read from the catalogue.
 */

const NOW = new Date("2026-10-17T09:00:00.000Z");
const ID = "a1000000-0000-4000-8000-000000000001" as KabinetAnimalView["id"];
const PHOTO = { storageKey: "/photos/1.jpg", width: 1600, height: 2000, alt: null };
const unknown = { source: "shelter_declared", state: "unknown", declaredAt: NOW } as const;
const COMPLETE = {
  sex: "male",
  size: "medium",
  age: { kind: "declared_bucket", bucket: "young", declaredAt: new Date("2026-09-01T00:00:00Z") },
  description: { uk: "Спокійна, любить гуляти.", en: null },
} as const;
const PUBLISHED = {
  kind: "published",
  publishedAt: NOW,
  confirmedAt: NOW,
  undoable: null,
} as const;

const animal = (overrides: Record<string, unknown> = {}): KabinetAnimalView =>
  ({
    id: ID,
    name: "Ластівка",
    species: "dog",
    sex: "unknown",
    size: null,
    coatLength: null,
    age: null,
    description: null,
    photos: [],
    temperament: [],
    colour: null,
    medicalNotes: null,
    vaccination: unknown,
    spayNeuter: unknown,
    documentReadiness: { kind: "unknown" },
    listing: { kind: "draft" },
    publicLocation: null,
    createdAt: NOW,
    lastUpdatedAt: NOW,
    version: 0,
    ...overrides,
  }) as KabinetAnimalView;

function renderTabs(view: KabinetAnimalView | null, initialTab?: AnimalTab) {
  render(
    <AnimalForm
      initialView={view}
      editing={{ kind: "open" }}
      viewer="admin"
      shelterVisibility="visible"
      back={{ href: "/kabinet/tvaryny", label: "← Тварини" }}
      client={{ shelter: { animals: {}, photos: {} } } as unknown as KabinetAnimalClient}
      clock={() => NOW}
      {...(initialTab === undefined ? {} : { initialTab })}
    />,
  );
}

/** What a screen reader says: the visible text without the decorative mark. */
const nameOf = (tab: Element) => {
  const copy = tab.cloneNode(true) as Element;
  for (const mark of copy.querySelectorAll('[aria-hidden="true"]')) mark.remove();
  return copy.textContent;
};
const tabNames = () => screen.getAllByRole("tab").map(nameOf);
const selectedTab = () =>
  screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");
const complete = (extra: Record<string, unknown> = {}) =>
  animal({ ...COMPLETE, photos: [PHOTO], ...extra });

afterEach(() => window.history.replaceState(null, "", "/"));

describe("tab switching", () => {
  it("opens a new animal on «Основне», with only that panel showing", () => {
    renderTabs(null);
    expect(selectedTab()?.textContent).toMatch(/^Основне/);
    expect(screen.getByLabelText("Імʼя")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /^Опис/ })).toBeNull();
  });

  it("keeps unsaved values when you leave a tab and come back, with no prompt", async () => {
    const user = userEvent.setup();
    renderTabs(complete());
    await user.click(screen.getByRole("tab", { name: /^Про тварину/ }));
    const description = screen.getByLabelText<HTMLTextAreaElement>(/^Опис/);
    await user.clear(description);
    await user.type(description, "Нове слово.");
    await user.click(screen.getByRole("tab", { name: /^Основне/ }));
    await user.click(screen.getByLabelText("Дівчинка"));
    await user.click(screen.getByRole("tab", { name: /^Про тварину/ }));
    expect(screen.getByLabelText<HTMLTextAreaElement>(/^Опис/).value).toBe("Нове слово.");
    await user.click(screen.getByRole("tab", { name: /^Основне/ }));
    expect(screen.getByLabelText<HTMLInputElement>("Дівчинка").checked).toBe(true);
  });

  it("moves between tabs with the arrow keys, Home and End", async () => {
    const user = userEvent.setup();
    renderTabs(null);
    selectedTab()?.focus();
    await user.keyboard("{ArrowRight}");
    expect(selectedTab()?.textContent).toMatch(/^Фото/);
    await user.keyboard("{End}");
    expect(selectedTab()?.textContent).toBe("Публікація");
    await user.keyboard("{Home}");
    expect(selectedTab()?.textContent).toMatch(/^Основне/);
  });

  it("keeps the chosen tab in the address, and the first tab off it", async () => {
    const user = userEvent.setup();
    renderTabs(null);
    await user.click(screen.getByRole("tab", { name: /^Про тварину/ }));
    expect(window.location.search).toBe("?tab=pro-tvarynu");
    await user.click(screen.getByRole("tab", { name: /^Основне/ }));
    expect(window.location.search).toBe("");
  });

  it("opens on the tab a deep link names", () => {
    renderTabs(animal(), "zdorovia");
    expect(selectedTab()?.textContent).toBe("Здоровʼя");
    expect(screen.getByRole("tabpanel", { name: "Здоровʼя" })).toBeTruthy();
  });
});

describe("completion badges", () => {
  it("a fresh draft needs more on Основне, Фото and Про тварину; Здоровʼя and Публікація carry none", () => {
    renderTabs(animal());
    expect(tabNames()).toEqual([
      "Основне, потрібно доповнити",
      "Фото, потрібно доповнити",
      "Про тварину, потрібно доповнити",
      "Здоровʼя",
      "Публікація",
    ]);
  });

  it("a complete card is ticked on all three, still none on the other two", () => {
    renderTabs(complete());
    expect(tabNames()).toEqual([
      "Основне, усе потрібне заповнено",
      "Фото, усе потрібне заповнено",
      "Про тварину, усе потрібне заповнено",
      "Здоровʼя",
      "Публікація",
    ]);
  });

  it("each tab follows its own fields: a missing size marks only Основне", () => {
    renderTabs(complete({ size: null }));
    expect(tabNames().slice(0, 3)).toEqual([
      "Основне, потрібно доповнити",
      "Фото, усе потрібне заповнено",
      "Про тварину, усе потрібне заповнено",
    ]);
  });

  it("a badge changes as the field is filled, before anything is saved", async () => {
    const user = userEvent.setup();
    renderTabs(complete({ description: null }));
    expect(tabNames()[2]).toBe("Про тварину, потрібно доповнити");
    await user.click(screen.getByRole("tab", { name: /^Про тварину/ }));
    await user.type(screen.getByLabelText(/^Опис/), "Лагідна.");
    expect(tabNames()[2]).toBe("Про тварину, усе потрібне заповнено");
  });
});

describe("«потрібно для публікації»", () => {
  it("sits beside the label of an empty required field and goes once it is filled", async () => {
    const user = userEvent.setup();
    renderTabs(complete({ size: null }));
    expect(screen.getByRole("group", { name: "Розмір · потрібно для публікації" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Стать" })).toBeTruthy();
    await user.click(
      within(screen.getByRole("group", { name: /^Розмір/ })).getByLabelText(/Малий/),
    );
    expect(screen.getByRole("group", { name: "Розмір" })).toBeTruthy();
  });

  it("never shows on a card that is already published", () => {
    renderTabs(complete({ listing: PUBLISHED, size: null }));
    expect(screen.queryByText(/потрібно для публікації/)).toBeNull();
  });
});

describe("the missing-items panel", () => {
  it("lists what blocks publishing in «Публікація»", () => {
    renderTabs(animal({ sex: "male" }), "publikatsiia");
    const nav = screen.getByRole("navigation", { name: "Щоб опублікувати, ще потрібно:" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Розмір (Основне)", "Вік (Основне)", "Опис (Про тварину)", "Фото (Фото)"]);
  });

  it("says «Усе потрібне заповнено» when nothing is missing", () => {
    renderTabs(complete(), "publikatsiia");
    expect(screen.getByText("Усе потрібне заповнено. Можна публікувати.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: /Щоб опублікувати/ })).toBeNull();
  });

  it.each([
    ["Розмір (Основне)", /^Основне/, () => document.querySelector('input[name="animal-size"]')],
    ["Опис (Про тварину)", /^Про тварину/, () => document.getElementById("animal-description")],
    ["Фото (Фото)", /^Фото/, () => document.getElementById("photos-title")],
  ])("«%s» switches to its tab and focuses the field", async (item, tab, field) => {
    const user = userEvent.setup();
    renderTabs(animal({ sex: "male" }), "publikatsiia");
    await user.click(screen.getByRole("link", { name: item }));
    expect(selectedTab()?.textContent).toMatch(tab);
    await waitFor(() => expect(document.activeElement).toBe(field()));
  });

  it("pressing «Опублікувати» with something missing opens «Публікація» and focuses its heading", async () => {
    const user = userEvent.setup();
    renderTabs(animal({ sex: "male" }));
    await user.click(screen.getByRole("button", { name: "Опублікувати" }));
    expect(selectedTab()?.textContent).toBe("Публікація");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Публікація" })),
    );
    expect(
      screen.getByText("Щоб опублікувати, ще потрібно: розмір, вік, опис і фото."),
    ).toBeTruthy();
  });
});

describe("the error summary", () => {
  it("brings a field on another tab into view", async () => {
    const user = userEvent.setup();
    renderTabs(null);
    await user.click(within(screen.getByRole("group", { name: "Вид" })).getByLabelText("Кіт"));
    await user.click(screen.getByRole("tab", { name: /^Про тварину/ }));
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    await user.click(
      await screen.findByRole("button", { name: "Щоб зберегти чернетку, потрібне імʼя." }),
    );
    expect(selectedTab()?.textContent).toMatch(/^Основне/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Імʼя")));
  });
});
