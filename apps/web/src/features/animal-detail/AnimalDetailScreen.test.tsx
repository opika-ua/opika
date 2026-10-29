import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { DEFAULT_FRESHNESS_POLICY, freshnessOf } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `RevealFlow` calls `session.bootstrap`/`animals.reveal` through
 * `../../api/browser-client` - its own call order and rendering is
 * `RevealFlow.test.tsx`'s job. Stubbed here so this file's badge-suppression
 * assertions don't need that transport at all.
 */
vi.mock("./RevealFlow", () => ({
  RevealFlow: () => null,
}));

const AT = new Date("2024-01-01T00:00:00.000Z");
const NOW = new Date("2026-09-06T00:00:00.000Z");

function makeAnimal(overrides: Partial<AnimalDetailView> = {}): AnimalDetailView {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as AnimalDetailView["id"],
    name: "Мурчик",
    species: "cat",
    sex: "male",
    size: "small",
    coatLength: null,
    publicLocation: null,
    description: { uk: "Лагідний кіт", en: null },
    // Empty, not a real storageKey - same reason `AnimalCard.test.tsx` uses
    // `primaryPhoto: null`: `next/image` requires an absolute URL or a
    // leading-slash path, and this file isn't testing photo rendering.
    photos: [],
    vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    documentReadiness: { kind: "unknown" },
    temperament: [],
    colour: null,
    medicalNotes: null,
    ageBucket: "young",
    freshness: freshnessOf(AT, NOW, DEFAULT_FRESHNESS_POLICY),
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as AnimalDetailView["shelter"]["id"],
      displayName: "Тестовий притулок",
      logo: null,
      publicLocation: { cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never },
      verification: "verified",
    },
    ...overrides,
  };
}

function makeShelter(overrides: Partial<PublicShelterView> = {}): PublicShelterView {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as PublicShelterView["id"],
    displayName: "Тестовий притулок",
    description: { uk: "Опис притулку", en: null },
    publicLocation: { cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never },
    donation: null,
    logo: null,
    createdAt: new Date("2023-01-01T00:00:00.000Z"),
    freshnessSentence: null,
    verification: "verified",
    ...overrides,
  };
}

/**
 * Pet card PR 5: the `shelterVerifiedYears` badge ("Перевірено вручну · на
 * сайті з {year} року") had no slot in the Figma header - the shelter row is
 * now just the logo, the name and the city (owner decision 1, "follow the
 * Figma design completely"). It was already suppressed everywhere in
 * production (`REGISTRY_HAS_NO_REAL_SHELTERS` is `true`), so dropping it
 * removes dead JSX, not a live feature - a decision taken, recorded here
 * rather than silently deleting its old test block. `uk.detail
 * .shelterVerifiedYears` itself is left in the catalogue (unlike the keys
 * this PR actually deletes elsewhere), since restoring the badge, if ever
 * wanted, would need its exact words back.
 */
describe("AnimalDetailScreen – shelterVerifiedYears badge (retired, pet card PR 5)", () => {
  it("renders nowhere, demo mode or not", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({ createdAt: new Date("2023-01-01T00:00:00.000Z") })}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    expect(screen.queryByText(/Перевірено вручну/)).toBeNull();
  });
});

/**
 * Found by the reviewer, 2026-09-10 - the gallery's own D-2 fix
 * (`tvaryny/page.test.tsx`) covered `/tvaryny`, but this route carries the
 * identical gap: `/prytulkam` itself tells a shelter to expect this exact
 * URL shared into Telegram, and it had the demo disclosure in
 * `generateMetadata` only, never in the body a visitor actually opens.
 */
describe("AnimalDetailScreen – demo disclosure banner (REGISTRY_HAS_NO_REAL_SHELTERS)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows the demo banner in the page body while the registry holds no real shelters", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );

    expect(screen.getByTestId("detail-demo-banner").textContent).toBe(
      "На сайті поки немає справжніх притулків – усі картки тут демонстраційні.",
    );
  });

  it("does not show the banner once real shelters exist", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );

    expect(screen.queryByTestId("detail-demo-banner")).toBeNull();
  });
});

/**
 * Designer round 1, S6: the shelter row is a link to the shelter page, named
 * by his `detail.shelterRowLink` («Сторінка притулку «{name}»», transcribed
 * from his message), and the donation link stays here too (commitment 5).
 */
describe("AnimalDetailScreen – the shelter row (designer round 1, S6)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is a link to the shelter's page, named after the shelter", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({ displayName: "Лапа допомоги" })}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    const link = screen.getByRole("link", { name: "Сторінка притулку «Лапа допомоги»" });
    expect(link.getAttribute("href")).toBe("/prytulky/dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });

  it("keeps the donation link, with its domain as text", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({
          donation: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" },
        })}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    const donate = screen.getByTestId("donate-link");
    expect(donate.getAttribute("href")).toBe("https://send.monobank.ua/jar/abc");
    expect(donate.textContent).toContain("send.monobank.ua");
  });
});

describe("AnimalDetailScreen – a city name is printed literally (review finding 2)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /**
   * Pet card PR 5: the back-link row this test used to check (O-12's own
   * regex-injection guard, `"m. {city}".replace`) is gone with the row
   * itself (owner decision B). The header's shelter row now has the only
   * place `cityName` renders as text (beside the decorative location icon,
   * owner decision 6) - same guard, same reason (`cityName` reaches a
   * `.replace("{city}", () => cityName)` call inside `fillTemplate` for the
   * shelter-row's own `aria-label`, and is printed directly as the location
   * text), rechecked against the new location.
   */
  it("does not read $& or $1 in the city name as replacement patterns", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter()}
        cityName="Місто $& $1"
        cityPlace="Місто $& $1"
      />,
    );
    expect(screen.getByText("Місто $& $1")).toBeTruthy();
  });
});

/** The meta line names sex as its own word (owner decision 1 - follows the gallery card's
 * own `cardFactsParts`, which also names sex separately rather than folding it into the age
 * word's grammatical gender the way the pre-redesign subtitle's `ageWordFor` did). */
describe("AnimalDetailScreen meta line, by sex", () => {
  it.each([
    ["female", "Дівчинка"],
    ["male", "Хлопчик"],
  ] as const)("a %s animal's meta line names the sex", async (sex, word) => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({ sex, ageBucket: "young" })}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    // The sex word appears twice by design: the meta line ("Хлопчик · Молодий · Малий")
    // and the «Про мене» chip row both show it (Figma's own two separate facts).
    expect(screen.getAllByText(word).length).toBeGreaterThan(0);
  });

  it("an unrecorded sex shows no sex chip at all (sexWordFor's own null-for-unknown contract)", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({ sex: "unknown" })}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    expect(screen.queryByText("Хлопчик")).toBeNull();
    expect(screen.queryByText("Дівчинка")).toBeNull();
  });

  /**
   * The sex chip's own filterable link (gallery filter restructure
   * reverses SF-D5): same `FilterableChipLink` pattern age/size already
   * use, writing `stat=` rather than a `filters.sex*`-worded href for any
   * other dimension.
   */
  it("a recorded sex is a chip linking to the gallery's own sex filter", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({ sex: "male", ageBucket: "young" })}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    const chip = screen.getByRole("link", { name: "Показати схожих котів: хлопчик" });
    expect(chip.textContent).toBe("Хлопчик");
    expect(chip.getAttribute("href")).toContain("stat=male");
  });
});

/**
 * Pet card PR 5, A6, originally: coat length moved from its own stacked
 * "Шерсть: Коротка" row (`CoatFact`, deleted with this PR) into a
 * filterable chip in the «Про мене» row. **Changed, gallery filter
 * restructure:** the fur filter itself is gone, so this chip is plain
 * text again, same as temperament/colour - still `uk.filters.coatShort`/
 * `coatLong` (those two words stay public, their only caller now), still
 * no row at all when fur isn't recorded, just no longer a link anywhere.
 */
describe("AnimalDetailScreen – the coat length chip", () => {
  const renderWith = async (coatLength: AnimalDetailView["coatLength"]) => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({ coatLength })}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
  };

  it.each([
    ["short", "Короткошерсті"],
    ["long", "Довгошерсті"],
  ] as const)("a %s coat is a plain, non-filterable chip", async (coatLength, text) => {
    await renderWith(coatLength);
    const chip = screen.getByText(text);
    expect(chip.closest("a")).toBeNull();
  });

  it("shows no coat chip when it isn't recorded", async () => {
    await renderWith(null);
    expect(screen.queryByText("Короткошерсті")).toBeNull();
    expect(screen.queryByText("Довгошерсті")).toBeNull();
  });
});

/**
 * Pet card PR 5, owner decision A3: the medical fact chips (vaccination,
 * spay/neuter) keep the «Не записано» rule - unlike every other chip in
 * the «Про мене» row, which simply doesn't render for an unrecorded fact,
 * these two always render, even unknown, never hidden and never shown as
 * "no" (`docs/standing-constraints.md`'s own product rule).
 */
describe("AnimalDetailScreen – the medical fact chips always render (A3)", () => {
  it("an unknown vaccination/spay-neuter state reads «Не записано», not hidden", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({
          vaccination: { source: "shelter_declared", state: "unknown", declaredAt: AT },
          spayNeuter: { source: "shelter_declared", state: "unknown", declaredAt: AT },
        })}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    expect(screen.getByText("Комплексне щеплення: Не записано")).toBeTruthy();
    expect(screen.getByText("Стерилізація: Не записано")).toBeTruthy();
  });

  it("a confirmed, shelter-declared state reads the real status, not «Не записано»", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({
          vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
          spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
        })}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
    expect(screen.getByText("Комплексне щеплення: Зроблено, за даними притулку")).toBeTruthy();
    expect(screen.queryByText(/Не записано/)).toBeNull();
  });
});
