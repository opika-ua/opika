import type { ShelterLegalEntity } from "../legal-entity.js";
import { countEvidence, type EvidenceKind, type VerificationEvidence } from "./evidence.js";

export type EvidenceRequirement = { kind: EvidenceKind; minimum: number };

export type VerificationPolicy = {
  requirementsByLegalEntity: Record<ShelterLegalEntity["kind"], readonly EvidenceRequirement[]>;
};

/**
 * An unregistered volunteer group can reach `verified`, but not on paperwork it
 * does not have. It substitutes a moderator site visit and a second independent
 * reference for the registration and banking records a registered entity
 * supplies. Excluding such groups entirely would exclude most wartime shelter
 * activity in the target oblast from the product.
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
      { kind: "bank_account_holder", minimum: 1 },
      { kind: "reference_contact", minimum: 1 },
    ],
    sole_proprietor: [
      { kind: "edrpou_registration", minimum: 1 },
      { kind: "bank_account_holder", minimum: 1 },
      { kind: "reference_contact", minimum: 1 },
    ],
    unregistered_initiative: [
      { kind: "site_visit", minimum: 1 },
      { kind: "reference_contact", minimum: 2 },
    ],
  },
};

export type EvidenceGap = EvidenceRequirement & { provided: number };

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
