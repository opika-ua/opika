import { z } from "zod";
import type { ShelterLegalEntity } from "../legal-entity";
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
