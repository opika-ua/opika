import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Animal,
  type AnimalId,
  AnimalIdSchema,
  type AnimalPhoto,
  AnimalSexSchema,
  AnimalSpeciesSchema,
  ContactChannelSchema,
  type Coordinates,
  DEFAULT_VERIFICATION_POLICY,
  DonationLinkSchema,
  EdrpouSchema,
  type EvidenceItem,
  ExactAddressSchema,
  type ModeratorId,
  ModeratorIdSchema,
  meetsEvidenceRequirements,
  publicLocationOf,
  ReferenceRelationshipSchema,
  type Shelter,
  ShelterContactSchema,
  ShelterIdSchema,
  ShelterLegalEntitySchema,
  SizeBucketSchema,
  UNKNOWN_ATTESTATION,
  UNKNOWN_DOCUMENT_READINESS,
} from "@opika/domain";
import postgres from "postgres";
import { z } from "zod";
import { createDatabaseWithClient } from "./client";
import {
  createR2Client,
  type ImageStorageClient,
  resolveLocalPhotoPath,
  uploadAnimalPhoto,
  validateLocalPhoto,
} from "./image-pipeline/server";
import { productionLocationPolicy } from "./location-policy";
import { animalRepo, cityRepo, shelterRepo } from "./repos";

/**
 * Onboards ONE real shelter and its animals — the only path in this repo that
 * may ever write a real, non-fictional `publicLocation`.
 *
 * Deliberately separate from `seed.ts`, not a mode flag on it: a shared file
 * where a flag chooses between "append real data" and "truncate everything
 * and reseed fiction" is a failure mode reachable by typo, on exactly the
 * evening someone is least careful. This script imports nothing from
 * seed.ts and has no truncation code path at all — it can only insert.
 *
 * Always uses `productionLocationPolicy` — there is no test-only fallback
 * reachable from this file, not gated on `NODE_ENV`. `LOCATION_HMAC_SECRET`
 * is read directly and the process exits if it's missing or too short
 * (`productionLocationPolicy`'s own check).
 *
 * Usage:
 *   LOCATION_HMAC_SECRET=... DATABASE_URL=<neon-direct-url> \
 *     pnpm --filter @opika/db run onboard:shelter -- /path/to/shelter.json
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
 *   against `D:\Startup\opika` — the guard would wave through exactly the
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
 * Not a real UUIDv5 (no external namespace UUID, no RFC 4122 library) —
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
 * verifies — there is no real moderator login system yet, so this stands in
 * for "the founder personally vetted this" until one exists. Fixed and
 * deterministic, not `crypto.randomUUID()`, so every onboarded shelter's
 * verification record points at the same, recognisable id rather than a
 * fresh one no query can group by.
 */
const FOUNDER_MODERATOR_ID = ModeratorIdSchema.parse(
  deterministicId("moderator:founder-manual-vetting"),
) as ModeratorId;

/**
 * `localPath`, not `storageKey`/`width`/`height` — an operator has a folder
 * of real photo files next to their input JSON (`docs/onboarding-a-
 * shelter.md`'s documented convention: a `photos/` directory alongside the
 * input file), not R2 object keys or hand-measured pixel dimensions. Both
 * are computed by this script now: `resolveLocalPhotoPath` +
 * `validateLocalPhoto` read the real file for its real dimensions (H1 —
 * see `docs/h1-decisions.md`), and `uploadAnimalPhoto` derives the storage
 * key from the animal id and the photo's position in this array.
 */
const OnboardPhotoSchema = z.object({
  localPath: z.string().min(1),
});

const OnboardAnimalSchema = z.object({
  idSeed: z.string().min(1),
  name: z.string().min(1),
  species: AnimalSpeciesSchema,
  sex: AnimalSexSchema,
  size: SizeBucketSchema,
  ageBucket: z.enum(["baby", "young", "adult", "senior"]),
  descriptionUk: z.string().min(1),
  photos: z.array(OnboardPhotoSchema).min(1),
});

/**
 * An operator-friendly shape for `EvidenceItemSchema` — the real domain
 * schema needs a `ModeratorId` (a UUID) on `site_visit` and a `submittedAt`
 * on the whole evidence bundle, neither of which an operator hand-writing
 * this file on a phone call has any business supplying by hand. Both are
 * filled in automatically (`FOUNDER_MODERATOR_ID`, `now`) by
 * `toEvidenceItem`/`buildShelter` below, not asked for here.
 */
const OnboardEvidenceItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edrpou_registration"), edrpou: EdrpouSchema }),
  z.object({ kind: z.literal("bank_account_holder"), holderName: z.string().min(1) }),
  z.object({
    kind: z.literal("reference_contact"),
    name: z.string().min(1),
    channel: ContactChannelSchema,
    relationship: ReferenceRelationshipSchema,
  }),
  z.object({ kind: z.literal("site_visit"), notes: z.string().min(1) }),
  z.object({
    kind: z.literal("supporting_document"),
    labelUk: z.string().min(1),
    documentKey: z.string().min(1),
  }),
]);
type OnboardEvidenceItem = z.infer<typeof OnboardEvidenceItemSchema>;

function toEvidenceItem(item: OnboardEvidenceItem, now: Date): EvidenceItem {
  switch (item.kind) {
    case "edrpou_registration":
      return { kind: "edrpou_registration", edrpou: item.edrpou, documentKey: null };
    case "bank_account_holder":
      return { kind: "bank_account_holder", holderName: item.holderName, documentKey: null };
    case "reference_contact":
      return {
        kind: "reference_contact",
        name: item.name,
        channel: item.channel,
        relationship: item.relationship,
      };
    case "site_visit":
      return {
        kind: "site_visit",
        visitedAt: now,
        visitedBy: FOUNDER_MODERATOR_ID,
        notes: item.notes,
      };
    case "supporting_document":
      return {
        kind: "supporting_document",
        label: { uk: item.labelUk, en: null },
        documentKey: item.documentKey,
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = item;
      return unreachable;
    }
  }
}

const OnboardInputSchema = z.object({
  shelter: z.object({
    idSeed: z.string().min(1),
    displayName: z.string().min(1),
    descriptionUk: z.string().min(1),
    legalEntity: ShelterLegalEntitySchema,
    exactAddress: ExactAddressSchema,
    contact: ShelterContactSchema,
    donation: DonationLinkSchema.nullable(),
    /**
     * Required, not optional: this is the sentence the shelter writes in
     * its own words, and a required field is what stops onboarding a
     * shelter nobody actually asked for one.
     */
    freshnessSentenceUk: z.string().min(1),
    /**
     * What you actually have, not a name this script used to turn into a
     * fabricated `reference_contact` pointing at the shelter's own phone
     * number as if it were independent corroboration — caught on review,
     * not by construction the first time: an `unregistered_initiative`
     * needs a site visit plus two real references; a registered entity
     * needs its EDRPOU and bank-holder records. `buildShelter` below
     * refuses to produce a `verified` shelter (dry run or `--commit`) if
     * what's here doesn't clear `DEFAULT_VERIFICATION_POLICY` for the
     * `legalEntity.kind` given — see docs/onboarding-a-shelter.md for a
     * worked example per legal shape.
     */
    evidence: z.array(OnboardEvidenceItemSchema).min(1),
  }),
  animals: z.array(OnboardAnimalSchema).min(1),
});

type OnboardInput = z.infer<typeof OnboardInputSchema>;

export function refuseIfInsideRepo(inputPath: string): void {
  const resolved = canonicalPath(inputPath);
  if (resolved === REPO_ROOT || resolved.startsWith(`${REPO_ROOT}${sep}`)) {
    console.error(
      "ERROR: input file is inside the repository.\n" +
        `  ${resolve(inputPath)}\n` +
        "This file will contain a real shelter's exact address and phone number, and\n" +
        "docs/standing-constraints.md forbids real shelter data in the repository —\n" +
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

  const evidence = {
    items: input.evidence.map((item) => toEvidenceItem(item, now)),
    submittedAt: now,
  };

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
    freshnessSentence: { uk: input.freshnessSentenceUk, en: null },
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
 * photo-upload step, which needs it (`animalPhotoStorageKey(animalId,
 * index)`) before the rest of the animal record exists.
 */
export function animalIdFor(idSeed: string): AnimalId {
  return AnimalIdSchema.parse(deterministicId(`animal:${idSeed}`)) as AnimalId;
}

/**
 * `photos` arrives already resolved to real `AnimalPhoto` records — this
 * function no longer derives them from the raw input, `main()` does, via
 * `resolveAndUploadPhotos` below. Keeps this function pure and testable
 * without touching the filesystem or R2, same as before H1.
 */
export function buildAnimal(
  input: z.infer<typeof OnboardAnimalSchema>,
  photos: readonly AnimalPhoto[],
  shelterId: Shelter["id"],
  now: Date,
): Animal {
  return {
    id: animalIdFor(input.idSeed),
    shelterId,
    name: input.name,
    species: input.species,
    sex: input.sex,
    size: input.size,
    age: { kind: "declared_bucket", bucket: input.ageBucket, declaredAt: now },
    description: { uk: input.descriptionUk, en: null },
    photos,
    vaccination: UNKNOWN_ATTESTATION(now),
    spayNeuter: UNKNOWN_ATTESTATION(now),
    documentReadiness: UNKNOWN_DOCUMENT_READINESS,
    listing: { kind: "published", publishedAt: now },
    // null: inherits the shelter's own publicLocation, computed above.
    // Only a fostered animal (not supported by this script) would need its
    // own city-precision location — see animal.ts's own comment on the field.
    publicLocation: null,
    createdAt: now,
    lastUpdatedAt: now,
  };
}

/**
 * Runs in both dry-run and `--commit` — resolves each photo's local path
 * against the input file's own directory and confirms it's a real,
 * readable image, without uploading anything. This is what catches a
 * shelter's missing or corrupt photo file before the dry-run's "looks
 * right, add --commit" message, the same reasoning `buildShelter`'s
 * evidence-policy check already applies to verification evidence.
 */
async function validateAnimalPhotos(
  inputPath: string,
  animal: z.infer<typeof OnboardAnimalSchema>,
): Promise<Array<{ resolvedPath: string; dimensions: { width: number; height: number } }>> {
  return Promise.all(
    animal.photos.map(async (photo) => {
      const resolvedPath = resolveLocalPhotoPath(inputPath, photo.localPath);
      const dimensions = await validateLocalPhoto(resolvedPath);
      return { resolvedPath, dimensions };
    }),
  );
}

/**
 * `NOT VERIFIED against a real bucket` — this is `--commit`-only, and the
 * one place in this script that calls `uploadAnimalPhoto`, which is itself
 * the one place that calls the R2 client. See `docs/h1-decisions.md`.
 */
async function uploadAnimalPhotos(
  r2: ImageStorageClient,
  animalId: AnimalId,
  validated: Array<{ resolvedPath: string; dimensions: { width: number; height: number } }>,
): Promise<AnimalPhoto[]> {
  const photos: AnimalPhoto[] = [];
  for (const [index, { resolvedPath, dimensions }] of validated.entries()) {
    photos.push(await uploadAnimalPhoto(r2, resolvedPath, animalId, index, dimensions));
  }
  return photos;
}

async function main(): Promise<void> {
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

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(inputPath, "utf8"));
  const parsed = OnboardInputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("ERROR: input file does not match the expected shape.");
    console.error(z.prettifyError(parsed.error));
    process.exit(1);
  }
  const input = parsed.data;

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
  // above makes an out-of-bounds index structurally impossible — same
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
        `Internal error: no photo validation result for animal index ${index} — ` +
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
  console.log(`\n${commit ? "COMMIT" : "DRY RUN"} — ${input.shelter.displayName}\n`);
  console.log("Computed public location (productionLocationPolicy output, not the input address):");
  console.log(JSON.stringify(shelter.publicLocation, null, 2));
  if (shelter.publicLocation.precision === "fuzzed_address") {
    const offset = haversineMetres(
      input.shelter.exactAddress.coordinates,
      shelter.publicLocation.approximate.center,
    );
    console.log(
      `Offset from the real address: ${Math.round(offset)}m ` +
        `(radius: ${shelter.publicLocation.approximate.precisionMetres}m) — ` +
        `${offset > 0 && offset <= shelter.publicLocation.approximate.precisionMetres * 1.05 ? "looks right" : "CHECK THIS — outside the expected radius"}`,
    );
  }
  console.log(`\nShelter id:  ${shelter.id}`);
  console.log(`Animals (${input.animals.length}):`);
  for (const [i, animalInput] of input.animals.entries()) {
    const photoCount = validatedPhotosFor(i).length;
    console.log(
      `  ${animalIdFor(animalInput.idSeed)}  ${animalInput.name}  ` +
        `(${photoCount} photo(s) found and validated, not yet uploaded)`,
    );
  }

  if (!commit) {
    console.log(
      "\nDry run only — nothing was written or uploaded. Re-run with --commit to insert.",
    );
    process.exit(0);
  }

  // R2 write credentials — operator-only, never in Vercel (same split as
  // LOCATION_HMAC_SECRET, same reason: this script runs from an operator's
  // own machine, never through the deployed apps/web instance). Checked
  // only here, past the dry-run branch, so a dry run never needs them.
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
  // exits after printing "Done." — on a script whose whole job is writing
  // real rows to a live database, a hang after the last log line reads as a
  // failure and invites a Ctrl+C mid-write on the next run. `seed.ts` ends
  // its own client for the same reason.
  const sql = postgres(databaseUrl);
  const db = createDatabaseWithClient(sql);
  const shelters = shelterRepo(db);
  const cities = cityRepo(db);
  const animalsRepo = animalRepo(db);

  const cityId = input.shelter.exactAddress.cityId;
  const city = await cities.findById(cityId);
  if (!city) {
    console.error(
      `ERROR: city ${cityId} does not exist. Cities are seeded once and not created here.`,
    );
    process.exit(1);
  }

  const existingShelter = await shelters.findById(shelter.id);
  if (existingShelter) {
    console.log(
      `\nShelter ${shelter.id} already exists — skipping (re-run is safe, not duplicating).`,
    );
  } else {
    await shelters.insert(shelter);
    console.log(`\nInserted shelter ${shelter.id}.`);
  }

  // Existence checked BEFORE uploading, not after — round-1 review found
  // the original order (upload every animal's photos, then check
  // existence) wasted a real upload on every already-inserted animal on
  // every retry, and — worse — silently discarded an edited photo list:
  // an operator re-running after adding or replacing a photo would see
  // "Uploading N photo(s)..." followed by "skipped, already present" and
  // reasonably conclude the new photo landed. It uploaded to R2 and was
  // never referenced by the animal row. This order makes that
  // undetectable case detectable instead: a real, loud warning naming the
  // mismatch, rather than a silent no-op.
  //
  // NOT VERIFIED against a real bucket until this actually runs against
  // one — see docs/h1-decisions.md's explicit list (auth, CORS,
  // content-type, whether the public URL resolves).
  let insertedCount = 0;
  let skippedCount = 0;
  for (const [i, animalInput] of input.animals.entries()) {
    const animalId = animalIdFor(animalInput.idSeed);
    const validated = validatedPhotosFor(i);
    const existingAnimal = await animalsRepo.findById(animalId);
    if (existingAnimal) {
      skippedCount += 1;
      if (existingAnimal.photos.length !== validated.length) {
        console.log(
          `\nWARNING: ${animalInput.name} (${animalId}) already exists with ` +
            `${existingAnimal.photos.length} photo(s), but this input now lists ` +
            `${validated.length}. Nothing was uploaded or changed for ` +
            "this animal — re-running does not update an existing row. If the photo list " +
            "genuinely changed, this needs a real update path, not a re-run of this script.",
        );
      }
      continue;
    }
    console.log(`Uploading ${validated.length} photo(s) for ${animalInput.name}...`);
    const photos = await uploadAnimalPhotos(r2, animalId, validated);
    await animalsRepo.insert(buildAnimal(animalInput, photos, shelter.id, now), cityId);
    insertedCount += 1;
  }

  await sql.end();

  console.log(
    `Inserted ${insertedCount} animal(s), skipped ${skippedCount} already present. Done.`,
  );
}

// Only run the CLI when this file is executed directly (`tsx src/onboard-
// shelter.ts`), not when its exports are imported for testing — importing a
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
