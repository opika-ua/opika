import { z } from "zod";

export const MedicalStateSchema = z.enum(["unknown", "in_progress", "confirmed"]);
export type MedicalState = z.infer<typeof MedicalStateSchema>;

/**
 * The two ways a medical claim can reach us, each defined exactly once.
 *
 * `source` is part of the discriminant rather than a field beside it, so a new
 * provenance lands as another variant instead of a migration across every
 * animal, and "confirmed by the state registry" can render as a different badge
 * from "the shelter says so".
 *
 * Which of these an attestation may use is decided per fact below, not here.
 * That is the point: the variants are shared, the permissions are not.
 */
const shelterDeclaredVariant = z.object({
  source: z.literal("shelter_declared"),
  state: MedicalStateSchema,
  declaredAt: z.date(),
});

/**
 * `state` is pinned to the literal "confirmed" because a registry either holds
 * a record or it does not. It has no way to report that a course of shots is
 * half finished.
 */
const registryVariant = z.object({
  source: z.literal("registry"),
  state: z.literal("confirmed"),
  registryRef: z.string().min(1),
  verifiedAt: z.date(),
});

export type ShelterDeclaredAttestation = z.infer<typeof shelterDeclaredVariant>;

/**
 * Vaccination can come from either source.
 *
 * Ukraine's pet registry holds animal identification and rabies vaccination
 * data, so a registry-confirmed vaccination is a real state that the Phase 3
 * adapter will produce.
 */
export const VaccinationStatusSchema = z.discriminatedUnion("source", [
  shelterDeclaredVariant,
  registryVariant,
]);
export type VaccinationStatus = z.infer<typeof VaccinationStatusSchema>;

/**
 * Sterilisation is shelter-declared only, and a single-variant union is
 * deliberate rather than an oversight.
 *
 * The registry holds identification and rabies vaccination records. It holds no
 * sterilisation records, and no plausible future version would: a spay is a
 * surgical fact recorded by the clinic that performed it, not a registry entry.
 * So `{ source: "registry" }` on this fact is a state that can never
 * legitimately occur — and until now the type permitted it, because both facts
 * aliased one schema.
 *
 * Sharing a schema to avoid drift was the right instinct applied to the wrong
 * unit. What must not drift is the *shape* of a variant; which variants a fact
 * admits is a property of that fact. Keeping the union form means a future
 * vet-clinic source is still an added variant here, not a restructuring.
 */
export const SpayNeuterStatusSchema = z.discriminatedUnion("source", [shelterDeclaredVariant]);
export type SpayNeuterStatus = z.infer<typeof SpayNeuterStatusSchema>;

/** Any medical attestation, for helpers that do not care which fact they hold. */
export type MedicalAttestation = VaccinationStatus | SpayNeuterStatus;

/**
 * The default for a fact nobody has recorded yet. Shelter-declared, so it is
 * valid for every attestation type.
 */
export const UNKNOWN_ATTESTATION = (declaredAt: Date): ShelterDeclaredAttestation => ({
  source: "shelter_declared",
  state: "unknown",
  declaredAt,
});

export const isConfirmed = (attestation: MedicalAttestation): boolean =>
  attestation.state === "confirmed";

/** Whether the claim rests on an independent record rather than on the shelter's word. */
export const isIndependentlyVerified = (attestation: MedicalAttestation): boolean =>
  attestation.source === "registry";
