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
      publicLocation: {
        precision: "fuzzed_address",
        cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
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
    publicLocation: {
      precision: "fuzzed_address",
      cityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as never,
      district: null,
      approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
    },
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
      />,
    );

    // 2023-01-01 -> 2026-09-06 is 3 whole years — transcribed as a plain
    // number here rather than computed via the component's own
    // `yearsOnOpika`, so this doesn't turn into a self-comparing assertion.
    expect(screen.getByText("Перевірений вручну · 3 роки на Opika")).not.toBeNull();
  });
});
