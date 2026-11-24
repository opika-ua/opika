import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import sharp, { type Metadata } from "sharp";

/**
 * An operator points the onboarding input's `photos[].localPath` at a real
 * file next to their JSON (a `photos/` folder alongside it is the
 * documented convention - `docs/onboarding-a-shelter.md`), not at an
 * absolute path they'd have to hand-type identically on every machine this
 * might run from. Relative paths resolve against the *input file's own
 * directory*, not `process.cwd()` - the operator invokes this script from
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
 * Real file, real read, no network - `sharp(...).metadata()` decodes just
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
    // Header only, limit lifted so an oversized file is refused by name below.
    metadata = await sharp(resolvedPath, { limitInputPixels: false }).metadata();
  } catch (cause) {
    throw new Error(`Photo file is not a readable image: ${resolvedPath}`, { cause });
  }
  const { width, height } = checkOnboardingPhotoHeader(metadata, resolvedPath);
  return displayedDimensions({ width, height, orientation: metadata.orientation });
}

/**
 * Looser than the kabinet's 2000 px edge, since the onboarding CLI scales large originals down,
 * but still a ceiling on what any of its decodes may open (a pixel bomb).
 */
export const ONBOARDING_PIXEL_LIMIT = 50_000_000;

/** An animated or multi-page file: refused before any decode, by the kabinet and the onboarding CLI alike. */
export function hasSeveralFrames(header: Pick<Metadata, "pages">): boolean {
  return (header.pages ?? 1) > 1;
}

/** The onboarding CLI's header checks, run before anything is decoded: one frame, at most 50 MP. */
export function checkOnboardingPhotoHeader(
  header: Pick<Metadata, "pages" | "width" | "height">,
  path: string,
): LocalPhotoDimensions {
  if (hasSeveralFrames(header)) {
    throw new Error(
      `Photo file is animated or has several pages, only a still image is accepted: ${path}`,
    );
  }
  if (!header.width || !header.height) {
    throw new Error(`Photo file has no readable dimensions: ${path}`);
  }
  if (header.width * header.height > ONBOARDING_PIXEL_LIMIT) {
    throw new Error(
      `Photo file is over ${ONBOARDING_PIXEL_LIMIT / 1_000_000} megapixels (${header.width} × ${header.height}): ${path}`,
    );
  }
  return { width: header.width, height: header.height };
}

/**
 * sharp's metadata() reports the STORED pixel grid, not the displayed
 * orientation - EXIF Orientation 5-8 means a 90°/270° rotation, so the
 * stored width/height are transposed relative to how the photo actually
 * displays (and how `generateVariants`' own `.rotate()` will output it).
 * Round-1 review found this missing: without the swap, a portrait phone
 * photo stored with a rotation tag would report landscape dimensions,
 * and AnimalPhoto.width/height (which downstream code trusts as real -
 * packages/domain/src/animals/photo.ts's aspectRatio()) would be wrong.
 * Shared by the onboarding script's local files and the kabinet's uploads
 * (`prepareUploadedPhoto`), so both record a photo's shape the same way.
 */
export function displayedDimensions(metadata: {
  width: number;
  height: number;
  orientation?: number | undefined;
}): LocalPhotoDimensions {
  const isRotated90or270 = metadata.orientation !== undefined && metadata.orientation >= 5;
  return isRotated90or270
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}
