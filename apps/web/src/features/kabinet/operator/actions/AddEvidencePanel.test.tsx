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

  it("tells the operator that only he sees the entry, not the shelter", () => {
    renderWithActions(<AddEvidencePanel />, { view: pending });
    expect(
      section().getByText(
        "Нові докази додаються до наявних. Статус не змінюється. В історії цей запис бачите лише ви: сам притулок його не бачить.",
      ),
    ).toBeTruthy();
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

/** An initiative's ongoing work (owner, 2026-11-24): copy rows 1-7, as approved. */
describe("«Додати докази»: documents of ongoing work", () => {
  const NOW = new Date("2026-11-24T10:00:00Z");

  async function openRecord(u: ReturnType<typeof userEvent.setup>) {
    await u.selectOptions(section().getByLabelText("Тип доказу"), "Документи постійної роботи");
    await u.click(section().getByRole("button", { name: "+ Додати доказ" }));
    return within(screen.getByRole("group", { name: "Документи постійної роботи" }));
  }

  async function fillDocument(
    u: ReturnType<typeof userEvent.setup>,
    card: ReturnType<typeof within>,
    index: number,
    month: string,
  ) {
    await u.selectOptions(
      card.getAllByLabelText("Документ")[index] as HTMLElement,
      "Чек ветклініки",
    );
    await u.selectOptions(card.getAllByLabelText("Місяць")[index] as HTMLElement, month);
    await u.type(
      card.getAllByLabelText("Хто видав: клініка, магазин")[index] as HTMLElement,
      "Ветклініка «Айболить»",
    );
  }

  it("says the documents are not kept, offers only the last 12 months, and sends month and issuer", async () => {
    const addEvidence = vi.fn(async (_input: unknown) => withOneItem(pending));
    renderWithActions(<AddEvidencePanel now={() => NOW} />, {
      view: pending,
      client: { verification: { addEvidence } },
      reread: async () => withOneItem(pending),
    });
    const u = userEvent.setup();
    const card = await openRecord(u);
    expect(
      card.getByText(
        "Щонайменше два документи з різних місяців. Самі документи на сайті не зберігаються – лише місяць і хто видав.",
      ),
    ).toBeTruthy();
    const months = within(card.getAllByLabelText("Місяць")[0] as HTMLElement)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(months).toEqual(["", "2026-11", ...months.slice(2, -1), "2025-11"]);
    expect(months).toHaveLength(14);
    expect(
      within(card.getAllByLabelText("Документ")[0] as HTMLElement)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["", "Чек ветклініки", "Купівля корму", "Перевезення", "Інше"]);
    await fillDocument(u, card, 0, "2026-09");
    await fillDocument(u, card, 1, "2026-10");
    // A third, empty slot follows the last typed one and is not sent.
    expect(card.getAllByLabelText("Місяць")).toHaveLength(3);
    await u.type(card.getByLabelText("Нотатки"), "Чеки надіслали в месенджері");
    await u.click(section().getByRole("button", { name: "Додати" }));
    expect(addEvidence).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      evidence: [
        {
          kind: "ongoing_work_record",
          documents: [
            { kind: "vet_receipt", month: "2026-09", issuer: "Ветклініка «Айболить»" },
            { kind: "vet_receipt", month: "2026-10", issuer: "Ветклініка «Айболить»" },
          ],
          notes: "Чеки надіслали в месенджері",
        },
      ],
    });
  });

  it("refuses one month without a request, on the month field, with row 7", async () => {
    const addEvidence = vi.fn();
    renderWithActions(<AddEvidencePanel now={() => NOW} />, {
      view: pending,
      client: { verification: { addEvidence } },
    });
    const u = userEvent.setup();
    const card = await openRecord(u);
    await fillDocument(u, card, 0, "2026-10");
    await fillDocument(u, card, 1, "2026-10");
    await u.type(card.getByLabelText("Нотатки"), "Два чеки одного місяця");
    await u.click(section().getByRole("button", { name: "Додати" }));
    expect(addEvidence).not.toHaveBeenCalled();
    const month = card.getAllByLabelText("Місяць")[1] as HTMLElement;
    expect(month.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(month);
    expect(card.getByText("Потрібні документи щонайменше з двох різних місяців.")).toBeTruthy();
  });

  it("requires the issuer of a typed document", async () => {
    const addEvidence = vi.fn();
    renderWithActions(<AddEvidencePanel now={() => NOW} />, {
      view: pending,
      client: { verification: { addEvidence } },
    });
    const u = userEvent.setup();
    const card = await openRecord(u);
    await fillDocument(u, card, 0, "2026-09");
    await u.selectOptions(card.getAllByLabelText("Документ")[1] as HTMLElement, "Купівля корму");
    await u.selectOptions(card.getAllByLabelText("Місяць")[1] as HTMLElement, "2026-10");
    await u.type(card.getByLabelText("Нотатки"), "Чеки");
    await u.click(section().getByRole("button", { name: "Додати" }));
    expect(addEvidence).not.toHaveBeenCalled();
    expect(
      (card.getAllByLabelText("Хто видав: клініка, магазин")[1] as HTMLElement).getAttribute(
        "aria-invalid",
      ),
    ).toBe("true");
  });

  it("the server's one-month refusal reads as row 7", async () => {
    const addEvidence = vi.fn(async () => {
      throw apiError("INVALID_EVIDENCE", { reason: "ongoing_work_too_few_months" });
    });
    renderWithActions(<AddEvidencePanel now={() => NOW} />, {
      view: pending,
      client: { verification: { addEvidence } },
    });
    const u = userEvent.setup();
    const card = await openRecord(u);
    await fillDocument(u, card, 0, "2026-09");
    await fillDocument(u, card, 1, "2026-10");
    await u.type(card.getByLabelText("Нотатки"), "Чеки");
    await u.click(section().getByRole("button", { name: "Додати" }));
    expect((await section().findByRole("alert")).textContent).toBe(
      "Потрібні документи щонайменше з двох різних місяців.",
    );
  });
});
