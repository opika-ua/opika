import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type AnimalId,
  AnimalIdSchema,
  type AnimalListingState,
  AnimalNameInputSchema,
  type AnimalPhoto,
  AnimalSexSchema,
  AnimalSpeciesSchema,
  animalDescriptionProblem,
  animalDescriptionProblemMessage,
  CONTACT_INPUT_MAX_LENGTH,
  type Coordinates,
  DEFAULT_VERIFICATION_POLICY,
  DonationLinkSchema,
  EvidenceItemInputSchema,
  ExactAddressSchema,
  everServedAtAfter,
  FRAME_UNITS,
  frameBoxOf,
  frameOfUnits,
  type ListedAnimal,
  MAX_ADDITIONAL_CHANNELS,
  MAX_ANIMAL_PHOTOS,
  type ModeratorId,
  ModeratorIdSchema,
  meetsEvidenceRequirements,
  PhotoFrameSchema,
  type PhotoFraming,
  publicLocationOf,
  type Shelter,
  ShelterContactInputSchema,
  ShelterIdSchema,
  ShelterLegalEntitySchema,
  type ShelterVerification,
  SizeBucketSchema,
  toVerificationEvidence,
  UNKNOWN_ATTESTATION,
  UNKNOWN_DOCUMENT_READINESS,
} from "@opika/domain";
import postgres from "postgres";
import { z } from "zod";
import { createDatabaseWithClient, type Database } from "./client";
import {
  createR2Client,
  type ImageStorageClient,
  photoSourceSizeOf,
  resolveLocalPhotoPath,
  uploadAnimalPhoto,
  validateLocalPhoto,
} from "./image-pipeline/server";
import { productionLocationPolicy } from "./location-policy";
import { assertProductionWriteAllowed } from "./prod-guard";
import { animalRepo, cityRepo, type PhotoSource, photoSourcesRepo, shelterRepo } from "./repos";
import type { CurrentCityResolution } from "./repos/city-repo";
import { insertShelterFromScript, recordAnimalsImported, type ScriptActor } from "./script-history";

/**
 * Onboards ONE real shelter and its animals - the only path in this repo that
 * may ever write a real, non-fictional `publicLocation`.
 *
 * Deliberately separate from `seed.ts`, not a mode flag on it: a shared file
 * where a flag chooses between "append real data" and "truncate everything
 * and reseed fiction" is a failure mode reachable by typo, on exactly the
 * evening someone is least careful. This script imports nothing from
 * seed.ts and has no truncation code path at all - it can only insert.
 *
 * Always uses `productionLocationPolicy` - there is no test-only fallback
 * reachable from this file, not gated on `NODE_ENV`. `LOCATION_HMAC_SECRET`
 * is read directly and the process exits if it's missing or too short
 * (`productionLocationPolicy`'s own check).
 *
 * Usage:
 *   LOCATION_HMAC_SECRET=... DATABASE_URL=<neon-direct-url> \
 *     pnpm --filter @opika/db run onboard:shelter -- /path/to/shelter.json --prod
 *   (`--prod` is required when the target is production: see `./prod-guard.ts`.)
 *
 *   (add --commit once the dry-run output looks right)
 *
 * See docs/onboarding-a-shelter.md for the input format and the full
 * dry-run-then-commit walkthrough.
 */

/**
 * Both sides of the "is this file inside the repo?" comparison go through
 * this, so the two are compared in the same normal form.
 *
 * `resolve()` alone is not enough, and neither gap is theoretical on the one
 * platform this script is actually run from (`CLAUDE.md`'s "Windows
 * development notes"):
 * - Windows paths are case-insensitive, so `d:\startup\opika\shelter.json`
 *   names a file inside the repo while failing a case-sensitive `startsWith`
 *   against `D:\Startup\opika` - the guard would wave through exactly the
 *   file it exists to refuse.
 * - A symlink outside the tree can point at a file inside it, and only
 *   `realpathSync` sees through that. What would get committed is the real
 *   file, not the link.
 *
 * `realpathSync` throws on a path that does not exist yet, which is a legal
 * input here (the missing-file message below is a better error than a raw
 * ENOENT), so the parent directory is resolved instead and the basename
 * re-joined.
 */
function canonicalPath(input: string): string {
  const resolved = resolve(input);
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    try {
      real = join(realpathSync(dirname(resolved)), basename(resolved));
    } catch {
      real = resolved;
    }
  }
  return process.platform === "win32" ? real.toLowerCase() : real;
}

const REPO_ROOT = canonicalPath(fileURLToPath(new URL("../../..", import.meta.url)));

/** Great-circle distance, for the dry-run printout's "is the offset actually inside the radius" check. */
function haversineMetres(a: Coordinates, b: Coordinates): number {
  const EARTH_RADIUS_METRES = 6_371_000;
  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}

/**
 * Deterministic, not random: re-running this script against the same input
 * file must produce the same shelter/animal ids, or a retry after a partial
 * failure would insert duplicates instead of finishing the job. `crypto.
 * randomUUID()` (used everywhere else ids are minted) is exactly wrong here.
 *
 * Not a real UUIDv5 (no external namespace UUID, no RFC 4122 library) -
 * just SHA-256 truncated to 16 bytes with the version/variant nibbles set so
 * the result passes `z.uuid()`. The seed's own uniqueness is what this
 * repo's ids need; the "5" is decoration for readability, not a claim of
 * standards conformance.
 */
export function deterministicId(seed: string): string {
  const hash = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The moderator identity recorded against every shelter this script
 * verifies - there is no real moderator login system yet, so this stands in
 * for "the founder personally vetted this" until one exists. Fixed and
 * deterministic, not `crypto.randomUUID()`, so every onboarded shelter's
 * verification record points at the same, recognisable id rather than a
 * fresh one no query can group by.
 */
const FOUNDER_MODERATOR_ID = ModeratorIdSchema.parse(
  deterministicId("moderator:founder-manual-vetting"),
) as ModeratorId;

/**
 * `localPath`, not `storageKey`/`width`/`height` - an operator has a folder
 * of real photo files next to their input JSON (`docs/onboarding-a-
 * shelter.md`'s documented convention: a `photos/` directory alongside the
 * input file), not R2 object keys or hand-measured pixel dimensions. Both
 * are computed by this script now: `resolveLocalPhotoPath` +
 * `validateLocalPhoto` read the real file for its real dimensions (H1 -
 * see `docs/h1-decisions.md`), and `uploadAnimalPhoto` stores it under a
 * fresh random key per photo (P-Q13), the scheme the kabinet's uploads use.
 */
const OnboardPhotoSchema = z.object({
  localPath: z.string().min(1),
  /**
   * The crop frame the operator chose (crop-frame Q1: kabinet crops, plus an optional frame when
   * the operator enters first cards, inside commitment #6), as a pixel box on the photo as an
   * image viewer shows it. Must be 4:5. Without it, the automatic crop, as before.
   */
  frame: z
    .strictObject({
      left: z.int().min(0),
      top: z.int().min(0),
      width: z.int().positive(),
      height: z.int().positive(),
    })
    .optional(),
});
type OnboardFrame = NonNullable<z.infer<typeof OnboardPhotoSchema>["frame"]>;

/**
 * An operator's pixel box as a stored frame, or why it is refused. The box's edges are taken to
 * 1/10 000 of the photo, so the frame lies inside it once stored, and `frameBoxOf` then judges it
 * on the kept source's size (a photo over 2000 px is stored scaled, and 400 px is that copy's).
 */
export function framingOfOnboardFrame(
  frame: OnboardFrame | undefined,
  displayed: { width: number; height: number },
): { kind: "ok"; framing: PhotoFraming } | { kind: "refused"; message: string } {
  if (frame === undefined) return { kind: "ok", framing: { kind: "attention" } };
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  if (right > displayed.width || bottom > displayed.height) {
    return {
      kind: "refused",
      message: `frame ${frame.left},${frame.top} ${frame.width}x${frame.height} reaches past the ${displayed.width}x${displayed.height} photo`,
    };
  }
  const unitsOf = (px: number, side: number) => Math.round((px / side) * FRAME_UNITS);
  const x = unitsOf(frame.left, displayed.width);
  const y = unitsOf(frame.top, displayed.height);
  const parsed = PhotoFrameSchema.safeParse(
    frameOfUnits({
      x,
      y,
      w: unitsOf(right, displayed.width) - x,
      h: unitsOf(bottom, displayed.height) - y,
    }),
  );
  if (!parsed.success) return { kind: "refused", message: "frame is too small to store" };
  const source = photoSourceSizeOf(displayed);
  const box = frameBoxOf(parsed.data, source);
  if (box.kind === "rejected") {
    const why = {
      aspect: "is not 4:5 (width = height x 0.8)",
      too_small: `is narrower than 400 px of the stored ${source.width}x${source.height} copy`,
      outside: "reaches past the photo",
    }[box.reason];
    return { kind: "refused", message: `frame ${why}` };
  }
  return { kind: "ok", framing: { kind: "frame", frame: parsed.data } };
}

/**
 * The shelter's text, with the cap every write path shares (the kabinet and the operator's forms
 * refuse a longer one too). Shown word for word under «Про притулок»; braces are plain text.
 */
const OnboardShelterDescriptionUkSchema = z
  .string()
  .min(1)
  .superRefine((text, ctx) => {
    const problem = animalDescriptionProblem(text);
    if (problem !== null) {
      ctx.addIssue({ code: "custom", message: animalDescriptionProblemMessage(problem) });
    }
  });

const OnboardAnimalSchema = z.object({
  idSeed: z.string().min(1),
  // The kabinet's rule: no braces in a name (K-Q6, kept since DR1-Q5; see `animalNameProblem`).
  name: AnimalNameInputSchema,
  species: AnimalSpeciesSchema,
  // Onboarding always publishes directly (no draft stage), so unlike the kabinet's
  // draft form, "unknown" is never an acceptable starting value here (SF-F1).
  sex: AnimalSexSchema.refine((s) => s !== "unknown", {
    message: "Onboarded animals must have a known sex (male or female), not unknown",
  }),
  size: SizeBucketSchema,
  ageBucket: z.enum(["baby", "young", "adult", "senior"]),
  // K3's cap: an onboarded description over it couldn't be saved again in K3.
  descriptionUk: z
    .string()
    .min(1)
    .superRefine((text, ctx) => {
      const problem = animalDescriptionProblem(text);
      if (problem !== null) {
        ctx.addIssue({ code: "custom", message: animalDescriptionProblemMessage(problem) });
      }
    }),
  // K-Q11: the cap every write path shares (`MAX_ANIMAL_PHOTOS`, domain).
  photos: z.array(OnboardPhotoSchema).min(1).max(MAX_ANIMAL_PHOTOS),
});

/**
 * Evidence input is `EvidenceItemInputSchema` from `@opika/domain`, shared with
 * the kabinet's S2 evidence step (decisions §4: one schema, two callers). This
 * script supplies the attribution itself - `FOUNDER_MODERATOR_ID` and `now` -
 * because no operator login reaches it.
 */
export const OnboardInputSchema = z.object({
  shelter: z.object({
    idSeed: z.string().min(1),
    displayName: z.string().min(1),
    descriptionUk: OnboardShelterDescriptionUkSchema,
    legalEntity: ShelterLegalEntitySchema,
    exactAddress: ExactAddressSchema,
    contact: ShelterContactInputSchema,
    donation: DonationLinkSchema.nullable(),
    /**
     * Gone: the shelter's own words are `descriptionUk` now. A non-strict object would drop this
     * key without a word, so a leftover one is refused by name instead.
     */
    freshnessSentenceUk: z
      .never({
        error:
          "freshnessSentenceUk is no longer accepted: put the text in descriptionUk (who they are, how often they update)",
      })
      .optional(),
    /**
     * What you actually have, not a name this script used to turn into a
     * fabricated `reference_contact` pointing at the shelter's own phone
     * number as if it were independent corroboration - caught on review,
     * not by construction the first time: an `unregistered_initiative`
     * needs a site visit plus two real references; a registered entity
     * needs its EDRPOU and bank-holder records. `buildShelter` below
     * refuses to produce a `verified` shelter (dry run or `--commit`) if
     * what's here doesn't clear `DEFAULT_VERIFICATION_POLICY` for the
     * `legalEntity.kind` given - see docs/onboarding-a-shelter.md for a
     * worked example per legal shape.
     */
    evidence: z.array(EvidenceItemInputSchema).min(1),
  }),
  animals: z.array(OnboardAnimalSchema).min(1),
});

type OnboardInput = z.infer<typeof OnboardInputSchema>;

/**
 * Zod's own line for a refine is just "Invalid input", so the contact rules the kabinet editor
 * shares (the same `ShelterContactInputSchema`) are said in words here, after its own report.
 */
function contactRefusalHints(error: z.ZodError): string[] {
  const hints = new Set<string>();
  for (const issue of error.issues) {
    const [root, field, part] = issue.path;
    if (root !== "shelter" || field !== "contact") continue;
    if (part === "primary" && issue.path.length === 3 && issue.code === "custom") {
      hints.add(
        "contact.primary cannot be an application form; give a phone, email, Telegram, Viber or WhatsApp, and put the form in additional.",
      );
    } else if (
      part === "additional" &&
      issue.path.length === 3 &&
      issue.code === "too_big" &&
      issue.origin === "array"
    ) {
      hints.add(`contact.additional holds at most ${MAX_ADDITIONAL_CHANNELS} channels.`);
    } else if (part === "additional" && issue.path.length === 3 && issue.code === "custom") {
      hints.add("contact.additional may hold at most one application form.");
    } else if (issue.code === "too_big" && issue.origin === "string") {
      hints.add(`a contact value is longer than ${CONTACT_INPUT_MAX_LENGTH} characters.`);
    }
  }
  return [...hints];
}

export type OnboardParse =
  | { kind: "ok"; input: OnboardInput }
  | { kind: "refused"; message: string };

/**
 * The first gate: the whole file against the schema, before anything is built, uploaded or
 * written. A refusal carries the message `main` prints.
 */
export function parseOnboardInput(raw: unknown): OnboardParse {
  const parsed = OnboardInputSchema.safeParse(raw);
  if (parsed.success) return { kind: "ok", input: parsed.data };
  return {
    kind: "refused",
    message: [
      "input file does not match the expected shape.",
      z.prettifyError(parsed.error),
      ...contactRefusalHints(parsed.error),
    ].join("\n"),
  };
}

const RETIRED_CITY_MESSAGE =
  "that settlement is retired (no longer in the current settlement register); a shelter cannot be onboarded there. Use its current settlement.";

export type CitySlugLookup = (slug: string) => Promise<CurrentCityResolution>;

/**
 * An input file may name the settlement by its slug (`exactAddress.citySlug`, the current or a
 * former one) instead of a `cityId` UUID: with ~30k settlements nobody can be asked to copy a
 * UUID, but the slug is in the URL of the city's page. Resolved to the id before the schema runs,
 * so everything after sees only `cityId`. Both given, or neither, or a slug nothing answers to, is
 * refused with a sentence saying which; the lookup is injected so this stays testable without a database.
 */
export async function withCityIdFromSlug(raw: unknown, lookup: CitySlugLookup): Promise<unknown> {
  const address = (raw as { shelter?: { exactAddress?: Record<string, unknown> } } | null)?.shelter
    ?.exactAddress;
  if (!address || typeof address !== "object" || !("citySlug" in address)) return raw;

  const { citySlug, ...rest } = address;
  if ("cityId" in rest && rest["cityId"] !== undefined) {
    throw new Error("exactAddress has both cityId and citySlug: give one of them.");
  }
  if (typeof citySlug !== "string" || citySlug.trim() === "") {
    throw new Error("exactAddress.citySlug must be a non-empty string.");
  }
  const found = await lookup(citySlug.trim());
  if (found.kind === "unknown") {
    throw new Error(
      `no settlement answers to the slug "${citySlug}" (neither a current nor a former one). Check the slug in the city's address on the site.`,
    );
  }
  if (found.kind === "retired") throw new Error(RETIRED_CITY_MESSAGE);
  return {
    ...(raw as object),
    shelter: {
      ...(raw as { shelter: object }).shelter,
      exactAddress: { ...rest, cityId: found.city.id },
    },
  };
}

export function refuseIfInsideRepo(inputPath: string): void {
  const resolved = canonicalPath(inputPath);
  if (resolved === REPO_ROOT || resolved.startsWith(`${REPO_ROOT}${sep}`)) {
    console.error(
      "ERROR: input file is inside the repository.\n" +
        `  ${resolve(inputPath)}\n` +
        "This file will contain a real shelter's exact address and phone number, and\n" +
        "docs/standing-constraints.md forbids real shelter data in the repository -\n" +
        "it is public. Move the file outside the working tree and pass that path instead.",
    );
    process.exit(1);
  }
}

/**
 * Throws rather than returning an error, deliberately: this is checked
 * before the dry-run printout even happens, so an operator on the phone
 * with a shelter finds out their evidence is short *before* reading a
 * "looks right, add --commit" message that would have written a `verified`
 * shelter the domain's own `DEFAULT_VERIFICATION_POLICY` doesn't actually
 * back.
 */
export function buildShelter(input: OnboardInput["shelter"], now: Date, secret: string): Shelter {
  const policy = productionLocationPolicy(secret);
  const id = ShelterIdSchema.parse(deterministicId(`shelter:${input.idSeed}`)) as Shelter["id"];

  // No private evidence bucket exists yet (H2-6), so a key typed into an input
  // file points at nothing this system issued: a public photo path or a made-up
  // string would be stored as verification evidence. Until that upload path
  // exists these two kinds carry no document, exactly as this script always
  // wrote them. (`supporting_document` keeps its required key: unchanged
  // behaviour, and the operator is pointing at a document they hold.)
  const typedKey = input.evidence.find(
    (item) =>
      (item.kind === "edrpou_registration" || item.kind === "bank_account_holder") &&
      item.documentKey !== null,
  );
  if (typedKey) {
    throw new Error(
      `${typedKey.kind}.documentKey must be omitted for now: evidence documents need the private evidence bucket, which doesn't exist yet.`,
    );
  }

  const recorded = toVerificationEvidence(input.evidence, {
    recordedBy: FOUNDER_MODERATOR_ID,
    recordedAt: now,
  });
  if (recorded.kind === "site_visit_in_future") {
    throw new Error(
      `site_visit.visitedOn ${recorded.visitedOn} is after today - a visit that hasn't happened can't back a verification.`,
    );
  }
  const evidence = recorded.evidence;

  const meetsPolicy = meetsEvidenceRequirements(
    input.legalEntity,
    evidence,
    DEFAULT_VERIFICATION_POLICY,
  );
  if (!meetsPolicy) {
    throw new Error(
      `Evidence does not meet DEFAULT_VERIFICATION_POLICY for a "${input.legalEntity.kind}" shelter. ` +
        "See docs/onboarding-a-shelter.md for what each legal shape needs.",
    );
  }

  return {
    id,
    displayName: input.displayName,
    description: { uk: input.descriptionUk, en: null },
    legalEntity: input.legalEntity,
    publicLocation: publicLocationOf(id, input.exactAddress, policy),
    exactAddress: input.exactAddress,
    contact: input.contact,
    donation: input.donation,
    logo: null,
    pendingDonation: null,
    earlyListingSince: null,
    version: 0,
    verification: {
      status: "verified",
      verifiedAt: now,
      verifiedBy: FOUNDER_MODERATOR_ID,
      evidence,
    },
    createdAt: now,
    lastUpdatedAt: now,
  };
}

/**
 * Split out of `buildAnimal` so the animal id is computable before the
 * photo-upload step, which needs it (`animalPhotoStorageKeyFor(animalId,
 * photoId)`) before the rest of the animal record exists.
 */
export function animalIdFor(idSeed: string): AnimalId {
  return AnimalIdSchema.parse(deterministicId(`animal:${idSeed}`)) as AnimalId;
}

/**
 * `photos` arrives already resolved to real `AnimalPhoto` records - this
 * function no longer derives them from the raw input, `main()` does, via
 * `resolveAndUploadPhotos` below. Keeps this function pure and testable
 * without touching the filesystem or R2, same as before H1.
 */
export function buildAnimal(
  input: z.infer<typeof OnboardAnimalSchema>,
  photos: readonly AnimalPhoto[],
  shelter: Pick<Shelter, "id" | "verification">,
  now: Date,
): ListedAnimal {
  const listing: AnimalListingState = {
    kind: "published",
    publishedAt: now,
    confirmedAt: now,
    undoable: null,
  };
  return {
    id: animalIdFor(input.idSeed),
    shelterId: shelter.id,
    name: input.name,
    species: input.species,
    sex: input.sex,
    // Not part of the onboarding input (DR1-D12): an onboarded animal starts
    // with fur «Не записано», and the shelter records it in the kabinet.
    coatLength: null,
    size: input.size,
    age: { kind: "declared_bucket", bucket: input.ageBucket, declaredAt: now },
    description: { uk: input.descriptionUk, en: null },
    photos,
    vaccination: UNKNOWN_ATTESTATION(now),
    spayNeuter: UNKNOWN_ATTESTATION(now),
    documentReadiness: UNKNOWN_DOCUMENT_READINESS,
    // Not part of the onboarding input, like fur (DR1-D12): an onboarded
    // animal starts with no temperament, colour or medical note recorded,
    // and the shelter records them in the kabinet. No new flag.
    temperament: [],
    colour: null,
    medicalNotes: null,
    // Publishing is the first confirmation: a shelter handing over a live
    // animal is saying it is looking for a home today.
    listing,
    // null: inherits the shelter's own publicLocation, computed above.
    // Only a fostered animal (not supported by this script) would need its
    // own city-precision location - see animal.ts's own comment on the field.
    publicLocation: null,
    // S8-F5's third hook: this script is the one real path that can insert an
    // animal already published under an already-verified shelter (every
    // shelter it inserts is `status: "verified"` from the start), so the
    // publish-transition and verification-transition hooks never fire for
    // it - this is the only chance to stamp the fact.
    everServedAt: everServedAtAfter(null, listing, shelter.verification, now),
    createdAt: now,
    lastUpdatedAt: now,
    version: 0,
  };
}

/**
 * Runs in both dry-run and `--commit` - resolves each photo's local path
 * against the input file's own directory and confirms it's a real,
 * readable image, without uploading anything. This is what catches a
 * shelter's missing or corrupt photo file before the dry-run's "looks
 * right, add --commit" message, the same reasoning `buildShelter`'s
 * evidence-policy check already applies to verification evidence.
 */
type ValidatedPhoto = {
  resolvedPath: string;
  dimensions: { width: number; height: number };
  framing: PhotoFraming;
};

async function validateAnimalPhotos(
  inputPath: string,
  animal: z.infer<typeof OnboardAnimalSchema>,
): Promise<ValidatedPhoto[]> {
  return Promise.all(
    animal.photos.map(async (photo) => {
      const resolvedPath = resolveLocalPhotoPath(inputPath, photo.localPath);
      const dimensions = await validateLocalPhoto(resolvedPath);
      const framed = framingOfOnboardFrame(photo.frame, dimensions);
      if (framed.kind === "refused") throw new Error(`${resolvedPath}: ${framed.message}`);
      return { resolvedPath, dimensions, framing: framed.framing };
    }),
  );
}

/**
 * `--commit` only. Photo ids are random (P-Q13), so nothing is overwritten; a failed run's files
 * stay unreferenced for the clean-up job. Each keeps its source; rows follow the animal's insert.
 */
async function uploadAnimalPhotos(
  r2: ImageStorageClient,
  animalId: AnimalId,
  validated: readonly ValidatedPhoto[],
): Promise<{ photos: AnimalPhoto[]; sources: PhotoSource[] }> {
  const photos: AnimalPhoto[] = [];
  const sources: PhotoSource[] = [];
  for (const { resolvedPath, dimensions, framing } of validated) {
    const uploaded = await uploadAnimalPhoto(
      r2,
      resolvedPath,
      animalId,
      { photoId: randomUUID(), sourceId: randomUUID() },
      dimensions,
      framing,
    );
    photos.push(uploaded.photo);
    sources.push(uploaded.source);
  }
  return { photos, sources };
}

/**
 * The shelter, once: a re-run finds it and inserts nothing, so its
 * `shelter_created` line (RG-Q8, written in the same statement) is never
 * duplicated. Exported so a test pins both.
 */
export async function insertOnboardedShelter(
  db: Database,
  shelter: Shelter,
  by: ScriptActor,
): Promise<"inserted" | "exists"> {
  if ((await shelterRepo(db).findById(shelter.id)) !== null) return "exists";
  await insertShelterFromScript(db, shelter, by);
  return "inserted";
}

/**
 * The verification a *new* animal from this run should be stamped with
 * (S8-F5's hook 3, `buildAnimal`'s `everServedAtAfter` call).
 *
 * Tier 1 review finding 1 (PR #196): `buildShelter` always sets a freshly
 * built shelter to `verified` - the status *this run* would give it, never
 * what a shelter that already existed is at *now*. A second run against an
 * existing shelter (adding a new animal: `docs/onboarding-a-shelter.md`'s
 * documented re-run flow) must stamp the new animal with that shelter's
 * real, current row - not `shelter.verification`'s optimistic value - or a
 * card published while the shelter is paused or suspended would read as
 * "ever served" when it was never actually shown.
 */
export async function verificationForNewAnimals(
  db: Database,
  shelter: Shelter,
  insertResult: "inserted" | "exists",
): Promise<ShelterVerification> {
  if (insertResult === "inserted") return shelter.verification;
  const stored = await shelterRepo(db).findById(shelter.id);
  if (!stored) {
    throw new Error(
      `Internal error: shelter ${shelter.id} was reported as existing but not found.`,
    );
  }
  return stored.verification;
}

async function main(): Promise<void> {
  // First, before anything else this script checks or reads: which database
  // it would write to. Checked even on a dry run, because it costs nothing and
  // an operator learns before typing --commit that the target is production.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  assertProductionWriteAllowed(databaseUrl, process.argv);

  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const inputPath = args.find((a) => !a.startsWith("--"));

  if (!inputPath) {
    console.error("Usage: onboard-shelter.ts <path-to-input.json> [--commit]");
    process.exit(1);
  }

  refuseIfInsideRepo(inputPath);

  if (!existsSync(inputPath)) {
    console.error(`ERROR: no file at ${resolve(inputPath)}`);
    process.exit(1);
  }

  const secret = process.env.LOCATION_HMAC_SECRET;
  if (!secret) {
    console.error(
      "ERROR: LOCATION_HMAC_SECRET is not set. Generate one with: openssl rand -hex 32",
    );
    process.exit(1);
  }

  let raw: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
  try {
    raw = await withCityIdFromSlug(raw, async (slug) => {
      // Opened only when the file names its city by slug, and closed at once; the dry run
      // otherwise touches no database. The same guard above already vetted `databaseUrl`.
      const lookupSql = postgres(databaseUrl);
      try {
        return await cityRepo(createDatabaseWithClient(lookupSql)).resolveCurrent(slug);
      } finally {
        await lookupSql.end();
      }
    });
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const parsed = parseOnboardInput(raw);
  if (parsed.kind === "refused") {
    console.error(`ERROR: ${parsed.message}`);
    process.exit(1);
  }
  const input = parsed.input;

  const now = new Date();
  const shelter = buildShelter(input.shelter, now, secret);

  // Runs in both dry-run and --commit, before either branch: a shelter's
  // photo folder missing a file or containing something sharp can't decode
  // is caught here, the same "before the looks-right message, not after"
  // posture buildShelter's own evidence-policy check already applies.
  let animalPhotoValidations: Awaited<ReturnType<typeof validateAnimalPhotos>>[];
  try {
    animalPhotoValidations = await Promise.all(
      input.animals.map((animal) => validateAnimalPhotos(inputPath, animal)),
    );
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // `noUncheckedIndexedAccess` types every `animalPhotoValidations[i]` as
  // possibly-undefined, even though `Promise.all(input.animals.map(...))`
  // above makes an out-of-bounds index structurally impossible - same
  // length, same order, every time. Round-1 review found the original code
  // defaulting to `?? []`/`?? 0` at each call site instead: a real index
  // mismatch (a future refactor breaking the 1:1 correspondence) would
  // then silently insert a photoless animal rather than failing loudly,
  // exactly the kind of "theoretically fine" gap standing-constraints.md
  // warns about. One throwing accessor instead of four silent defaults.
  function validatedPhotosFor(index: number): Awaited<ReturnType<typeof validateAnimalPhotos>> {
    const validated = animalPhotoValidations[index];
    if (!validated) {
      throw new Error(
        `Internal error: no photo validation result for animal index ${index} - ` +
          "animalPhotoValidations should always have one entry per input.animals.",
      );
    }
    return validated;
  }

  // The whole point of this gate: prove productionLocationPolicy actually
  // ran before anything touches the database. Every animal below inherits
  // this one computed value (publicLocation: null → the shelter's), so
  // there is one fuzzed location to show, not one per animal.
  //
  // The offset in metres, not "does this coordinate look like the real
  // one" — at a 1km radius the fuzzed point's first two decimal digits
  // always resemble the real address (that's what a 1km radius means), so
  // eyeballing the raw coordinates was never actually checkable. A metres
  // figure inside the configured radius is.
  console.log(`\n${commit ? "COMMIT" : "DRY RUN"} - ${input.shelter.displayName}\n`);
  console.log("Computed public location (productionLocationPolicy output, not the input address):");
  console.log(JSON.stringify(shelter.publicLocation, null, 2));
  const point = input.shelter.exactAddress.coordinates;
  if (shelter.publicLocation.precision === "fuzzed_address" && point !== null) {
    const offset = haversineMetres(point, shelter.publicLocation.approximate.center);
    console.log(
      `Offset from the real address: ${Math.round(offset)}m ` +
        `(radius: ${shelter.publicLocation.approximate.precisionMetres}m) - ` +
        `${offset > 0 && offset <= shelter.publicLocation.approximate.precisionMetres * 1.05 ? "looks right" : "CHECK THIS - outside the expected radius"}`,
    );
  }
  console.log(`\nShelter id:  ${shelter.id}`);
  console.log(`Animals (${input.animals.length}):`);
  for (const [i, animalInput] of input.animals.entries()) {
    const validated = validatedPhotosFor(i);
    const framed = validated.filter((photo) => photo.framing.kind === "frame").length;
    console.log(
      `  ${animalIdFor(animalInput.idSeed)}  ${animalInput.name}  ` +
        `(${validated.length} photo(s) found and validated, ${framed} with a frame, not yet uploaded)`,
    );
  }

  if (!commit) {
    console.log(
      "\nDry run only - nothing was written or uploaded. Re-run with --commit to insert.",
    );
    process.exit(0);
  }

  // R2 write credentials - this script's own token, operator-only, never in
  // Vercel: this script runs from an operator's own machine, never through the
  // deployed apps/web instance. The app's kabinet uploads (K-Q2) write with a
  // different token of its own (`R2_UPLOAD_*`, P-Q10), so this one never
  // needs to leave the operator's shell. (LOCATION_HMAC_SECRET
  // is no longer the same split: since the commit that turns production
  // sign-in on, it is also in Vercel Production, the same value as here,
  // because the registry fuzzes locations with it, RG-Q10.) Checked only
  // here, past the dry-run branch, so a dry run never needs them.
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  if (!r2AccountId) {
    console.error("ERROR: R2_ACCOUNT_ID is not set.");
    process.exit(1);
  }
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
  if (!r2AccessKeyId) {
    console.error("ERROR: R2_ACCESS_KEY_ID is not set.");
    process.exit(1);
  }
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!r2SecretAccessKey) {
    console.error("ERROR: R2_SECRET_ACCESS_KEY is not set.");
    process.exit(1);
  }
  const r2BucketName = process.env.R2_BUCKET_NAME;
  if (!r2BucketName) {
    console.error("ERROR: R2_BUCKET_NAME is not set.");
    process.exit(1);
  }
  const r2 = createR2Client({
    accountId: r2AccountId,
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    bucketName: r2BucketName,
  });

  // The connection is opened here and closed explicitly below, rather than
  // through `createDatabase`, which keeps its `postgres.Sql` private. Without
  // the `end()`, postgres.js holds an idle socket open and the script never
  // exits after printing "Done." - on a script whose whole job is writing
  // real rows to a live database, a hang after the last log line reads as a
  // failure and invites a Ctrl+C mid-write on the next run. `seed.ts` ends
  // its own client for the same reason.
  const sql = postgres(databaseUrl);
  const db = createDatabaseWithClient(sql);
  const cities = cityRepo(db);
  const animalsRepo = animalRepo(db);
  const scriptActor = { moderatorId: FOUNDER_MODERATOR_ID, now };

  const cityId = input.shelter.exactAddress.cityId;
  const city = await cities.findCurrentById(cityId);
  if (!city) {
    const existing = await cities.findById(cityId);
    console.error(
      existing
        ? `ERROR: city ${cityId} is retired. ${RETIRED_CITY_MESSAGE}`
        : `ERROR: city ${cityId} does not exist. Cities are seeded once and not created here.`,
    );
    process.exit(1);
  }

  const insertResult = await insertOnboardedShelter(db, shelter, scriptActor);
  console.log(
    insertResult === "exists"
      ? `\nShelter ${shelter.id} already exists - skipping (re-run is safe, not duplicating).`
      : `\nInserted shelter ${shelter.id}.`,
  );
  // S8-F5, Tier 1 review finding 1: see verificationForNewAnimals' own doc
  // comment for why this can't just be `shelter.verification`.
  const shelterVerification = await verificationForNewAnimals(db, shelter, insertResult);

  // Existence checked BEFORE uploading, not after - round-1 review found
  // the original order (upload every animal's photos, then check
  // existence) wasted a real upload on every already-inserted animal on
  // every retry, and - worse - silently discarded an edited photo list:
  // an operator re-running after adding a photo would see "Uploading N
  // photo(s)..." followed by "skipped, already present" and reasonably
  // conclude the new photo landed. It uploaded to R2 and was never
  // referenced by the animal row. This order catches the COUNT-changed
  // case with a loud warning instead of a silent no-op.
  //
  // Round-2 review found this still doesn't catch a one-for-one photo
  // REPLACEMENT - count stays the same, so the check below can't tell a
  // fresh file apart from the one already recorded, and stays silent.
  // docs/onboarding-a-shelter.md's own re-run section states this limit
  // plainly rather than overclaiming the warning catches every edit.
  //
  // NOT VERIFIED against a real bucket until this actually runs against
  // one - see docs/h1-decisions.md's explicit list (auth, CORS,
  // content-type, whether the public URL resolves).
  let insertedCount = 0;
  let skippedCount = 0;
  let mismatchCount = 0;
  for (const [i, animalInput] of input.animals.entries()) {
    const animalId = animalIdFor(animalInput.idSeed);
    const validated = validatedPhotosFor(i);
    const existingAnimal = await animalsRepo.findById(animalId);
    if (existingAnimal) {
      skippedCount += 1;
      if (existingAnimal.photos.length !== validated.length) {
        mismatchCount += 1;
        // console.error, not console.log - round-2 review found the
        // original console.log call could scroll off above the final
        // success-shaped summary line unnoticed. The count below in that
        // summary is the second half of making this loud, not just
        // present.
        console.error(
          `\nWARNING: ${animalInput.name} (${animalId}) already exists with ` +
            `${existingAnimal.photos.length} photo(s), but this input now lists ` +
            `${validated.length}. Nothing was uploaded or changed for ` +
            "this animal - re-running does not update an existing row. If the photo list " +
            "genuinely changed, this needs a real update path, not a re-run of this script.",
        );
      }
      continue;
    }
    console.log(`Uploading ${validated.length} photo(s) for ${animalInput.name}...`);
    const { photos, sources } = await uploadAnimalPhotos(r2, animalId, validated);
    await animalsRepo.insert(
      buildAnimal(animalInput, photos, { id: shelter.id, verification: shelterVerification }, now),
      cityId,
    );
    // After the animal: a row names one of its photos. A failure here leaves those photos
    // crop-able only from their detail variant; their files still go with the photo.
    const recorded = await photoSourcesRepo(db).insertForAnimal(animalId, sources, now);
    if (recorded !== sources.length) {
      throw new Error(
        `${animalInput.name}: recorded ${recorded} of ${sources.length} photo sources`,
      );
    }
    insertedCount += 1;
  }

  // RG-Q8: one history line for the batch, so the shelter's own history
  // shows what was entered for it. A crash mid-loop leaves the inserted
  // animals without this line; a re-run inserts no duplicates and records
  // only what it newly inserts.
  await recordAnimalsImported(db, shelter.id, insertedCount, scriptActor);

  await sql.end();

  console.log(
    `Inserted ${insertedCount} animal(s), skipped ${skippedCount} already present` +
      (mismatchCount > 0
        ? ` (${mismatchCount} with a photo-count mismatch - see WARNINGs above)`
        : "") +
      ". Done.",
  );
}

// Only run the CLI when this file is executed directly (`tsx src/onboard-
// shelter.ts`), not when its exports are imported for testing - importing a
// module must never have the side effect of running its whole script.
// `pathToFileURL`, not a manual `file://` prefix: on Windows argv[1] is a
// backslash path with no leading slash, and a naive string concatenation
// never matches `import.meta.url`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
