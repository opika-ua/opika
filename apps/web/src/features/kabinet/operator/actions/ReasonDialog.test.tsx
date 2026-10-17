import type { RegistryShelterView } from "@opika/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "./DecisionPanel";
import {
  apiError,
  lostAnswer,
  MODERATOR,
  registryView,
  renderWithActions,
  SHELTER_ID,
  withVerification,
} from "./test-fixtures";

/**
 * The reason dialog (N15) for reject and suspend, opened from the decision
 * panel as the operator meets it. Strings transcribed from `rui-copy-uk.md`
 * §3.2 (and K4's «Закрити», «Скасувати», «Оберіть причину»).
 */

const AT = new Date("2026-10-01T09:00:00Z");
const NONE = { items: [], submittedAt: AT };
const underReview = withVerification(registryView(), {
  status: "under_review",
  startedAt: AT,
  reviewerId: MODERATOR,
  evidence: NONE,
});
const verified = withVerification(registryView(), {
  status: "verified",
  verifiedAt: new Date("2026-03-14T10:00:00Z"),
  verifiedBy: MODERATOR,
  evidence: NONE,
});
const rejectedWith = (note: string): RegistryShelterView =>
  withVerification(underReview, {
    status: "rejected",
    rejectedAt: AT,
    rejectedBy: MODERATOR,
    reason: { code: "spam", note },
    evidence: NONE,
  });
const suspendedWith = (note: string): RegistryShelterView =>
  withVerification(verified, {
    status: "suspended",
    suspendedAt: AT,
    suspendedBy: MODERATOR,
    reason: { code: "complaint_upheld", note },
    priorState: {
      status: "verified",
      verifiedAt: new Date("2026-03-14T10:00:00Z"),
      verifiedBy: MODERATOR,
    },
    evidence: NONE,
  });

const panel = () => within(screen.getByRole("region", { name: "Рішення" }));

async function openReject() {
  await userEvent.click(panel().getByRole("button", { name: "Відхилити…" }));
  return within(screen.getByRole("dialog", { name: "Відхилити «Домівка»?" }));
}

describe("reject: code and note, both required", () => {
  it("names the shelter, says the shelter reads the note verbatim, and starts on its title", async () => {
    renderWithActions(<DecisionPanel />, { view: underReview });
    const dialog = await openReject();
    expect(
      dialog.getByText(
        "Притулок побачить це пояснення дослівно у своєму кабінеті. Його тварин не буде в галереї.",
      ),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        dialog.getByRole("heading", { name: "Відхилити «Домівка»?" }),
      ),
    );
    expect(
      within(dialog.getByLabelText("Причина"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Оберіть причину",
      "Недостатньо доказів",
      "Не вдалося підтвердити, хто стоїть за притулком",
      "Повторна заявка",
      "Поза областю, де працює сайт",
      "Спам",
      "Інше",
    ]);
    expect(
      dialog.getByText("Обовʼязково. Пишіть так, щоб людина знала, що робити далі."),
    ).toBeTruthy();
  });

  it("the primary stays disabled until both are set, and pressing it before then sends nothing", async () => {
    const reject = vi.fn(async () => rejectedWith("Надішліть виписку з ЄДР."));
    renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: { verification: { reject } },
    });
    const dialog = await openReject();
    const confirm = dialog.getByRole("button", { name: "Відхилити" });
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(confirm);

    await userEvent.selectOptions(dialog.getByLabelText("Причина"), "Спам");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(confirm);

    // Whitespace is not a note (the contract trims, then requires a character).
    await userEvent.type(dialog.getByLabelText("Пояснення"), "   ");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(confirm);
    expect(reject).not.toHaveBeenCalled();

    await userEvent.type(dialog.getByLabelText("Пояснення"), "Надішліть виписку з ЄДР.  ");
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
  });

  it("a note alone, with no code, keeps it disabled too", async () => {
    renderWithActions(<DecisionPanel />, { view: underReview });
    const dialog = await openReject();
    await userEvent.type(dialog.getByLabelText("Пояснення"), "Надішліть виписку.");
    expect(dialog.getByRole("button", { name: "Відхилити" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("sends the code and the trimmed note, closes, and the panel shows the rejection", async () => {
    const reject = vi.fn(async () => rejectedWith("Надішліть виписку з ЄДР."));
    renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: { verification: { reject } },
      reread: async () => rejectedWith("Надішліть виписку з ЄДР."),
    });
    const dialog = await openReject();
    await userEvent.selectOptions(dialog.getByLabelText("Причина"), "Спам");
    await userEvent.type(dialog.getByLabelText("Пояснення"), "  Надішліть виписку з ЄДР.  ");
    await userEvent.click(dialog.getByRole("button", { name: "Відхилити" }));
    expect(reject).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      reason: { code: "spam", note: "Надішліть виписку з ЄДР." },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel().getByText("Спам. Надішліть виписку з ЄДР.")).toBeTruthy();
  });

  it("stops the note at the contract's 2,000", async () => {
    renderWithActions(<DecisionPanel />, { view: underReview });
    const dialog = await openReject();
    expect(dialog.getByLabelText("Пояснення").getAttribute("maxlength")).toBe("2000");
  });
});

describe("closing", () => {
  it("Escape, ✕ and «Скасувати» close it, send nothing, and give focus back to the opener", async () => {
    const reject = vi.fn();
    renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: { verification: { reject } },
    });
    const opener = panel().getByRole("button", { name: "Відхилити…" });

    await openReject();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));

    const dialog = await openReject();
    await userEvent.click(dialog.getByRole("button", { name: "Закрити" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    const again = await openReject();
    await userEvent.click(again.getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reject).not.toHaveBeenCalled();
  });

  it("Tab past the last control comes back to the first: focus stays in the dialog", async () => {
    renderWithActions(<DecisionPanel />, { view: underReview });
    const dialog = await openReject();
    dialog.getByRole("button", { name: "Відхилити" }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: "Закрити" }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: "Відхилити" }));
  });
});

describe("suspend", () => {
  it("its own title, body, codes and button; sends the suspension", async () => {
    const suspend = vi.fn(async () => suspendedWith("Скарга від ветклініки."));
    renderWithActions(<DecisionPanel />, {
      view: verified,
      client: { verification: { suspend } },
      reread: async () => suspendedWith("Скарга від ветклініки."),
    });
    await userEvent.click(panel().getByRole("button", { name: "Призупинити…" }));
    const dialog = within(screen.getByRole("dialog", { name: "Призупинити «Домівка»?" }));
    expect(
      dialog.getByText(
        "Тварини притулку одразу зникнуть із галереї. Притулок побачить це пояснення у своєму кабінеті. Відновити можна будь-коли.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog.getByLabelText("Причина"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Оберіть причину",
      "Немає звʼязку з притулком",
      "Скарга підтвердилася",
      "Картки не відповідають дійсності",
      "Підозра на шахрайство",
      "Інше",
    ]);
    await userEvent.selectOptions(dialog.getByLabelText("Причина"), "Скарга підтвердилася");
    await userEvent.type(dialog.getByLabelText("Пояснення"), "Скарга від ветклініки.");
    await userEvent.click(dialog.getByRole("button", { name: "Призупинити" }));
    expect(suspend).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      reason: { code: "complaint_upheld", note: "Скарга від ветклініки." },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel().getByRole("button", { name: "Відновити → «Перевірено»" })).toBeTruthy();
  });
});

describe("outcomes inside the dialog", () => {
  async function fillAndSend() {
    const dialog = await openReject();
    await userEvent.selectOptions(dialog.getByLabelText("Причина"), "Спам");
    await userEvent.type(dialog.getByLabelText("Пояснення"), "Надішліть виписку.");
    await userEvent.click(dialog.getByRole("button", { name: "Відхилити" }));
    return dialog;
  }

  it("a server failure keeps the dialog open with the note as typed, and says so", async () => {
    renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: {
        verification: {
          reject: vi.fn(async () => {
            throw apiError("INTERNAL_SERVER_ERROR");
          }),
        },
      },
    });
    const dialog = await fillAndSend();
    expect(dialog.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
    expect((dialog.getByLabelText("Пояснення") as HTMLTextAreaElement).value).toBe(
      "Надішліть виписку.",
    );
  });

  it("a lost answer the re-read shows done (same code, same note): closes as done", async () => {
    const { reread } = renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: {
        verification: {
          reject: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => rejectedWith("Надішліть виписку."),
    });
    await fillAndSend();
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel().queryByRole("alert")).toBeNull();
  });

  it("a lost answer the re-read shows not done: stays open, his failure text", async () => {
    renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: {
        verification: {
          reject: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => underReview,
    });
    const dialog = await fillAndSend();
    expect(dialog.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });

  it("a lost answer whose re-read finds a different note is not counted as this one", async () => {
    renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: {
        verification: {
          reject: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      reread: async () => rejectedWith("Інше пояснення."),
    });
    const dialog = await fillAndSend();
    expect(dialog.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });

  it("ILLEGAL_TRANSITION: closes, and the panel says the status moved, after re-reading", async () => {
    const { reread } = renderWithActions(<DecisionPanel />, {
      view: underReview,
      client: {
        verification: {
          reject: vi.fn(async () => {
            throw apiError("ILLEGAL_TRANSITION");
          }),
        },
      },
      reread: async () => verified,
    });
    await fillAndSend();
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel().getByRole("alert").textContent).toBe(
      "З поточного статусу так не можна. Сторінку оновлено.",
    );
  });
});
