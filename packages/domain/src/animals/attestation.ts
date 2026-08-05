import { z } from "zod";

export const MedicalStateSchema = z.enum(["unknown", "in_progress", "confirmed"]);
export type MedicalState = z.infer<typeof MedicalStateSchema>;

/**
 * `source` is part of the discriminant, not a field beside it. That is the
 * whole point: when the national registry becomes reachable it lands as another
 * variant rather than as a migration across every animal, and "confirmed by the
 * state registry" can render as a different badge from "the shelter says so".
 *
 * The asymmetry is real rather than incidental — the registry variant's state
 * is the literal "confirmed" because a registry either holds a record or does
 * not. It has no way to report that a course of shots is half finished.
 */
export const MedicalAttestationSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("shelter_declared"),
    state: MedicalStateSchema,
    declaredAt: z.date(),
  }),
  z.object({
    source: z.literal("registry"),
    state: z.literal("confirmed"),
    registryRef: z.string().min(1),
    verifiedAt: z.date(),
  }),
]);
export type MedicalAttestation = z.infer<typeof MedicalAttestationSchema>;

/**
 * Two aliases over one schema. The shapes are identical today and duplicating
 * them would guarantee they drift; a future vet-clinic source applies to both.
 */
export const VaccinationStatusSchema = MedicalAttestationSchema;
export type VaccinationStatus = MedicalAttestation;

export const SpayNeuterStatusSchema = MedicalAttestationSchema;
export type SpayNeuterStatus = MedicalAttestation;

export const UNKNOWN_ATTESTATION = (declaredAt: Date): MedicalAttestation => ({
  source: "shelter_declared",
  state: "unknown",
  declaredAt,
});

export const isConfirmed = (attestation: MedicalAttestation): boolean =>
  attestation.state === "confirmed";

/** Whether the claim rests on an independent record rather than on the shelter's word. */
export const isIndependentlyVerified = (attestation: MedicalAttestation): boolean =>
  attestation.source === "registry";
