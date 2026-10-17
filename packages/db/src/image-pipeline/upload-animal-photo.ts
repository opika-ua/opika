import { readFileSync } from "node:fs";
import type { AnimalId, AnimalPhoto } from "@opika/domain";
import { generateVariants } from "./generate-variants";
import type { ImageStorageClient } from "./r2-client";
import {
  animalPhotoStorageKeyFor,
  IMAGE_VARIANT_NAMES,
  type ImageVariantName,
  variantObjectKey,
} from "./variants";

/**
 * Puts one photo's three variants under its storage key. The one place
 * either writer (the onboarding script, the kabinet's upload) hands bytes to
 * storage, so both store exactly the variants, as WebP, and never the
 * original file.
 */
export async function storePhotoVariants(
  storage: ImageStorageClient,
  storageKey: string,
  variants: Record<ImageVariantName, Buffer>,
): Promise<void> {
  for (const name of IMAGE_VARIANT_NAMES) {
    await storage.put(variantObjectKey(storageKey, name), variants[name], "image/webp");
  }
}

/**
 * `NOT VERIFIED against a real bucket` — the onboarding script's upload:
 * read the file, generate variants, store them under a fresh random key
 * (`photoId`, P-Q13), return the record. Everything before the storage call
 * is independently pure and tested. See `docs/h1-decisions.md`.
 */
export async function uploadAnimalPhoto(
  r2: ImageStorageClient,
  resolvedPath: string,
  animalId: AnimalId,
  photoId: string,
  dimensions: { width: number; height: number },
): Promise<AnimalPhoto> {
  const storageKey = animalPhotoStorageKeyFor(animalId, photoId);
  const variants = await generateVariants(readFileSync(resolvedPath));
  await storePhotoVariants(r2, storageKey, variants);
  return { storageKey, width: dimensions.width, height: dimensions.height, alt: null };
}
