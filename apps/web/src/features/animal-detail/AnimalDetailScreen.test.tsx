import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { DEFAULT_FRESHNESS_POLICY, freshnessOf } from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `RevealFlow` calls `session.bootstrap`/`animals.reveal` through
 * `../../api/browser-client` — its own call order and rendering is
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
    publicLocation: null,
    description: { uk: "Лагідний кіт", en: null },
    // Empty, not a real storageKey — same reason `AnimalCard.test.tsx` uses
    // `primaryPhoto: null`: `next/image` requires an absolute URL or a
    // leading-slash path, and this file isn't testing photo rendering.
    photos: [],
    vaccination: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    spayNeuter: { source: "shelter_declared", state: "confirmed", declaredAt: AT },
    documentReadiness: { kind: "unknown" },
    ageBucket: "young",
    freshness: freshnessOf(AT, NOW, DEFAULT_FRESHNESS_POLICY),
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as AnimalDetailView["shelter"]["id"],
      displayName: "Тестовий притулок",
      publicLocation: { cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never },
      freshnessSentence: null,
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
    createdAt: new Date("2023-01-01T00:00:00.000Z"),
    verification: "verified",
    ...overrides,
  };
}

/**
 * D-2 (`docs/observations.md`): the `shelterVerifiedYears` badge asserts
 * something true about a *verified* shelter, fictional while
 * `REGISTRY_HAS_NO_REAL_SHELTERS`. `animal-detail.harness.ts` only ever
 * checks the suppressed (demo, `true`) state — an absence check with no
 * positive control, so it would stay green even if the badge's JSX were
 * deleted outright rather than gated. This exercises both states directly,
 * the same `vi.doMock` + `vi.resetModules` + dynamic re-import pattern
 * `DeckScreen.test.tsx` uses for its own demo-banner branch.
 */
describe("AnimalDetailScreen — shelterVerifiedYears badge (REGISTRY_HAS_NO_REAL_SHELTERS)", () => {
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
        now={NOW}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    expect(screen.queryByText(/Перевірений вручну/)).toBeNull();
  });

  it("shows the real badge, with the real computed year count, once real shelters exist", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter({ createdAt: new Date("2023-01-01T00:00:00.000Z") })}
        now={NOW}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    // 2023-01-01 -> 2026-09-06 is 3 whole years — transcribed as a plain
    // number here rather than computed via the component's own
    // `yearsOnOpika`, so this doesn't turn into a self-comparing assertion.
    expect(screen.getByText("Перевірений вручну · 3 роки на Opika")).not.toBeNull();
  });
});

/**
 * Found by the reviewer, 2026-09-10 — the gallery's own D-2 fix
 * (`tvaryny/page.test.tsx`) covered `/tvaryny`, but this route carries the
 * identical gap: `/prytulkam` itself tells a shelter to expect this exact
 * URL shared into Telegram, and it had the demo disclosure in
 * `generateMetadata` only, never in the body a visitor actually opens.
 */
describe("AnimalDetailScreen — demo disclosure banner (REGISTRY_HAS_NO_REAL_SHELTERS)", () => {
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
        now={NOW}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    expect(screen.getByTestId("detail-demo-banner").textContent).toBe(
      "У реєстрі поки немає справжніх притулків — усі картки тут демонстраційні.",
    );
  });

  it("does not show the banner once real shelters exist", async () => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: false }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter()}
        now={NOW}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );

    expect(screen.queryByTestId("detail-demo-banner")).toBeNull();
  });
});

describe("AnimalDetailScreen — the shelter's sentence and its attribution (VH-Q2)", () => {
  const renderWith = async (
    freshnessSentence: AnimalDetailView["shelter"]["freshnessSentence"],
  ) => {
    vi.doMock("../../seo-flags", () => ({ REGISTRY_HAS_NO_REAL_SHELTERS: true }));
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    const base = makeAnimal();
    render(
      <AnimalDetailScreen
        animal={{ ...base, shelter: { ...base.shelter, freshnessSentence } }}
        shelter={makeShelter()}
        now={NOW}
        cityName="Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it("attributes a sentence to the shelter, and claims nothing about a date", async () => {
    await renderWith({ uk: "Оновлюємо картки щосуботи.", en: null });
    // In «…», not English “…” (CB-B1, item 4).
    expect(screen.getByTestId("shelter-freshness-sentence").textContent).toBe(
      "«Оновлюємо картки щосуботи.»",
    );
    expect(screen.getByTestId("shelter-freshness-attribution").textContent).toBe("Слова притулку");
  });

  it("fills {імʼя} with this page's animal name (K-Q6)", async () => {
    await renderWith({ uk: "Напишіть, і ми скажемо, чи {імʼя} ще з нами.", en: null });
    expect(screen.getByTestId("shelter-freshness-sentence").textContent).toBe(
      "«Напишіть, і ми скажемо, чи Мурчик ще з нами.»",
    );
  });

  it("shows no attribution without a sentence: the day count isn't the shelter's words", async () => {
    await renderWith(null);
    expect(screen.queryByTestId("shelter-freshness-sentence")).toBeNull();
    expect(screen.queryByTestId("shelter-freshness-attribution")).toBeNull();
  });
});

describe("AnimalDetailScreen — a city name is printed literally (review finding 2)", () => {
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
        now={NOW}
        cityName="Місто $& $1"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );
    expect(screen.getByText("← Усі тварини у Місто $& $1")).toBeTruthy();
    expect(screen.getByText("м. Місто $& $1")).toBeTruthy();
  });
});
