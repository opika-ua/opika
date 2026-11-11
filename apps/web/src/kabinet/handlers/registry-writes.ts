import { type apiErrors, type RegistryShelterView, UNKNOWN_CITY_MESSAGE } from "@opika/contracts";
import { type AuditedShelterChange, cityRepo, kabinetShelterRepo } from "@opika/db/repos";
import {
  addEvidence,
  allowEarlyListing,
  approvalGaps,
  type CityId,
  DEFAULT_VERIFICATION_POLICY,
  type DonationRemovalCode,
  donationOnSuspension,
  type EvidenceItemInput,
  type ExactAddress,
  earlyListingOf,
  type FreshnessSentence,
  keepsEarlyListing,
  type LocalizedText,
  type LocationPrivacyPolicy,
  lapsedAtOf,
  MAX_EVIDENCE_ITEMS,
  type ModeratorId,
  publicLocationOf,
  type RejectionCode,
  revokeEarlyListing,
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
import { withEvidenceOnFile } from "./evidence-on-file";
import { loadShelterOr404, type RegistryDeps, registryShelterView } from "./registry-reads";
import { optionalTextAfterEdit } from "./text-after-edit";

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
  plan: (shelter: Shelter) => Planned | Promise<Planned>,
  errors: E<never>,
): Promise<RegistryShelterView> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const shelter = await loadShelterOr404(deps, shelterId, errors);
    if ((await writePlanned(deps, shelter, await plan(shelter))) !== "conflict") {
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
    (await cityRepo(deps.db).findCurrentById(input.change.next.cityId as CityId)) === null
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
 * The profile fields, written by the operator: the display name, which only
 * the operator changes (R-UI 4), and the ones the shelter can also edit. Each
 * changed field is its own history line with the operator as actor, which is
 * what the shelter later reads in its own history (RG-Q8). An unchanged field
 * records nothing; the contract has already trimmed the name, so a rename to
 * the same name with spaces around it is unchanged too.
 */
export const registryUpdateProfile = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: {
    shelterId: ShelterId;
    expectedVersion: number;
    displayName?: string | undefined;
    contact?: ShelterContact | undefined;
    description?: LocalizedText | null | undefined;
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
      if (input.displayName !== undefined && input.displayName !== shelter.displayName) {
        plan.changes.push({ kind: "display_name", displayName: input.displayName });
        plan.entries.push({
          kind: "display_name_changed",
          at: deps.now,
          moderatorId,
          from: shelter.displayName,
          to: input.displayName,
        });
      }
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
      if (input.description !== undefined) {
        const next = optionalTextAfterEdit(shelter.description, input.description);
        if (!same(shelter.description, next)) {
          plan.changes.push({ kind: "description", description: next });
          plan.entries.push({
            kind: "description_changed",
            at: deps.now,
            actor,
            previous: shelter.description,
            next,
          });
        }
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
 * attributed to the operator recording it, never typed. On resubmit, what
 * this refuses to take from input is put back from the record on file
 * (`withEvidenceOnFile`): documents, and the recorder of an unchanged visit.
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
  alongside: (shelter: Shelter) => Planned = () => ({ changes: [], entries: [] }),
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
      const extra = alongside(shelter);
      return {
        changes: [{ kind: "verification", verification: result.next }, ...extra.changes],
        entries: [
          {
            kind: "verification",
            event,
            from: shelter.verification.status,
            to: result.next.status,
          },
          // The write clears an expired permission (approve, reject); the lapse is recorded then,
          // dated at its expiry. `start_review` keeps the permission, so records nothing.
          ...(keepsEarlyListing(shelter.verification.status, result.next.status)
            ? []
            : lapsedEntries(shelter, deps.now)),
          ...extra.entries,
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
 * Approval is refused while the legal entity or address is missing
 * (VERIFIED_DATA_MISSING, checked first), then while the evidence misses the
 * policy for the shelter's legal form (EVIDENCE_INSUFFICIENT), each with the
 * gaps as data. Checked after legality, so an approve on the wrong state is
 * ILLEGAL_TRANSITION whatever the data.
 */
export const registryApprove = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId },
  errors: E<"ILLEGAL_TRANSITION" | "VERIFIED_DATA_MISSING" | "EVIDENCE_INSUFFICIENT">,
) =>
  verificationMove(
    deps,
    input.shelterId,
    () => ({ type: "approve", at: deps.now, moderatorId }),
    errors,
    (shelter) => {
      const gaps = approvalGaps(
        shelter,
        shelter.verification.evidence,
        DEFAULT_VERIFICATION_POLICY,
      );
      const [missing, ...moreMissing] = gaps.flatMap((gap) =>
        gap.on === "verified_data" ? [gap.field] : [],
      );
      if (missing !== undefined)
        throw errors.VERIFIED_DATA_MISSING({ data: { missing: [missing, ...moreMissing] } });
      const [first, ...rest] = gaps.flatMap((gap) =>
        gap.on === "evidence"
          ? [{ kind: gap.kind, minimum: gap.minimum, provided: gap.provided }]
          : [],
      );
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
    undefined,
    // Planned from the same read the transition is, and written in the same compare-and-set
    // statement: a link that stops being live can never outlive the suspension that ended it.
    (shelter) => {
      const outcome = donationOnSuspension(shelter, deps.now);
      if (outcome.kind === "nothing_live") return { changes: [], entries: [] };
      return {
        changes: [
          {
            kind: "donation_state",
            donation: null,
            pendingDonation:
              outcome.kind === "moved_to_pending"
                ? outcome.pendingDonation
                : shelter.pendingDonation,
          },
        ],
        entries: [
          {
            kind: "donation_suspended",
            at: deps.now,
            moderatorId,
            previousLive: outcome.previousLive,
            outcome: outcome.kind,
          },
        ],
      };
    },
  );

/**
 * The operator amends the evidence and sends it back for review (H2-2's
 * operator side). What the input can't carry (documents, who made a visit)
 * comes from the record on file as it is read for this write
 * (`withEvidenceOnFile`), so a resubmit never drops it.
 *
 * The history entry is the event itself, so it holds the whole list the
 * shelter has from then on, carried items included: the same list the record
 * holds, as the shelter's own request for another look records it
 * (`verificationRequestReview`). It doesn't mark which items were typed and
 * which carried; the entry before it holds the list it replaced, except after
 * `shelter_created`, which holds none.
 */
export function registryResubmit(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; evidence: readonly EvidenceItemInput[] },
  errors: E<"ILLEGAL_TRANSITION" | "INVALID_EVIDENCE" | "EVIDENCE_LIMIT_REACHED">,
): Promise<RegistryShelterView> {
  // Before validating any item: an oversized list is refused on its length alone, as at creation.
  if (input.evidence.length > MAX_EVIDENCE_ITEMS) {
    throw errors.EVIDENCE_LIMIT_REACHED({ data: { limit: MAX_EVIDENCE_ITEMS } });
  }
  const accepted = acceptEvidence(input.evidence, { moderatorId, now: deps.now });
  if (accepted.kind === "refused")
    throw errors.INVALID_EVIDENCE({ data: { reason: accepted.reason } });
  return verificationMove(
    deps,
    input.shelterId,
    (shelter) => {
      const evidence = withEvidenceOnFile(shelter.verification.evidence, accepted.evidence);
      // Counted after the carried documents are put back: that is the list the shelter will hold.
      if (evidence.items.length > MAX_EVIDENCE_ITEMS) {
        throw errors.EVIDENCE_LIMIT_REACHED({ data: { limit: MAX_EVIDENCE_ITEMS } });
      }
      return { type: "resubmit", at: deps.now, actor: moderatorActor(moderatorId), evidence };
    },
    errors,
  );
}

// ─── earlyListing.allow / revoke ────────────────────────────────────────────

/** The lapse line for a permission that ran out on its own, dated at its expiry, or nothing. */
const lapsedEntries = (shelter: Shelter, now: Date): ShelterHistoryEntry[] => {
  const at = lapsedAtOf(earlyListingOf(shelter.earlyListingSince), now);
  return at === null ? [] : [{ kind: "early_listing_lapsed", at }];
};

/**
 * Operator only (the registry matrix). Not a verification move: the FSM, the evidence and the
 * reviewer are untouched. Re-read on a lost race, so an approval that lands meanwhile answers
 * wrong_status instead of leaving a permission on a verified shelter. A re-allow after a lapse
 * writes the lapse line first, then the allow; the note is operator-only history.
 */
export function registryAllowEarlyListing(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; note?: string | undefined },
  errors: E<"EARLY_LISTING_REFUSED">,
): Promise<RegistryShelterView> {
  return tapWithRetry(
    deps,
    input.shelterId,
    async (shelter) => {
      const result = allowEarlyListing({
        verification: shelter.verification,
        early: earlyListingOf(shelter.earlyListingSince),
        periodsUsed: await kabinetShelterRepo(deps.db).earlyListingPeriodsUsed(shelter.id),
        note: input.note ?? null,
        now: deps.now,
      });
      if (result.kind !== "ok") {
        throw errors.EARLY_LISTING_REFUSED({ data: { reason: result.kind } });
      }
      return {
        changes: [{ kind: "early_listing_allowed", since: result.since }],
        entries: [
          ...lapsedEntries(shelter, deps.now),
          {
            kind: "early_listing_allowed",
            at: deps.now,
            moderatorId,
            period: result.period,
            note: input.note ?? null,
          },
        ],
      };
    },
    errors,
  );
}

export function registryRevokeEarlyListing(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId },
  errors: E<"EARLY_LISTING_REFUSED">,
): Promise<RegistryShelterView> {
  return tapWithRetry(
    deps,
    input.shelterId,
    (shelter) => {
      const result = revokeEarlyListing(
        shelter.verification,
        earlyListingOf(shelter.earlyListingSince),
        deps.now,
      );
      if (result.kind !== "ok") {
        throw errors.EARLY_LISTING_REFUSED({ data: { reason: "not_running" } });
      }
      return {
        changes: [{ kind: "early_listing_revoked" }],
        entries: [{ kind: "early_listing_revoked", at: deps.now, moderatorId }],
      };
    },
    errors,
  );
}

// ─── verification.addEvidence ───────────────────────────────────────────────

/**
 * The operator appends evidence while the shelter is pending or under review.
 * Not a verification move: status, timestamps and reviewer are untouched and
 * the shelter is not told (its history projection omits `evidence_added`). The
 * entry names the kinds only, never contents. Duplicates (same kind and key
 * field, see `evidenceDuplicateKey`) are dropped, so a repeat writes nothing.
 * No version in the input: appends commute, and a lost race re-plans on what is
 * there now, so a shelter approved or rejected meanwhile answers
 * EVIDENCE_NOT_EDITABLE rather than taking the item. Approval re-reads the
 * list at approve time, so the new items count with no extra code.
 */
export function registryAddEvidence(
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; evidence: readonly EvidenceItemInput[] },
  errors: E<"INVALID_EVIDENCE" | "EVIDENCE_NOT_EDITABLE" | "EVIDENCE_LIMIT_REACHED">,
): Promise<RegistryShelterView> {
  const accepted = acceptEvidence(input.evidence, { moderatorId, now: deps.now });
  if (accepted.kind === "refused")
    throw errors.INVALID_EVIDENCE({ data: { reason: accepted.reason } });
  return tapWithRetry(
    deps,
    input.shelterId,
    (shelter) => {
      const result = addEvidence(shelter.verification, accepted.evidence.items);
      switch (result.kind) {
        case "not_open":
          throw errors.EVIDENCE_NOT_EDITABLE({ data: { from: result.from } });
        case "too_many":
          throw errors.EVIDENCE_LIMIT_REACHED({ data: { limit: result.limit } });
        case "nothing_new":
          return { changes: [], entries: [] };
        case "ok": {
          const statusAt = shelter.verification.status;
          if (statusAt !== "pending" && statusAt !== "under_review") {
            throw new Error("addEvidence returned ok from a closed status");
          }
          return {
            changes: [{ kind: "verification", verification: result.next }],
            entries: [
              {
                kind: "evidence_added",
                at: deps.now,
                moderatorId,
                items: result.added.map((item) => ({ kind: item.kind })),
                statusAt,
              },
            ],
          };
        }
        /* v8 ignore next 4 -- exists so the compiler rejects an unhandled result; unreachable at runtime */
        default: {
          const unreachable: never = result;
          return unreachable;
        }
      }
    },
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
    // Approving while suspended would let a reinstatement publish the link with no decision after
    // it; rejecting stays possible. Nothing is written, as with nothing pending.
    if (decision === "approved" && shelter.verification.status === "suspended") {
      return { changes: [], entries: [] };
    }
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

/**
 * Takes the live link away for good and clears a waiting proposal with it, for a reason the
 * shelter reads. Versioned: the operator removes the link they read, anything newer is CONFLICT.
 * With no live link there is nothing to remove, so nothing is written.
 */
export const registryDonationRemove = (
  deps: RegistryDeps,
  moderatorId: ModeratorId,
  input: {
    shelterId: ShelterId;
    expectedVersion: number;
    reason: { code: DonationRemovalCode; note: string };
  },
  errors: E<"CONFLICT">,
) =>
  editFromForm(
    deps,
    input.shelterId,
    input.expectedVersion,
    (shelter) =>
      shelter.donation === null
        ? { changes: [], entries: [] }
        : {
            changes: [{ kind: "donation_state", donation: null, pendingDonation: null }],
            entries: [
              {
                kind: "donation_removed",
                at: deps.now,
                moderatorId,
                previousLive: shelter.donation,
                clearedPending: shelter.pendingDonation !== null,
                reason: input.reason,
              },
            ],
          },
    errors,
  );
