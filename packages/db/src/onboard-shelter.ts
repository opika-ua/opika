import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Animal,
  type AnimalId,
  AnimalIdSchema,
  AnimalSexSchema,
  AnimalSpeciesSchema,
  DonationLinkSchema,
  ExactAddressSchema,
  type ModeratorId,
  ModeratorIdSchema,
  publicLocationOf,
  type Shelter,
  ShelterContactSchema,
  ShelterIdSchema,
  ShelterLegalEntitySchema,
  SizeBucketSchema,
  UNKNOWN_ATTESTATION,
  UNKNOWN_DOCUMENT_READINESS,
} from "@opika/domain";
import { z } from "zod";
import { createDatabase } from "./client";
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

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

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

const OnboardAnimalSchema = z.object({
  idSeed: z.string().min(1),
  name: z.string().min(1),
  species: AnimalSpeciesSchema,
  sex: AnimalSexSchema,
  size: SizeBucketSchema,
  ageBucket: z.enum(["baby", "young", "adult", "senior"]),
  descriptionUk: z.string().min(1),
  photos: z
    .array(
      z.object({
        storageKey: z.string().min(1),
        width: z.int().positive(),
        height: z.int().positive(),
      }),
    )
    .min(1),
});

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
    /** Whoever on your side actually vetted this shelter — becomes the evidence record. */
    vettedByName: z.string().min(1),
  }),
  animals: z.array(OnboardAnimalSchema).min(1),
});

type OnboardInput = z.infer<typeof OnboardInputSchema>;

export function refuseIfInsideRepo(inputPath: string): void {
  const resolved = resolve(inputPath);
  if (
    resolved === REPO_ROOT ||
    resolved.startsWith(`${REPO_ROOT}/`) ||
    resolved.startsWith(`${REPO_ROOT}\\`)
  ) {
    console.error(
      "ERROR: input file is inside the repository.\n" +
        `  ${resolved}\n` +
        "This file will contain a real shelter's exact address and phone number, and\n" +
        "docs/standing-constraints.md forbids real shelter data in the repository —\n" +
        "it is public. Move the file outside the working tree and pass that path instead.",
    );
    process.exit(1);
  }
}

export function buildShelter(input: OnboardInput["shelter"], now: Date, secret: string): Shelter {
  const policy = productionLocationPolicy(secret);
  const id = ShelterIdSchema.parse(deterministicId(`shelter:${input.idSeed}`)) as Shelter["id"];

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
      evidence: {
        items: [
          {
            kind: "reference_contact",
            name: input.vettedByName,
            channel: input.contact.primary,
            relationship: "other",
          },
        ],
        submittedAt: now,
      },
    },
    createdAt: now,
    lastUpdatedAt: now,
  };
}

export function buildAnimal(
  input: z.infer<typeof OnboardAnimalSchema>,
  shelterId: Shelter["id"],
  now: Date,
): Animal {
  return {
    id: AnimalIdSchema.parse(deterministicId(`animal:${input.idSeed}`)) as AnimalId,
    shelterId,
    name: input.name,
    species: input.species,
    sex: input.sex,
    size: input.size,
    age: { kind: "declared_bucket", bucket: input.ageBucket, declaredAt: now },
    description: { uk: input.descriptionUk, en: null },
    photos: input.photos.map((p) => ({ ...p, alt: null })),
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
  const animals = input.animals.map((a) => buildAnimal(a, shelter.id, now));

  // The whole point of this gate: prove productionLocationPolicy actually
  // ran before anything touches the database. Every animal below inherits
  // this one computed value (publicLocation: null → the shelter's), so
  // there is one fuzzed location to show, not one per animal.
  console.log(`\n${commit ? "COMMIT" : "DRY RUN"} — ${input.shelter.displayName}\n`);
  console.log("Computed public location (productionLocationPolicy output, not the input address):");
  console.log(JSON.stringify(shelter.publicLocation, null, 2));
  console.log(`\nShelter id:  ${shelter.id}`);
  console.log(`Animals (${animals.length}):`);
  for (const animal of animals) {
    console.log(`  ${animal.id}  ${animal.name}`);
  }

  if (!commit) {
    console.log("\nDry run only — nothing was written. Re-run with --commit to insert.");
    process.exit(0);
  }

  const db = createDatabase(databaseUrl);
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

  let insertedCount = 0;
  let skippedCount = 0;
  for (const animal of animals) {
    const existingAnimal = await animalsRepo.findById(animal.id);
    if (existingAnimal) {
      skippedCount += 1;
      continue;
    }
    await animalsRepo.insert(animal, cityId);
    insertedCount += 1;
  }

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
