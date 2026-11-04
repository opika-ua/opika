import type { RegistryShelterView } from "@opika/contracts";
import { MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_ITEMS_PER_ADD } from "@opika/domain";
import { uk } from "@opika/i18n";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddEvidencePanel } from "./AddEvidencePanel";
import {
  apiError,
  registryView,
  renderWithActions,
  SHELTER_ID,
  withVerification,
} from "./test-fixtures";

/** Strings from the owner-approved copy table (2026-11-04, evidence add). */

const AT = new Date("2026-10-04T09:00:00Z");
const pending = registryView();
const underReview = withVerification(registryView(), {
  status: "under_review",
  startedAt: AT,
  reviewerId: "11111111-1111-4111-8111-111111111111" as never,
  evidence: { items: [], submittedAt: AT },
});
const withOneItem = (view: RegistryShelterView): RegistryShelterView =>
  withVerification(view, {
    ...(view.verification as Extract<RegistryShelterView["verification"], { status: "pending" }>),
    evidence: {
      items: [{ kind: "bank_account_holder", holderName: "ГО", documentKey: null }],
      submittedAt: AT,
    },
  });

const section = () => within(screen.getByRole("region", { name: "Додати докази" }));

async function fillReference(
  u: ReturnType<typeof userEvent.setup>,
  index = 0,
  phone = "+380670001122",
) {
  await u.selectOptions(section().getByLabelText("Тип доказу"), "Рекомендація");
  await u.click(section().getByRole("button", { name: "+ Додати доказ" }));
  const card = within(screen.getAllByRole("group", { name: "Рекомендація" })[index] as HTMLElement);
  await u.type(card.getByLabelText("Хто"), "Громада Ірпеня");
  await u.type(card.getByLabelText("Телефон"), phone);
  await u.selectOptions(card.getByLabelText("Ким доводиться притулку"), "Ветклініка");
}

describe("«Додати докази»", () => {
  it("the limit message names the domain's two caps", () => {
    const text = uk.kabinet.operator.evidence.limit;
    expect(text).toContain(String(MAX_EVIDENCE_ITEMS));
    expect(text).toContain(String(MAX_EVIDENCE_ITEMS_PER_ADD));
  });

  it.each([
    ["pending", pending],
    ["under_review", underReview],
  ])("is offered while %s", (_status, view) => {
    renderWithActions(<AddEvidencePanel />, { view });
    expect(section().getByText(/^Нові докази додаються до наявних/)).toBeTruthy();
  });

  it("is not offered once the decision is made", () => {
    const verified = withVerification(registryView(), {
      status: "verified",
      verifiedAt: AT,
      verifiedBy: "11111111-1111-4111-8111-111111111111" as never,
      evidence: { items: [], submittedAt: AT },
    });
    renderWithActions(<AddEvidencePanel />, { view: verified });
    expect(screen.queryByRole("region", { name: "Додати докази" })).toBeNull();
  });

  it("starts empty and refuses an empty submit without a request", async () => {
    const addEvidence = vi.fn();
    renderWithActions(<AddEvidencePanel />, {
      view: pending,
      client: { verification: { addEvidence } },
    });
    expect(section().queryAllByRole("group")).toHaveLength(0);
    await userEvent.click(section().getByRole("button", { name: "Додати" }));
    expect(addEvidence).not.toHaveBeenCalled();
    expect(section().getByRole("alert").textContent).toBe("Додайте хоча б один доказ.");
  });

  it("sends only the new items and says «Докази додано.»", async () => {
    const answered = withOneItem(pending);
    const addEvidence = vi.fn(async (_input: unknown) => answered);
    renderWithActions(<AddEvidencePanel />, {
      view: pending,
      client: { verification: { addEvidence } },
      reread: async () => answered,
    });
    const u = userEvent.setup();
    await fillReference(u);
    await u.click(section().getByRole("button", { name: "Додати" }));
    expect(addEvidence).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      evidence: [
        {
          kind: "reference_contact",
          name: "Громада Ірпеня",
          channel: { kind: "phone", e164: "+380670001122" },
          relationship: "veterinary_clinic",
        },
      ],
    });
    expect((await section().findByRole("status")).textContent).toBe("Докази додано.");
    expect(section().queryAllByRole("group")).toHaveLength(0);
  });

  it("says «Ці докази вже є.» when the server found nothing new", async () => {
    const addEvidence = vi.fn(async (_input: unknown) => pending);
    renderWithActions(<AddEvidencePanel />, {
      view: pending,
      client: { verification: { addEvidence } },
    });
    const u = userEvent.setup();
    await fillReference(u);
    await u.click(section().getByRole("button", { name: "Додати" }));
    expect((await section().findByRole("status")).textContent).toBe("Ці докази вже є.");
  });

  it("stops offering new cards past ten, and says why", async () => {
    renderWithActions(<AddEvidencePanel />, { view: pending });
    const u = userEvent.setup();
    for (let i = 0; i < 10; i += 1) {
      await u.click(section().getByRole("button", { name: "+ Додати доказ" }));
    }
    expect(section().queryByRole("button", { name: "+ Додати доказ" })).toBeNull();
    expect(section().queryByLabelText("Тип доказу")).toBeNull();
    expect(
      section().getByText("У заявці може бути щонайбільше 30 доказів, за раз – до 10."),
    ).toBeTruthy();
    await u.click(section().getAllByRole("button", { name: "Прибрати" })[0] as HTMLElement);
    expect(section().getByRole("button", { name: "+ Додати доказ" })).toBeTruthy();
  });

  it("maps the server's refusals to the approved messages", async () => {
    const u = userEvent.setup();
    for (const [code, data, message] of [
      [
        "EVIDENCE_NOT_EDITABLE",
        { from: "verified" },
        "Докази можна додати, лише поки рішення не ухвалено.",
      ],
      [
        "EVIDENCE_LIMIT_REACHED",
        { limit: 30 },
        "У заявці може бути щонайбільше 30 доказів, за раз – до 10.",
      ],
    ] as const) {
      const addEvidence = vi.fn(async () => {
        throw apiError(code, data);
      });
      const { unmount } = renderWithActions(<AddEvidencePanel />, {
        view: pending,
        client: { verification: { addEvidence } },
      });
      await fillReference(u);
      await u.click(section().getByRole("button", { name: "Додати" }));
      expect((await section().findByRole("alert")).textContent).toBe(message);
      unmount();
    }
  });
});
