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
 * D-2 (`docs/observations.md`): the `shelterVerifiedYears` badge asserts
 * something true about a *verified* shelter, fictional while
 * `REGISTRY_HAS_NO_REAL_SHELTERS`. `animal-detail.harness.ts` only ever
 * checks the suppressed (demo, `true`) state - an absence check with no
 * positive control, so it would stay green even if the badge's JSX were
 * deleted outright rather than gated. This exercises both states directly,
 * the same `vi.doMock` + `vi.resetModules` + dynamic re-import pattern
 * `DeckScreen.test.tsx` uses for its own demo-banner branch.
 */
describe("AnimalDetailScreen – shelterVerifiedYears badge (REGISTRY_HAS_NO_REAL_SHELTERS)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("suppresses the badge while the registry holds no real shelters", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({ createdAt: new Date("2023-01-01T00:00:00.000Z") })}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    expect(screen.queryByText(/Перевірено вручну/)).toBeNull();
  });

  it("shows the badge with the year the shelter's record was created, once real shelters exist", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({ createdAt: new Date("2023-01-01T00:00:00.000Z") })}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    // Audit 2026-10-22 #21: a year, not a count of years - a shelter's whole first year
    // used to read «0 років на Opika». Transcribed from the audit's wording.
    expect(screen.getByText("Перевірено вручну · на сайті з 2023 року")).not.toBeNull();
  });

  it("reads the year in UTC, so the server's time zone can't move it across New Year", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({ createdAt: new Date("2025-12-31T23:30:00.000Z") })}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    expect(screen.getByText("Перевірено вручну · на сайті з 2025 року")).not.toBeNull();
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
        backToGalleryHref="/tvaryny?misto=brovary"
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
        backToGalleryHref="/tvaryny?misto=brovary"
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
        backToGalleryHref="/tvaryny"
      />,
    );
    const link = screen.getByRole("link", { name: "Сторінка притулку «Лапа допомоги»" });
    expect(link.getAttribute("href")).toBe("/prytulky/dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });

  /**
   * Review of b50a905 (DR1-S6-F1): `aria-label` replaces a link's whole
   * accessible name, so the verified-years badge text was invisible to a
   * screen reader once `REGISTRY_HAS_NO_REAL_SHELTERS` is false - true only
   * by the flag's own suppression, not by design. `aria-describedby` wires
   * the badge in as the link's description instead.
   */
  it("exposes the verified-years badge to a screen reader via aria-describedby, once real shelters exist", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    const shelter = makeShelter({
      displayName: "Лапа допомоги",
      createdAt: new Date("2023-01-01T00:00:00.000Z"),
    });
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={shelter}
        cityName="Бровари"
        backToGalleryHref="/tvaryny"
      />,
    );
    const link = screen.getByRole("link", { name: "Сторінка притулку «Лапа допомоги»" });
    const describedById = link.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const badge = document.getElementById(describedById as string);
    expect(badge?.textContent).toBe("Перевірено вручну · на сайті з 2023 року");
  });

  it("carries no aria-describedby while the badge is suppressed (demo mode)", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({ displayName: "Лапа допомоги" })}
        cityName="Бровари"
        backToGalleryHref="/tvaryny"
      />,
    );
    const link = screen.getByRole("link", { name: "Сторінка притулку «Лапа допомоги»" });
    expect(link.getAttribute("aria-describedby")).toBeNull();
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
        backToGalleryHref="/tvaryny"
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

  it("does not read $& or $1 in the city name as replacement patterns", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter()}
        cityName="Місто $& $1"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );
    expect(screen.getByText("← Усі тварини · м. Місто $& $1")).toBeTruthy();
    expect(screen.getByText("м. Місто $& $1")).toBeTruthy();
  });
});

/** Q9 (Oleksii, 2026-10-18): the subtitle's age word agrees with the animal. */
describe("AnimalDetailScreen subtitle, by sex", () => {
  it.each([
    ["female", /· молода ·/],
    ["male", /· молодий ·/],
  ] as const)("a %s animal's subtitle", async (sex, word) => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({ sex, ageBucket: "young" })}
        shelter={makeShelter()}
        cityName="Бровари"
        backToGalleryHref="/tvaryny"
      />,
    );
    expect(screen.getByText(word)).toBeTruthy();
  });
});

/**
 * DR1 (S3), his rule: «Шерсть» with «Коротка» / «Довга», the form's words;
 * no row at all when fur isn't recorded (never «Не вказано» to adopters).
 */
describe("AnimalDetailScreen – the fur fact", () => {
  const renderWith = async (coatLength: AnimalDetailView["coatLength"]) => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({ coatLength })}
        shelter={makeShelter()}
        cityName="Бровари"
        backToGalleryHref="/tvaryny"
      />,
    );
  };

  it.each([
    ["short", "Коротка"],
    ["long", "Довга"],
  ] as const)("a %s coat reads «Шерсть: %s»", async (coatLength, value) => {
    await renderWith(coatLength);
    const term = screen.getByRole("term");
    expect(term.textContent).toBe("Шерсть:");
    expect(screen.getByRole("definition").textContent).toBe(value);
  });

  it("shows no fur row when it isn't recorded", async () => {
    await renderWith(null);
    expect(screen.queryByText(/Шерсть/)).toBeNull();
    expect(screen.queryByText(/Не вказано/)).toBeNull();
    expect(screen.queryByRole("term")).toBeNull();
  });
});
