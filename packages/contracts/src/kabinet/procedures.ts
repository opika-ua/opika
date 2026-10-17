import {
  AgeEstimateSchema,
  AnimalIdSchema,
  AnimalNameInputSchema,
  AnimalSexSchema,
  AnimalSpeciesSchema,
  animalDescriptionProblem,
  animalDescriptionProblemMessage,
  characterCount,
  DonationLinkSchema,
  EvidenceItemInputSchema,
  ExactAddressSchema,
  type FreshnessSentence,
  freshnessSentenceProblemMessage,
  LISTING_KINDS,
  LocalizedTextSchema,
  MAX_ANIMAL_PHOTOS,
  MedicalDeclarationInputSchema,
  normalizeFreshnessSentenceText,
  PauseCodeSchema,
  type PauseReason,
  RejectionCodeSchema,
  ShelterAdminIdSchema,
  ShelterContactSchema,
  ShelterIdSchema,
  ShelterLegalEntitySchema,
  SizeBucketSchema,
  SuspensionCodeSchema,
  TextProvenanceSchema,
  VERIFICATION_STATUSES,
  VerificationStatusSchema,
  WithdrawalReasonSchema,
} from "@opika/domain";
import { z } from "zod";
import { apiErrors } from "../errors";
import { MAX_PAGE_SIZE } from "../procedures/pagination";
import { kabinet, registry, shelterRead, shelterWrite, supportExit } from "./access";
import {
  BlockedAddressesViewSchema,
  CreatedShelterViewSchema,
  EmailSendOutcomeSchema,
  HistoryEntryViewSchema,
  InvitationReminderSchema,
  InvitedAdminViewSchema,
  KabinetAnimalRowViewSchema,
  KabinetAnimalViewSchema,
  KabinetShelterViewSchema,
  RegistryShelterRowViewSchema,
  RegistryShelterViewSchema,
  ShelterHistoryItemViewSchema,
} from "./views";

/**
 * Every input object here is strict (HS-T5, Oleksii): an unknown key is
 * BAD_REQUEST, not silently stripped. So a `shelterId` smuggled into a
 * `shelter.*` call is refused outright rather than ignored, and a client
 * can't send a field it believes does something that the server then drops.
 *
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

/**
 * The pause note's cap (inbox K4-T15, Oleksii, 2026-10-17: "Your decisions
 * (pause note length cap; re-read after a lost save response): fine."), the
 * same 2,000 as the operator's note, counted in characters as a reader sees
 * them (`characterCount`, as K-B2 asked of the sentence).
 */
export const PAUSE_NOTE_MAX_CHARACTERS = 2000;

/**
 * A shelter's pause reason as `shelter.profile.pause` accepts it: one of the
 * five codes, and a note trimmed, blank meaning none, at most 2,000
 * characters. The note is shown to the shelter's admins and the operator in
 * the kabinet (K4-B4, answer 2) and in no public view. Its output is the
 * stored `PauseReason`.
 */
export const PauseReasonInputSchema = z
  .strictObject({
    code: PauseCodeSchema,
    note: z
      .string()
      .trim()
      .refine((note) => characterCount(note) <= PAUSE_NOTE_MAX_CHARACTERS, {
        message: `Pause note is longer than ${PAUSE_NOTE_MAX_CHARACTERS} characters`,
      })
      .nullable(),
  })
  .transform(
    (reason): PauseReason => ({
      code: reason.code,
      note: reason.note === null || reason.note === "" ? null : reason.note,
    }),
  );

/** What any shelter-scoped procedure can raise just by being called. */
const shelterScopedErrors = {
  UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
  FORBIDDEN: apiErrors.FORBIDDEN,
} as const;

/** Shelter writes that compare-and-set on `version`. */
const shelterCasErrors = { ...shelterScopedErrors, CONFLICT: apiErrors.CONFLICT } as const;

/**
 * Every shelter write starts here, so each one declares the refusal it gets
 * while K2/K3 haven't shipped (`SHELTER_WRITES_NOT_YET_AVAILABLE`, inbox
 * KH-Q1) and a typed client can handle it. Declared on the builder rather
 * than per procedure, so a new write can't be added without it.
 */
const shelterWriteProcedure = kabinet.$meta(shelterWrite).errors({
  SHELTER_WRITES_NOT_YET_AVAILABLE: apiErrors.SHELTER_WRITES_NOT_YET_AVAILABLE,
});

const registryErrors = {
  UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
  FORBIDDEN: apiErrors.FORBIDDEN,
  NOT_FOUND: apiErrors.NOT_FOUND,
} as const;

const empty = z.strictObject({});
/** Outputs stay non-strict: stripping undeclared fields is what keeps a view a view. */
const emptyOutput = z.object({});
const expectedVersion = z.int().nonnegative();
const animalRef = z.strictObject({ animalId: AnimalIdSchema });
const humanName = z.string().trim().min(1);

/**
 * One language's freshness sentence, checked and normalised by the domain
 * rule (K-Q6), so the handler only ever receives `{імʼя}` in its canonical
 * spelling. Blank becomes null: the sentence is optional, and a shelter who
 * clears the field means "no sentence", which a refusal would only make them
 * retype as an explicit null.
 */
const freshnessSentenceText = z.string().transform((raw, ctx): string | null => {
  const normalized = normalizeFreshnessSentenceText(raw);
  switch (normalized.kind) {
    case "ok":
      return normalized.text;
    case "empty":
      return null;
    case "invalid":
      ctx.addIssue({
        code: "custom",
        message: freshnessSentenceProblemMessage(normalized.problem),
      });
      return z.NEVER;
  }
});

/**
 * What a write accepts for `freshnessSentence`; its output is the stored
 * `FreshnessSentenceSchema` shape, which stays as it was. A blank English text
 * drops the translation; a blank Ukrainian one clears the sentence, unless an
 * English text was sent with it, which is refused rather than silently thrown
 * away (English is never stored without the Ukrainian it translates).
 */
export const FreshnessSentenceInputSchema = z
  .object({
    uk: freshnessSentenceText,
    en: z.object({ text: freshnessSentenceText, provenance: TextProvenanceSchema }).nullable(),
  })
  .nullable()
  .transform((input, ctx): FreshnessSentence => {
    if (input === null) return null;
    const en =
      input.en === null || input.en.text === null
        ? null
        : { text: input.en.text, provenance: input.en.provenance };
    if (input.uk !== null) return { uk: input.uk, en };
    if (en === null) return null;
    ctx.addIssue({
      code: "custom",
      path: ["uk"],
      message: "An English freshness sentence needs the Ukrainian it translates",
    });
    return z.NEVER;
  });

/** K3's cap (`ANIMAL_DESCRIPTION_MAX_CHARACTERS`, in domain so onboarding shares it). */
const withinDescriptionLimit = (
  text: string,
  path: readonly PropertyKey[],
  ctx: z.RefinementCtx,
) => {
  const problem = animalDescriptionProblem(text);
  if (problem !== null) {
    ctx.addIssue({
      code: "custom",
      path: [...path],
      message: animalDescriptionProblemMessage(problem),
    });
  }
};

const AnimalDescriptionInputSchema = LocalizedTextSchema.superRefine((description, ctx) => {
  withinDescriptionLimit(description.uk, ["uk"], ctx);
  if (description.en !== null) withinDescriptionLimit(description.en.text, ["en", "text"], ctx);
});

// ─── shelter.profile ────────────────────────────────────────────────────────

const shelterProfileRead = kabinet.$meta(shelterRead).output(KabinetShelterViewSchema);
const shelterProfileWrite = shelterWriteProcedure.output(KabinetShelterViewSchema);

export const shelterProfileContract = {
  get: shelterProfileRead.input(empty).errors(shelterScopedErrors),
  updateContact: shelterProfileWrite
    .input(z.strictObject({ contact: ShelterContactSchema, expectedVersion }))
    .errors(shelterCasErrors),
  updateFreshnessSentence: shelterProfileWrite
    .input(z.strictObject({ freshnessSentence: FreshnessSentenceInputSchema, expectedVersion }))
    .errors(shelterCasErrors),
  /** The provider is derived from the URL on the server (`donationProviderOf`), never sent. */
  proposeDonation: shelterProfileWrite
    .input(DonationLinkSchema.pick({ url: true }).strict())
    .errors(shelterScopedErrors),
  cancelDonationProposal: shelterProfileWrite.input(empty).errors(shelterScopedErrors),
  pause: shelterProfileWrite
    .input(z.strictObject({ reason: PauseReasonInputSchema }))
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

// ─── shelter.history ────────────────────────────────────────────────────────

/**
 * The shelter's own history (RG-Q8), newest first. Side-effect-free (RS-Q1):
 * expired-invitation clean-up never runs on this read.
 */
export const shelterHistoryContract = {
  list: kabinet
    .$meta(shelterRead)
    .input(z.strictObject({ cursor: KabinetCursorSchema.nullable(), limit: kabinetPageSizeSchema }))
    .output(
      z.object({
        items: z.array(ShelterHistoryItemViewSchema).readonly(),
        nextCursor: KabinetCursorSchema.nullable(),
      }),
    )
    .errors({ ...shelterScopedErrors, INVALID_CURSOR: apiErrors.INVALID_CURSOR }),
};

// ─── shelter.animals ────────────────────────────────────────────────────────

/**
 * What K3 can change. Medical facts arrive as a bare state; the server builds
 * the shelter-declared attestation and refuses to overwrite a registry one.
 * `documentReadiness` is in no kabinet input (proposal §1.7). Photos have
 * their own procedures (`shelter.photos.*`, below); a foster location waits
 * for a write path through `animalPublicLocationOf`.
 */
export const AnimalPatchSchema = z
  .strictObject({
    name: AnimalNameInputSchema,
    species: AnimalSpeciesSchema,
    sex: AnimalSexSchema,
    size: SizeBucketSchema,
    age: AgeEstimateSchema,
    description: AnimalDescriptionInputSchema,
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
  z.strictObject({ type: z.literal("publish") }),
  z.strictObject({ type: z.literal("reserve") }),
  z.strictObject({ type: z.literal("release") }),
  z.strictObject({ type: z.literal("adopt") }),
  z.strictObject({ type: z.literal("withdraw"), reason: WithdrawalReasonSchema }),
  z.strictObject({ type: z.literal("restore_to_draft") }),
]);

const animalRead = kabinet.$meta(shelterRead).output(KabinetAnimalViewSchema);
const animalWrite = shelterWriteProcedure.output(KabinetAnimalViewSchema);
const animalMoveErrors = {
  ...shelterScopedErrors,
  NOT_FOUND: apiErrors.NOT_FOUND,
  ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION,
} as const;

export const shelterAnimalsContract = {
  list: kabinet
    .$meta(shelterRead)
    .input(
      z.strictObject({
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
      z.strictObject({
        name: AnimalNameInputSchema,
        species: AnimalSpeciesSchema,
        sex: AnimalSexSchema,
        size: SizeBucketSchema,
        age: AgeEstimateSchema,
        description: AnimalDescriptionInputSchema,
      }),
    )
    .errors(shelterScopedErrors),
  /** Compare-and-set on `version` (S3-T6); bumps `lastUpdatedAt` and `version`, never `confirmedAt` (commitment #7). */
  update: animalWrite
    .input(
      z.strictObject({
        animalId: AnimalIdSchema,
        expectedVersion: z.int().nonnegative(),
        patch: AnimalPatchSchema,
      }),
    )
    .errors({
      ...shelterCasErrors,
      NOT_FOUND: apiErrors.NOT_FOUND,
      REGISTRY_CONFIRMED: apiErrors.REGISTRY_CONFIRMED,
    }),
  transition: animalWrite
    .input(z.strictObject({ animalId: AnimalIdSchema, event: KabinetListingEventInputSchema }))
    .errors({
      ...animalMoveErrors,
      PUBLISH_REQUIREMENTS_UNMET: apiErrors.PUBLISH_REQUIREMENTS_UNMET,
    }),
  /** «Ще шукає»: one animal per call, never bulk (commitment #7). */
  confirm: shelterWriteProcedure
    .input(animalRef)
    .output(z.object({ animal: KabinetAnimalViewSchema, undoUntil: z.date() }))
    .errors(animalMoveErrors),
  undoConfirm: animalWrite
    .input(animalRef)
    .errors({ ...animalMoveErrors, UNDO_EXPIRED: apiErrors.UNDO_EXPIRED }),
  /** Only a never-published draft (HS-Q9); anything once public is withdrawn instead. */
  deleteDraft: shelterWriteProcedure
    .input(animalRef)
    .output(emptyOutput)
    .errors({ ...animalMoveErrors, WAS_PUBLISHED: apiErrors.WAS_PUBLISHED }),
};

// ─── shelter.photos ─────────────────────────────────────────────────────────

/**
 * The largest request `/api/kabinet/*` reads, an upload included (P-Q7): 4 MiB.
 * The route refuses a larger declared `Content-Length` with 413 before any
 * session is looked up, and stops reading a body without one (chunked) at the
 * same point; oRPC's `BodyLimitPlugin` holds the same line inside the handler.
 * It sits below Next's proxy buffer (`proxyClientMaxBodySize`, 10 MB by
 * default, which truncates rather than refuses), so the proxy never hands the
 * route a cut-off body that would pass, and below the 4.5 MB request limit
 * Vercel documented for Functions (whether Hobby now allows more is on the
 * production probe list, K-T2). A device-compressed 2000 px JPEG is far
 * smaller; the ceiling exists for the request that skipped compression.
 */
export const KABINET_MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * The file itself: the body ceiling less headroom for the multipart framing
 * and the JSON part around the file, so a file this size always fits.
 */
export const PHOTO_UPLOAD_MAX_FILE_BYTES = KABINET_MAX_BODY_BYTES - 64 * 1024;

const photoStorageKey = z.string().min(1).max(200);

/** A photo list as the kabinet last read it: its storage keys, in order, no repeats. */
const photoKeyList = z
  .array(photoStorageKey)
  .min(1)
  .max(MAX_ANIMAL_PHOTOS)
  .readonly()
  .refine((keys) => new Set(keys).size === keys.length, { message: "Repeated photo key" });

const sameKeys = (a: readonly string[], b: readonly string[]) => {
  const sortedB = [...b].sort();
  return a.length === b.length && [...a].sort().every((key, i) => key === sortedB[i]);
};

/**
 * Photos have their own procedures (P-Q1..P-Q3), outside `update`'s patch:
 * an upload is a file, not a form field, and reorder and remove compare-and-set
 * on the photo list the screen shows (`expectedPhotoKeys`, P-Q3) rather than
 * on `version`, so a K3 form open in another tab neither blocks nor is blocked
 * by them. Each records `animal_edited` with `fields: ["photos"]` and moves
 * `lastUpdatedAt`, never `confirmedAt` (commitment #7). The cover is
 * `photos[0]`: "make cover" is a reorder (P-Q9).
 */
export const shelterPhotosContract = {
  /**
   * One step (P-Q2): checked by its bytes, re-encoded without any metadata,
   * stored under a fresh random key, appended. Charged to the shelter's upload
   * limits before the file is read (P-Q12).
   */
  add: animalWrite
    .input(
      z.strictObject({
        animalId: AnimalIdSchema,
        file: z.file().max(PHOTO_UPLOAD_MAX_FILE_BYTES),
      }),
    )
    .errors({
      ...shelterScopedErrors,
      NOT_FOUND: apiErrors.NOT_FOUND,
      RATE_LIMITED: apiErrors.RATE_LIMITED,
      PHOTO_UPLOADS_UNAVAILABLE: apiErrors.PHOTO_UPLOADS_UNAVAILABLE,
      PHOTO_REJECTED: apiErrors.PHOTO_REJECTED,
      PHOTO_LIMIT_REACHED: apiErrors.PHOTO_LIMIT_REACHED,
    }),
  /** A new order of exactly the photos the screen shows; anything else changed meanwhile is CONFLICT. */
  reorder: animalWrite
    .input(
      z
        .strictObject({
          animalId: AnimalIdSchema,
          expectedPhotoKeys: photoKeyList,
          nextPhotoKeys: photoKeyList,
        })
        .refine((input) => sameKeys(input.expectedPhotoKeys, input.nextPhotoKeys), {
          message: "A reorder names exactly the photos it read",
          path: ["nextPhotoKeys"],
        }),
    )
    .errors({ ...shelterCasErrors, NOT_FOUND: apiErrors.NOT_FOUND }),
  /**
   * Takes the photo off the animal. The stored files stay where they are
   * (no code path deletes an object, K-Q2); a takedown is a manual step
   * (P-Q14, `docs/onboarding-a-shelter.md`).
   */
  remove: animalWrite
    .input(
      z
        .strictObject({
          animalId: AnimalIdSchema,
          expectedPhotoKeys: photoKeyList,
          storageKey: photoStorageKey,
        })
        .refine((input) => input.expectedPhotoKeys.includes(input.storageKey), {
          message: "The photo to remove must be one the screen shows",
          path: ["storageKey"],
        }),
    )
    .errors({
      ...shelterCasErrors,
      NOT_FOUND: apiErrors.NOT_FOUND,
      PHOTOS_REQUIRED_WHILE_VISIBLE: apiErrors.PHOTOS_REQUIRED_WHILE_VISIBLE,
    }),
};

// ─── registry (operator only) ───────────────────────────────────────────────

const shelterRef = z.strictObject({ shelterId: ShelterIdSchema });
const registryShelter = kabinet.$meta(registry).output(RegistryShelterViewSchema);
const verificationMove = registryShelter
  .input(shelterRef)
  .errors({ ...registryErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION });

export const registrySheltersContract = {
  list: kabinet
    .$meta(registry)
    .input(
      z.strictObject({
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
  /**
   * S2 collects S4's sections in one form (H2-1); the shelter starts
   * `pending`. The output adds what became of the first admin's invitation
   * email, so S2 can show it (IN-E7).
   */
  create: kabinet
    .$meta(registry)
    .output(CreatedShelterViewSchema)
    .input(
      z.strictObject({
        displayName: humanName,
        description: LocalizedTextSchema,
        legalEntity: ShelterLegalEntitySchema,
        exactAddress: ExactAddressSchema,
        contact: ShelterContactSchema,
        freshnessSentence: FreshnessSentenceInputSchema,
        evidence: z.array(EvidenceItemInputSchema).readonly(),
        firstAdmin: z.strictObject({ name: humanName, email: z.email() }),
      }),
    )
    .errors({
      UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
      FORBIDDEN: apiErrors.FORBIDDEN,
      INVALID_EVIDENCE: apiErrors.INVALID_EVIDENCE,
      // Its first admin may already have a role: a shelter, an operator grant, or a live invitation elsewhere (RG-T10).
      ADDRESS_HAS_A_ROLE: apiErrors.ADDRESS_HAS_A_ROLE,
    }),
  /** The locked fields: legal entity or premises address, one per call, each audited. */
  updateVerifiedData: registryShelter
    .input(
      z.strictObject({
        shelterId: ShelterIdSchema,
        expectedVersion,
        change: z.discriminatedUnion("field", [
          z.strictObject({ field: z.literal("legal_entity"), next: ShelterLegalEntitySchema }),
          z.strictObject({ field: z.literal("exact_address"), next: ExactAddressSchema }),
        ]),
      }),
    )
    .errors({ ...registryErrors, CONFLICT: apiErrors.CONFLICT }),
  updateProfile: registryShelter
    .input(
      z
        .strictObject({
          shelterId: ShelterIdSchema,
          expectedVersion,
          contact: ShelterContactSchema.optional(),
          description: LocalizedTextSchema.optional(),
          freshnessSentence: FreshnessSentenceInputSchema.optional(),
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
      z.strictObject({
        shelterId: ShelterIdSchema,
        reason: z.strictObject({ code: RejectionCodeSchema, note: OperatorNoteSchema }),
      }),
    )
    .errors({ ...registryErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION }),
  suspend: registryShelter
    .input(
      z.strictObject({
        shelterId: ShelterIdSchema,
        reason: z.strictObject({ code: SuspensionCodeSchema, note: OperatorNoteSchema }),
      }),
    )
    .errors({ ...registryErrors, ILLEGAL_TRANSITION: apiErrors.ILLEGAL_TRANSITION }),
  resubmit: registryShelter
    .input(
      z.strictObject({
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

/**
 * The operator decides on the proposal they read (RG-Q12, Oleksii): the
 * version they read travels with the decision, and anything newer (a
 * re-proposal, a cancellation, any other write) is CONFLICT, the same rule
 * every S4 form follows.
 */
const donationDecision = z.strictObject({ shelterId: ShelterIdSchema, expectedVersion });

export const registryDonationContract = {
  approve: registryShelter
    .input(donationDecision)
    .errors({ ...registryErrors, CONFLICT: apiErrors.CONFLICT }),
  reject: registryShelter
    .input(donationDecision)
    .errors({ ...registryErrors, CONFLICT: apiErrors.CONFLICT }),
};

const adminRef = z.strictObject({ shelterId: ShelterIdSchema, adminId: ShelterAdminIdSchema });

export const registryAdminsContract = {
  invite: kabinet
    .$meta(registry)
    .input(z.strictObject({ shelterId: ShelterIdSchema, name: humanName, email: z.email() }))
    // The admin plus this call's email outcome, which S4 shows directly (IN-E7).
    .output(InvitedAdminViewSchema)
    .errors({ ...registryErrors, ADDRESS_HAS_A_ROLE: apiErrors.ADDRESS_HAS_A_ROLE }),
  /**
   * A resend can revive an expired invitation, so it is checked like a new
   * one (review of ee847a2, finding 1): an address that meanwhile holds a
   * role elsewhere is refused, never handed a second live invitation.
   */
  resendInvite: kabinet
    .$meta(registry)
    .input(adminRef)
    .output(
      z.object({
        invitationEmail: EmailSendOutcomeSchema,
        invitationReminder: InvitationReminderSchema,
      }),
    )
    .errors({ ...registryErrors, ADDRESS_HAS_A_ROLE: apiErrors.ADDRESS_HAS_A_ROLE }),
  remove: kabinet.$meta(registry).input(adminRef).output(emptyOutput).errors(registryErrors),
  /**
   * Which of the shelter's admin and invited addresses the email provider
   * has blocked (Oleksii, 2026-10-14, answer 4), read when S4 loads. A read:
   * it changes nothing, and unblocking stays manual in the provider (IN-E7).
   */
  blockedAddresses: kabinet
    .$meta(registry)
    .input(shelterRef)
    .output(BlockedAddressesViewSchema)
    .errors(registryErrors),
};

export const registryHistoryContract = {
  list: kabinet
    .$meta(registry)
    .input(
      z.strictObject({
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
  enter: kabinet.$meta(registry).input(shelterRef).output(emptyOutput).errors(registryErrors),
};

export const kabinetSessionContract = {
  exitSupport: kabinet
    .$meta(supportExit)
    .input(empty)
    .output(emptyOutput)
    .errors({ UNAUTHENTICATED: apiErrors.UNAUTHENTICATED, FORBIDDEN: apiErrors.FORBIDDEN }),
};
