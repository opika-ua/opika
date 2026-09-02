import { readFileSync } from "node:fs";
import type { AnimalId, AnimalPhoto } from "@opika/domain";
import { generateVariants } from "./generate-variants";
import type { ImageStorageClient } from "./r2-client";
import { animalPhotoStorageKey, IMAGE_VARIANT_NAMES, variantObjectKey } from "./variants";

/**
 * `NOT VERIFIED against a real bucket` — this is the one function in the
 * pipeline that calls `ImageStorageClient.put`. Everything it does before
 * that call (`generateVariants`, `animalPhotoStorageKey`,
 * `variantObjectKey`) is independently pure and tested; this function's own
 * job is thin on purpose — read the file, generate variants, upload each
 * one, return the record. See `docs/h1-decisions.md`.
 */
export async function uploadAnimalPhoto(
  r2: ImageStorageClient,
  resolvedPath: string,
  animalId: AnimalId,
  photoIndex: number,
  dimensions: { width: number; height: number },
): Promise<AnimalPhoto> {
  const source = readFileSync(resolvedPath);
  const variants = await generateVariants(source);
  const storageKey = animalPhotoStorageKey(animalId, photoIndex);

  for (const name of IMAGE_VARIANT_NAMES) {
    await r2.put(variantObjectKey(storageKey, name), variants[name], "image/webp");
  }

  return { storageKey, width: dimensions.width, height: dimensions.height, alt: null };
}
