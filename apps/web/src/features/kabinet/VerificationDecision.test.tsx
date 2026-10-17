import type { KabinetShelterView } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShelterProfile } from "./ShelterProfile";

vi.mock("./test-shelter-only/AllowlistedShelterArea", () => ({
  AllowlistedShelterArea: () => null,
}));

/**
 * The shelter's side of a rejection or suspension on `/kabinet` (RU-Q7,
 * answer 7), rendered as the page renders it. Every string is Oleksii's,
 * transcribed from `rui-copy-uk.md` §3.4 and §3.2 (the code labels), never
 * read from `uk.ts`. The section's whole text is pinned, so nothing else
 * (no count, no adopter, commitment #2) can ride along in it.
 */

const view = (verification: KabinetShelterView["verification"]): KabinetShelterView => ({
  id: "51000000-0000-4000-8000-000000000001" as KabinetShelterView["id"],
  displayName: "Притулок «Домівка»",
  description: { uk: "Опис", en: null },
  legalEntity: { kind: "unregistered_initiative", contactPersonName: "Олена Коваль" },
  exactAddress: {
    line1: "вул. Київська, 300",
    line2: null,
    postalCode: "07400",
    cityId: "c1000000-0000-4000-8000-000000000001" as never,
    district: null,
    coordinates: { lat: 50.5, lng: 30.8 },
  },
  contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
  donation: null,
  pendingDonation: null,
  freshnessSentence: null,
  version: 3,
  verification,
});

const AT = new Date("2026-10-15T09:00:00Z");
const NOTE = "Надішліть, будь ласка, виписку саме на «Ірпінський хвіст».\nДякую.";

const renderAs = (
  verification: KabinetShelterView["verification"],
  viewer: "admin" | "support" = "admin",
  operatorName = "Олексій",
) =>
  render(
    <ShelterProfile
      view={view(verification)}
      cityName="Бровари"
      viewer={viewer}
      operatorName={operatorName}
    />,
  );

describe("a rejected shelter reads the decision", () => {
  it.each(["admin", "support"] as const)(
    "%s: title, effect, the code, the operator's note verbatim, and the contact line",
    (viewer) => {
      renderAs({ status: "rejected", at: AT, reason: { code: "spam", note: NOTE } }, viewer);
      const section = screen.getByRole("region", { name: "Перевірку не пройдено" });
      expect(section.textContent).toBe(
        [
          "Перевірку не пройдено",
          "Тварин притулку не буде в галереї, доки перевірку не пройдено.",
          "Причина: Спам.",
          "Пояснення:",
          NOTE,
          "Якщо маєте питання, напишіть мені.",
        ].join(""),
      );
      // Verbatim means the line break too, in a quotation.
      const quote = section.querySelector("blockquote");
      expect(quote?.textContent).toBe(NOTE);
    },
  );

  it("a reason stored without a note shows the code, and no empty quotation", () => {
    renderAs({ status: "rejected", at: AT, reason: { code: "insufficient_evidence", note: null } });
    const section = screen.getByRole("region", { name: "Перевірку не пройдено" });
    expect(section.textContent).toBe(
      [
        "Перевірку не пройдено",
        "Тварин притулку не буде в галереї, доки перевірку не пройдено.",
        "Причина: Недостатньо доказів.",
        "Якщо маєте питання, напишіть мені.",
      ].join(""),
    );
    expect(section.querySelector("blockquote")).toBeNull();
  });

  /**
   * AW-R3-1: «від {operator}» needs the genitive, which the configured name
   * doesn't have, so the label is his string without it, and no operator
   * name, configured or fallback, appears in the section at all.
   */
  it("labels the note «Пояснення:», with no operator name in the section", () => {
    renderAs(
      { status: "rejected", at: AT, reason: { code: "spam", note: "Ні" } },
      "admin",
      "Олексій Колотенко",
    );
    const section = screen.getByRole("region", { name: "Перевірку не пройдено" });
    expect(section.querySelector("figcaption")?.textContent).toBe("Пояснення:");
    expect(section.textContent).not.toContain("Олексій");
    expect(section.textContent).not.toContain("адміністратор сайту");
    expect(section.textContent).not.toMatch(/[{}]/);
  });
});

describe("a suspended shelter reads the decision", () => {
  it.each(["admin", "support"] as const)("%s: its own title and effect", (viewer) => {
    renderAs(
      {
        status: "suspended",
        at: AT,
        reason: { code: "complaint_upheld", note: "Скарга від ветклініки. Чекаю на ваші фото." },
      },
      viewer,
    );
    const section = screen.getByRole("region", { name: "Притулок тимчасово призупинено" });
    expect(section.textContent).toBe(
      [
        "Притулок тимчасово призупинено",
        "Поки притулок призупинено, його тварин немає в галереї.",
        "Причина: Скарга підтвердилася.",
        "Пояснення:",
        "Скарга від ветклініки. Чекаю на ваші фото.",
        "Якщо маєте питання, напишіть мені.",
      ].join(""),
    );
  });
});

describe("every other status sees none of it", () => {
  it.each([
    ["pending", { status: "pending", since: AT }],
    ["under_review", { status: "under_review", since: AT }],
    ["verified", { status: "verified", since: AT }],
    [
      "paused",
      { status: "paused", since: AT, reason: { code: "relocation", note: "Переїжджаємо" } },
    ],
  ] as const)("%s", (_status, verification) => {
    renderAs(verification as KabinetShelterView["verification"]);
    for (const text of [
      "Перевірку не пройдено",
      "Притулок тимчасово призупинено",
      "Якщо маєте питання, напишіть мені.",
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.queryByText(/^Причина: /)).toBeNull();
    expect(screen.queryByText(/^Пояснення/)).toBeNull();
  });
});
