import { readFileSync } from "node:fs";
import { type AnimalId, type AnimalPhoto, frameBoxOf, type PhotoFraming } from "@opika/domain";
import type { PhotoSource } from "../repos/photo-sources-repo";
import { generateFramedVariants, generateVariants } from "./generate-variants";
import { encodePhotoSource } from "./photo-source";
import type { ImageStorageClient } from "./r2-client";
import {
  animalPhotoStorageKeyFor,
  IMAGE_VARIANT_NAMES,
  IMAGE_VARIANTS,
  type ImageVariantName,
  photoSourceObjectKeyFor,
  variantObjectKey,
} from "./variants";

/**
 * Every writer's one put of a photo: re-encoded WebP only, never the uploaded file. The source
 * must sit directly under the key, or the clean-up job would not take it with the variants.
 */
export async function storePhoto(
  storage: ImageStorageClient,
  storageKey: string,
  variants: Record<ImageVariantName, Buffer>,
  source: { objectKey: string; bytes: Buffer },
): Promise<void> {
  const name = source.objectKey.slice(storageKey.length + 1);
  if (!source.objectKey.startsWith(`${storageKey}/source-`) || name.includes("/")) {
    throw new Error("A photo's source must sit directly under its storage key");
  }
  for (const variant of IMAGE_VARIANT_NAMES) {
    await storage.put(variantObjectKey(storageKey, variant), variants[variant], "image/webp");
  }
  await storage.put(source.objectKey, source.bytes, "image/webp");
}

/**
 * The onboarding script's upload, NOT VERIFIED against a real bucket (`docs/h1-decisions.md`):
 * variants by attention from the file, or by the operator's frame from the source. A refused
 * frame throws before anything is stored.
 */
export async function uploadAnimalPhoto(
  r2: ImageStorageClient,
  resolvedPath: string,
  animalId: AnimalId,
  ids: { photoId: string; sourceId: string },
  dimensions: { width: number; height: number },
  framing: PhotoFraming,
): Promise<{ photo: AnimalPhoto; source: PhotoSource }> {
  const storageKey = animalPhotoStorageKeyFor(animalId, ids.photoId);
  const sourceObjectKey = photoSourceObjectKeyFor(storageKey, ids.sourceId);
  const file = readFileSync(resolvedPath);
  const source = await encodePhotoSource(file);
  let variants: Record<ImageVariantName, Buffer>;
  switch (framing.kind) {
    case "attention":
      variants = await generateVariants(IMAGE_VARIANTS, file);
      break;
    case "frame": {
      const box = frameBoxOf(framing.frame, source);
      if (box.kind === "rejected") {
        throw new Error(`The frame for ${resolvedPath} is refused (${box.reason})`);
      }
      variants = await generateFramedVariants(IMAGE_VARIANTS, source.bytes, box.box);
      break;
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = framing;
      return unreachable;
    }
  }
  await storePhoto(r2, storageKey, variants, { objectKey: sourceObjectKey, bytes: source.bytes });
  return {
    photo: { storageKey, width: dimensions.width, height: dimensions.height, alt: null },
    source: {
      storageKey,
      sourceObjectKey,
      origin: "upload",
      width: source.width,
      height: source.height,
      framing,
    },
  };
}
