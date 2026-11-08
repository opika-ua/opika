import type { RegistryShelterView } from "@opika/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DonationDecision } from "./DonationDecision";
import {
  ADMIN_ID,
  apiError,
  lostAnswer,
  registryView,
  renderWithActions,
  SHELTER_ID,
} from "./test-fixtures";

/**
 * N20 on S4: the operator decides on the proposed donation link, with the
 * version read (RG-Q12). Strings transcribed from `rui-copy-uk.md` §3.3.
 */

const LIVE = { url: "https://dobro.ua/fund/domivka", provider: "dobro_ua" } as const;
const PROPOSED = { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as const;
const proposal = (link: { url: string; provider: string }) => ({
  link: link as never,
  proposedAt: new Date("2026-10-15T09:00:00Z"),
  proposedBy: ADMIN_ID,
});

const withProposal = registryView({
  donation: LIVE as never,
  pendingDonation: proposal(PROPOSED),
  version: 7,
});
const approvedView = registryView({
  donation: PROPOSED as never,
  pendingDonation: null,
  version: 8,
});
const rejectedView = registryView({ donation: LIVE as never, pendingDonation: null, version: 8 });

describe("donation decision", () => {
  it("nothing proposed: nothing to decide, only the live link to remove", () => {
    renderWithActions(<DonationDecision />, { view: registryView({ donation: LIVE as never }) });
    expect(screen.queryByRole("button", { name: "Схвалити" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Відхилити" })).toBeNull();
    expect(screen.getByRole("button", { name: "Прибрати посилання…" })).toBeTruthy();
  });

  it("suspended shelter: the proposal can be rejected but not approved", () => {
    renderWithActions(<DonationDecision />, {
      view: {
        ...withProposal,
        verification: { status: "suspended", since: new Date("2026-10-20T00:00:00Z") } as never,
      },
    });
    expect(screen.queryByRole("button", { name: "Схвалити" })).toBeNull();
    expect(screen.getByRole("button", { name: "Відхилити" })).toBeTruthy();
  });

  it("no live link: nothing to remove", () => {
    renderWithActions(<DonationDecision />, { view: registryView({ donation: null }) });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("approve sends the version read, then says so", async () => {
    const approve = vi.fn(async () => approvedView);
    const { reread } = renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { approve } },
      reread: async () => approvedView,
    });
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(approve).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID, expectedVersion: 7 });
    expect(screen.getByRole("status").textContent).toBe("Посилання схвалено.");
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Схвалити" })).toBeNull();
  });

  it("reject sends the version read, then says so", async () => {
    const reject = vi.fn(async () => rejectedView);
    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { reject } },
      reread: async () => rejectedView,
    });
    await userEvent.click(screen.getByRole("button", { name: "Відхилити" }));
    expect(reject).toHaveBeenCalledExactlyOnceWith({ shelterId: SHELTER_ID, expectedVersion: 7 });
    expect(screen.getByRole("status").textContent).toBe("Посилання відхилено.");
  });

  it("CONFLICT: re-reads, says the proposal changed, and the next decision sends the new version", async () => {
    const reproposed = registryView({
      donation: LIVE as never,
      pendingDonation: proposal({
        url: "https://send.monobank.ua/jar/xyz",
        provider: "monobank_jar",
      }),
      version: 9,
    });
    const approve = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw apiError("CONFLICT");
      })
      .mockImplementationOnce(async () => approvedView);
    const reads = [reproposed, approvedView];
    const { reread } = renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { approve } },
      reread: async () => reads.shift() ?? null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe(
      "Пропозиція змінилася, поки сторінка була відкрита. Тут – поточна.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(approve).toHaveBeenLastCalledWith({ shelterId: SHELTER_ID, expectedVersion: 9 });
  });

  it("CONFLICT with a re-read that fails: never claims the current proposal is shown", async () => {
    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: {
        donation: {
          approve: vi.fn(async () => {
            throw apiError("CONFLICT");
          }),
        },
      },
      reread: async () => null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("a lost approve the re-read shows done: «Посилання схвалено.»; shows not done: his failure text", async () => {
    const lost = vi.fn(async () => {
      throw lostAnswer();
    });
    const first = renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { approve: lost } },
      reread: async () => approvedView,
    });
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(screen.getByRole("status").textContent).toBe("Посилання схвалено.");
    first.unmount();

    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { approve: lost } },
      reread: async () => withProposal,
    });
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });

  it("a lost reject is not taken for an approve: the live link must be the one there before", async () => {
    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: {
        donation: {
          reject: vi.fn(async () => {
            throw lostAnswer();
          }),
        },
      },
      // What an approve would have left behind.
      reread: async () => approvedView as RegistryShelterView,
    });
    await userEvent.click(screen.getByRole("button", { name: "Відхилити" }));
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });
});

describe("removing the live link", () => {
  const removedView = registryView({ donation: null, pendingDonation: null, version: 8 });

  async function fill(note = "Веде на чужу сторінку") {
    await userEvent.click(screen.getByRole("button", { name: "Прибрати посилання…" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText("Причина"), "wrong_destination");
    if (note !== "") await userEvent.type(within(dialog).getByLabelText("Пояснення"), note);
    return dialog;
  }

  it("asks for a reason, tells the operator what happens, and names who reads the note", async () => {
    renderWithActions(<DonationDecision />, { view: withProposal });
    await userEvent.click(screen.getByRole("button", { name: "Прибрати посилання…" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Посилання одразу зникне зі сторінок/)).toBeTruthy();
    expect(within(dialog).getByText("Цей текст побачить притулок.")).toBeTruthy();
    const options = within(within(dialog).getByLabelText("Причина")).getAllByRole("option");
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      "",
      "wrong_destination",
      "not_shelters_own",
      "cannot_confirm",
      "shelter_request",
      "other",
    ]);
    expect(
      within(dialog).getByRole("option", { name: "Не вдалося підтвердити, куди веде посилання" }),
    ).toBeTruthy();
  });

  it("sends nothing until the code and the note are both set", async () => {
    const remove = vi.fn(async () => removedView);
    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { remove } },
    });
    const dialog = await fill("");
    await userEvent.click(within(dialog).getByRole("button", { name: "Прибрати" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("sends the version read with the reason, then says so and drops the buttons", async () => {
    const remove = vi.fn(async () => removedView);
    const { reread } = renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { remove } },
      reread: async () => removedView,
    });
    const dialog = await fill();
    await userEvent.click(within(dialog).getByRole("button", { name: "Прибрати" }));
    expect(remove).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      expectedVersion: 7,
      reason: { code: "wrong_destination", note: "Веде на чужу сторінку" },
    });
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Посилання прибрано.");
    expect(screen.queryByRole("button", { name: "Прибрати посилання…" })).toBeNull();
  });

  it("CONFLICT: re-reads, closes onto the current link and says it changed", async () => {
    const changed = registryView({
      donation: PROPOSED as never,
      pendingDonation: null,
      version: 9,
    });
    const remove = vi.fn(async () => {
      throw apiError("CONFLICT");
    });
    const { reread } = renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { remove } },
      reread: async () => changed,
    });
    const dialog = await fill();
    await userEvent.click(within(dialog).getByRole("button", { name: "Прибрати" }));
    expect(reread).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Посилання змінилося, поки сторінка була відкрита. Тут – поточне.",
    );
  });

  it("CONFLICT with a re-read that fails: never claims the current link is shown", async () => {
    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: {
        donation: {
          remove: vi.fn(async () => {
            throw apiError("CONFLICT");
          }),
        },
      },
      reread: async () => null,
    });
    const dialog = await fill();
    await userEvent.click(within(dialog).getByRole("button", { name: "Прибрати" }));
    expect(screen.getByRole("alert").textContent).toBe("Не вдалося. Спробуйте ще раз.");
  });

  it("a lost answer the re-read shows done is done; shown not done keeps the dialog and the note", async () => {
    const lost = vi.fn(async () => {
      throw lostAnswer();
    });
    const first = renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { remove: lost } },
      reread: async () => removedView,
    });
    let dialog = await fill();
    await userEvent.click(within(dialog).getByRole("button", { name: "Прибрати" }));
    expect(screen.getByRole("status").textContent).toBe("Посилання прибрано.");
    first.unmount();

    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { remove: lost } },
      reread: async () => withProposal,
    });
    dialog = await fill();
    await userEvent.click(within(dialog).getByRole("button", { name: "Прибрати" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe(
      "Не вдалося. Спробуйте ще раз.",
    );
    expect((within(dialog).getByLabelText("Пояснення") as HTMLTextAreaElement).value).toBe(
      "Веде на чужу сторінку",
    );
  });

  it("Cancel closes it without sending", async () => {
    const remove = vi.fn(async () => removedView);
    renderWithActions(<DonationDecision />, {
      view: withProposal,
      client: { donation: { remove } },
    });
    const dialog = await fill();
    await userEvent.click(within(dialog).getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
