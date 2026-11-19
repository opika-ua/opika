import type { KabinetShelterView } from "@opika/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnimalListScreen } from "./AnimalListScreen";

vi.mock("next/navigation", () => ({
  usePathname: () => "/kabinet/tvaryny",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const resend = vi.hoisted(() => vi.fn(async () => ({ kind: "sent" as const })));
vi.mock("../../../kabinet/registration/resend-confirmation-action", () => ({
  resendConfirmationEmail: resend,
}));

/** The shelter's landing page: the banner and the pending note while cards are shown early (N13, B5). */

const AT = new Date("2026-10-04T09:00:00Z");
const shelterIn = (
  verification: KabinetShelterView["verification"],
  earlyListing: KabinetShelterView["earlyListing"],
  registration: KabinetShelterView["registration"] = { source: "operator" },
) =>
  ({
    id: "s",
    displayName: "Домівка",
    verification,
    earlyListing,
    registration,
  }) as unknown as KabinetShelterView;

const NO_CARDS = { draft: 0, published: 0, reserved: 0, adopted: 0, withdrawn: 0 };

const renderScreen = (
  shelter: KabinetShelterView,
  viewer: "admin" | "support" = "admin",
  {
    counts = NO_CARDS,
    email = null,
    approvedDismissed = false,
    selfRegistration = true,
  }: {
    counts?: typeof NO_CARDS;
    email?: string | null;
    approvedDismissed?: boolean;
    selfRegistration?: boolean;
  } = {},
) =>
  render(
    <AnimalListScreen
      page={{
        kind: "list",
        shelter,
        viewer,
        editing: { kind: "open" },
        first: { items: [], nextCursor: null, counts, staleCount: 0 },
      }}
      operatorName="Олексій"
      person={email === null ? null : { name: null, email }}
      approvedDismissed={approvedDismissed}
      selfRegistration={selfRegistration}
    />,
  );

describe("the kabinet banner while cards are shown before verification", () => {
  it("says «на перевірці» exactly once on the page: the dated banner, not the note or the list line", () => {
    renderScreen(
      shelterIn({ status: "pending", since: AT } as KabinetShelterView["verification"], {
        kind: "running",
        expiresAt: new Date("2026-12-01T09:00:00Z"),
        daysLeft: 10,
      }),
    );
    expect(screen.queryAllByText(/на перевірці/)).toHaveLength(1);
  });

  it("says the end date, and cuts the pending note to its first sentence", () => {
    renderScreen(
      shelterIn({ status: "pending", since: AT } as KabinetShelterView["verification"], {
        kind: "running",
        expiresAt: new Date("2026-12-01T09:00:00Z"),
        daysLeft: 10,
      }),
    );
    expect(
      screen.getByText("Ваші картки показуються з позначкою «на перевірці» до 1 грудня."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Перевірку проводжу я. Якщо мені забракне інформації з відкритих джерел, я напишу вам.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/ваших тварин бачите лише ви/)).toBeNull();
  });

  it("without a permission there is no banner and the original note stays", () => {
    renderScreen(
      shelterIn({ status: "pending", since: AT } as KabinetShelterView["verification"], {
        kind: "none",
      }),
    );
    expect(screen.queryByText(/до 1 грудня/)).toBeNull();
    expect(screen.queryByText(/позначкою «на перевірці»/)).toBeNull();
    expect(screen.getByText(/ваших тварин бачите лише ви/)).toBeTruthy();
  });
});

describe("the kabinet line once the period has ended, review still open (gap 6)", () => {
  const ended = () =>
    shelterIn({ status: "under_review", since: AT } as KabinetShelterView["verification"], {
      kind: "ended",
      endedAt: new Date("2026-12-01T09:00:00Z"),
    });

  it("says when it ended, keeps the full pending note, and shows no running banner", () => {
    renderScreen(ended());
    expect(
      screen.getByText("Показ ваших карток з позначкою «на перевірці» завершився 1 грудня."),
    ).toBeTruthy();
    expect(screen.getByText(/ваших тварин бачите лише ви/)).toBeTruthy();
    expect(screen.queryByText(/показуються з позначкою/)).toBeNull();
  });

  it("in the support view still omits the «я» panel, and the dated line stays", () => {
    renderScreen(ended(), "support");
    expect(screen.queryByText(/Перевірку проводжу я/)).toBeNull();
    expect(screen.getByText(/завершився 1 грудня/)).toBeTruthy();
  });
});

describe("a self-registered shelter's banners (spec §2, Q3, P0-1)", () => {
  const SELF = (email: "confirmed" | "unconfirmed") =>
    ({ source: "self_registration", appliedAt: AT, email }) as const;
  const application = (email: "confirmed" | "unconfirmed") =>
    shelterIn(
      { status: "application", since: AT } as KabinetShelterView["verification"],
      { kind: "none" },
      SELF(email),
    );
  const PENDING_TEXT =
    "Перевіряю ваш притулок – зазвичай до 2 днів. Поки можете заповнити профіль і додати тварин як чернетки: опублікувати їх можна буде після перевірки.";
  const CONFIRM_TEXT =
    "Підтвердіть email – я надіслав лист на olena@example.org. Без цього я не зможу схвалити притулок.";
  const APPROVED_TEXT = "Притулок схвалено. Тепер можна публікувати тварин.";

  it("an application reads «На перевірці» and what it can do meanwhile", () => {
    renderScreen(application("confirmed"), "admin", { email: "olena@example.org" });
    expect(screen.getByRole("heading", { level: 2, name: "На перевірці" })).toBeTruthy();
    expect(screen.getByText(PENDING_TEXT)).toBeTruthy();
    expect(screen.queryByText(CONFIRM_TEXT)).toBeNull();
  });

  it("asks to confirm the address while it is unconfirmed, naming it", () => {
    renderScreen(application("unconfirmed"), "admin", { email: "olena@example.org" });
    expect(screen.getByText(CONFIRM_TEXT)).toBeTruthy();
  });

  it("offers «Надіслати ще раз» with the confirm banner; pressing it asks for the email again", async () => {
    resend.mockClear();
    renderScreen(application("unconfirmed"), "admin", { email: "olena@example.org" });
    await userEvent.click(screen.getByRole("button", { name: "Надіслати ще раз" }));
    expect(resend).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Перевірте пошту")).toBeTruthy();
  });

  it("no resend button once the address is confirmed, nor in the support view", () => {
    renderScreen(application("confirmed"), "admin", { email: "olena@example.org" });
    expect(screen.queryByRole("button", { name: "Надіслати ще раз" })).toBeNull();
    renderScreen(application("unconfirmed"), "support", { email: "olena@example.org" });
    expect(screen.queryByRole("button", { name: "Надіслати ще раз" })).toBeNull();
  });

  it("with SELF_REGISTRATION_ENABLED off there is no confirm banner and so no resend button", () => {
    renderScreen(application("unconfirmed"), "admin", {
      email: "olena@example.org",
      selfRegistration: false,
    });
    expect(screen.queryByText(CONFIRM_TEXT)).toBeNull();
    expect(screen.queryByRole("button", { name: "Надіслати ще раз" })).toBeNull();
  });

  it("the support view gets none of the «я» banners", () => {
    renderScreen(application("unconfirmed"), "support", { email: "olena@example.org" });
    expect(screen.queryByText(PENDING_TEXT)).toBeNull();
    expect(screen.queryByText(CONFIRM_TEXT)).toBeNull();
  });

  it("once approved: «Притулок схвалено» (dismissible) and the days left instead of the date", () => {
    renderScreen(
      shelterIn(
        { status: "pending", since: AT } as KabinetShelterView["verification"],
        { kind: "running", expiresAt: new Date("2026-12-01T09:00:00Z"), daysLeft: 22 },
        SELF("confirmed"),
      ),
    );
    expect(screen.getByText(APPROVED_TEXT)).toBeTruthy();
    expect(screen.getByText("До кінця показу: 22 дні")).toBeTruthy();
    expect(screen.queryByText(/до 1 грудня/)).toBeNull();
    // «Закрити» is a native form post (no client component): it works without JavaScript.
    const close = screen.getByRole("button", { name: "Закрити" });
    expect(close.getAttribute("type")).toBe("submit");
    expect(close.closest("form")).not.toBeNull();
  });

  it("once this browser closed it, «Притулок схвалено» is gone and the days left stay", () => {
    renderScreen(
      shelterIn(
        { status: "pending", since: AT } as KabinetShelterView["verification"],
        { kind: "running", expiresAt: new Date("2026-12-01T09:00:00Z"), daysLeft: 22 },
        SELF("confirmed"),
      ),
      "admin",
      { approvedDismissed: true },
    );
    expect(screen.queryByText(APPROVED_TEXT)).toBeNull();
    expect(screen.getByText("До кінця показу: 22 дні")).toBeTruthy();
  });

  it("stops saying «схвалено» once anything was published", () => {
    renderScreen(
      shelterIn(
        { status: "pending", since: AT } as KabinetShelterView["verification"],
        { kind: "running", expiresAt: new Date("2026-12-01T09:00:00Z"), daysLeft: 1 },
        SELF("confirmed"),
      ),
      "admin",
      { counts: { ...NO_CARDS, adopted: 1 } },
    );
    expect(screen.queryByText(APPROVED_TEXT)).toBeNull();
    expect(screen.getByText("До кінця показу: 1 день")).toBeTruthy();
  });

  it("an operator-created shelter sees none of them, and keeps the dated banner", () => {
    renderScreen(
      shelterIn({ status: "pending", since: AT } as KabinetShelterView["verification"], {
        kind: "running",
        expiresAt: new Date("2026-12-01T09:00:00Z"),
        daysLeft: 22,
      }),
    );
    expect(screen.queryByText(APPROVED_TEXT)).toBeNull();
    expect(screen.queryByText(/До кінця показу/)).toBeNull();
    expect(screen.getByText(/до 1 грудня/)).toBeTruthy();
  });
});
