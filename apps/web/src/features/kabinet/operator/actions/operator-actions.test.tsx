import type { RegistryShelterView } from "@opika/contracts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "./DecisionPanel";
import { DonationDecision } from "./DonationDecision";
import { OperatorActionsProvider, type Settled, useOperatorActions } from "./operator-actions";
import {
  ADMIN_ID,
  deferred,
  fakeClient,
  MODERATOR,
  registryView,
  renderWithActions,
  withVerification,
} from "./test-fixtures";

/**
 * The one runner every S4 action goes through: one request at a time across
 * the whole page, a write's answer shown at once, and the page's own record
 * winning once the page re-renders with a newer one.
 */

const AT = new Date("2026-10-01T09:00:00Z");
const withProposal = registryView({
  donation: null,
  pendingDonation: {
    link: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as never,
    proposedAt: AT,
    proposedBy: ADMIN_ID,
  },
});
const underReview = withVerification(withProposal, {
  status: "under_review",
  startedAt: AT,
  reviewerId: MODERATOR,
  evidence: { items: [], submittedAt: AT },
});

const decision = () => within(screen.getByRole("region", { name: "Рішення" }));

describe("one request at a time, across the page", () => {
  it("a donation decision pressed while a verification move is in flight sends nothing", async () => {
    const answer = deferred<RegistryShelterView>();
    const approve = vi.fn();
    renderWithActions(
      <>
        <DecisionPanel />
        <DonationDecision />
      </>,
      {
        view: withProposal,
        client: {
          verification: { startReview: vi.fn(() => answer.promise) },
          donation: { approve },
        },
        reread: async () => underReview,
      },
    );
    await userEvent.click(decision().getByRole("button", { name: "Взяти на розгляд" }));
    const donate = screen.getByRole("button", { name: "Схвалити" });
    expect(donate.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(donate);
    expect(approve).not.toHaveBeenCalled();
    await act(async () => answer.resolve(underReview));
    expect(donate.getAttribute("aria-disabled")).toBeNull();
  });

  it("the wait includes the re-read after a write: nothing else goes until the page has caught up", async () => {
    const reading = deferred<RegistryShelterView | null>();
    const approve = vi.fn();
    renderWithActions(
      <>
        <DecisionPanel />
        <DonationDecision />
      </>,
      {
        view: withProposal,
        client: {
          verification: { startReview: vi.fn(async () => underReview) },
          donation: { approve },
        },
        reread: () => reading.promise,
      },
    );
    await userEvent.click(decision().getByRole("button", { name: "Взяти на розгляд" }));
    // The write answered: its record shows at once, while the re-read is still out.
    expect(decision().getByRole("button", { name: "Схвалити → «Перевірено»" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Схвалити" }));
    expect(approve).not.toHaveBeenCalled();
    await act(async () => reading.resolve(underReview));
  });
});

describe("the runner itself", () => {
  /** Two requests in one tick, before any re-render could mark the page busy. */
  function DoublePress({ onSettled }: { onSettled: (results: Settled<unknown>[]) => void }) {
    const { view, run } = useOperatorActions();
    return (
      <button
        type="button"
        onClick={async () => {
          const request = {
            owner: "probe",
            call: (client: Parameters<Parameters<typeof run>[0]["call"]>[0]) =>
              client.registry.verification.startReview({ shelterId: view.id }),
            landed: () => false,
          };
          onSettled(await Promise.all([run(request), run(request)]));
        }}
      >
        probe
      </button>
    );
  }

  it("a second request in the same tick is turned away as busy, and nothing is sent twice", async () => {
    const startReview = vi.fn(async () => underReview);
    const onSettled = vi.fn();
    renderWithActions(<DoublePress onSettled={onSettled} />, {
      view: withProposal,
      client: { verification: { startReview } },
      reread: async () => underReview,
    });
    await userEvent.click(screen.getByRole("button", { name: "probe" }));
    expect(startReview).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith([{ kind: "ok", value: underReview }, { kind: "busy" }]);
  });
});

describe("whose record is shown", () => {
  it("once the page itself re-renders with a newer record, the page's record wins", async () => {
    const { client } = fakeClient({
      verification: { startReview: vi.fn(async () => underReview) },
    });
    const reread = vi.fn(async () => underReview);
    const { rerender } = render(
      <OperatorActionsProvider view={withProposal} reread={reread} client={client}>
        <DecisionPanel />
      </OperatorActionsProvider>,
    );
    await userEvent.click(decision().getByRole("button", { name: "Взяти на розгляд" }));
    expect(decision().getByRole("button", { name: "Схвалити → «Перевірено»" })).toBeTruthy();
    // Someone else moved it on; the server-rendered page now says rejected.
    const rejected = withVerification(underReview, {
      status: "rejected",
      rejectedAt: new Date("2026-10-02T09:00:00Z"),
      rejectedBy: MODERATOR,
      reason: { code: "spam", note: "Ні." },
      evidence: { items: [], submittedAt: AT },
    });
    rerender(
      <OperatorActionsProvider view={rejected} reread={reread} client={client}>
        <DecisionPanel />
      </OperatorActionsProvider>,
    );
    expect(decision().getByRole("button", { name: "Повернути на перевірку" })).toBeTruthy();
  });
});
