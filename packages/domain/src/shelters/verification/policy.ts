import { z } from "zod";
import type { ShelterLegalEntity } from "../legal-entity";
import type { ExactAddress } from "../location";
import {
  countEvidence,
  type EvidenceKind,
  EvidenceKindSchema,
  type VerificationEvidence,
} from "./evidence";

/**
 * One line of a legal form's policy. `kind`: at least `minimum` items of that kind. `any_of`: at
 * least `minimum` items whose kinds are among `kinds`, counted together, so one rule can say
 * "a video call or an open-sources check" without a boolean beside the kind.
 */
export type EvidenceRequirement =
  | { rule: "kind"; kind: EvidenceKind; minimum: number }
  | {
      rule: "any_of";
      kinds: readonly [EvidenceKind, EvidenceKind, ...EvidenceKind[]];
      minimum: number;
    };

export type VerificationPolicy = {
  requirementsByLegalEntity: Record<ShelterLegalEntity["kind"], readonly EvidenceRequirement[]>;
};

/**
 * A registered form (NGO or ФОП) shows its registry entry and is seen by a moderator: the entry
 * is an `edrpou_registration` or an `open_sources_review` (which holds the same ЄДР facts plus
 * the registry address), and the second check is the video call (stored as `site_visit`, shown
 * as «Відеодзвінок») or that same open-sources check (owner, 2026-11-19). So one open-sources
 * item clears both lines, and the call is optional evidence for a registered form.
 *
 * An unregistered volunteer group, which has no paperwork and no registry entry to check, still
 * needs the video call and one independent reference: open sources count for neither. Excluding
 * such groups entirely would exclude most wartime shelter activity in the target oblast from
 * the product. Bank-account and further reference items stay addable as evidence but are not
 * required (owner, 2026-11-10); the operator's donation-approve hint asks for the holder check.
 *
 * Thresholds live here rather than inside the check for the same reason the
 * freshness thresholds do: they will be tuned against the first ten real
 * shelters, and a tunable number embedded in a conditional is a number nobody
 * finds later.
 */
const REGISTERED_FORM_REQUIREMENTS: readonly EvidenceRequirement[] = [
  { rule: "any_of", kinds: ["edrpou_registration", "open_sources_review"], minimum: 1 },
  { rule: "any_of", kinds: ["site_visit", "open_sources_review"], minimum: 1 },
];

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  requirementsByLegalEntity: {
    registered_ngo: REGISTERED_FORM_REQUIREMENTS,
    sole_proprietor: REGISTERED_FORM_REQUIREMENTS,
    unregistered_initiative: [
      { rule: "kind", kind: "site_visit", minimum: 1 },
      { rule: "kind", kind: "reference_contact", minimum: 1 },
    ],
  },
};

export type EvidenceGap = EvidenceRequirement & { provided: number };

/** The same gap as data, for an API error to carry (`EVIDENCE_INSUFFICIENT`). */
export const EvidenceGapSchema = z.discriminatedUnion("rule", [
  z.object({
    rule: z.literal("kind"),
    kind: EvidenceKindSchema,
    minimum: z.int().nonnegative(),
    provided: z.int().nonnegative(),
  }),
  z.object({
    rule: z.literal("any_of"),
    kinds: z.array(EvidenceKindSchema).min(2).readonly(),
    minimum: z.int().nonnegative(),
    provided: z.int().nonnegative(),
  }),
]);

const providedFor = (evidence: VerificationEvidence, requirement: EvidenceRequirement): number => {
  switch (requirement.rule) {
    case "kind":
      return countEvidence(evidence, requirement.kind);
    case "any_of":
      return evidence.items.filter((item) => requirement.kinds.includes(item.kind)).length;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled rule; unreachable at runtime */
    default: {
      const unreachable: never = requirement;
      return unreachable;
    }
  }
};

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
    .map(
      (requirement): EvidenceGap => ({
        ...requirement,
        provided: providedFor(evidence, requirement),
      }),
    )
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
