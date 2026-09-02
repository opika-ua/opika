/**
 * Client-safe exports only — this is the one subpath `apps/web`'s
 * `image-loader.ts` (a `"use client"` file) is allowed to import from.
 * `generateVariants` (sharp), `createR2Client` (`@aws-sdk/client-s3`), and
 * `resolveLocalPhotoPath`/`validateLocalPhoto`/`uploadAnimalPhoto` (all
 * `node:fs`) are server-only and deliberately NOT re-exported here — a real
 * `next build` failure caught this the first time (Turbopack refusing to
 * bundle `sharp`'s native bindings into the client bundle), not a rule
 * followed in advance. `onboard-shelter.ts` imports those directly via
 * `./image-pipeline/server`, never through this file.
 */
export {
  animalPhotoStorageKey,
  IMAGE_VARIANT_NAMES,
  IMAGE_VARIANTS,
  type ImageVariantName,
  isRealPhotoKey,
  nearestVariant,
  r2PublicUrl,
  variantObjectKey,
} from "./variants";
