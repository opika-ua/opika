import type { RegistryShelterView } from "@opika/contracts";
import { screen } from "@testing-library/react";
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
  it("nothing proposed: nothing to decide", () => {
    renderWithActions(<DonationDecision />, { view: registryView({ donation: LIVE as never }) });
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
      "Пропозиція змінилася, поки сторінка була відкрита. Тут — поточна.",
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
