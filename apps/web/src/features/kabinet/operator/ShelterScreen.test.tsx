import type { BlockedAddressesView, KabinetCursor, RegistryShelterView } from "@opika/contracts";
import type { ModeratorId, ShelterHistoryEntry } from "@opika/domain";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryList } from "./HistoryList";
import type { RegistryReadClient } from "./registry-browser-client";
import {
  BlockedCard,
  blockReasonOf,
  ShelterScreen,
  type ShelterScreenActions,
} from "./ShelterScreen";

/**
 * S4 · one shelter, read-only, as behaviour: what each section says in each
 * state of its data. Expected text is typed from his Ukrainian
 * (`rui-copy-uk.md` §1.3–§1.6) and the K4 strings it reuses.
 */

const NOW = new Date("2026-10-17T10:00:00.000Z");
const ME = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const SHELTER_ID = "51000000-0000-4000-8000-000000000001" as RegistryShelterView["id"];

const view = (overrides: Partial<RegistryShelterView> = {}): RegistryShelterView => ({
  id: SHELTER_ID,
  displayName: "Притулок «Домівка»",
  description: { uk: "Опис притулку для тесту.", en: null },
  legalEntity: {
    kind: "registered_ngo",
    legalName: "ГО «Домівка»",
    edrpou: "43218765" as never,
    registeredAt: new Date("2020-01-01T00:00:00Z"),
  },
  publicLocation: {
    precision: "fuzzed_address",
    cityId: "c1" as never,
    district: null,
    approximate: { lat: 50.5, lng: 30.8 } as never,
  },
  exactAddress: {
    line1: "вул. Київська, 300",
    line2: null,
    postalCode: "07400",
    cityId: "c1" as never,
    district: null,
    coordinates: { lat: 50.5, lng: 30.8 },
  },
  contact: { primary: { kind: "phone", e164: "+380671234567" }, additional: [] },
  donation: null,
  pendingDonation: null,
  freshnessSentence: null,
  verification: {
    status: "pending",
    submittedAt: new Date("2026-10-15T09:00:00Z"),
    evidence: { items: [], submittedAt: new Date("2026-10-15T09:00:00Z") },
  },
  createdAt: new Date("2026-10-15T09:00:00Z"),
  lastUpdatedAt: new Date("2026-10-15T09:00:00Z"),
  version: 1,
  admins: [],
  ...overrides,
});

const CHECKED_NONE: BlockedAddressesView = { kind: "checked", asOf: NOW, blocked: [] };
/**
 * R-UI 3's controls left empty: what this file tests is the record S4 reads
 * out. The controls, and the admins list they make the admins card, are
 * tested where they live (`actions/*.test.tsx`, `ShelterActionsScreen.test.tsx`).
 */
const NO_ACTIONS: ShelterScreenActions = {
  supportEntry: null,
  rename: null,
  decision: null,
  donationDecision: null,
  admins: null,
};

const renderScreen = (
  overrides: Partial<RegistryShelterView> = {},
  blocked: BlockedAddressesView = CHECKED_NONE,
) =>
  render(
    <ShelterScreen
      view={view(overrides)}
      cityName="Бровари"
      history={{ items: [], nextCursor: null }}
      blocked={blocked}
      me={ME}
      actions={NO_ACTIONS}
    />,
  );

const section = (name: string) => screen.getByRole("region", { name });

describe("S4 heading", () => {
  it("names the shelter, its city and signed-in admins, its status and since when (a date, not a count)", () => {
    renderScreen({
      admins: [
        {
          id: "a1" as never,
          name: "Олена",
          email: "olena@example.org",
          invite: { status: "accepted" },
        },
      ],
    });
    expect(screen.getByRole("heading", { level: 1, name: "Притулок «Домівка»" })).toBeTruthy();
    expect(screen.getByText("Бровари · Адміністраторів: 1")).toBeTruthy();
    expect(screen.getByText("Очікує")).toBeTruthy();
    expect(screen.getByText("з 15 жовтня 2026 р.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Притулки" }).getAttribute("href")).toBe(
      "/kabinet/prytulky",
    );
  });
});

describe("S4 evidence", () => {
  it("says when there is none, and what approval still needs", () => {
    renderScreen();
    const evidence = section("Докази для перевірки");
    expect(within(evidence).getByText("Доказів поки немає.")).toBeTruthy();
    // A registered NGO needs one of each (DEFAULT_VERIFICATION_POLICY).
    expect(
      within(evidence).getByText("Для схвалення бракує: Реєстрація · ЄДРПОУ — 0 з 1."),
    ).toBeTruthy();
    expect(within(evidence).getByText("Для схвалення бракує: Рекомендація — 0 з 1.")).toBeTruthy();
  });

  it("shows each item's facts, and that no document is attached where that is allowed", () => {
    const submittedAt = new Date("2026-10-15T09:00:00Z");
    renderScreen({
      verification: {
        status: "under_review",
        startedAt: NOW,
        reviewerId: ME,
        evidence: {
          submittedAt,
          items: [
            {
              kind: "edrpou_registration",
              edrpou: "43218765" as never,
              registeredName: "ГО ДОМІВКА",
              documentKey: null,
            },
            { kind: "bank_account_holder", holderName: "ГО «Домівка»", documentKey: null },
            {
              kind: "reference_contact",
              name: "Ветклініка «Айболить»",
              channel: { kind: "phone", e164: "+380501112233" },
              relationship: "veterinary_clinic",
            },
            {
              kind: "site_visit",
              visitedAt: new Date("2026-10-12T00:00:00Z"),
              visitedBy: ME,
              notes: "Був на місці.",
            },
          ],
        },
      },
    });
    const evidence = section("Докази для перевірки");
    expect(within(evidence).getByText("Назва в ЄДР")).toBeTruthy();
    expect(within(evidence).getByText("ГО ДОМІВКА")).toBeTruthy();
    expect(within(evidence).getByText("43 218 765")).toBeTruthy();
    expect(within(evidence).getByText("Власник рахунку")).toBeTruthy();
    expect(
      within(evidence).getAllByText("Документ не додано — для цього типу доказу це дозволено."),
    ).toHaveLength(2);
    expect(within(evidence).getByText("Телефон: +380501112233")).toBeTruthy();
    expect(within(evidence).getByText("Ветклініка")).toBeTruthy();
    expect(within(evidence).getByText("12 жовтня 2026 р.")).toBeTruthy();
    expect(within(evidence).getAllByText("додано 15 жовтня 2026 р.")).toHaveLength(4);
    // Everything the NGO's policy asks for is there: no gap line.
    expect(within(evidence).queryByText(/Для схвалення бракує/)).toBeNull();
  });

  it("names no gap once approval is not the next decision", () => {
    renderScreen({
      verification: {
        status: "verified",
        verifiedAt: NOW,
        verifiedBy: ME,
        evidence: { items: [], submittedAt: NOW },
      },
    });
    expect(screen.queryByText(/Для схвалення бракує/)).toBeNull();
  });
});

describe("S4 legal data, address, contacts, description", () => {
  it("shows the legal data read-only, with his note", () => {
    renderScreen();
    const legal = section("Юридичні дані");
    expect(within(legal).getByText("Громадська організація чи фонд")).toBeTruthy();
    expect(within(legal).getByText("ГО «Домівка»")).toBeTruthy();
    expect(within(legal).getByText("1 січня 2020 р.")).toBeTruthy();
    expect(
      within(legal).getByText(
        "Ці поля притулок бачить лише для читання. Зміна юридичної особи чи ЄДРПОУ не змінює статус автоматично — рішення за вами.",
      ),
    ).toBeTruthy();
  });

  it("shows an unregistered initiative's contact person", () => {
    renderScreen({ legalEntity: { kind: "unregistered_initiative", contactPersonName: "Ірина" } });
    const legal = section("Юридичні дані");
    expect(within(legal).getByText("Ініціатива без реєстрації")).toBeTruthy();
    expect(within(legal).getByText("Контактна особа")).toBeTruthy();
    expect(within(legal).getByText("Ірина")).toBeTruthy();
  });

  it("shows the exact address with the profile's true note (adopters see the city only)", () => {
    renderScreen();
    const address = section("Адреса приміщення");
    expect(within(address).getByText("Бровари, вул. Київська, 300, 07400")).toBeTruthy();
    expect(within(address).getByText("50.5, 30.8")).toBeTruthy();
    expect(
      within(address).getByText("Ті, хто шукає тварину, не бачать точної адреси — лише місто."),
    ).toBeTruthy();
  });

  it("shows the contacts and the description", () => {
    renderScreen();
    expect(within(section("Контакти")).getByText("+380671234567")).toBeTruthy();
    expect(within(section("Опис притулку")).getByText("Опис притулку для тесту.")).toBeTruthy();
  });
});

describe("S4 donation", () => {
  it("no link, and nothing proposed", () => {
    renderScreen();
    const donation = section("Збір коштів");
    expect(within(donation).getByText("Посилання немає")).toBeTruthy();
    expect(within(donation).queryByText(/Чекає на ваше рішення/)).toBeNull();
  });

  it("the live link, and a proposal waiting for the operator", () => {
    renderScreen({
      donation: { url: "https://send.monobank.ua/jar/live", provider: "monobank_jar" },
      pendingDonation: {
        link: { url: "https://dobro.ua/fund/new", provider: "other" },
        proposedAt: new Date("2026-10-16T08:00:00Z"),
        proposedBy: "a1" as never,
      },
    });
    const donation = section("Збір коштів");
    expect(within(donation).getByText("Чинне посилання")).toBeTruthy();
    expect(within(donation).getByText("https://send.monobank.ua/jar/live")).toBeTruthy();
    expect(
      within(donation).getByText(
        "Притулок запропонував dobro.ua 16 жовтня 2026 р. Чекає на ваше рішення.",
      ),
    ).toBeTruthy();
    expect(within(donation).getByText("https://dobro.ua/fund/new")).toBeTruthy();
  });
});

describe("S4 blocked addresses, every answer", () => {
  const blockedSection = () => section("Адреси, на які поштовий сервіс не доставляє листи");
  const renderBlocked = (blocked: BlockedAddressesView) =>
    render(<BlockedCard blocked={blocked} />);

  it("checked, none blocked", () => {
    renderBlocked(CHECKED_NONE);
    expect(
      within(blockedSection()).getByText("Перевірено: жодна адреса цього притулку не заблокована."),
    ).toBeTruthy();
    expect(within(blockedSection()).getByText("Станом на 13:00")).toBeTruthy();
    expect(within(blockedSection()).queryByText(/Розблокувати/)).toBeNull();
  });

  it("checked, with who and why, and where to unblock", () => {
    renderBlocked({
      kind: "checked",
      asOf: NOW,
      blocked: [{ email: "olena@example.org", reason: "hard_bounce" }],
    });
    const blocked = blockedSection();
    expect(
      within(blocked).getByText("olena@example.org — адреса не існує або не приймає пошту."),
    ).toBeTruthy();
    expect(within(blocked).queryByText(/жодна адреса/)).toBeNull();
    expect(
      within(blocked).getByText(
        "Розблокувати адресу можна лише в кабінеті поштового сервісу, не тут.",
      ),
    ).toBeTruthy();
  });

  it("incomplete: says only part was checked, and who was found so far", () => {
    renderBlocked({
      kind: "incomplete",
      asOf: NOW,
      blockedSoFar: [{ email: "petro@example.org", reason: "unsubscribed" }],
    });
    const blocked = blockedSection();
    expect(
      within(blocked).getByText("Список заблокованих адрес вдалося отримати лише частково."),
    ).toBeTruthy();
    expect(
      within(blocked).getByText("petro@example.org — людина з цієї адреси відписалася від листів."),
    ).toBeTruthy();
    expect(within(blocked).queryByText(/жодна адреса/)).toBeNull();
  });

  /**
   * Oleksii's answer 4: "on hitting the cap, return a typed "incomplete"
   * result, not a partial "none blocked"". An incomplete read that found
   * nobody so far is the case most tempting to show as «none»: it must not.
   */
  it("incomplete with nobody found so far: still only «part checked», never «none blocked»", () => {
    renderBlocked({ kind: "incomplete", asOf: NOW, blockedSoFar: [] });
    const blocked = blockedSection();
    expect(
      within(blocked).getByText("Список заблокованих адрес вдалося отримати лише частково."),
    ).toBeTruthy();
    expect(within(blocked).queryByText(/жодна адреса/)).toBeNull();
    expect(within(blocked).queryByRole("listitem")).toBeNull();
    expect(within(blocked).queryByText(/Розблокувати/)).toBeNull();
  });

  it.each([
    ["provider_error", "Поштовий сервіс відповів помилкою."],
    ["timed_out", "Поштовий сервіс не відповів вчасно."],
    ["unsupported_provider", "Цей поштовий сервіс не дає перевірити блокування."],
    // His round-2 wording (answer 5).
    [
      "provider_suppresses",
      "Поштовий сервіс має власний список заблокованих адрес; сайт його не перевіряє.",
    ],
  ] as const)("unknown (%s): says why, and never «none blocked»", (why, text) => {
    renderBlocked({ kind: "unknown", why });
    const blocked = blockedSection();
    expect(within(blocked).getByText(text)).toBeTruthy();
    expect(within(blocked).queryByText(/жодна адреса/)).toBeNull();
    expect(within(blocked).queryByText(/Станом на/)).toBeNull();
  });

  it("every block reason reads as a reason, never as an invitation that wasn't sent", () => {
    expect({
      unsubscribed: blockReasonOf("unsubscribed"),
      hard_bounce: blockReasonOf("hard_bounce"),
      spam_complaint: blockReasonOf("spam_complaint"),
      admin_blocked: blockReasonOf("admin_blocked"),
    }).toEqual({
      unsubscribed: "людина з цієї адреси відписалася від листів.",
      hard_bounce: "адреса не існує або не приймає пошту.",
      spam_complaint: "на попередній лист з цієї адреси поскаржилися як на спам.",
      admin_blocked: "адресу заблоковано вручну в поштовому сервісі.",
    });
  });
});

describe("S4 history", () => {
  const AT = new Date("2026-10-16T07:05:00Z");
  const created: ShelterHistoryEntry = {
    kind: "shelter_created",
    at: AT,
    moderatorId: ME,
    via: "registry",
  };
  const cursor = "history-cursor" as KabinetCursor;

  it("says when there are no entries yet", () => {
    renderScreen();
    expect(within(section("Історія")).getByText("Записів ще немає.")).toBeTruthy();
    expect(
      within(section("Історія")).getByText(
        "Зміни статусу, даних, адміністраторів, збору коштів і тварин. Підтвердження «Ще шукає» тут не записуються.",
      ),
    ).toBeTruthy();
  });

  it("renders each entry as its line and moment, and «Показати ще» sends the cursor for this shelter", async () => {
    const list = vi.fn(async () => ({
      items: [
        {
          kind: "admin_invited",
          at: new Date("2026-10-15T07:00:00Z"),
          moderatorId: ME,
          email: "olena@example.org",
        },
      ],
      nextCursor: null,
    }));
    render(
      <HistoryList
        shelterId={SHELTER_ID}
        first={{ items: [created], nextCursor: cursor }}
        people={{ me: ME, admins: [] }}
        client={
          {
            registry: { shelters: { list: vi.fn() }, history: { list } },
          } as unknown as RegistryReadClient
        }
        restart={vi.fn()}
      />,
    );
    const history = section("Історія");
    expect(within(history).getByText("Притулок створено · ви")).toBeTruthy();
    expect(within(history).getByText("16 жовтня 2026 р. о 10:05")).toBeTruthy();
    await userEvent.click(within(history).getByRole("button", { name: "Показати ще" }));
    expect(list).toHaveBeenCalledWith({
      shelterId: SHELTER_ID,
      cursor: "history-cursor",
      limit: 20,
    });
    expect(
      within(history).getByText("Надіслано запрошення: Не записано, olena@example.org · ви"),
    ).toBeTruthy();
    expect(within(history).queryByRole("button", { name: "Показати ще" })).toBeNull();
  });

  it("a failed page offers the same request again", async () => {
    const list = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <HistoryList
        shelterId={SHELTER_ID}
        first={{ items: [created], nextCursor: cursor }}
        people={{ me: ME, admins: [] }}
        client={
          {
            registry: { shelters: { list: vi.fn() }, history: { list } },
          } as unknown as RegistryReadClient
        }
        restart={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Не вдалося. Спробуйте ще раз.")).toBeTruthy();
    expect(within(alert).getByRole("button", { name: "Спробувати ще раз" })).toBeTruthy();
  });
});
