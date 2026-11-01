import type { KabinetShelterView } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type OperatorName, standaloneOperatorName } from "../../kabinet/operator";
import { VerificationDecision } from "./VerificationDecision";

/**
 * The shelter's side of a rejection or suspension (RU-Q7, answer 7, and
 * round-2 answer 2: "«Пояснення:», then my note verbatim, then a signature
 * line «— {operator}» (nominative, as in the emails)"), rendered as the page
 * renders it. Since kabinet redesign Phase 2 PR 1 that page is Головна
 * (the top of Тварини) - it used to be `/kabinet`'s profile
 * editor, which still renders the separate, unrelated locked block its own
 * operator-name fallback test lives in `ShelterProfile.test.tsx` now.
 *
 * Every string here is Oleksii's, transcribed from `rui-copy-uk.md` §3.4 and
 * §3.2 (the code labels) and his round-2 answers 2 and 6, never read from
 * `uk.ts`. The section's whole text is pinned, so nothing else (no count, no
 * adopter, commitment #2) can ride along in it.
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
  logo: null,
  version: 3,
  verification,
});

const AT = new Date("2026-10-15T09:00:00Z");
const NOTE = "Надішліть, будь ласка, виписку саме на «Ірпінський хвіст».\nДякую.";
const OLEKSII: OperatorName = { kind: "configured", name: "Олексій Колотенко" };

const renderAs = (
  verification: KabinetShelterView["verification"],
  _viewer: "admin" | "support" = "admin",
  operator: OperatorName = OLEKSII,
) =>
  render(
    <VerificationDecision
      verification={view(verification).verification}
      operatorName={standaloneOperatorName(operator)}
    />,
  );

describe("a rejected shelter reads the decision", () => {
  it.each(["admin", "support"] as const)(
    "%s: title, effect, the code, «Пояснення:», the note verbatim, the signature, the contact line",
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
          "- Олексій Колотенко",
          "Якщо маєте питання, напишіть мені.",
        ].join(""),
      );
      // Verbatim means the line break too, in a quotation of its own, the signature outside it.
      const quote = section.querySelector("blockquote");
      expect(quote?.textContent).toBe(NOTE);
      expect(section.querySelector("figcaption")?.textContent).toBe("Пояснення:");
      expect(screen.getByText("- Олексій Колотенко").closest("blockquote")).toBeNull();
    },
  );

  it("a reason stored without a note shows the code: no label, no empty quotation, no signature", () => {
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

  it("prints a name carrying $& and $1 literally in the signature", () => {
    renderAs({ status: "rejected", at: AT, reason: { code: "spam", note: "Ні" } }, "admin", {
      kind: "configured",
      name: "Олексій $& $1",
    });
    expect(screen.getByText("- Олексій $& $1")).toBeTruthy();
  });
});

describe("a suspended shelter reads the decision", () => {
  it.each(["admin", "support"] as const)("%s: its own title and effect, signed", (viewer) => {
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
        "- Олексій Колотенко",
        "Якщо маєте питання, напишіть мені.",
      ].join(""),
    );
  });
});

/**
 * No name configured: the signature stands alone, so it takes the capitalised
 * fallback, as both emails sign (round-2 answer 6: "capitalise it → «—
 * Адміністратор сайту»"). `ShelterProfile.test.tsx` has the locked note's own
 * fallback case (lower case, mid-sentence) - a different component, on a
 * different screen since kabinet redesign Phase 2 PR 1.
 */
describe("with no operator name configured", () => {
  it("signs «- Адміністратор сайту»", () => {
    renderAs(
      { status: "suspended", at: AT, reason: { code: "other", note: "Чекаю на ваші фото." } },
      "admin",
      { kind: "fallback" },
    );
    const section = screen.getByRole("region", { name: "Притулок тимчасово призупинено" });
    expect(section.textContent).toContain("Чекаю на ваші фото.- Адміністратор сайту");
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
      "Пояснення:",
      "- Олексій Колотенко",
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.queryByText(/^Причина: /)).toBeNull();
    expect(screen.queryByText(/^Пояснення/)).toBeNull();
    expect(screen.queryByText(/^- /)).toBeNull();
  });
});
