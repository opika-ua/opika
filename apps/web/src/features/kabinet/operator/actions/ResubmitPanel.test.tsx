import type { RegistryShelterView } from "@opika/contracts";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "./DecisionPanel";
import { ResubmitPanel } from "./ResubmitPanel";
import {
  apiError,
  MODERATOR,
  registryView,
  renderWithActions,
  SHELTER_ID,
  withVerification,
} from "./test-fixtures";

/**
 * «Повернути на перевірку» from a rejected shelter (S3/S4), with R-UI 2's
 * evidence editor started from what is on file: with no edits the same items
 * go back, and what the editor changes is what is sent. Strings transcribed
 * from `rui-copy-uk.md` §1.4, §2.2, §2.4, §3.1 and §3.3.
 */

const AT = new Date("2026-10-04T09:00:00Z");
const rejectedWith = (items: RegistryShelterView["verification"]["evidence"]["items"]) =>
  withVerification(registryView(), {
    status: "rejected",
    rejectedAt: AT,
    rejectedBy: MODERATOR,
    reason: { code: "insufficient_evidence", note: "Бракує другої рекомендації." },
    evidence: { items, submittedAt: AT },
  });

const EDRPOU = {
  kind: "edrpou_registration" as const,
  edrpou: "43218765" as never,
  registeredName: "ГО «Домівка для хвостатих»",
  documentKey: null,
};
const BANK = {
  kind: "bank_account_holder" as const,
  holderName: "ГО «Домівка для хвостатих»",
  documentKey: null,
};
const REFERENCE = {
  kind: "reference_contact" as const,
  name: "Д-р Марина Шевчук",
  channel: { kind: "phone" as const, e164: "+380505552108" },
  relationship: "veterinary_clinic" as const,
};
const VISIT = {
  kind: "site_visit" as const,
  visitedAt: new Date("2026-10-05T00:00:00Z"),
  visitedBy: MODERATOR,
  notes: "Чисто, вольєри з навісом.",
};
const DOCUMENT = {
  kind: "supporting_document" as const,
  label: { uk: "Договір оренди приміщення", en: null },
  documentKey: "evidence/orenda.pdf",
};

const pendingAgain = withVerification(registryView(), {
  status: "pending",
  submittedAt: new Date("2026-10-17T10:00:00Z"),
  evidence: { items: [], submittedAt: new Date("2026-10-17T10:00:00Z") },
});

const panel = () => within(screen.getByRole("region", { name: "Рішення" }));
const resubmitButton = () => panel().getByRole("button", { name: "Повернути на перевірку" });
const card = (name: string, index = 0) =>
  within(screen.getAllByRole("group", { name })[index] as HTMLElement);

describe("resubmit", () => {
  it("with no edits, sends exactly the items on file, and the shelter is pending again", async () => {
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    renderWithActions(<DecisionPanel />, {
      view: rejectedWith([EDRPOU, BANK, REFERENCE, VISIT]),
      client: { verification: { resubmit } },
      reread: async () => pendingAgain,
    });
    await userEvent.click(resubmitButton());
    // Transcribed from the four items above, as the contract takes them.
    expect(resubmit).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      evidence: [
        {
          kind: "edrpou_registration",
          edrpou: "43218765",
          registeredName: "ГО «Домівка для хвостатих»",
        },
        { kind: "bank_account_holder", holderName: "ГО «Домівка для хвостатих»" },
        {
          kind: "reference_contact",
          name: "Д-р Марина Шевчук",
          channel: { kind: "phone", e164: "+380505552108" },
          relationship: "veterinary_clinic",
        },
        { kind: "site_visit", visitedOn: "2026-10-05", notes: "Чисто, вольєри з навісом." },
      ],
    });
    expect(panel().getByRole("button", { name: "Взяти на розгляд" })).toBeTruthy();
  });

  it("the editor starts from the items on file, one card each, under «Докази для перевірки»", () => {
    renderWithActions(<DecisionPanel />, { view: rejectedWith([REFERENCE, VISIT]) });
    const editor = within(panel().getByRole("region", { name: "Докази для перевірки" }));
    const reference = card("Рекомендація");
    expect((reference.getByLabelText("Хто") as HTMLInputElement).value).toBe("Д-р Марина Шевчук");
    expect((reference.getByLabelText("Телефон") as HTMLInputElement).value).toBe("+380505552108");
    expect((reference.getByLabelText("Ким доводиться притулку") as HTMLSelectElement).value).toBe(
      "veterinary_clinic",
    );
    const visit = card("Візит на місце");
    expect((visit.getByLabelText("Дата візиту") as HTMLInputElement).value).toBe("2026-10-05");
    expect((visit.getByLabelText("Нотатка") as HTMLTextAreaElement).value).toBe(
      "Чисто, вольєри з навісом.",
    );
    expect(editor.getByLabelText("Тип доказу")).toBeTruthy();
    expect(editor.getByRole("button", { name: "+ Додати доказ" })).toBeTruthy();
  });

  it("what the editor changes is what is sent: an edited card, a removed one, an added one", async () => {
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    renderWithActions(<DecisionPanel />, {
      view: rejectedWith([REFERENCE, VISIT]),
      client: { verification: { resubmit } },
      reread: async () => pendingAgain,
    });
    const u = userEvent.setup();
    const reference = card("Рекомендація");
    await u.clear(reference.getByLabelText("Хто"));
    await u.type(reference.getByLabelText("Хто"), "Д-р Марина Шевчук-Коваль");
    await u.click(card("Візит на місце").getByRole("button", { name: "Прибрати" }));
    await u.selectOptions(panel().getByLabelText("Тип доказу"), "Рекомендація");
    await u.click(panel().getByRole("button", { name: "+ Додати доказ" }));
    const added = card("Рекомендація", 1);
    await u.type(added.getByLabelText("Хто"), "Громада Ірпеня");
    await u.type(added.getByLabelText("Телефон"), "+380 67 000 11 22");
    await u.selectOptions(added.getByLabelText("Ким доводиться притулку"), "Місцева влада");
    await u.click(resubmitButton());
    expect(resubmit).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      evidence: [
        {
          kind: "reference_contact",
          name: "Д-р Марина Шевчук-Коваль",
          channel: { kind: "phone", e164: "+380505552108" },
          relationship: "veterinary_clinic",
        },
        {
          kind: "reference_contact",
          name: "Громада Ірпеня",
          channel: { kind: "phone", e164: "+380670001122" },
          relationship: "local_authority",
        },
      ],
    });
  });

  it("a card left incomplete: nothing is sent, the field says what is missing and takes focus", async () => {
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    renderWithActions(<DecisionPanel />, {
      view: rejectedWith([REFERENCE, VISIT]),
      client: { verification: { resubmit } },
    });
    const notes = card("Візит на місце").getByLabelText("Нотатка");
    await userEvent.clear(notes);
    await userEvent.click(resubmitButton());
    expect(resubmit).not.toHaveBeenCalled();
    expect(notes.getAttribute("aria-invalid")).toBe("true");
    expect(card("Візит на місце").getByText("Це поле потрібне.")).toBeTruthy();
    expect(document.activeElement).toBe(notes);
    expect(resubmitButton()).toBeTruthy();
  });

  it("never sends a script-onboarded supporting document (RG-Q5), and shows no card for it", async () => {
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    renderWithActions(<DecisionPanel />, {
      view: rejectedWith([REFERENCE, DOCUMENT]),
      client: { verification: { resubmit } },
      reread: async () => pendingAgain,
    });
    expect(panel().queryByRole("group", { name: "Документ" })).toBeNull();
    await userEvent.click(resubmitButton());
    expect(JSON.stringify(resubmit.mock.calls[0]?.[0])).not.toContain("supporting_document");
    expect(JSON.stringify(resubmit.mock.calls[0]?.[0])).not.toContain("evidence/orenda.pdf");
  });

  it("a visit dated after Kyiv's today is refused before anything is sent", async () => {
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    // 23:30 UTC on 16 October is already 17 October in Kyiv: the 17th is today, the 18th is not.
    const now = () => new Date("2026-10-16T23:30:00Z");
    renderWithActions(<ResubmitPanel onDone={() => {}} now={now} />, {
      view: rejectedWith([VISIT]),
      client: { verification: { resubmit } },
    });
    const visitedOn = card("Візит на місце").getByLabelText("Дата візиту") as HTMLInputElement;
    expect(visitedOn.max).toBe("2026-10-17");
    fireEvent.change(visitedOn, { target: { value: "2026-10-18" } });
    await userEvent.click(screen.getByRole("button", { name: "Повернути на перевірку" }));
    expect(resubmit).not.toHaveBeenCalled();
    expect(
      card("Візит на місце").getByText("Дата візиту не може бути в майбутньому."),
    ).toBeTruthy();
    fireEvent.change(visitedOn, { target: { value: "2026-10-17" } });
    await userEvent.click(screen.getByRole("button", { name: "Повернути на перевірку" }));
    expect(resubmit).toHaveBeenCalledOnce();
  });

  it("the server refusing a visit in the future: his message, and the shelter stays rejected", async () => {
    renderWithActions(<DecisionPanel />, {
      view: rejectedWith([VISIT]),
      client: {
        verification: {
          resubmit: vi.fn(async () => {
            throw apiError("INVALID_EVIDENCE", { reason: "site_visit_in_future" });
          }),
        },
      },
    });
    await userEvent.click(resubmitButton());
    expect(panel().getByRole("alert").textContent).toBe("Дата візиту не може бути в майбутньому.");
    expect(resubmitButton()).toBeTruthy();
  });

  it("ILLEGAL_TRANSITION: the page is re-read and the panel says the status moved", async () => {
    const { reread } = renderWithActions(<DecisionPanel />, {
      view: rejectedWith([REFERENCE]),
      client: {
        verification: {
          resubmit: vi.fn(async () => {
            throw apiError("ILLEGAL_TRANSITION");
          }),
        },
      },
      reread: async () => pendingAgain,
    });
    await userEvent.click(resubmitButton());
    expect(reread).toHaveBeenCalledOnce();
    expect(panel().getByRole("alert").textContent).toBe(
      "З поточного статусу так не можна. Сторінку оновлено.",
    );
  });
});
