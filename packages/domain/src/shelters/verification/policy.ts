import { z } from "zod";
import type { ShelterLegalEntity } from "../legal-entity";
import type { ExactAddress } from "../location";
import {
  countEvidence,
  type EvidenceKind,
  EvidenceKindSchema,
  type VerificationEvidence,
} from "./evidence";

export type EvidenceRequirement = { kind: EvidenceKind; minimum: number };

export type VerificationPolicy = {
  requirementsByLegalEntity: Record<ShelterLegalEntity["kind"], readonly EvidenceRequirement[]>;
};

/**
 * Every legal form needs a moderator's video call (stored as `site_visit`, shown
 * as «Відеодзвінок»). A registered entity adds its ЄДРПОУ registration; an
 * unregistered volunteer group, which has no paperwork, adds one independent
 * reference instead. Excluding such groups entirely would exclude most wartime
 * shelter activity in the target oblast from the product. Bank-account and
 * further reference items stay addable as evidence but are not required (owner,
 * 2026-11-10); the operator's donation-approve hint asks for the holder check.
 *
 * Thresholds live here rather than inside the check for the same reason the
 * freshness thresholds do: they will be tuned against the first ten real
 * shelters, and a tunable number embedded in a conditional is a number nobody
 * finds later.
 */
export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  requirementsByLegalEntity: {
    registered_ngo: [
      { kind: "edrpou_registration", minimum: 1 },
      { kind: "site_visit", minimum: 1 },
    ],
    sole_proprietor: [
      { kind: "edrpou_registration", minimum: 1 },
      { kind: "site_visit", minimum: 1 },
    ],
    unregistered_initiative: [
      { kind: "site_visit", minimum: 1 },
      { kind: "reference_contact", minimum: 1 },
    ],
  },
};

export type EvidenceGap = EvidenceRequirement & { provided: number };

/** The same gap as data, for an API error to carry (`EVIDENCE_INSUFFICIENT`). */
export const EvidenceGapSchema = z.object({
  kind: EvidenceKindSchema,
  minimum: z.int().nonnegative(),
  provided: z.int().nonnegative(),
});

/**
 * Returns what is missing rather than a bare boolean, so a reviewer can be told
 * which document to chase instead of being told "no".
 */
export const evidenceGaps = (
  legalEntity: ShelterLegalEntity,
  evidence: VerificationEvidence,
  policy: VerificationPolicy,
): readonly EvidenceGap[] =>
  policy.requirementsByLegalEntity[legalEntity.kind]
    .map((requirement) => ({
      ...requirement,
      provided: countEvidence(evidence, requirement.kind),
    }))
    .filter((gap) => gap.provided < gap.minimum);

export const meetsEvidenceRequirements = (
  legalEntity: ShelterLegalEntity,
  evidence: VerificationEvidence,
  policy: VerificationPolicy,
): boolean => evidenceGaps(legalEntity, evidence, policy).length === 0;

/** The verified data a minimal create may leave out, in the order approval asks for it. */
export const VERIFIED_DATA_FIELDS = ["legal_entity", "exact_address"] as const;
export const VerifiedDataFieldSchema = z.enum(VERIFIED_DATA_FIELDS);
export type VerifiedDataField = z.infer<typeof VerifiedDataFieldSchema>;

export type ApprovalGap =
  | { on: "verified_data"; field: VerifiedDataField }
  | ({ on: "evidence" } & EvidenceGap);

/**
 * Verified data first (in this order), then evidence. Evidence requirements depend on the legal
 * form, so with no legal entity there is nothing to measure evidence against yet.
 */
export const approvalGaps = (
  shelter: { legalEntity: ShelterLegalEntity | null; exactAddress: ExactAddress | null },
  evidence: VerificationEvidence,
  policy: VerificationPolicy,
): readonly ApprovalGap[] => [
  ...(shelter.legalEntity === null
    ? [{ on: "verified_data", field: "legal_entity" } as const]
    : []),
  ...(shelter.exactAddress === null
    ? [{ on: "verified_data", field: "exact_address" } as const]
    : []),
  ...(shelter.legalEntity === null
    ? []
    : evidenceGaps(shelter.legalEntity, evidence, policy).map(
        (gap) => ({ on: "evidence", ...gap }) as const,
      )),
];
