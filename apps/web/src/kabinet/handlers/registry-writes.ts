import { type apiErrors, type RegistryShelterView, UNKNOWN_CITY_MESSAGE } from "@opika/contracts";
import { type AuditedShelterChange, cityRepo, kabinetShelterRepo } from "@opika/db/repos";
import {
  type CityId,
  DEFAULT_VERIFICATION_POLICY,
  type EvidenceItemInput,
  type ExactAddress,
  evidenceGaps,
  type FreshnessSentence,
  type LocalizedText,
  type LocationPrivacyPolicy,
  type ModeratorId,
  publicLocationOf,
  type RejectionCode,
  type Shelter,
  type ShelterActor,
  type ShelterContact,
  type ShelterHistoryEntry,
  type ShelterId,
  type ShelterLegalEntity,
  type SuspensionCode,
  toVerificationEvidence,
  transition,
  type VerificationEvent,
  type VerificationEvidence,
} from "@opika/domain";
import { ORPCError, type ORPCErrorConstructorMap } from "@orpc/server";
import { loadShelterOr404, type RegistryDeps, registryShelterView } from "./registry-reads";

type E<K extends keyof typeof apiErrors> = ORPCErrorConstructorMap<
  Pick<typeof apiErrors, K | "NOT_FOUND">
>;

const moderatorActor = (moderatorId: ModeratorId): ShelterActor => ({
  kind: "moderator",
  moderatorId,
});

/** Structural equality for the snapshot values history records (no Dates inside these). */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

type Planned = {
  changes: AuditedShelterChange[];
  entries: ShelterHistoryEntry[];
};

async function writePlanned(
  deps: RegistryDeps,
  shelter: Shelter,
  plan: Planned,
): Promise<"ok" | "conflict" | "no_change"> {
  if (plan.entries.length === 0) return "no_change";
  const result = await kabinetShelterRepo(deps.db).applyAuditedMany({
    shelterId: shelter.id,
    expectedVersion: shelter.version,
    changes: plan.changes,
    entries: plan.entries.map((entry) => ({ id: deps.newId(), entry })),
    now: deps.now,
  });
  return result.kind;
}

/**
 * An edit of a form the operator read (S4): it sends the version it read,
 * and anything newer is CONFLICT, the same rule the shelter's own forms
 * follow. Checked before planning, so every entry's `previous` is the value
 * the write replaced. A form that changes nothing writes nothing.
 */
async function editFromForm(
  deps: RegistryDeps,
  shelterId: ShelterId,
  expectedVersion: number,
  plan: (shelter: Shelter) => Planned,
  errors: E<"CONFLICT">,
): Promise<RegistryShelterView> {
  const shelter = await loadShelterOr404(deps, shelterId, errors);
  if (shelter.version !== expectedVersion) throw errors.CONFLICT();
  if ((await writePlanned(deps, shelter, plan(shelter))) === "conflict") throw errors.CONFLICT();
  return registryShelterView(deps, await loadShelterOr404(deps, shelterId, errors));
}

const MAX_ATTEMPTS = 3;

/**
 * A single tap with no version in its input (a verification move). A lost race re-reads and re-plans on what's there now, so a
 * move that became illegal in the meantime is refused, never applied to a
 * state the operator didn't see. Bounded, like the shelter side's.
 */
async function tapWithRetry(
  deps: RegistryDeps,
  shelterId: ShelterId,
  plan: (shelter: Shelter) => Planned,
  errors: E<never>,
): Promise<RegistryShelterView> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const shelter = await loadShelterOr404(deps, shelterId, errors);
    if ((await writePlanned(deps, shelter, plan(shelter))) !== "conflict") {
      return registryShelterView(deps, await loadShelterOr404(deps, shelterId, errors));
    }
  }
  throw new Error(`Shelter ${shelterId}: lost ${MAX_ATTEMPTS} races in a row`);
}

// ─── shelters.updateVerifiedData / updateProfile ────────────────────────────

/**
 * The locked fields, one per call (S4). An address change recomputes the
 * public location with the configured key (`publicLocationOf`, the only
 * sanctioned constructor) and moves it together with the address.
 */
export async function registryUpdateVerifiedData(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  policy: LocationPrivacyPolicy,
  input: {
    shelterId: ShelterId;
    expectedVersion: number;
    change:
      | { field: "legal_entity"; next: ShelterLegalEntity }
      | { field: "exact_address"; next: ExactAddress };
  },
  errors: E<"CONFLICT">,
): Promise<RegistryShelterView> {
  if (
    input.change.field === "exact_address" &&
    (await cityRepo(deps.db).findById(input.change.next.cityId as CityId)) === null
  ) {
    // As on create (RG-T5): a client fault, answered 400, never the FK's 500.
    throw new ORPCError("BAD_REQUEST", { status: 400, message: UNKNOWN_CITY_MESSAGE });
  }
  return editFromForm(
    deps,
    input.shelterId,
    input.expectedVersion,
    (shelter): Planned => {
      const { change } = input;
      if (change.field === "legal_entity") {
        if (same(shelter.legalEntity, change.next)) return { changes: [], entries: [] };
        return {
          changes: [{ kind: "legal_entity", legalEntity: change.next }],
          entries: [
            {
              kind: "verified_data_changed",
              at: deps.now,
              moderatorId,
              change: { field: "legal_entity", previous: shelter.legalEntity, next: change.next },
            },
          ],
        };
      }
      if (same(shelter.exactAddress, change.next)) return { changes: [], entries: [] };
      return {
        changes: [
          {
            kind: "exact_address",
            exactAddress: change.next,
            publicLocation: publicLocationOf(shelter.id, change.next, policy),
          },
        ],
        entries: [
          {
            kind: "verified_data_changed",
            at: deps.now,
            moderatorId,
            change: { field: "exact_address", previous: shelter.exactAddress, next: change.next },
          },
        ],
      };
    },
    errors,
  );
}

/**
 * The profile fields the shelter can also edit, written by the operator.
 * Each changed field is its own history line with the operator as actor,
 * which is what the shelter later reads in its own history (RG-Q8).
 */
export const registryUpdateProfile = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: {
    shelterId: ShelterId;
    expectedVersion: number;
    contact?: ShelterContact | undefined;
    description?: LocalizedText | undefined;
    freshnessSentence?: FreshnessSentence | undefined;
  },
  errors: E<"CONFLICT">,
) =>
  editFromForm(
    deps,
    input.shelterId,
    input.expectedVersion,
    (shelter): Planned => {
      const actor = moderatorActor(moderatorId);
      const plan: Planned = { changes: [], entries: [] };
      if (input.contact !== undefined && !same(shelter.contact, input.contact)) {
        plan.changes.push({ kind: "contact", contact: input.contact });
        plan.entries.push({
          kind: "contact_changed",
          at: deps.now,
          actor,
          previous: shelter.contact,
          next: input.contact,
        });
      }
      if (input.description !== undefined && !same(shelter.description, input.description)) {
        plan.changes.push({ kind: "description", description: input.description });
        plan.entries.push({
          kind: "description_changed",
          at: deps.now,
          actor,
          previous: shelter.description,
          next: input.description,
        });
      }
      if (
        input.freshnessSentence !== undefined &&
        !same(shelter.freshnessSentence, input.freshnessSentence)
      ) {
        plan.changes.push({
          kind: "freshness_sentence",
          freshnessSentence: input.freshnessSentence,
        });
        plan.entries.push({
          kind: "freshness_sentence_changed",
          at: deps.now,
          actor,
          previous: shelter.freshnessSentence,
          next: input.freshnessSentence,
        });
      }
      return plan;
    },
    errors,
  );

// ─── verification ───────────────────────────────────────────────────────────

/**
 * Evidence the operator records (S2 create, S3 resubmit). A `documentKey`
 * points at nothing this system issued until the private bucket exists
 * (H2-6), so any item carrying one is refused (RG-Q5). A site visit is
 * attributed to the operator recording it, never typed.
 */
export function acceptEvidence(
  inputs: readonly EvidenceItemInput[],
  by: { moderatorId: ModeratorId; now: Date },
):
  | { kind: "ok"; evidence: VerificationEvidence }
  | { kind: "refused"; reason: "site_visit_in_future" | "document_not_supported_yet" } {
  const carriesDocument = inputs.some(
    (input) =>
      input.kind === "supporting_document" ||
      ((input.kind === "edrpou_registration" || input.kind === "bank_account_holder") &&
        input.documentKey !== null),
  );
  if (carriesDocument) return { kind: "refused", reason: "document_not_supported_yet" };
  const result = toVerificationEvidence(inputs, { recordedBy: by.moderatorId, recordedAt: by.now });
  if (result.kind === "site_visit_in_future") return { kind: "refused", reason: result.kind };
  return { kind: "ok", evidence: result.evidence };
}

type MoveErrors = E<"ILLEGAL_TRANSITION">;

function verificationMove(
  deps: RegistryDeps,
  shelterId: ShelterId,
  eventOf: (shelter: Shelter) => VerificationEvent,
  errors: MoveErrors,
  precheck: (shelter: Shelter) => void = () => {},
): Promise<RegistryShelterView> {
  return tapWithRetry(
    deps,
    shelterId,
    (shelter) => {
      const event = eventOf(shelter);
      const result = transition(shelter.verification, event);
      if (result.kind === "illegal") {
        throw errors.ILLEGAL_TRANSITION({
          data: { machine: "verification", from: result.from, event: result.event },
        });
      }
      if (result.kind === "non_monotonic") {
        // The server stamps `at`, so this is its own clock behind the last
        // write: a deployment fault, never something the operator did.
        throw new Error(
          `Verification event at ${result.eventTimestamp.toISOString()} precedes state at ${result.stateTimestamp.toISOString()}`,
        );
      }
      precheck(shelter);
      return {
        changes: [{ kind: "verification", verification: result.next }],
        entries: [
          {
            kind: "verification",
            event,
            from: shelter.verification.status,
            to: result.next.status,
          },
        ],
      };
    },
    errors,
  );
}

export const registryStartReview = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId },
  errors: MoveErrors,
) =>
  verificationMove(
    deps,
    input.shelterId,
    () => ({ type: "start_review", at: deps.now, reviewerId: moderatorId }),
    errors,
  );

/**
 * Approval is refused while the evidence on file misses the policy for the
 * shelter's legal form (`DEFAULT_VERIFICATION_POLICY`), with the gaps as
 * data. Checked after legality, so an approve on the wrong state is
 * ILLEGAL_TRANSITION whatever the evidence.
 */
export const registryApprove = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId },
  errors: E<"ILLEGAL_TRANSITION" | "EVIDENCE_INSUFFICIENT">,
) =>
  verificationMove(
    deps,
    input.shelterId,
    () => ({ type: "approve", at: deps.now, moderatorId }),
    errors,
    (shelter) => {
      const gaps = evidenceGaps(
        shelter.legalEntity,
        shelter.verification.evidence,
        DEFAULT_VERIFICATION_POLICY,
      );
      const [first, ...rest] = gaps;
      if (first !== undefined)
        throw errors.EVIDENCE_INSUFFICIENT({ data: { gaps: [first, ...rest] } });
    },
  );

export const registryReinstate = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId },
  errors: MoveErrors,
) =>
  verificationMove(
    deps,
    input.shelterId,
    () => ({ type: "reinstate", at: deps.now, moderatorId }),
    errors,
  );

export const registryReject = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; reason: { code: RejectionCode; note: string } },
  errors: MoveErrors,
) =>
  verificationMove(
    deps,
    input.shelterId,
    () => ({ type: "reject", at: deps.now, moderatorId, reason: input.reason }),
    errors,
  );

export const registrySuspend = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; reason: { code: SuspensionCode; note: string } },
  errors: MoveErrors,
) =>
  verificationMove(
    deps,
    input.shelterId,
    () => ({ type: "suspend", at: deps.now, moderatorId, reason: input.reason }),
    errors,
  );

/** The operator amends the evidence and sends it back for review (H2-2's operator side). */
export function registryResubmit(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; evidence: readonly EvidenceItemInput[] },
  errors: E<"ILLEGAL_TRANSITION" | "INVALID_EVIDENCE">,
): Promise<RegistryShelterView> {
  const accepted = acceptEvidence(input.evidence, { moderatorId, now: deps.now });
  if (accepted.kind === "refused")
    throw errors.INVALID_EVIDENCE({ data: { reason: accepted.reason } });
  return verificationMove(
    deps,
    input.shelterId,
    () => ({
      type: "resubmit",
      at: deps.now,
      actor: moderatorActor(moderatorId),
      evidence: accepted.evidence,
    }),
    errors,
  );
}

// ─── donation ───────────────────────────────────────────────────────────────

/**
 * Approve or reject the proposed link (N20) the operator read: the version
 * they read comes with the decision (RG-Q12, Oleksii), and anything newer is
 * CONFLICT, never retried. A re-proposal or cancellation in between moves
 * the version (pinned by the shelter side's tests), so a decision can only
 * land on the proposal the operator saw. With nothing pending at that
 * version there is nothing to decide; that is answered with the current view.
 */
const donationDecisionPlan =
  (moderatorId: ModeratorId, decision: "approved" | "rejected", now: Date) =>
  (shelter: Shelter): Planned => {
    const pending = shelter.pendingDonation;
    if (pending === null) return { changes: [], entries: [] };
    return {
      changes: [
        decision === "approved"
          ? { kind: "donation_approved", donation: pending.link }
          : { kind: "pending_donation", pendingDonation: null },
      ],
      entries: [
        {
          kind: "donation_decided",
          at: now,
          moderatorId,
          decision,
          link: pending.link,
          previousLive: shelter.donation,
        },
      ],
    };
  };

const donationDecision =
  (decision: "approved" | "rejected") =>
  (
    deps: RegistryDeps,
    moderatorId: ModeratorId,
    input: { shelterId: ShelterId; expectedVersion: number },
    errors: E<"CONFLICT">,
  ) =>
    editFromForm(
      deps,
      input.shelterId,
      input.expectedVersion,
      donationDecisionPlan(moderatorId, decision, deps.now),
      errors,
    );

export const registryDonationApprove = donationDecision("approved");
export const registryDonationReject = donationDecision("rejected");
