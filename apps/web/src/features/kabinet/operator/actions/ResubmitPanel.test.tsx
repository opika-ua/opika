import type { RegistryShelterView } from "@opika/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "./DecisionPanel";
import type { EvidenceEditorSlot } from "./ResubmitPanel";
import {
  apiError,
  MODERATOR,
  registryView,
  renderWithActions,
  SHELTER_ID,
  withVerification,
} from "./test-fixtures";

/**
 * «Повернути на перевірку» from a rejected shelter (S3/S4): the evidence
 * editor starts from what is on file, and with no edits the same items go
 * back. Strings transcribed from `rui-copy-uk.md` §2.4, §3.1 and §3.3.
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

describe("resubmit", () => {
  it("with no edits, sends exactly the items on file, and the shelter is pending again", async () => {
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    renderWithActions(<DecisionPanel />, {
      view: rejectedWith([REFERENCE, VISIT]),
      client: { verification: { resubmit } },
      reread: async () => pendingAgain,
    });
    await userEvent.click(resubmitButton());
    // Transcribed from the two items above, as the contract takes them.
    expect(resubmit).toHaveBeenCalledExactlyOnceWith({
      shelterId: SHELTER_ID,
      evidence: [
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

  it("the editor gets the prefilled items, and what it changes is what is sent", async () => {
    const seen: string[] = [];
    const editor: EvidenceEditorSlot = ({ items, onChange }) => {
      seen.push(items.map((item) => item.kind).join(","));
      return (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...items,
              { ...REFERENCE, name: "Громада Ірпеня", relationship: "local_authority" },
            ])
          }
        >
          stub: add a reference
        </button>
      );
    };
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    renderWithActions(<DecisionPanel renderEvidenceEditor={editor} />, {
      view: rejectedWith([REFERENCE]),
      client: { verification: { resubmit } },
      reread: async () => pendingAgain,
    });
    expect(seen[0]).toBe("reference_contact");
    await userEvent.click(screen.getByRole("button", { name: "stub: add a reference" }));
    await userEvent.click(resubmitButton());
    expect(resubmit.mock.calls[0]?.[0]).toEqual({
      shelterId: SHELTER_ID,
      evidence: [
        {
          kind: "reference_contact",
          name: "Д-р Марина Шевчук",
          channel: { kind: "phone", e164: "+380505552108" },
          relationship: "veterinary_clinic",
        },
        {
          kind: "reference_contact",
          name: "Громада Ірпеня",
          channel: { kind: "phone", e164: "+380505552108" },
          relationship: "local_authority",
        },
      ],
    });
  });

  it("never sends a script-onboarded supporting document (RG-Q5)", async () => {
    const resubmit = vi.fn(async (_input: unknown) => pendingAgain);
    renderWithActions(<DecisionPanel />, {
      view: rejectedWith([REFERENCE, DOCUMENT]),
      client: { verification: { resubmit } },
      reread: async () => pendingAgain,
    });
    await userEvent.click(resubmitButton());
    expect(JSON.stringify(resubmit.mock.calls[0]?.[0])).not.toContain("supporting_document");
    expect(JSON.stringify(resubmit.mock.calls[0]?.[0])).not.toContain("evidence/orenda.pdf");
  });

  it("a visit dated in the future: his message, and the shelter stays rejected", async () => {
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
