import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { DEFAULT_FRESHNESS_POLICY, freshnessOf } from "@opika/domain";
import { render, screen, within } from "@testing-library/react";
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
    listingKind: "published",
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

  it.each([
    ["male", "small", "Малий"],
    ["male", "medium", "Середній"],
    ["male", "large", "Великий"],
    ["female", "small", "Мала"],
    ["female", "medium", "Середня"],
    ["female", "large", "Велика"],
    ["unknown", "small", "Малий"],
    ["unknown", "medium", "Середній"],
    ["unknown", "large", "Великий"],
  ] as const)("%s, %s: the meta line's size word reads «%s»", async (sex, size, word) => {
    await renderAnimal({ sex, size });
    const parts = Array.from(
      document.querySelector(".meta-line")?.querySelectorAll(".meta-part") ?? [],
    ).map((part) => part.textContent);
    expect(parts.at(-1)).toBe(word);
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
   * The age word agrees with the animal's sex on the meta line and in the «Про мене» chip (Q9,
   * the same `ageWordFor` as the gallery card), capitalised like the other chips; the chip's link
   * and accessible name stay the filter's own («Показати схожих…: дорослий»). Every sex × bucket.
   */
  it.each([
    ["male", "baby", "Малюк", "малюк"],
    ["male", "young", "Молодий", "молодий"],
    ["male", "adult", "Дорослий", "дорослий"],
    ["male", "senior", "Літній", "літній"],
    ["female", "baby", "Малючка", "малюк"],
    ["female", "young", "Молода", "молодий"],
    ["female", "adult", "Доросла", "дорослий"],
    ["female", "senior", "Літня", "літній"],
    ["unknown", "baby", "Малюк", "малюк"],
    ["unknown", "young", "Молодий", "молодий"],
    ["unknown", "adult", "Дорослий", "дорослий"],
    ["unknown", "senior", "Літній", "літній"],
  ] as const)(
    "%s, %s: the age chip and meta line read «%s»; the chip's link name keeps «%s»",
    async (sex, ageBucket, word, filterWord) => {
      const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
      render(
        <AnimalDetailScreen
          animal={makeAnimal({ sex, ageBucket })}
          shelter={makeShelter()}
          cityName="Бровари"
          cityPlace="м. Бровари"
        />,
      );
      // Meta line and chip row: two places.
      expect(screen.getAllByText(word).length).toBeGreaterThanOrEqual(2);
      const chip = screen.getByRole("link", { name: new RegExp(`${filterWord}$`) });
      expect(chip.textContent).toBe(word);
    },
  );

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

const REGISTRY = {
  source: "registry",
  state: "confirmed",
  registryRef: "UA-1",
  verifiedAt: AT,
} as const;

async function renderAnimal(overrides: Partial<AnimalDetailView>) {
  const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
  return render(
    <AnimalDetailScreen
      animal={makeAnimal(overrides)}
      shelter={makeShelter()}
      cityName="Бровари"
      cityPlace="м. Бровари"
    />,
  );
}

function medicalBlock() {
  const heading = screen.getByRole("heading", { level: 2, name: "Медичний стан" });
  return heading.parentElement as HTMLElement;
}

/**
 * «Медичний стан»: one row per stored health fact, value beside the label, always rendered
 * (the «Не записано» rule, now «Невідомо»); the facts are no longer chips in «Про мене».
 */
describe("AnimalDetailScreen – the medical status rows", () => {
  it("there are no vaccination or sterilisation chips in «Про мене»", async () => {
    await renderAnimal({});
    expect(screen.queryByText(/Комплексне щеплення:/)).toBeNull();
    expect(screen.queryByText(/Стерилізація:/)).toBeNull();
  });

  it.each([
    ["unknown", "Невідомо"],
    ["in_progress", "У процесі"],
    ["confirmed", "Зроблено"],
  ] as const)("a %s fact reads «%s», on its own labelled row", async (state, text) => {
    await renderAnimal({
      vaccination: { source: "shelter_declared", state, declaredAt: AT },
      spayNeuter: { source: "shelter_declared", state, declaredAt: AT },
    });
    const block = within(medicalBlock());
    expect(block.getByText("Комплексне щеплення").closest("dl > div")?.textContent).toContain(text);
    expect(block.getByText("Стерилізація").closest("dl > div")?.textContent).toContain(text);
  });

  it("all shelter-declared: the source is said once, under the rows", async () => {
    await renderAnimal({});
    expect(within(medicalBlock()).getAllByText("За даними притулку")).toHaveLength(1);
  });

  it("mixed source: no shared line, each row names its own source", async () => {
    await renderAnimal({ vaccination: REGISTRY });
    const block = within(medicalBlock());
    const rabies = block.getByText("Щеплення від сказу").closest("dl > div") as HTMLElement;
    const spay = block.getByText("Стерилізація").closest("dl > div") as HTMLElement;
    expect(rabies.textContent).toContain("За даними державного реєстру тварин");
    expect(rabies.textContent).toContain("Зроблено");
    expect(spay.textContent).toContain("За даними притулку");
    expect(block.getAllByText("За даними притулку")).toHaveLength(1);
  });

  it("no medical notes: nothing below the rows, no empty text", async () => {
    await renderAnimal({ medicalNotes: null });
    const block = medicalBlock();
    expect(block.querySelector("p.border-t")).toBeNull();
  });

  it("notes are shown in full, never clamped, up to the 1 500-character limit", async () => {
    const long = `${"Лікувальний корм двічі на день. ".repeat(48)}`.slice(0, 1499).concat(".");
    await renderAnimal({ medicalNotes: { uk: long, en: null } });
    const note = within(medicalBlock()).getByText(long);
    expect(note.textContent).toHaveLength(1500);
    expect(note.className).not.toContain("line-clamp");
  });
});

/** The size chip agrees with the animal's sex like the age chip: Мала / Середня / Велика. */
describe("AnimalDetailScreen – the size chip agrees with sex", () => {
  it.each([
    ["male", "small", "Малий"],
    ["male", "medium", "Середній"],
    ["male", "large", "Великий"],
    ["female", "small", "Мала"],
    ["female", "medium", "Середня"],
    ["female", "large", "Велика"],
    ["unknown", "small", "Малий"],
    ["unknown", "medium", "Середній"],
    ["unknown", "large", "Великий"],
  ] as const)("%s, %s: the chip reads «%s»", async (sex, size, word) => {
    await renderAnimal({ sex, size });
    const chip = screen.getByRole("link", {
      name: /^Показати схожих котів: (малий|середній|великий)$/,
    });
    expect(chip.textContent).toBe(word);
  });

  it("«Про мене» order: age, sex, size, temperament, colour, coat", async () => {
    await renderAnimal({
      sex: "female",
      size: "medium",
      ageBucket: "adult",
      temperament: [{ kind: "preset", trait: "calm" }],
      colour: { kind: "custom", text: { uk: "Димчасто-кремова", en: null } },
      coatLength: "short",
    });
    const row = screen.getByRole("link", { name: /котів: доросл/ }).parentElement as HTMLElement;
    expect(Array.from(row.children).map((c) => c.textContent)).toEqual([
      "Доросла",
      "Дівчинка",
      "Середня",
      "Спокійна",
      "Димчасто-кремова",
      "Короткошерсті",
    ]);
  });
});

describe("AnimalDetailScreen – landmarks", () => {
  it("puts the animal page's heading in the main landmark", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");

    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );

    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "Мурчик" })).toBeTruthy();
  });
});

describe("AnimalDetailScreen – the full page on a phone (pet card on phones, S6)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("has «Усі тварини» back to the gallery, and no ✕ and no prev/next (those are the overlay's)", async () => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal()}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
        backToGalleryHref="/tvaryny?misto=brovary"
      />,
    );
    expect(screen.getByRole("link", { name: "Усі тварини" }).getAttribute("href")).toBe(
      "/tvaryny?misto=brovary",
    );
    expect(screen.queryByRole("button", { name: "Закрити" })).toBeNull();
    expect(screen.queryByTestId("overlay-prev")).toBeNull();
    expect(screen.queryByTestId("overlay-next")).toBeNull();
  });
});

describe("AnimalDetailScreen – reserved chip", () => {
  const renderKind = async (listingKind: AnimalDetailView["listingKind"]) => {
    const { AnimalDetailScreen } = await import("./AnimalDetailScreen");
    render(
      <AnimalDetailScreen
        animal={makeAnimal({ listingKind })}
        shelter={makeShelter()}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );
  };

  it("a reserved animal shows «Уже домовляються» beside the freshness chip", async () => {
    await renderKind("reserved");
    expect(screen.getByText("Уже домовляються")).toBeTruthy();
    expect(screen.getByTestId("freshness-block")).toBeTruthy();
  });

  it("a published animal shows no reserved chip", async () => {
    await renderKind("published");
    expect(screen.queryByText("Уже домовляються")).toBeNull();
  });
});
