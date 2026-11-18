import type { ApplicationQueueItemView, ApplicationsQueueView } from "@opika/contracts";
import type { CityId, ShelterId } from "@opika/domain";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError } from "../actions/test-fixtures";
import { ApplicationsBlock } from "./ApplicationsBlock";
import type { ApplicationsClient } from "./applications-client";
import { ApplicationDecision, DonationQueueDecision, reasonOf } from "./QueueDecisions";

/** The «Заявки» block as the operator meets it: what each card says, and what each button sends. */

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NOW = new Date("2026-11-20T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const SHELTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ShelterId;
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ShelterId;
const CITY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as CityId;
const LINK = "https://www.instagram.com/lapa_help/";

const card = (overrides: Partial<ApplicationQueueItemView> = {}): ApplicationQueueItemView => ({
  shelterId: SHELTER,
  version: 3,
  name: "Лапа допомоги",
  cityId: CITY,
  appliedAt: new Date(NOW.getTime() - HOUR),
  link: LINK,
  contact: { kind: "telegram", handle: "lapa_help" },
  email: "lapa@example.org",
  emailStatus: "confirmed",
  duplicates: [],
  drafts: { animals: 3, photos: 7 },
  ...overrides,
});

const view = (overrides: Partial<ApplicationsQueueView> = {}): ApplicationsQueueView => ({
  applications: [card()],
  listedUnverified: [],
  pendingDonations: [],
  funnel: {
    windowDays: 30,
    counts: [
      { kind: "registered", count: 5 },
      { kind: "email_confirmed", count: 4 },
      { kind: "first_draft", count: 3 },
      { kind: "approved", count: 2 },
      { kind: "first_published", count: 1 },
    ],
  },
  ...overrides,
});

function fakeClient() {
  const fns = {
    accept: vi.fn(),
    reject: vi.fn(),
    approve: vi.fn(),
    rejectDonation: vi.fn(),
  };
  const client = {
    registry: {
      applications: { accept: fns.accept, reject: fns.reject },
      donation: { approve: fns.approve, reject: fns.rejectDonation },
    },
  } as unknown as ApplicationsClient;
  return { client, fns };
}

beforeEach(() => router.refresh.mockReset());

describe("ApplicationsBlock", () => {
  it("names the count and shows the card's facts, the link in full and opened apart", () => {
    render(<ApplicationsBlock view={view()} cityNames={{ [CITY]: "Бровари" }} now={NOW} />);
    expect(screen.getByRole("heading", { level: 2, name: "Заявки (1)" })).toBeTruthy();
    const link = screen.getByRole("link", { name: LINK });
    expect(link.getAttribute("href")).toBe(LINK);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Бровари")).toBeTruthy();
    expect(screen.getByText("@lapa_help")).toBeTruthy();
    expect(screen.getByText("Email підтверджено")).toBeTruthy();
    expect(screen.getByText("3 чернетки, 7 фото")).toBeTruthy();
    expect(screen.queryByText("Чекає понад 36 годин")).toBeNull();
  });

  it("marks an application waiting longer than 36 hours", () => {
    const old = card({ appliedAt: new Date(NOW.getTime() - 37 * HOUR) });
    render(<ApplicationsBlock view={view({ applications: [old] })} cityNames={{}} now={NOW} />);
    expect(screen.getByText("Чекає понад 36 годин")).toBeTruthy();
  });

  it("names each possible duplicate and why, linking to it", () => {
    const flagged = card({
      duplicates: [{ kind: "same_link", shelterId: OTHER, shelterName: "Інший" }],
    });
    render(<ApplicationsBlock view={view({ applications: [flagged] })} cityNames={{}} now={NOW} />);
    const link = screen.getByRole("link", {
      name: "Можливий дублікат: Інший (те саме посилання)",
    });
    expect(link.getAttribute("href")).toBe(`/kabinet/prytulky/${OTHER}`);
  });

  it("lists accepted applications still shown early, with the days left", () => {
    render(
      <ApplicationsBlock
        view={view({
          applications: [],
          listedUnverified: [
            {
              shelterId: OTHER,
              name: "Схвалений",
              cityId: CITY,
              expiresAt: NOW,
              daysLeft: 22,
              remind: false,
            },
          ],
        })}
        cityNames={{}}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Заявки (0)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Схвалений" })).toBeTruthy();
    expect(screen.getByText("До кінця показу: 22 дні")).toBeTruthy();
  });

  /** D3: money never goes live unchecked, so the queue shows S4's holder check beside «Схвалити». */
  it.each([
    [
      { kind: "registered_ngo", legalName: "ГО «Лапа»", edrpou: "12345678", registeredAt: NOW },
      "Перевірте, що власник рахунку збігається з організацією",
      "Юридична особа: ГО «Лапа»",
    ],
    [
      { kind: "unregistered_initiative", contactPersonName: "Олена К." },
      "Перевірте, що власник рахунку – контактна особа ініціативи",
      "Контактна особа: Олена К.",
    ],
    [
      null,
      "Перевірте, що власник рахунку збігається з організацією",
      "Юридична особа: Не записано",
    ],
  ] as const)(
    "a donation link's card names who should hold the account (%#)",
    (legalEntity, hint, holder) => {
      render(
        <ApplicationsBlock
          view={view({
            applications: [],
            pendingDonations: [
              {
                shelterId: OTHER,
                name: "Лапа",
                version: 2,
                proposedUrl: "https://send.monobank.ua/jar/abc",
                legalEntity: legalEntity as never,
              },
            ],
          })}
          cityNames={{}}
          now={NOW}
        />,
      );
      const donation = within(screen.getByRole("listitem"));
      expect(donation.getByText(hint)).toBeTruthy();
      // The name to compare sits before «Схвалити», where the decision is made.
      const name = donation.getByText(holder);
      const approve = donation.getByRole("button", { name: "Схвалити" });
      expect(name.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    },
  );

  it("shows the funnel's counts per step for the last 30 days", () => {
    render(<ApplicationsBlock view={view()} cityNames={{}} now={NOW} />);
    const table = screen.getByRole("table", { name: "Реєстрації за 30 днів" });
    const row = within(table).getByRole("row", { name: /Підтвердили email/ });
    expect(within(row).getByText("4")).toBeTruthy();
    expect(within(table).getAllByRole("row")).toHaveLength(5);
  });
});

describe("ApplicationDecision", () => {
  it("«Схвалити» sends the card's version, says so and re-reads the page", async () => {
    const { client, fns } = fakeClient();
    fns.accept.mockResolvedValue({ kind: "decided", status: "pending" });
    render(
      <ApplicationDecision
        shelterId={SHELTER}
        version={3}
        name="Лапа"
        emailStatus="confirmed"
        client={client}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(fns.accept).toHaveBeenCalledWith({ shelterId: SHELTER, expectedVersion: 3 });
    expect(await screen.findByText("Заявку схвалено")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("a double tap sends one decision", async () => {
    const { client, fns } = fakeClient();
    let answer: (value: unknown) => void = () => {};
    fns.accept.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(
      <ApplicationDecision
        shelterId={SHELTER}
        version={3}
        name="Лапа"
        emailStatus="confirmed"
        client={client}
      />,
    );
    const button = screen.getByRole("button", { name: "Схвалити" });
    button.click();
    button.click();
    answer({ kind: "decided", status: "pending" });
    await screen.findByText("Заявку схвалено");
    expect(fns.accept).toHaveBeenCalledTimes(1);
  });

  it("«Схвалити» does nothing while the email is unconfirmed", async () => {
    const { client, fns } = fakeClient();
    render(
      <ApplicationDecision
        shelterId={SHELTER}
        version={3}
        name="Лапа"
        emailStatus="unconfirmed"
        client={client}
      />,
    );
    const button = screen.getByRole("button", { name: "Схвалити" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(button);
    expect(fns.accept).not.toHaveBeenCalled();
  });

  it("a decision someone else made meanwhile is said and the page re-read", async () => {
    const { client, fns } = fakeClient();
    fns.accept.mockResolvedValue({ kind: "already_decided", status: "pending" });
    render(
      <ApplicationDecision
        shelterId={SHELTER}
        version={3}
        name="Лапа"
        emailStatus="confirmed"
        client={client}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(
      await screen.findByText("З поточного статусу так не можна. Сторінку оновлено."),
    ).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("«Відхилити»: a preset, sent with no note; a refusal keeps the dialog open", async () => {
    const { client, fns } = fakeClient();
    fns.reject.mockRejectedValueOnce(apiError("INTERNAL_SERVER_ERROR"));
    fns.reject.mockResolvedValueOnce({ kind: "decided", status: "rejected" });
    render(
      <ApplicationDecision
        shelterId={SHELTER}
        version={3}
        name="Лапа"
        emailStatus="unconfirmed"
        client={client}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Відхилити" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Відхилити «Лапа»?" }));
    const confirm = dialog.getByRole("button", { name: "Відхилити" });
    await userEvent.click(confirm);
    expect(fns.reject).not.toHaveBeenCalled();
    await userEvent.selectOptions(
      dialog.getByRole("combobox", { name: "Причина" }),
      "duplicate_submission",
    );
    await userEvent.click(confirm);
    expect(fns.reject).toHaveBeenCalledWith({
      shelterId: SHELTER,
      expectedVersion: 3,
      reason: { code: "duplicate_submission", note: null },
    });
    expect(await dialog.findByRole("alert")).toBeTruthy();
    // Said once: the card keeps quiet while the dialog carries the alert.
    expect(screen.getAllByRole("alert", { hidden: true })).toHaveLength(1);
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Відхилено")).toBeTruthy();
  });
});

describe("reasonOf", () => {
  it("needs a code, and the text for «Інше» only", () => {
    expect(reasonOf("", "")).toBeNull();
    expect(reasonOf("other", "  ")).toBeNull();
    expect(reasonOf("other", " Немає контактів ")).toEqual({
      code: "other",
      note: "Немає контактів",
    });
    expect(reasonOf("not_animal_welfare", " ")).toEqual({
      code: "not_animal_welfare",
      note: null,
    });
  });
});

describe("DonationQueueDecision", () => {
  it("approves the proposal at the version read", async () => {
    const { client, fns } = fakeClient();
    fns.approve.mockResolvedValue({});
    render(
      <DonationQueueDecision
        shelterId={SHELTER}
        version={4}
        proposedUrl="https://send.monobank.ua/jar/abc"
        client={client}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(fns.approve).toHaveBeenCalledWith({ shelterId: SHELTER, expectedVersion: 4 });
    expect(await screen.findByText("Посилання схвалено.")).toBeTruthy();
  });

  it("a proposal changed meanwhile is CONFLICT: said, and the page re-read", async () => {
    const { client, fns } = fakeClient();
    fns.rejectDonation.mockRejectedValue(apiError("CONFLICT"));
    render(
      <DonationQueueDecision
        shelterId={SHELTER}
        version={4}
        proposedUrl="https://send.monobank.ua/jar/abc"
        client={client}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Відхилити" }));
    expect(
      await screen.findByText("Пропозиція змінилася, поки сторінка була відкрита. Тут – поточна."),
    ).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
  });
});
