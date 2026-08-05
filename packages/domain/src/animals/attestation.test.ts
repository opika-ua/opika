import { describe, expect, it } from "vitest";
import {
  isConfirmed,
  isIndependentlyVerified,
  type SpayNeuterStatus,
  SpayNeuterStatusSchema,
  UNKNOWN_ATTESTATION,
  type VaccinationStatus,
  VaccinationStatusSchema,
} from "./attestation";

const AT = new Date("2026-08-05T00:00:00.000Z");

const registryPayload = {
  source: "registry",
  state: "confirmed",
  registryRef: "UA-123",
  verifiedAt: AT,
} as const;

describe("sterilisation cannot come from the registry", () => {
  it("rejects a registry-sourced spay/neuter at parse time", () => {
    // The registry holds identification and rabies vaccination records. A spay
    // is a surgical fact recorded by a clinic, so this state can never occur.
    expect(SpayNeuterStatusSchema.safeParse(registryPayload).success).toBe(false);
  });

  it("rejects it at compile time too", () => {
    // @ts-expect-error a registry source is not a valid spay/neuter attestation
    const impossible: SpayNeuterStatus = registryPayload;
    void impossible;
  });

  it("still accepts a shelter-declared spay/neuter in every state", () => {
    for (const state of ["unknown", "in_progress", "confirmed"] as const) {
      expect(
        SpayNeuterStatusSchema.safeParse({ source: "shelter_declared", state, declaredAt: AT })
          .success,
      ).toBe(true);
    }
  });

  it("exposes exactly one permitted source", () => {
    expect(SpayNeuterStatusSchema.options).toHaveLength(1);
  });
});

describe("vaccination keeps both sources", () => {
  it("accepts a registry-confirmed vaccination", () => {
    // The Phase 3 registry adapter produces exactly this.
    expect(VaccinationStatusSchema.safeParse(registryPayload).success).toBe(true);
  });

  it("accepts it at compile time", () => {
    const fromRegistry: VaccinationStatus = registryPayload;
    expect(isIndependentlyVerified(fromRegistry)).toBe(true);
  });

  it("pins the registry variant's state to confirmed", () => {
    // A registry either holds a record or does not; it cannot report a course
    // of shots as half finished.
    expect(
      VaccinationStatusSchema.safeParse({ ...registryPayload, state: "in_progress" }).success,
    ).toBe(false);
  });

  it("requires a registry reference, so the claim is traceable", () => {
    const { registryRef: _dropped, ...withoutRef } = registryPayload;
    expect(VaccinationStatusSchema.safeParse(withoutRef).success).toBe(false);
    expect(VaccinationStatusSchema.safeParse({ ...registryPayload, registryRef: "" }).success).toBe(
      false,
    );
  });
});

describe("shared helpers", () => {
  it("treats an unknown attestation as unconfirmed and unverified", () => {
    const unknown = UNKNOWN_ATTESTATION(AT);
    expect(isConfirmed(unknown)).toBe(false);
    expect(isIndependentlyVerified(unknown)).toBe(false);
  });

  it("produces a default valid for both facts", () => {
    // One default has to satisfy the narrower union as well as the wider one.
    const unknown = UNKNOWN_ATTESTATION(AT);
    expect(SpayNeuterStatusSchema.safeParse(unknown).success).toBe(true);
    expect(VaccinationStatusSchema.safeParse(unknown).success).toBe(true);
  });

  it("separates confirmation from independence", () => {
    // A shelter can confirm a fact without any independent record of it.
    const declared: SpayNeuterStatus = {
      source: "shelter_declared",
      state: "confirmed",
      declaredAt: AT,
    };
    expect(isConfirmed(declared)).toBe(true);
    expect(isIndependentlyVerified(declared)).toBe(false);
  });
});
