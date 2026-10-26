import type { RegistryShelterView } from "@opika/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "./DecisionPanel";
import {
  apiError,
  deferred,
  lostAnswer,
  MODERATOR,
  registryView,
  renderWithActions,
  SHELTER_ID,
  withVerification,
} from "./test-fixtures";

/**
 * S4's decision panel, behaviour only (Oleksii, 2026-10-17: "Test logic, not
 * looks"). Every string asserted is Oleksii's Ukrainian transcribed from
 * `rui-copy-uk.md` §3 (and K4's for the reused «Закрити», «Скасувати»,
 * «Оберіть причину»), never read from `uk.ts`, so a drift in the catalogue
 * fails here. The API is a fake client with the browser client's shape; the
 * server side of each call is `kabinet/registry.test.ts`'s.
 */

const AT = new Date("2026-10-01T09:00:00Z");
const NONE = { items: [], submittedAt: AT };

const pending = registryView();
const underReview = withVerification(pending, {
  status: "under_review",
  startedAt: AT,
  reviewerId: MODERATOR,
  evidence: NONE,
});
const fullEvidence = {
  items: [
    {
      kind: "edrpou_registration" as const,
      edrpou: "43218765" as never,
      registeredName: "ГО «Домівка»",
      documentKey: null,
    },
    { kind: "bank_account_holder" as const, holderName: "ГО «Домівка»", documentKey: null },
    {
      kind: "reference_contact" as const,
      name: "Ветклініка «Айболить»",
      channel: { kind: "phone" as const, e164: "+380501234567" },
      relationship: "veterinary_clinic" as const,
    },
  ],
  submittedAt: AT,
};
const readyForApproval = withVerification(pending, {
  status: "under_review",
  startedAt: AT,
  reviewerId: MODERATOR,
  evidence: fullEvidence,
});
const verified = withVerification(pending, {
  status: "verified",
  verifiedAt: new Date("2026-03-14T10:00:00Z"),
  verifiedBy: MODERATOR,
  evidence: NONE,
});
const suspendedFromVerified = withVerification(pending, {
  status: "suspended",
  suspendedAt: AT,
  suspendedBy: MODERATOR,
  reason: { code: "complaint_upheld", note: "Скарга від ветклініки. Пишіть мені." },
  priorState: {
    status: "verified",
    verifiedAt: new Date("2026-03-14T10:00:00Z"),
    verifiedBy: MODERATOR,
  },
  evidence: NONE,
});
const suspendedFromPaused = withVerification(pending, {
  status: "suspended",
  suspendedAt: AT,
  suspendedBy: MODERATOR,
  reason: { code: "other", note: "До повторного візиту." },
  priorState: {
    status: "paused",
    verifiedAt: new Date("2026-03-14T10:00:00Z"),
    verifiedBy: MODERATOR,
    pausedAt: new Date("2026-09-20T09:00:00Z"),
    pausedBy: { kind: "moderator", moderatorId: MODERATOR },
    reason: { code: "seasonal_closure", note: null },
  },
  evidence: NONE,
});
const rejected = withVerification(pending, {
  status: "rejected",
  rejectedAt: AT,
  rejectedBy: MODERATOR,
  reason: { code: "spam", note: "Це не притулок." },
  evidence: NONE,
});

const panel = () => within(screen.getByRole("region", { name: "Рішення" }));
/** The panel's moves: its buttons, less the evidence editor's own (resubmit's cards, R-UI 2). */
const buttonNames = () => {
  const editor = panel().queryByRole("region", { name: "Докази для перевірки" });
  return panel()
    .getAllByRole("button")
    .filter((button) => editor === null || !editor.contains(button))
    .map((button) => button.textContent);
};

describe("the panel offers the status's moves, and only those", () => {
  it("says what the shelter will see, under «Рішення»", () => {
    renderWithActions(<DecisionPanel />);
    expect(
      panel().getByText("Притулок побачить рішення і пояснення дослівно у своєму кабінеті."),
    ).toBeTruthy();
  });

  it.each([
    ["pending", pending, ["Взяти на розгляд", "Відхилити…"]],
    ["under_review", readyForApproval, ["Схвалити → «Перевірено»", "Відхилити…"]],
    ["verified", verified, ["Призупинити…"]],
    [
      "suspended (from verified)",
      suspendedFromVerified,
      ["Відновити → «Перевірено»", "Відхилити…"],
    ],
    ["suspended (from paused)", suspendedFromPaused, ["Відновити → «На паузі»", "Відхилити…"]],
    ["rejected", rejected, ["Повернути на перевірку"]],
  ] as [string, RegistryShelterView, string[]][])("%s: %j", (_status, view, names) => {
    renderWithActions(<DecisionPanel />, { view });
    expect(buttonNames()).toEqual(names);
  });

  it("paused: suspend only (the shelter resumes itself; the operator can't)", () => {
    const paused = withVerification(pending, {
      status: "paused",
      verifiedAt: new Date("2026-03-14T10:00:00Z"),
      verifiedBy: MODERATOR,
      pausedAt: AT,
      pausedBy: { kind: "moderator", moderatorId: MODERATOR },
      reason: { code: "relocation", note: null },
      evidence: NONE,
    });
    renderWithActions(<DecisionPanel />, { view: paused });
    expect(buttonNames()).toEqual(["Призупинити…"]);
  });
});

describe("pending → «Взяти на розгляд» → «Схвалити» (answer 4)", () => {
  it("takes it under review with one request, then offers approve", async () => {
    const { fns } = renderWithActions(<DecisionPanel />, {
      view: pending,
      client: { verification: { startReview: vi.fn(async () => readyForApproval) } },
      reread: async () => readyForApproval,
    });
    await userEvent.click(panel().getByRole("button", { name: "Взяти на розгляд" }));
    expect(fns.verification.startReview).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID });
    expect(buttonNames()).toEqual(["Схвалити → «Перевірено»", "Відхилити…"]);
    // The pressed button is gone: focus goes to the panel's heading.
    await waitFor(() =>
      expect(document.activeElement).toBe(panel().getByRole("heading", { name: "Рішення" })),
    );
  });

  it("approves with evidence that meets the policy, saying what approval does", async () => {
    const { fns } = renderWithActions(<DecisionPanel />, {
      view: readyForApproval,
      client: { verification: { approve: vi.fn(async () => verified) } },
      reread: async () => verified,
    });
    expect(
      panel().getByText(
        "Після схвалення тварини притулку одразу зʼявляються в галереї. Для відхилення потрібне пояснення.",
      ),
    ).toBeTruthy();
    await userEvent.click(panel().getByRole("button", { name: "Схвалити → «Перевірено»" }));
    expect(fns.verification.approve).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID });
    expect(buttonNames()).toEqual(["Призупинити…"]);
  });

  it("with evidence short of the policy, approve is disabled and the gap list is next to it", async () => {
    const { fns } = renderWithActions(<DecisionPanel />, { view: underReview });
    const approve = panel().getByRole("button", { name: "Схвалити → «Перевірено»" });
    expect(approve.getAttribute("aria-disabled")).toBe("true");
    const description = approve.getAttribute("aria-describedby") ?? "";
    const blocked = document.getElementById(description);
    expect(blocked?.textContent).toContain("Схвалити поки не можна - бракує доказів:");
    expect(
      within(blocked as HTMLElement)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Для схвалення бракує: Реєстрація · ЄДРПОУ - 0 з 1.",
      "Для схвалення бракує: Власник банківського рахунку - 0 з 1.",
      "Для схвалення бракує: Рекомендація - 0 з 1.",
    ]);
    await userEvent.click(approve);
    expect(fns.verification.approve).not.toHaveBeenCalled();
  });

  it("EVIDENCE_INSUFFICIENT (the evidence changed meanwhile): re-reads, and the panel shows the gaps", async () => {
    const { fns, reread } = renderWithActions(<DecisionPanel />, {
      view: readyForApproval,
      client: {
        verification: {
          approve: vi.fn(async () => {
            throw apiError("EVIDENCE_INSUFFICIENT", {
              gaps: [{ kind: "reference_contact", minimum: 1, provided: 0 }],
            });
          }),
        },
      },
      reread: async () => underReview,
    });
    await userEvent.click(panel().getByRole("button", { name: "Схвалити → «Перевірено»" }));
    expect(fns.verification.approve).toHaveBeenCalledOnce();
    expect(reread).toHaveBeenCalledOnce();
    expect(
      panel()
        .getByRole("button", { name: "Схвалити → «Перевірено»" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(panel().getByText("Схвалити поки не можна - бракує доказів:")).toBeTruthy();
  });
});

describe("reinstate names the status it returns to", () => {
  it("from verified: «Відновити → «Перевірено»», the animals come back, no confirmation", async () => {
    const { fns } = renderWithActions(<DecisionPanel />, {
      view: suspendedFromVerified,
      client: { verification: { reinstate: vi.fn(async () => verified) } },
      reread: async () => verified,
    });
    expect(
      panel().getByText(
        "Кнопка «Відновити» поверне статус «Перевірено», і тварини знову зʼявляться в галереї.",
      ),
    ).toBeTruthy();
    expect(panel().getByText("Підтвердження не потрібне: ця дія нічого не приховує.")).toBeTruthy();
    await userEvent.click(panel().getByRole("button", { name: "Відновити → «Перевірено»" }));
    expect(fns.verification.reinstate).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(buttonNames()).toEqual(["Призупинити…"]);
  });

  it("from paused: back to the pause, which the shelter lifts itself", () => {
    renderWithActions(<DecisionPanel />, { view: suspendedFromPaused });
    expect(
      panel().getByText(
        "Кнопка «Відновити» поверне притулок на паузу, а не в «Перевірено». Тварини лишаться прихованими, доки притулок сам не зніме паузу.",
      ),
    ).toBeTruthy();
    // The interrupted state with its own chip and since when (20 вересня, Kyiv).
    expect(panel().getByText("До призупинення статус був")).toBeTruthy();
    expect(panel().getByText("На паузі")).toBeTruthy();
    expect(panel().getByText(/^з 20 вересня 2026 р\.? притулок сам поставив паузу$/)).toBeTruthy();
  });

  it("shows the suspension's reason as the shelter reads it: code, then the note verbatim", () => {
    renderWithActions(<DecisionPanel />, { view: suspendedFromVerified });
    expect(panel().getByText("Притулок призупинено")).toBeTruthy();
    const label = panel().getByText("Пояснення, яке бачить притулок");
    expect(label.nextElementSibling?.textContent).toBe(
      "Скарга підтвердилася. Скарга від ветклініки. Пишіть мені.",
    );
    expect(panel().getByText(/^з 14 березня 2026 р\.?$/)).toBeTruthy();
  });
});

describe("rejected", () => {
  it("shows «Відхилено» with the code and the note", () => {
    renderWithActions(<DecisionPanel />, { view: rejected });
    expect(panel().getByText("Відхилено")).toBeTruthy();
    expect(panel().getByText("Спам. Це не притулок.")).toBeTruthy();
  });
});

describe("refusals and lost answers", () => {
  it("ILLEGAL_TRANSITION: re-reads the page, then says so, and the panel shows the status it found", async () => {
    const { reread } = renderWithActions(<DecisionPanel />, {
      view: pending,
      client: {
        verification: {
          startReview: vi.fn(async () => {
            throw apiError("ILLEGAL_TRANSITION", {
              machine: "verification",
              from: "rejected",
              event: "start_review",
            });
          }),
        },
      },
      reread: async () => rejected,
    });
    await userEvent.click(panel().getByRole("button", { name: "Взяти на розгляд" }));
    expect(reread).toHaveBeenCalledOnce();
    expect(panel().getByRole("alert").textContent).toBe(
      "З поточного статусу так не можна. Сторінку оновлено.",
    );
    expect(buttonNames()).toEqual(["Повернути на перевірку"]);
  });

  it("ILLEGAL_TRANSITION with a re-read that fails: never claims the page was updated", async () => {
    renderWithActions(<DecisionPanel />, {
      view: pending,
      client: {
        verification: {
          startReview: vi.fn(async () => {
            throw apiError("ILLEGAL_TRANSITION");
          }),
        },
      },
      reread: async () => null,
    });
    await userEvent.click(panel().getByRole("button", { name: "Взяти на розгляд" }));
    expect(panel().getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });

  it("a lost answer: says it is checking, re-reads, and the move found done is simply done", async () => {
    const reading = deferred<RegistryShelterView>();
    const { reread } = renderWithActions(<DecisionPanel />, {
      view: pending,
      client: {
        verification: {
          startReview: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: () => reading.promise,
    });
    await userEvent.click(panel().getByRole("button", { name: "Взяти на розгляд" }));
    expect(panel().getByRole("status").textContent).toBe(
      "Відповідь не надійшла. Сторінка перевіряє, чи дію виконано.",
    );
    expect(panel().queryByRole("alert")).toBeNull();
    await act(async () => reading.resolve(underReview));
    expect(reread).toHaveBeenCalledOnce();
    expect(panel().queryByRole("alert")).toBeNull();
    expect(panel().getByRole("status").textContent).toBe("");
    expect(buttonNames()).toEqual(["Схвалити → «Перевірено»", "Відхилити…"]);
  });

  it("a lost answer the re-read shows not done: his failure text", async () => {
    renderWithActions(<DecisionPanel />, {
      view: pending,
      client: {
        verification: {
          startReview: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => pending,
    });
    await userEvent.click(panel().getByRole("button", { name: "Взяти на розгляд" }));
    expect(panel().getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });

  it("a server refusal is not re-read: his failure text at once", async () => {
    const { reread } = renderWithActions(<DecisionPanel />, {
      view: pending,
      client: {
        verification: {
          startReview: vi.fn(async () => {
            throw apiError("INTERNAL_SERVER_ERROR");
          }),
        },
      },
    });
    await userEvent.click(panel().getByRole("button", { name: "Взяти на розгляд" }));
    expect(panel().getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
    expect(reread).not.toHaveBeenCalled();
  });

  it("one request at a time: a second press while the first is in flight sends nothing", async () => {
    const answer = deferred<RegistryShelterView>();
    const startReview = vi.fn(() => answer.promise);
    renderWithActions(<DecisionPanel />, {
      view: pending,
      client: { verification: { startReview } },
    });
    const button = panel().getByRole("button", { name: "Взяти на розгляд" });
    await userEvent.click(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    // «Відхилити…» waits too: no dialog opens over a request in flight.
    await userEvent.click(panel().getByRole("button", { name: "Відхилити…" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => answer.resolve(underReview));
    expect(startReview).toHaveBeenCalledOnce();
  });
});
