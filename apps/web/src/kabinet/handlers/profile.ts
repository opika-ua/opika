import type { apiErrors, KabinetShelterView } from "@opika/contracts";
import { type AuditedShelterChange, kabinetShelterRepo, shelterRepo } from "@opika/db/repos";
import {
  donationProviderOf,
  type FreshnessSentence,
  type PauseReason,
  type Shelter,
  type ShelterActor,
  type ShelterContact,
  type ShelterHistoryEntry,
  type ShelterId,
  type ShelterLogo,
  shelterFacingVerificationOf,
  transition,
  type VerificationEvent,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { ShelterReadScope, ShelterWriteScope } from "../access";
import type { KabinetContext } from "../context";
import { shelterUploadKey } from "../rate-limits";
import { withinBudget } from "./photos";

export type ProfileDeps = Pick<KabinetContext, "db" | "now" | "newId" | "photoUploads">;

type CasErrors = ORPCErrorConstructorMap<{ CONFLICT: typeof apiErrors.CONFLICT }>;
type TransitionErrors = ORPCErrorConstructorMap<{
  ILLEGAL_TRANSITION: typeof apiErrors.ILLEGAL_TRANSITION;
}>;

/**
 * The shelter's own view of itself (K4). Built field by field, the way the
 * view is `pick`ed: nothing reaches a shelter because it happened to be on
 * the row. Verification is the shelter-facing projection, with no evidence
 * and no moderator ids.
 */
export function kabinetShelterViewOf(shelter: Shelter): KabinetShelterView {
  return {
    id: shelter.id,
    displayName: shelter.displayName,
    description: shelter.description,
    legalEntity: shelter.legalEntity,
    exactAddress: shelter.exactAddress,
    contact: shelter.contact,
    donation: shelter.donation,
    pendingDonation: shelter.pendingDonation,
    freshnessSentence: shelter.freshnessSentence,
    logo: shelter.logo,
    version: shelter.version,
    verification: shelterFacingVerificationOf(shelter.verification),
  };
}

/**
 * The shelter a scope names. It always exists: the scope came from a
 * membership or a support session pointing at it, and shelters are never
 * deleted (`shelter_history` references them with no cascade). A missing row
 * is a broken invariant, not a user error, so it throws.
 */
async function load(deps: ProfileDeps, shelterId: ShelterId): Promise<Shelter> {
  const shelter = await shelterRepo(deps.db).findById(shelterId);
  if (shelter === null) throw new Error(`Scope names missing shelter ${shelterId}`);
  return shelter;
}

const actorOf = (scope: ShelterWriteScope): ShelterActor => ({
  kind: "shelter_admin",
  shelterAdminId: scope.shelterAdminId,
});

type Planned =
  | { kind: "write"; change: AuditedShelterChange; entry: ShelterHistoryEntry }
  | { kind: "no_change" };

async function write(deps: ProfileDeps, shelter: Shelter, expectedVersion: number, plan: Planned) {
  if (plan.kind === "no_change") return { kind: "ok" } as const;
  return kabinetShelterRepo(deps.db).applyAudited({
    shelterId: shelter.id,
    expectedVersion,
    change: plan.change,
    entry: plan.entry,
    historyId: deps.newId(),
    now: deps.now,
  });
}

/**
 * An edit of a form the shelter read (contact, freshness sentence): it sends
 * the `version` it read, and anything newer since is CONFLICT, so the shelter
 * reloads rather than silently overwriting someone else's edit. Checked
 * before writing, so the history entry's `previous` is always what the write
 * actually replaced.
 */
async function editFromForm(
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  expectedVersion: number,
  plan: (shelter: Shelter) => Planned,
  errors: CasErrors,
): Promise<KabinetShelterView> {
  const shelter = await load(deps, scope.shelterId);
  if (shelter.version !== expectedVersion) throw errors.CONFLICT();
  const result = await write(deps, shelter, expectedVersion, plan(shelter));
  if (result.kind === "conflict") throw errors.CONFLICT();
  return kabinetShelterViewOf(await load(deps, scope.shelterId));
}

/**
 * How many times a write with no client version re-reads and retries after
 * losing a race. These are single taps (propose, pause, ask for review), not
 * a form someone filled in, so there is no stale input to protect: a lost
 * race only means "plan again on what's there now". Bounded so a pathological
 * contention loop ends in an error instead of spinning.
 */
const MAX_ATTEMPTS = 3;

async function tapWithRetry(
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  plan: (shelter: Shelter) => Planned,
): Promise<KabinetShelterView> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const shelter = await load(deps, scope.shelterId);
    const result = await write(deps, shelter, shelter.version, plan(shelter));
    if (result.kind === "ok") return kabinetShelterViewOf(await load(deps, scope.shelterId));
  }
  throw new Error(`Shelter ${scope.shelterId}: lost ${MAX_ATTEMPTS} races in a row`);
}

export async function profileGet(
  deps: ProfileDeps,
  scope: ShelterReadScope,
): Promise<KabinetShelterView> {
  return kabinetShelterViewOf(await load(deps, scope.shelterId));
}

export const profileUpdateContact = (
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  input: { contact: ShelterContact; expectedVersion: number },
  errors: CasErrors,
) =>
  editFromForm(
    deps,
    scope,
    input.expectedVersion,
    (shelter) => ({
      kind: "write",
      change: { kind: "contact", contact: input.contact },
      entry: {
        kind: "contact_changed",
        at: deps.now,
        actor: actorOf(scope),
        previous: shelter.contact,
        next: input.contact,
      },
    }),
    errors,
  );

/**
 * The sentence a shelter's edit stores (K4 sheet, answer 13, Oleksii,
 * verbatim: "Clear `en` when `uk` changes; a stale translation would be a
 * false claim."). The English translates one particular Ukrainian sentence;
 * once the Ukrainian is different, keeping it would show English readers
 * words the shelter no longer says. So a changed `uk` stores no `en`,
 * whatever the request carried, and an unchanged `uk` keeps the `en` sent
 * with it (the K4 editor sends the stored one back). Contacts have no
 * localised field, so `updateContact` has nothing to clear.
 */
export function freshnessSentenceAfterEdit(
  stored: FreshnessSentence,
  edited: FreshnessSentence,
): FreshnessSentence {
  if (edited === null) return null;
  if (stored !== null && stored.uk === edited.uk) return edited;
  return { uk: edited.uk, en: null };
}

export const profileUpdateFreshnessSentence = (
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  input: { freshnessSentence: FreshnessSentence; expectedVersion: number },
  errors: CasErrors,
) =>
  editFromForm(
    deps,
    scope,
    input.expectedVersion,
    (shelter) => {
      const next = freshnessSentenceAfterEdit(shelter.freshnessSentence, input.freshnessSentence);
      return {
        kind: "write",
        change: { kind: "freshness_sentence", freshnessSentence: next },
        entry: {
          kind: "freshness_sentence_changed",
          at: deps.now,
          actor: actorOf(scope),
          previous: shelter.freshnessSentence,
          next,
        },
      };
    },
    errors,
  );

/**
 * Proposes a donation link (N20). The live link is untouched until the
 * operator approves; proposing again replaces the pending one (H2-7). The
 * provider is derived from the URL, never sent by the client.
 */
export const profileProposeDonation = (
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  input: { url: string },
) => {
  const link = { url: input.url, provider: donationProviderOf(input.url) };
  return tapWithRetry(deps, scope, () => ({
    kind: "write",
    change: {
      kind: "pending_donation",
      pendingDonation: { link, proposedAt: deps.now, proposedBy: scope.shelterAdminId },
    },
    entry: { kind: "donation_proposed", at: deps.now, actor: actorOf(scope), link },
  }));
};

/** Withdraws a pending proposal. With nothing pending there is nothing to change or record. */
export const profileCancelDonationProposal = (deps: ProfileDeps, scope: ShelterWriteScope) =>
  tapWithRetry(deps, scope, (shelter) =>
    shelter.pendingDonation === null
      ? { kind: "no_change" }
      : {
          kind: "write",
          change: { kind: "pending_donation", pendingDonation: null },
          entry: { kind: "donation_proposal_cancelled", at: deps.now, actor: actorOf(scope) },
        },
  );

/**
 * A stored logo file no shelter row points at any more: logged the same way
 * `photos.ts`'s own `logOrphan` is, under a distinct event name so the two
 * pipelines stay tellable apart in the logs. Nothing deletes it in code - the
 * R2 clean-up job reclaims it after the grace period (pet card PR 4).
 */
const logOrphan = (storageKey: string) => console.error({ event: "logo_orphaned", storageKey });

/**
 * `shelter.logo.set` (pet card PR 3b): checked and re-encoded the same way a
 * `shelter.photos.add` upload is (`prepareUploadedLogo` - same magic-byte
 * sniff, same `PHOTO_MAX_EDGE_PX` ceiling, same metadata stripping - just a
 * different, square variant set), charged to the shelter's *existing* upload
 * allowance (`shelterUploadKey`/`PHOTO_UPLOAD_RATE_LIMITS` - a decision
 * taken, not a new limiter pool: a logo is rare next to animal photos). No
 * `PHOTO_LIMIT_REACHED`: a single nullable field has nothing to fill up.
 * `tapWithRetry` re-reads on a lost race, so the history's `previous` is
 * always whatever the write actually replaced, even if another admin edited
 * the profile between the read and this write.
 */
export async function profileSetLogo(
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  input: { file: File },
  errors: ORPCErrorConstructorMap<{
    RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
    PHOTO_UPLOADS_UNAVAILABLE: typeof apiErrors.PHOTO_UPLOADS_UNAVAILABLE;
    PHOTO_REJECTED: typeof apiErrors.PHOTO_REJECTED;
  }>,
): Promise<KabinetShelterView> {
  const uploads = deps.photoUploads;
  if (uploads.kind === "off") throw errors.PHOTO_UPLOADS_UNAVAILABLE();

  const allowanceKey = shelterUploadKey(scope.shelterId);
  if (!(await uploads.limiters.perHour.check(allowanceKey, deps.now))) throw errors.RATE_LIMITED();
  if (!(await uploads.limiters.perDay.check(allowanceKey, deps.now))) throw errors.RATE_LIMITED();

  const pipeline = await import("@opika/db/image-pipeline/server");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const processed = await withinBudget(
    pipeline.prepareUploadedLogo(bytes),
    uploads.processingBudgetMs,
  );
  if (processed.kind === "over_budget") {
    console.error({ event: "logo_processing_over_budget", budgetMs: uploads.processingBudgetMs });
    throw new Error("Logo processing ran past its budget");
  }
  const prepared = processed.value;
  if (prepared.kind === "rejected") {
    throw errors.PHOTO_REJECTED({ data: { reason: prepared.reason } });
  }

  const storageKey = pipeline.shelterLogoStorageKeyFor(scope.shelterId, deps.newId());
  const logo: ShelterLogo = { storageKey, width: prepared.width, height: prepared.height };
  try {
    await pipeline.storeLogoVariants(uploads.storage, storageKey, prepared.variants);
    return await tapWithRetry(deps, scope, (shelter) => ({
      kind: "write",
      change: { kind: "logo", logo },
      entry: {
        kind: "logo_changed",
        at: deps.now,
        actor: actorOf(scope),
        previous: shelter.logo,
        next: logo,
      },
    }));
  } catch (error) {
    logOrphan(storageKey);
    throw error;
  }
}

/** Clears the logo back to the fallback-initials avatar. With none set there is nothing to change or record. */
export const profileRemoveLogo = (deps: ProfileDeps, scope: ShelterWriteScope) =>
  tapWithRetry(deps, scope, (shelter) =>
    shelter.logo === null
      ? { kind: "no_change" }
      : {
          kind: "write",
          change: { kind: "logo", logo: null },
          entry: {
            kind: "logo_changed",
            at: deps.now,
            actor: actorOf(scope),
            previous: shelter.logo,
            next: null,
          },
        },
  );

/**
 * A verification move a shelter makes itself. Planned against the state as
 * read on each attempt, so a retry after a lost race re-checks legality: a
 * pause that raced a suspension comes back ILLEGAL_TRANSITION, not paused.
 */
function verificationMove(
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  eventOf: (shelter: Shelter) => VerificationEvent,
  errors: TransitionErrors,
): Promise<KabinetShelterView> {
  return tapWithRetry(deps, scope, (shelter) => {
    const event = eventOf(shelter);
    const result = transition(shelter.verification, event);
    if (result.kind === "illegal") {
      throw errors.ILLEGAL_TRANSITION({
        data: { machine: "verification", from: result.from, event: result.event },
      });
    }
    if (result.kind === "non_monotonic") {
      // The server stamps `at` itself, so this is the server's clock behind
      // the last write's: a deployment fault, never something the shelter did.
      throw new Error(
        `Verification event at ${result.eventTimestamp.toISOString()} precedes state at ${result.stateTimestamp.toISOString()}`,
      );
    }
    return {
      kind: "write",
      change: { kind: "verification", verification: result.next },
      entry: {
        kind: "verification",
        event,
        from: shelter.verification.status,
        to: result.next.status,
      },
    };
  });
}

export const profilePause = (
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  input: { reason: PauseReason },
  errors: TransitionErrors,
) =>
  verificationMove(
    deps,
    scope,
    () => ({ type: "pause", at: deps.now, actor: actorOf(scope), reason: input.reason }),
    errors,
  );

export const profileResume = (
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  errors: TransitionErrors,
) =>
  verificationMove(
    deps,
    scope,
    () => ({ type: "resume", at: deps.now, actor: actorOf(scope) }),
    errors,
  );

/**
 * Asks for another review after a rejection (H2-2): the evidence already on
 * file, carried forward by the server and stamped as submitted now. A shelter
 * never uploads evidence itself; a person reviews the resubmission.
 */
export const verificationRequestReview = (
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  errors: TransitionErrors,
) =>
  verificationMove(
    deps,
    scope,
    (shelter) => ({
      type: "resubmit",
      at: deps.now,
      actor: actorOf(scope),
      evidence: { items: shelter.verification.evidence.items, submittedAt: deps.now },
    }),
    errors,
  );
