import {
  AgeEstimateSchema,
  AnimalIdSchema,
  AnimalSexSchema,
  AnimalSpeciesSchema,
  DonationLinkSchema,
  EvidenceItemInputSchema,
  ExactAddressSchema,
  FreshnessSentenceSchema,
  LISTING_KINDS,
  LocalizedTextSchema,
  MedicalDeclarationInputSchema,
  PauseReasonSchema,
  RejectionCodeSchema,
  ShelterAdminIdSchema,
  ShelterContactSchema,
  ShelterIdSchema,
  ShelterLegalEntitySchema,
  SizeBucketSchema,
  SuspensionCodeSchema,
  VERIFICATION_STATUSES,
  VerificationStatusSchema,
  WithdrawalReasonSchema,
} from "@opika/domain";
import { z } from "zod";
import { apiErrors } from "../errors";
import { MAX_PAGE_SIZE } from "../procedures/pagination";
import { kabinet, registry, shelterRead, shelterWrite, supportExit } from "./access";
import {
  HistoryEntryViewSchema,
  KabinetAnimalRowViewSchema,
  KabinetAnimalViewSchema,
  KabinetShelterViewSchema,
  RegistryShelterRowViewSchema,
  RegistryShelterViewSchema,
  ShelterAdminViewSchema,
} from "./views";

/**
 * The kabinet's procedures (H2 S3 addendum §4). Declarations only: handlers,
 * Better Auth and the access middleware arrive in the next slice.
 *
 * `shelterId` never appears in a `shelter.*` input. It comes from the actor,
 * so a shelter admin has no field to put another shelter's id in. Animal ids
 * do appear, and a handler that finds one belonging to another shelter answers
 * FORBIDDEN (S3-Q2), which is why every shelter-scoped procedure declares it.
 */

/** Opaque and signed, like the feed's: the handler binds it to its list and filters. */
export const KabinetCursorSchema = z.string().min(1).max(512).brand<"KabinetCursor">();
export type KabinetCursor = z.infer<typeof KabinetCursorSchema>;

const kabinetPageSizeSchema = z.int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE);

const ListingKindSchema = z.enum(LISTING_KINDS);
const countsBy = <const T extends readonly [string, ...string[]]>(keys: T) =>
  z.record(z.enum(keys), z.int().nonnegative());

/**
 * The operator's note on a rejection or suspension. Trimmed, then required
 * (S3-Q2): whitespace-only is refused. The shelter reads it exactly as written
 * (K5), so it follows the brand voice: first person, plain words. Bounded
 * because it is rendered on a shelter's screen and kept in its history. The
 * stored domain reasons keep `note` nullable; requiring it is a property of
 * this input, not of every reason.
 */
export const OperatorNoteSchema = z.string().trim().min(1).max(2000);

/** What any shelter-scoped procedure can raise just by being called. */
const shelterScopedErrors = {
  UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
  FORBIDDEN: apiErrors.FORBIDDEN,
} as const;

/** Shelter writes that compare-and-set on `version`. */
const shelterCasErrors = { ...shelterScopedErrors, CONFLICT: apiErrors.CONFLICT } as const;

const registryErrors = {
  UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
  FORBIDDEN: apiErrors.FORBIDDEN,
  NOT_FOUND: apiErrors.NOT_FOUND,
} as const;

const empty = z.object({});
const expectedVersion = z.int().nonnegative();
const animalRef = z.object({ animalId: AnimalIdSchema });
const humanName = z.string().trim().min(1);

// ─── shelter.profile ────────────────────────────────────────────────────────

const shelterProfileRead = kabinet.$meta(shelterRead).output(KabinetShelterViewSchema);
const shelterProfileWrite = kabinet.$meta(shelterWrite).output(KabinetShelterViewSchema);

export const shelterProfileContract = {
  get: shelterProfileRead.input(empty).errors(shelterScopedErrors),
  updateContact: shelterProfileWrite
    .input(z.object({ contact: ShelterContactSchema, expectedVersion }))
    .errors(shelterCasErrors),
  updateFreshnessSentence: shelterProfileWrite
    .input(z.object({ freshnessSentence: FreshnessSentenceSchema, expectedVersion }))
    .errors(shelterCasErrors),
  /** The provider is derived from the URL on the server (`donationProviderOf`), never sent. */
  proposeDonation: shelterProfileWrite
    .input(DonationLinkSchema.pick({ url: true }))
    .errors(shelterScopedErrors),
  cancelDonationProposal: shelterProfileWrite.input(empty).errors(shelterScopedErrors),
  pause: shelterProfileWrite
    .input(z.object({ reason: PauseReasonSchema }))
    .errors({ ...shelterScopedErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION }),
  resume: shelterProfileWrite
    .input(empty)
    .errors({ ...shelterScopedErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION }),
};

export const shelterVerificationContract = {
  /** Resubmits the evidence already on file (H2-2); a shelter never uploads evidence itself. */
  requestReview: shelterProfileWrite
    .input(empty)
    .errors({ ...shelterScopedErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION }),
};

// ─── shelter.animals ────────────────────────────────────────────────────────

/**
 * What K3 can change. Medical facts arrive as a bare state; the server builds
 * the shelter-declared attestation and refuses to overwrite a registry one.
 * `documentReadiness` is in no kabinet input (proposal §1.7). Photos get their
 * own procedures with the upload slice; a foster location waits for a write
 * path through `animalPublicLocationOf`.
 */
export const AnimalPatchSchema = z
  .object({
    name: humanName,
    species: AnimalSpeciesSchema,
    sex: AnimalSexSchema,
    size: SizeBucketSchema,
    age: AgeEstimateSchema,
    description: LocalizedTextSchema,
    vaccination: MedicalDeclarationInputSchema,
    spayNeuter: MedicalDeclarationInputSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Empty patch" });

/**
 * A listing move a shelter asks for, without its instant: the server stamps
 * `at`, so a client clock can't reorder a listing's history. `confirm` and
 * `undo_confirm` have their own procedures because they carry the undo window.
 */
export const KabinetListingEventInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("publish") }),
  z.object({ type: z.literal("reserve") }),
  z.object({ type: z.literal("release") }),
  z.object({ type: z.literal("adopt") }),
  z.object({ type: z.literal("withdraw"), reason: WithdrawalReasonSchema }),
  z.object({ type: z.literal("restore_to_draft") }),
]);

const animalRead = kabinet.$meta(shelterRead).output(KabinetAnimalViewSchema);
const animalWrite = kabinet.$meta(shelterWrite).output(KabinetAnimalViewSchema);
const animalMoveErrors = {
  ...shelterScopedErrors,
  NOT_FOUND: apiErrors.NOT_FOUND,
  ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION,
} as const;

export const shelterAnimalsContract = {
  list: kabinet
    .$meta(shelterRead)
    .input(
      z.object({
        listing: ListingKindSchema.nullable(),
        cursor: KabinetCursorSchema.nullable(),
        limit: kabinetPageSizeSchema,
      }),
    )
    .output(
      z.object({
        items: z.array(KabinetAnimalRowViewSchema).readonly(),
        nextCursor: KabinetCursorSchema.nullable(),
        counts: countsBy(LISTING_KINDS),
        staleCount: z.int().nonnegative(),
      }),
    )
    .errors({ ...shelterScopedErrors, INVALID_CURSOR: apiErrors.INVALID_CURSOR }),
  byId: animalRead
    .input(animalRef)
    .errors({ ...shelterScopedErrors, NOT_FOUND: apiErrors.NOT_FOUND }),
  createDraft: animalWrite
    .input(
      z.object({
        name: humanName,
        species: AnimalSpeciesSchema,
        sex: AnimalSexSchema,
        size: SizeBucketSchema,
        age: AgeEstimateSchema,
        description: LocalizedTextSchema,
      }),
    )
    .errors(shelterScopedErrors),
  /** Bumps `lastUpdatedAt` only, never `confirmedAt` (commitment #7). */
  update: animalWrite
    .input(
      z.object({
        animalId: AnimalIdSchema,
        expectedLastUpdatedAt: z.date(),
        patch: AnimalPatchSchema,
      }),
    )
    .errors({ ...shelterCasErrors, NOT_FOUND: apiErrors.NOT_FOUND }),
  transition: animalWrite
    .input(z.object({ animalId: AnimalIdSchema, event: KabinetListingEventInputSchema }))
    .errors({
      ...animalMoveErrors,
      PUBLISH_REQUIREMENTS_UNMET: apiErrors.PUBLISH_REQUIREMENTS_UNMET,
    }),
  /** «Ще шукає»: one animal per call, never bulk (commitment #7). */
  confirm: kabinet
    .$meta(shelterWrite)
    .input(animalRef)
    .output(z.object({ animal: KabinetAnimalViewSchema, undoUntil: z.date() }))
    .errors(animalMoveErrors),
  undoConfirm: animalWrite
    .input(animalRef)
    .errors({ ...animalMoveErrors, UNDO_EXPIRED: apiErrors.UNDO_EXPIRED }),
  deleteDraft: kabinet.$meta(shelterWrite).input(animalRef).output(empty).errors(animalMoveErrors),
};

// ─── registry (operator only) ───────────────────────────────────────────────

const shelterRef = z.object({ shelterId: ShelterIdSchema });
const registryShelter = kabinet.$meta(registry).output(RegistryShelterViewSchema);
const verificationMove = registryShelter
  .input(shelterRef)
  .errors({ ...registryErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION });

export const registrySheltersContract = {
  list: kabinet
    .$meta(registry)
    .input(
      z.object({
        search: z.string().trim().min(1).max(200).nullable(),
        status: VerificationStatusSchema.nullable(),
        cursor: KabinetCursorSchema.nullable(),
        limit: kabinetPageSizeSchema,
      }),
    )
    .output(
      z.object({
        items: z.array(RegistryShelterRowViewSchema).readonly(),
        nextCursor: KabinetCursorSchema.nullable(),
        counts: countsBy(VERIFICATION_STATUSES),
      }),
    )
    .errors({
      UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
      FORBIDDEN: apiErrors.FORBIDDEN,
      INVALID_CURSOR: apiErrors.INVALID_CURSOR,
    }),
  byId: registryShelter.input(shelterRef).errors(registryErrors),
  /** S2 collects S4's sections in one form (H2-1); the shelter starts `pending`. */
  create: registryShelter
    .input(
      z.object({
        displayName: humanName,
        description: LocalizedTextSchema,
        legalEntity: ShelterLegalEntitySchema,
        exactAddress: ExactAddressSchema,
        contact: ShelterContactSchema,
        freshnessSentence: FreshnessSentenceSchema,
        evidence: z.array(EvidenceItemInputSchema).readonly(),
        firstAdmin: z.object({ name: humanName, email: z.email() }),
      }),
    )
    .errors({
      UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
      FORBIDDEN: apiErrors.FORBIDDEN,
      INVALID_EVIDENCE: apiErrors.INVALID_EVIDENCE,
    }),
  /** The locked fields: legal entity or premises address, one per call, each audited. */
  updateVerifiedData: registryShelter
    .input(
      z.object({
        shelterId: ShelterIdSchema,
        expectedVersion,
        change: z.discriminatedUnion("field", [
          z.object({ field: z.literal("legal_entity"), next: ShelterLegalEntitySchema }),
          z.object({ field: z.literal("exact_address"), next: ExactAddressSchema }),
        ]),
      }),
    )
    .errors({ ...registryErrors, CONFLICT: apiErrors.CONFLICT }),
  updateProfile: registryShelter
    .input(
      z
        .object({
          shelterId: ShelterIdSchema,
          expectedVersion,
          contact: ShelterContactSchema.optional(),
          description: LocalizedTextSchema.optional(),
          freshnessSentence: FreshnessSentenceSchema.optional(),
        })
        .refine(
          (input) =>
            input.contact !== undefined ||
            input.description !== undefined ||
            input.freshnessSentence !== undefined,
          { message: "Nothing to update" },
        ),
    )
    .errors({ ...registryErrors, CONFLICT: apiErrors.CONFLICT }),
};

export const registryVerificationContract = {
  startReview: verificationMove,
  approve: registryShelter.input(shelterRef).errors({
    ...registryErrors,
    ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION,
    EVIDENCE_INSUFFICIENT: apiErrors.EVIDENCE_INSUFFICIENT,
  }),
  reinstate: verificationMove,
  /** The note is required here (H2-4) and shown to the shelter verbatim (K5). */
  reject: registryShelter
    .input(
      z.object({
        shelterId: ShelterIdSchema,
        reason: z.object({ code: RejectionCodeSchema, note: OperatorNoteSchema }),
      }),
    )
    .errors({ ...registryErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION }),
  suspend: registryShelter
    .input(
      z.object({
        shelterId: ShelterIdSchema,
        reason: z.object({ code: SuspensionCodeSchema, note: OperatorNoteSchema }),
      }),
    )
    .errors({ ...registryErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION }),
  resubmit: registryShelter
    .input(
      z.object({
        shelterId: ShelterIdSchema,
        evidence: z.array(EvidenceItemInputSchema).readonly(),
      }),
    )
    .errors({
      ...registryErrors,
      ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION,
      INVALID_EVIDENCE: apiErrors.INVALID_EVIDENCE,
    }),
};

export const registryDonationContract = {
  approve: registryShelter.input(shelterRef).errors(registryErrors),
  reject: registryShelter.input(shelterRef).errors(registryErrors),
};

const adminRef = z.object({ shelterId: ShelterIdSchema, adminId: ShelterAdminIdSchema });

export const registryAdminsContract = {
  invite: kabinet
    .$meta(registry)
    .input(z.object({ shelterId: ShelterIdSchema, name: humanName, email: z.email() }))
    .output(ShelterAdminViewSchema)
    .errors(registryErrors),
  resendInvite: kabinet.$meta(registry).input(adminRef).output(empty).errors(registryErrors),
  remove: kabinet.$meta(registry).input(adminRef).output(empty).errors(registryErrors),
};

export const registryHistoryContract = {
  list: kabinet
    .$meta(registry)
    .input(
      z.object({
        shelterId: ShelterIdSchema,
        cursor: KabinetCursorSchema.nullable(),
        limit: kabinetPageSizeSchema,
      }),
    )
    .output(
      z.object({
        items: z.array(HistoryEntryViewSchema).readonly(),
        nextCursor: KabinetCursorSchema.nullable(),
      }),
    )
    .errors({ ...registryErrors, INVALID_CURSOR: apiErrors.INVALID_CURSOR }),
};

export const registrySupportContract = {
  /** A read-only view of one shelter's kabinet; every write inside it is FORBIDDEN. */
  enter: kabinet.$meta(registry).input(shelterRef).output(empty).errors(registryErrors),
};

export const kabinetSessionContract = {
  exitSupport: kabinet
    .$meta(supportExit)
    .input(empty)
    .output(empty)
    .errors({ UNAUTHENTICATED: apiErrors.UNAUTHENTICATED, FORBIDDEN: apiErrors.FORBIDDEN }),
};
