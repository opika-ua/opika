import { describe, expect, it } from "vitest";
import {
  type DocumentItem,
  DocumentItemSchema,
  DocumentReadinessSchema,
  hasAnyDocumentEvidence,
  trackedDocumentReadiness,
  UNKNOWN_DOCUMENT_ITEM,
  UNKNOWN_DOCUMENT_READINESS,
} from "./document-readiness";

const AT = new Date("2026-08-05T00:00:00.000Z");

const chipped: DocumentItem = {
  kind: "present",
  issuedAt: AT,
  expiresAt: null,
  reference: "UA-CHIP-1",
};

describe("DocumentItem distinguishes unknown from absent", () => {
  it("accepts unknown", () => {
    expect(DocumentItemSchema.safeParse({ kind: "unknown" }).success).toBe(true);
  });

  it("keeps absent as a separate, stronger claim", () => {
    // "No chip" blocks travel and someone had to establish it. "Nobody looked"
    // does not. Collapsing them would make the second read as the first.
    expect(UNKNOWN_DOCUMENT_ITEM).not.toEqual({ kind: "absent" });
    expect(DocumentItemSchema.safeParse({ kind: "absent" }).success).toBe(true);
  });

  it("covers every variant the schema defines", () => {
    const all: readonly DocumentItem[] = [
      { kind: "unknown" },
      { kind: "absent" },
      { kind: "pending", since: AT },
      chipped,
    ];
    expect(all).toHaveLength(DocumentItemSchema.options.length);
    for (const item of all) {
      expect(DocumentItemSchema.safeParse(item).success).toBe(true);
    }
  });
});

describe("trackedDocumentReadiness", () => {
  it("claims nothing when given nothing", () => {
    const readiness = trackedDocumentReadiness();
    expect(readiness).toEqual({
      kind: "tracked",
      microchip: { kind: "unknown" },
      rabiesVaccination: { kind: "unknown" },
      rabiesTitration: { kind: "unknown" },
      vetCertificate: { kind: "unknown" },
    });
  });

  it("lets a shelter record a chip without asserting anything else", () => {
    // The failure this prevents: entering one known fact forcing three
    // fabricated ones.
    const readiness = trackedDocumentReadiness({ microchip: chipped });
    expect(readiness.microchip).toEqual(chipped);
    expect(readiness.rabiesVaccination).toEqual(UNKNOWN_DOCUMENT_ITEM);
    expect(readiness.rabiesTitration).toEqual(UNKNOWN_DOCUMENT_ITEM);
    expect(readiness.vetCertificate).toEqual(UNKNOWN_DOCUMENT_ITEM);
  });

  it("produces a value the schema accepts", () => {
    expect(DocumentReadinessSchema.safeParse(trackedDocumentReadiness()).success).toBe(true);
    expect(
      DocumentReadinessSchema.safeParse(trackedDocumentReadiness({ microchip: chipped })).success,
    ).toBe(true);
  });

  it("can still record a genuine absence", () => {
    const readiness = trackedDocumentReadiness({ microchip: { kind: "absent" } });
    expect(readiness.microchip).toEqual({ kind: "absent" });
  });
});

describe("hasAnyDocumentEvidence", () => {
  it("is false for the shipped default", () => {
    expect(hasAnyDocumentEvidence(UNKNOWN_DOCUMENT_READINESS)).toBe(false);
  });

  it("is false for a tracked readiness that knows nothing", () => {
    // Carries no more information than { kind: "unknown" }, so a documents
    // section built on `kind` alone would render an empty panel.
    expect(hasAnyDocumentEvidence(trackedDocumentReadiness())).toBe(false);
  });

  it("is true once any item says something", () => {
    expect(hasAnyDocumentEvidence(trackedDocumentReadiness({ microchip: chipped }))).toBe(true);
    expect(
      hasAnyDocumentEvidence(trackedDocumentReadiness({ vetCertificate: { kind: "absent" } })),
    ).toBe(true);
    expect(
      hasAnyDocumentEvidence(
        trackedDocumentReadiness({ rabiesTitration: { kind: "pending", since: AT } }),
      ),
    ).toBe(true);
  });
});
