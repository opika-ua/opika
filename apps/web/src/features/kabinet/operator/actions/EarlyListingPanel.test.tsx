import { EARLY_LISTING_REMINDER_DAYS } from "@opika/domain";
import { uk } from "@opika/i18n";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EarlyListingPanel } from "./EarlyListingPanel";
import {
  apiError,
  lostAnswer,
  registryView,
  renderWithActions,
  SHELTER_ID,
  withEarlyListing,
  withVerification,
} from "./test-fixtures";

/** Strings from the owner-approved copy table (2026-11-04, N7-N12). */

const AT = new Date("2026-10-04T09:00:00Z");
const MOD = "11111111-1111-4111-8111-111111111111" as never;
const pending = registryView();
const none = { state: { kind: "none" }, periodsUsed: 0 } as const;
const running = (daysLeft: number, periodsUsed = 1) =>
  ({
    state: {
      kind: "running",
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      daysLeft,
      remind: daysLeft <= EARLY_LISTING_REMINDER_DAYS,
    },
    periodsUsed,
  }) as const;
const lapsed = (periodsUsed: number) =>
  ({
    state: { kind: "lapsed", expiredAt: new Date("2026-11-03T12:00:00Z") },
    periodsUsed,
  }) as const;

const ALLOW = "Дозволити показ до завершення перевірки";
const CONFIRM =
  "Картки притулку побачать усі, з позначкою «на перевірці». Дозвіл діє до 60 днів, зняти його можна будь-коли.";

describe("«Дозволити показ до завершення перевірки»", () => {
  it("is not offered once the decision is made or refused", () => {
    const evidence = { items: [], submittedAt: AT };
    for (const verification of [
      { status: "verified", verifiedAt: AT, verifiedBy: MOD, evidence },
      {
        status: "rejected",
        rejectedAt: AT,
        rejectedBy: MOD,
        reason: { code: "spam", note: null },
        evidence,
      },
    ] as const) {
      const { unmount } = renderWithActions(<EarlyListingPanel />, {
        view: withVerification(withEarlyListing(pending, none), verification),
      });
      expect(screen.queryByRole("button"), verification.status).toBeNull();
      unmount();
    }
  });

  it("is offered on a pending shelter, and asks to confirm with the approved text before sending", async () => {
    const answered = withEarlyListing(pending, running(60, 1));
    const allow = vi.fn(async (_input: unknown) => answered);
    renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, none),
      client: { earlyListing: { allow } },
      reread: async () => answered,
    });
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: ALLOW }));
    expect(allow).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(CONFIRM)).toBeTruthy();
    expect(dialog.queryByLabelText("Чому подовжуєте показ")).toBeNull();
    await u.click(dialog.getByRole("button", { name: ALLOW }));
    expect(allow).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID });
    expect(await screen.findByRole("button", { name: "Зняти дозвіл" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelling sends nothing", async () => {
    const allow = vi.fn();
    renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, none),
      client: { earlyListing: { allow } },
    });
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: ALLOW }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Скасувати" }));
    expect(allow).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the second period asks for the reason, will not send without it, then sends it trimmed", async () => {
    const answered = withEarlyListing(pending, running(60, 2));
    const allow = vi.fn(async (_input: unknown) => answered);
    renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, lapsed(1)),
      client: { earlyListing: { allow } },
      reread: async () => answered,
    });
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: ALLOW }));
    const dialog = within(screen.getByRole("dialog"));
    await u.click(dialog.getByRole("button", { name: ALLOW }));
    expect(allow).not.toHaveBeenCalled();
    await u.type(dialog.getByLabelText("Чому подовжуєте показ"), "  чекаємо на візит  ");
    await u.click(dialog.getByRole("button", { name: ALLOW }));
    expect(allow).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      note: "чекаємо на візит",
    });
  });

  it("after two periods the third is refused up front: the line, no button", () => {
    renderWithActions(<EarlyListingPanel />, { view: withEarlyListing(pending, lapsed(2)) });
    expect(screen.getByText("Показ до перевірки вже дозволяли двічі.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: ALLOW })).toBeNull();
  });

  it("says when the last period ended", () => {
    renderWithActions(<EarlyListingPanel />, { view: withEarlyListing(pending, lapsed(1)) });
    expect(screen.getByText(/^Показ завершився /)).toBeTruthy();
  });

  it("a refusal for too little evidence says what is needed", async () => {
    const allow = vi.fn(async () => {
      throw apiError("EARLY_LISTING_REFUSED", { reason: "evidence_below_minimum" });
    });
    renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, none),
      client: { earlyListing: { allow } },
    });
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: ALLOW }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: ALLOW }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Щоб дозволити показ, потрібен хоча б візит на місце або одна рекомендація.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a refusal because the period already moved re-reads and says the page was updated", async () => {
    const allow = vi.fn(async () => {
      throw apiError("EARLY_LISTING_REFUSED", { reason: "already_running" });
    });
    const { reread } = renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, none),
      client: { earlyListing: { allow } },
      reread: async () => withEarlyListing(pending, running(30, 1)),
    });
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: ALLOW }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: ALLOW }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      uk.kabinet.operator.errors.illegalTransition,
    );
    expect(reread).toHaveBeenCalled();
  });

  it("a lost answer that did not land keeps the dialog open and says it failed", async () => {
    const allow = vi.fn(async () => {
      throw lostAnswer();
    });
    renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, none),
      client: { earlyListing: { allow } },
      reread: async () => withEarlyListing(pending, none),
    });
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: ALLOW }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: ALLOW }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeTruthy();
  });
});

describe("«Зняти дозвіл» and the days left", () => {
  it.each([
    [1, "До кінця показу: 1 день"],
    [2, "До кінця показу: 2 дні"],
    [5, "До кінця показу: 5 днів"],
    [11, "До кінця показу: 11 днів"],
    [21, "До кінця показу: 21 день"],
    [22, "До кінця показу: 22 дні"],
  ])("%i day(s) left reads «%s»", (days, text) => {
    renderWithActions(<EarlyListingPanel />, { view: withEarlyListing(pending, running(days)) });
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("button", { name: ALLOW })).toBeNull();
  });

  it("revokes without a confirmation and shows the answer", async () => {
    const answered = withEarlyListing(pending, lapsed(1));
    const revoke = vi.fn(async (_input: unknown) => answered);
    renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, running(30)),
      client: { earlyListing: { revoke } },
      reread: async () => answered,
    });
    await userEvent.click(screen.getByRole("button", { name: "Зняти дозвіл" }));
    expect(revoke).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID });
    expect(await screen.findByRole("button", { name: ALLOW })).toBeTruthy();
  });

  it("a refused revoke says the page was updated", async () => {
    const revoke = vi.fn(async () => {
      throw apiError("EARLY_LISTING_REFUSED", { reason: "not_running" });
    });
    renderWithActions(<EarlyListingPanel />, {
      view: withEarlyListing(pending, running(30)),
      client: { earlyListing: { revoke } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Зняти дозвіл" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      uk.kabinet.operator.errors.illegalTransition,
    );
  });
});
