import { z } from "zod";
import type { ShelterLegalEntity } from "../legal-entity";
import type { ExactAddress } from "../location";
import {
  countEvidence,
  type EvidenceKind,
  EvidenceKindSchema,
  holdsRegistryEntry,
  type VerificationEvidence,
} from "./evidence";

/**
 * One line of a legal form's policy. `kind`: at least `minimum` items of that kind. `any_of`: of
 * any of `kinds`, counted together. `registry_entry`: ЄДР entries (`holdsRegistryEntry`), which
 * can sit in two kinds of item, so no kind-only line can count them.
 */
export type EvidenceRequirement =
  | { rule: "kind"; kind: EvidenceKind; minimum: number }
  | {
      rule: "any_of";
      kinds: readonly [EvidenceKind, EvidenceKind, ...EvidenceKind[]];
      minimum: number;
    }
  | { rule: "registry_entry"; minimum: number };

export type VerificationPolicy = {
  requirementsByLegalEntity: Record<ShelterLegalEntity["kind"], readonly EvidenceRequirement[]>;
};

/** A video call (stored as `site_visit`) or an operator's open-sources check (owner, 2026-11-19). */
const CALL_OR_OPEN_SOURCES: EvidenceRequirement = {
  rule: "any_of",
  kinds: ["site_visit", "open_sources_review"],
  minimum: 1,
};

/**
 * A registered form (NGO or ФОП) shows its ЄДР entry (a registration, or an open-sources check
 * with its registry part) and is seen by a person: a call or an open-sources check. An
 * unregistered group, with no entry to show, gives a call or an open-sources check and one
 * independent reference (owner, 2026-11-19, (a′)). No form needs the call unconditionally.
 * Bank-account and further reference items stay addable but are not required (2026-11-10).
 *
 * Thresholds live here, not inside the check, so they can be tuned against the first real
 * shelters without hunting for a number inside a conditional.
 */
export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  requirementsByLegalEntity: {
    registered_ngo: [{ rule: "registry_entry", minimum: 1 }, CALL_OR_OPEN_SOURCES],
    sole_proprietor: [{ rule: "registry_entry", minimum: 1 }, CALL_OR_OPEN_SOURCES],
    unregistered_initiative: [
      CALL_OR_OPEN_SOURCES,
      { rule: "kind", kind: "reference_contact", minimum: 1 },
    ],
  },
};

export type EvidenceGap = EvidenceRequirement & { provided: number };

const count = z.int().nonnegative();

/** The same gap as data, for an API error to carry (`EVIDENCE_INSUFFICIENT`). */
export const EvidenceGapSchema = z.discriminatedUnion("rule", [
  z.object({ rule: z.literal("kind"), kind: EvidenceKindSchema, minimum: count, provided: count }),
  z.object({
    rule: z.literal("any_of"),
    kinds: z.array(EvidenceKindSchema).min(2).readonly(),
    minimum: count,
    provided: count,
  }),
  z.object({ rule: z.literal("registry_entry"), minimum: count, provided: count }),
]);

const providedFor = (evidence: VerificationEvidence, requirement: EvidenceRequirement): number => {
  switch (requirement.rule) {
    case "kind":
      return countEvidence(evidence, requirement.kind);
    case "any_of":
      return evidence.items.filter((item) => requirement.kinds.includes(item.kind)).length;
    case "registry_entry":
      return evidence.items.filter(holdsRegistryEntry).length;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled rule; unreachable at runtime */
    default: {
      const unreachable: never = requirement;
      return unreachable;
    }
  }
};

/** The lines a list of requirements still misses on this evidence. */
export const requirementGaps = (
  requirements: readonly EvidenceRequirement[],
  evidence: VerificationEvidence,
): readonly EvidenceGap[] =>
  requirements
    .map(
      (requirement): EvidenceGap => ({
        ...requirement,
        provided: providedFor(evidence, requirement),
      }),
    )
    .filter((gap) => gap.provided < gap.minimum);

/**
 * Returns what is missing rather than a bare boolean, so a reviewer can be told
 * which document to chase instead of being told "no".
 */
export const evidenceGaps = (
  legalEntity: ShelterLegalEntity,
  evidence: VerificationEvidence,
  policy: VerificationPolicy,
): readonly EvidenceGap[] =>
  requirementGaps(policy.requirementsByLegalEntity[legalEntity.kind], evidence);

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
