import { z } from "zod";
import type { ShelterLegalEntity } from "../legal-entity";
import type { ShelterPremises } from "../premises";
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
 * independent reference (owner, 2026-11-19, (a′)) or documented ongoing work (owner, 2026-11-24:
 * "(open sources OR a call) AND (one independent reference OR documented ongoing work)"; one
 * valid record counts, its two months are the item's own rule). No form needs the call
 * unconditionally.
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
      { rule: "any_of", kinds: ["reference_contact", "ongoing_work_record"], minimum: 1 },
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

/**
 * What approval asks of the verified data before any evidence (owner, 2026-11-24, D1-D3): a form
 * picked (`legal_form`); a registered form an address (`exact_address`); an initiative an address
 * or foster homes (`premises`).
 */
export const VERIFIED_DATA_GAPS = ["legal_form", "exact_address", "premises"] as const;
export const VerifiedDataGapSchema = z.enum(VERIFIED_DATA_GAPS);
export type VerifiedDataGap = z.infer<typeof VerifiedDataGapSchema>;

export type ApprovalGap =
  | { on: "verified_data"; field: VerifiedDataGap }
  | ({ on: "evidence" } & EvidenceGap);

/** The one verified-data gap the form and premises leave, per form; with no form, the form. */
export const verifiedDataGapOf = (
  legalEntity: ShelterLegalEntity | null,
  premises: ShelterPremises,
): VerifiedDataGap | null => {
  if (legalEntity === null) return "legal_form";
  switch (legalEntity.kind) {
    case "registered_ngo":
    case "sole_proprietor":
      return premises.kind === "address" ? null : "exact_address";
    case "unregistered_initiative":
      return premises.kind === "not_recorded" ? "premises" : null;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = legalEntity;
      return unreachable;
    }
  }
};

/**
 * Verified data first, then evidence. Evidence requirements depend on the legal form, so with no
 * legal entity there is nothing to measure evidence against yet.
 */
export const approvalGaps = (
  shelter: { legalEntity: ShelterLegalEntity | null; premises: ShelterPremises },
  evidence: VerificationEvidence,
  policy: VerificationPolicy,
): readonly ApprovalGap[] => {
  const field = verifiedDataGapOf(shelter.legalEntity, shelter.premises);
  return [
    ...(field === null ? [] : [{ on: "verified_data", field } as const]),
    ...(shelter.legalEntity === null
      ? []
      : evidenceGaps(shelter.legalEntity, evidence, policy).map(
          (gap) => ({ on: "evidence", ...gap }) as const,
        )),
  ];
};
