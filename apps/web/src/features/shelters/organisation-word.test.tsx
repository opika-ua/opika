import type { ContactRevealView } from "@opika/contracts";
import {
  AnimalIdSchema,
  CityIdSchema,
  type OrganisationWord,
  RevealIdSchema,
  ShelterIdSchema,
} from "@opika/domain";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WORDMARK } from "../../brand";
import { AnimalDetailContent, shelterRowLabel } from "../animal-detail/AnimalDetailScreen";
import { makeDetailAnimal, makeDetailShelter } from "../animal-detail/test-fixtures";
import { WithMockRouter } from "../gallery/test-router";
import { ContactRevealDialog } from "../reveal/ContactRevealDialog";
import { ShelterPageScreen } from "./ShelterPageScreen";
import { makeShelterPageShelter, makeShelterPageView } from "./test-fixtures";

/**
 * «Ініціатива без реєстрації» (owner, 2026-11-24): each organisation-specific public line says
 * «ініціатива» for an initiative and keeps today's «притулок» otherwise (a registered form, or
 * none chosen yet: both reach the page as `"shelter"`, mapped on the server). Texts transcribed
 * from the approved table, row numbers in the names. The name is fictional.
 */
const NAME = "Хвости в пошуку";
const BOTH = ["shelter", "initiative"] as const;
const pick = (word: OrganisationWord, texts: { shelter: string; initiative: string }) =>
  texts[word];

const T = {
  underReview: { shelter: "Притулок на перевірці", initiative: "Ініціатива на перевірці" },
  verified: {
    shelter: `Перевірений вручну · на ${WORDMARK} з 2023 р.`,
    initiative: `Перевірена вручну · на ${WORDMARK} з 2023 р.`,
  },
  revealNotice: {
    shelter: "Цей притулок ще проходить перевірку. Не переказуйте гроші наперед.",
    initiative: "Ця ініціатива ще проходить перевірку. Не переказуйте гроші наперед.",
  },
  title: { shelter: "Як звʼязатися з притулком", initiative: "Як звʼязатися з ініціативою" },
  subtitle: {
    shelter:
      "Притулок не знає про це звернення, поки ви не напишете самі. Нічого не надсилається автоматично.",
    initiative:
      "Ініціатива не знає про це звернення, поки ви не напишете самі. Нічого не надсилається автоматично.",
  },
  paused: {
    shelter: "Притулок тимчасово не приймає нових звернень",
    initiative: "Ініціатива тимчасово не приймає нових звернень",
  },
  loadFailed: {
    shelter: "Це не ваша помилка і не помилка притулку.",
    initiative: "Це не ваша помилка і не помилка ініціативи.",
  },
  notListed: {
    shelter: "Тварини з цього притулку зараз не показуються в галереї.",
    initiative: "Тварини цієї ініціативи зараз не показуються в галереї.",
  },
  about: { shelter: "Про притулок", initiative: "Про ініціативу" },
  donate: { shelter: "Підтримати притулок", initiative: "Підтримати ініціативу" },
  rowLink: {
    shelter: `Сторінка притулку «${NAME}»`,
    initiative: `Сторінка ініціативи «${NAME}»`,
  },
  medical: { shelter: "За даними притулку", initiative: "За даними ініціативи" },
  photo: {
    shelter: "Фото немає – притулок ще не надіслав",
    initiative: "Фото немає – ініціатива ще не надіслала",
  },
};
const other = (word: OrganisationWord): OrganisationWord =>
  word === "shelter" ? "initiative" : "shelter";

function renderShelterPage(word: OrganisationWord, overrides = {}) {
  render(
    <WithMockRouter>
      <ShelterPageScreen
        {...makeShelterPageView({
          shelter: makeShelterPageShelter({
            displayName: NAME,
            organisationWord: word,
            ...overrides,
          }),
        })}
      />
    </WithMockRouter>,
  );
}

describe.each(BOTH)("the shelter page, word %s", (word) => {
  it("rows 2, 10, 11: the verified line, the about heading and the donate link", () => {
    renderShelterPage(word);
    expect(screen.getByTestId("shelter-verified-badge").textContent).toBe(
      `✓ ${pick(word, T.verified)}`,
    );
    expect(screen.getByRole("region", { name: pick(word, T.about) })).toBeTruthy();
    expect(screen.getByTestId("donate-link").textContent).toContain(pick(word, T.donate));
    expect(screen.queryByText(pick(other(word), T.about))).toBeNull();
  });

  it("row 1: the under-review line", () => {
    renderShelterPage(word, { verification: "listed_before_verification" });
    expect(screen.getByTestId("shelter-under-review").textContent).toBe(pick(word, T.underReview));
  });

  it("rows 7 and 9: the pause notice and the missing list", () => {
    renderShelterPage(word, { availability: { kind: "paused", reason: "relocation" } });
    const paused = screen.getByTestId("shelter-paused");
    expect(within(paused).getByText(pick(word, T.paused))).toBeTruthy();
    expect(within(paused).getByText(pick(word, T.notListed))).toBeTruthy();
    expect(within(paused).queryByText(pick(other(word), T.notListed))).toBeNull();
  });
});

describe.each(BOTH)("the animal page, word %s", (word) => {
  const renderAnimal = (paused = false) =>
    render(
      <AnimalDetailContent
        animal={makeDetailAnimal({
          photos: [],
          availability: paused ? { kind: "paused" } : { kind: "open" },
        })}
        shelter={makeDetailShelter({
          displayName: NAME,
          organisationWord: word,
          availability: paused ? { kind: "paused", reason: "other" } : { kind: "open" },
        })}
        cityName="Бровари"
        cityPlace="м. Бровари"
      />,
    );

  it("rows 11, 12, 13, 14: donate, the shelter link's name, the medical source, the photo placeholder", () => {
    renderAnimal();
    expect(screen.getByRole("link", { name: pick(word, T.rowLink) })).toBeTruthy();
    expect(screen.getByTestId("donate-link").textContent).toContain(pick(word, T.donate));
    expect(screen.getByText(pick(word, T.medical))).toBeTruthy();
    expect(screen.getByTestId("photo-placeholder").textContent).toBe(pick(word, T.photo));
    expect(screen.queryByText(pick(other(word), T.medical))).toBeNull();
  });

  it("row 7: the pause notice", () => {
    renderAnimal(true);
    expect(within(screen.getByTestId("pause-notice")).getByText(pick(word, T.paused))).toBeTruthy();
  });
});

describe("the shelter link's name skips the prefix when the name already starts with the word", () => {
  it.each([
    ["Притулок «Добрі лапи»", "initiative"],
    ["Ініціатива «Хвости»", "initiative"],
    ["ініціатива Хвости", "shelter"],
    ["Притулок", "shelter"],
  ] as const)("%s (%s) is its own label", (name, word) => {
    expect(shelterRowLabel(name, word)).toBe(name);
  });

  it("a name that only contains the word gets the template", () => {
    expect(shelterRowLabel("Ініціативні лапки", "initiative")).toBe(
      "Сторінка ініціативи «Ініціативні лапки»",
    );
  });
});

const ANIMAL_ID = AnimalIdSchema.parse("11111111-2222-4333-8444-555555555555");
const revealView = (word: OrganisationWord): ContactRevealView => ({
  id: RevealIdSchema.parse("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"),
  animalId: ANIMAL_ID,
  revealedAt: new Date("2026-08-08T10:00:00Z"),
  shelterListing: "listed_before_verification",
  organisationWord: word,
  shelterContact: {
    source: "current",
    displayName: NAME,
    contact: { primary: { kind: "phone", e164: "+380000000000" }, additional: [] },
  },
  shelterAtFirstReveal: {
    shelterId: ShelterIdSchema.parse("66666666-7777-4888-8999-aaaaaaaaaaaa"),
    publicLocation: { cityId: CityIdSchema.parse("12121212-3434-4565-8787-909090909090") },
    verificationStatusAtReveal: "listed_before_verification",
  },
  animalSnapshot: { name: "Ластівка", primaryPhoto: null },
});
const errorState = (reason: "shelterPaused" | "loadFailed") =>
  ({
    kind: "error",
    reason,
    animalId: ANIMAL_ID,
    animalName: "Ластівка",
    sex: "female",
    cityName: null,
  }) as const;

describe.each(BOTH)("the contact dialog, word %s", (word) => {
  it("rows 3, 5, 6: the title, the subtitle and the under-review notice follow the reveal's word", () => {
    render(
      <ContactRevealDialog
        // The page's word is the other one: the answered reveal's own word wins.
        organisationWord={other(word)}
        state={{
          kind: "open",
          animalId: ANIMAL_ID,
          animalName: "Ластівка",
          sex: "female",
          cityName: null,
          reveal: revealView(word),
        }}
        onClose={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: pick(word, T.title) })).toBeTruthy();
    expect(screen.getByText(pick(word, T.subtitle))).toBeTruthy();
    expect(screen.getByTestId("reveal-under-review").textContent).toBe(pick(word, T.revealNotice));
  });

  it("row 7: the paused refusal's title", () => {
    render(
      <ContactRevealDialog
        organisationWord={word}
        state={errorState("shelterPaused")}
        onClose={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: pick(word, T.paused) })).toBeTruthy();
  });

  it("row 8: the load failure's body", () => {
    render(
      <ContactRevealDialog
        organisationWord={word}
        state={errorState("loadFailed")}
        onClose={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(pick(word, T.loadFailed))).toBeTruthy();
    expect(screen.queryByText(pick(other(word), T.loadFailed))).toBeNull();
  });
});
