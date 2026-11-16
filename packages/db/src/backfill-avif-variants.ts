/**
 * `avif:backfill`: writes the AVIF variants (owner, 2026-11-16) of every photo stored before uploads
 * wrote them, so `Photo` can add its AVIF source (`NEXT_PUBLIC_R2_AVIF=1`) without a 404.
 *
 * New objects only. It never overwrites (every put carries `IfNoneMatch: *`, K-Q2), never deletes,
 * and leaves the WebP variants alone. Idempotent: a photo whose five AVIF objects all exist is
 * skipped, and one a stopped run left half done gets only the missing ones.
 *
 * What each photo's AVIF is cut from, the crop's own two paths (`photosCrop`):
 *   - its kept source and frame (`photoSourcesRepo(db).listEveryRow`), as a crop cuts them;
 *   - with no kept source, its `detail.webp` by the automatic crop, the crop's fallback for an
 *     older photo. A row whose source object is missing is skipped and listed, not guessed at.
 *
 * Usage (from the repo root of the main checkout, whose `.env.local` provides
 * `PROD_NEON_ENDPOINT`; R2 with the operator's onboarding token, never Vercel's):
 *   pnpm --filter @opika/db avif:backfill --prod --expect ep-…             dry run: counts only
 *   pnpm --filter @opika/db avif:backfill --prod --expect ep-… --commit    writes
 * A local target takes neither `--prod` nor `--expect`.
 *
 * Refuses, with nothing read, an argument it doesn't take, what the production guard refuses
 * (`assertProductionWriteAllowed`), and a non-local target that isn't exactly `--expect`
 * (`migrateTargetCheck`, as `db:migrate` checks it). The database is only read.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { frameBoxOf } from "@opika/domain";
import postgres from "postgres";
import { createDatabaseWithClient, type Database } from "./client";
import { cutPhotoVariants, type VariantCut } from "./image-pipeline/crop-photo";
import { UPLOAD_PIXEL_LIMIT } from "./image-pipeline/prepare-uploaded-photo";
import {
  createR2Client,
  type ImageStorageClient,
  type ObjectExistence,
} from "./image-pipeline/r2-client";
import {
  IMAGE_CONTENT_TYPES,
  IMAGE_VARIANT_NAMES,
  IMAGE_VARIANTS,
  type ImageVariantName,
  variantObjectKey,
} from "./image-pipeline/variants";
import { EXPECT_FLAG, migrateTargetCheck } from "./migrate-args";
import { assertProductionWriteAllowed, databaseTargetLine, PROD_FLAG } from "./prod-guard";
import { ANIMAL_PHOTO_PREFIX } from "./r2-cleanup-run";
import { type PhotoSource, photoSourcesRepo } from "./repos/photo-sources-repo";
import { referencedStorageKeys } from "./repos/r2-cleanup-repo";

const COMMIT_FLAG = "--commit";
const ARGUMENTS_TAKEN = `${PROD_FLAG}, ${EXPECT_FLAG} <ep> and ${COMMIT_FLAG}`;
/** A flag's spelling is echoed in a refusal; anything else might be a pasted URL, so it never is. */
const FLAG_SPELLING = /^-{1,2}[A-Za-z][A-Za-z0-9-]*$/;
/** HEAD requests in flight while planning; the writes run one photo at a time. */
const PLAN_CONCURRENCY = 8;

export type BackfillArgs =
  | { kind: "ok"; expect: string | undefined; commit: boolean }
  | { kind: "refused"; reason: string };

/** Reads `process.argv.slice(2)`; whether `--expect` names the right compute is `migrateTargetCheck`'s job. */
export function parseBackfillArgs(args: readonly string[]): BackfillArgs {
  let expect: string | undefined;
  let commit = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === PROD_FLAG) continue;
    if (arg === COMMIT_FLAG) {
      commit = true;
      continue;
    }
    if (arg === EXPECT_FLAG) {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) {
        return { kind: "refused", reason: `${EXPECT_FLAG} needs an endpoint id (ep-…) after it` };
      }
      if (expect !== undefined) return { kind: "refused", reason: `${EXPECT_FLAG} is given twice` };
      expect = value;
      i++;
      continue;
    }
    const what = FLAG_SPELLING.test(arg)
      ? `${arg} is not an argument this script takes`
      : `argument ${i + 1} is not one this script takes`;
    return { kind: "refused", reason: `${what}; it takes ${ARGUMENTS_TAKEN}` };
  }
  return { kind: "ok", expect, commit };
}

export type BackfillStorage = ImageStorageClient & ObjectExistence;

/** Where a photo's AVIF is cut from: the bytes' key, the size they must have, and the cut. */
export type CutFrom = {
  path: "kept_source" | "detail_variant";
  objectKey: string;
  size: { width: number; height: number };
  cut: VariantCut;
};

export type PhotoPlan =
  | { kind: "done"; storageKey: string }
  | { kind: "write"; storageKey: string; from: CutFrom; missing: readonly ImageVariantName[] }
  | { kind: "skip"; storageKey: string; reason: SkipReason };

export type SkipReason = "no_source" | "kept_source_missing" | "frame_refused";

const SKIP_TEXT: Readonly<Record<SkipReason, string>> = {
  no_source: "no kept source and no detail.webp",
  kept_source_missing: "its kept source's row names an object the bucket lacks",
  frame_refused: "its kept frame lies outside its kept source",
};

/** Every photo on a card (any listing state), with its kept source if it has one. */
export async function loadBackfillPhotos(
  db: Database,
): Promise<{ storageKey: string; source: PhotoSource | null }[]> {
  const keys = [...(await referencedStorageKeys(db))]
    .filter((key) => key.startsWith(ANIMAL_PHOTO_PREFIX))
    .sort();
  const sources = new Map(
    (await photoSourcesRepo(db).listEveryRow()).map((source) => [source.storageKey, source]),
  );
  return keys.map((storageKey) => ({ storageKey, source: sources.get(storageKey) ?? null }));
}

async function planPhoto(
  storage: BackfillStorage,
  photo: { storageKey: string; source: PhotoSource | null },
): Promise<PhotoPlan> {
  const { storageKey, source } = photo;
  const present = await Promise.all(
    IMAGE_VARIANT_NAMES.map((variant) =>
      storage.exists(variantObjectKey(storageKey, variant, "avif")),
    ),
  );
  const missing = IMAGE_VARIANT_NAMES.filter((_, i) => present[i] !== true);
  if (missing.length === 0) return { kind: "done", storageKey };

  if (source !== null) {
    if (!(await storage.exists(source.sourceObjectKey))) {
      return { kind: "skip", storageKey, reason: "kept_source_missing" };
    }
    const size = { width: source.width, height: source.height };
    let cut: VariantCut = { kind: "attention" };
    if (source.framing.kind === "frame") {
      const box = frameBoxOf(source.framing.frame, size);
      if (box.kind === "rejected") return { kind: "skip", storageKey, reason: "frame_refused" };
      cut = { kind: "frame", box: box.box };
    }
    const from: CutFrom = { path: "kept_source", objectKey: source.sourceObjectKey, size, cut };
    return { kind: "write", storageKey, from, missing };
  }

  const detail = variantObjectKey(storageKey, "detail", "webp");
  if (!(await storage.exists(detail))) return { kind: "skip", storageKey, reason: "no_source" };
  const from: CutFrom = {
    path: "detail_variant",
    objectKey: detail,
    size: { width: IMAGE_VARIANTS.detail.width, height: IMAGE_VARIANTS.detail.height },
    cut: { kind: "attention" },
  };
  return { kind: "write", storageKey, from, missing };
}

/** Read-only: which photos already have their AVIF objects, and what the rest would be cut from. */
export async function planAvifBackfill(
  storage: BackfillStorage,
  photos: readonly { storageKey: string; source: PhotoSource | null }[],
): Promise<PhotoPlan[]> {
  const plans: PhotoPlan[] = new Array(photos.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < photos.length; i = next++) {
      const photo = photos[i];
      if (photo !== undefined) plans[i] = await planPhoto(storage, photo);
    }
  };
  await Promise.all(Array.from({ length: PLAN_CONCURRENCY }, worker));
  return plans;
}

export type BackfillResult = {
  written: readonly string[];
  failed: readonly { storageKey: string; message: string }[];
};

/**
 * Cuts and puts each planned photo's missing AVIF objects, one photo at a time. A failure is
 * recorded and the run goes on; nothing already written is touched again.
 */
export async function writeAvifBackfill(
  storage: BackfillStorage,
  plans: readonly PhotoPlan[],
): Promise<BackfillResult> {
  const written: string[] = [];
  const failed: { storageKey: string; message: string }[] = [];
  for (const plan of plans) {
    if (plan.kind !== "write") continue;
    try {
      const bytes = await storage.get(plan.from.objectKey);
      const variants = await cutPhotoVariants(bytes, plan.from.size, plan.from.cut, ["avif"], {
        limitInputPixels: UPLOAD_PIXEL_LIMIT,
      });
      for (const variant of plan.missing) {
        const key = variantObjectKey(plan.storageKey, variant, "avif");
        await storage.put(key, variants[variant].avif, IMAGE_CONTENT_TYPES.avif);
        written.push(key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ storageKey: plan.storageKey, message });
    }
  }
  return { written, failed };
}

/** The dry run's counts: never a source object's key, only photo keys, which are public URLs. */
export function formatPlan(plans: readonly PhotoPlan[]): string[] {
  const writes = plans.filter((plan) => plan.kind === "write");
  const byPath = (path: CutFrom["path"]) => writes.filter((plan) => plan.from.path === path);
  const objects = (list: readonly Extract<PhotoPlan, { kind: "write" }>[]) =>
    list.reduce((sum, plan) => sum + plan.missing.length, 0);
  const kept = byPath("kept_source");
  const detail = byPath("detail_variant");
  const skipped = plans.filter((plan) => plan.kind === "skip");
  return [
    `Photos on a card (animals/ keys): ${plans.length}`,
    `  already have all ${IMAGE_VARIANT_NAMES.length} AVIF variants: ${plans.filter((plan) => plan.kind === "done").length}`,
    `  to write, cut from the kept source: ${kept.length} (${objects(kept)} AVIF objects)`,
    `  to write, cut from detail.webp (no kept source): ${detail.length} (${objects(detail)} AVIF objects)`,
    `  skipped, nothing to cut from: ${skipped.length}`,
    ...skipped.map((plan) => `    ${plan.storageKey}: ${SKIP_TEXT[plan.reason]}`),
  ];
}

/** The onboarding token's four values, read only here and never printed. */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} is not set.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const args = parseBackfillArgs(process.argv.slice(2));
  if (args.kind === "refused") {
    console.error(`REFUSED: ${args.reason}. Nothing was run.`);
    process.exit(1);
  }
  // It writes to the bucket, not the database, yet production still needs --prod.
  assertProductionWriteAllowed(url, process.argv, process.env, args.commit ? "write" : "read");
  const target = migrateTargetCheck(url, args.expect);
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run (not printing the URL).`);
    process.exit(1);
  }
  console.log(databaseTargetLine(url));

  const storage = createR2Client({
    accountId: requiredEnv("R2_ACCOUNT_ID"),
    bucketName: requiredEnv("R2_BUCKET_NAME"),
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  });

  const client = postgres(url, { max: 1 });
  let exitCode: 0 | 1 = 0;
  try {
    const photos = await loadBackfillPhotos(createDatabaseWithClient(client));
    const plans = await planAvifBackfill(storage, photos);
    console.log(args.commit ? "COMMIT" : "DRY RUN (nothing is written)");
    for (const line of formatPlan(plans)) console.log(line);
    if (!args.commit) {
      console.log(`Dry run only. Re-run with ${COMMIT_FLAG} to write them.`);
    } else {
      const result = await writeAvifBackfill(storage, plans);
      console.log(`Written: ${result.written.length} AVIF objects`);
      if (result.failed.length > 0) {
        exitCode = 1;
        console.log(
          `Failed (nothing of theirs overwritten; re-run to retry): ${result.failed.length}`,
        );
        for (const { storageKey, message } of result.failed) {
          console.log(`  ${storageKey}: ${message}`);
        }
      }
      console.log(
        "Done. Run the dry run again: every photo should already have its AVIF variants.",
      );
    }
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  } finally {
    await client.end();
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
