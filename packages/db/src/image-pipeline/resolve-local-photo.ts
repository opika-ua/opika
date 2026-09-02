import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import sharp, { type Metadata } from "sharp";

/**
 * An operator points the onboarding input's `photos[].localPath` at a real
 * file next to their JSON (a `photos/` folder alongside it is the
 * documented convention — `docs/onboarding-a-shelter.md`), not at an
 * absolute path they'd have to hand-type identically on every machine this
 * might run from. Relative paths resolve against the *input file's own
 * directory*, not `process.cwd()` — the operator invokes this script from
 * the repo root (per its own usage comment), not from wherever the photos
 * live, so `cwd`-relative resolution would silently look in the wrong
 * place.
 */
export function resolveLocalPhotoPath(inputFilePath: string, localPath: string): string {
  if (isAbsolute(localPath)) return localPath;
  return resolve(dirname(inputFilePath), localPath);
}

export interface LocalPhotoDimensions {
  width: number;
  height: number;
}

/**
 * Real file, real read, no network — `sharp(...).metadata()` decodes just
 * the header, not the whole image, so this is cheap even for a large
 * source photo. Deliberately run for every photo in both dry-run and
 * `--commit` (see `onboard-shelter.ts`'s `main`): a shelter's photo folder
 * having a missing or corrupt file is exactly the kind of mistake a dry run
 * exists to catch before anything is uploaded, not just before anything is
 * written to the database.
 */
export async function validateLocalPhoto(resolvedPath: string): Promise<LocalPhotoDimensions> {
  if (!existsSync(resolvedPath)) {
    throw new Error(`Photo file not found: ${resolvedPath}`);
  }
  let metadata: Metadata;
  try {
    metadata = await sharp(resolvedPath).metadata();
  } catch (cause) {
    throw new Error(`Photo file is not a readable image: ${resolvedPath}`, { cause });
  }
  if (!metadata.width || !metadata.height) {
    throw new Error(`Photo file has no readable dimensions: ${resolvedPath}`);
  }
  // sharp's metadata() reports the STORED pixel grid, not the displayed
  // orientation — EXIF Orientation 5-8 means a 90°/270° rotation, so the
  // stored width/height are transposed relative to how the photo actually
  // displays (and how `generateVariants`' own `.rotate()` will output it).
  // Round-1 review found this missing: without the swap, a portrait phone
  // photo stored with a rotation tag would report landscape dimensions,
  // and AnimalPhoto.width/height (which downstream code trusts as real —
  // packages/domain/src/animals/photo.ts's aspectRatio()) would be wrong.
  const isRotated90or270 = metadata.orientation !== undefined && metadata.orientation >= 5;
  return isRotated90or270
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}
