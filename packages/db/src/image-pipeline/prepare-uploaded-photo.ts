import { PHOTO_MAX_EDGE_PX, type PhotoRejectionReason } from "@opika/domain";
import sharp, { type Metadata } from "sharp";
import { type EncodedVariants, generateVariants } from "./generate-variants";
import { encodePhotoSource, type PhotoSourceImage } from "./photo-source";
import { displayedDimensions, hasSeveralFrames } from "./resolve-local-photo";
import { sniffImageType } from "./sniff";
import {
  IMAGE_VARIANTS,
  type ImageFormat,
  type ImageVariantName,
  LOGO_FORMATS,
  LOGO_VARIANTS,
  type LogoVariantName,
  PHOTO_FORMATS,
} from "./variants";

type PreparedImage<Name extends string, F extends ImageFormat> =
  | {
      kind: "ok";
      /** Re-encoded in each format, no metadata, never the original file. */
      variants: EncodedVariants<Name, F>;
      /** As displayed (EXIF orientation applied), like `validateLocalPhoto`'s. */
      width: number;
      height: number;
    }
  | { kind: "rejected"; reason: PhotoRejectionReason };

type Rejected = Extract<PreparedImage<string, ImageFormat>, { kind: "rejected" }>;

/** A photo also keeps its source, re-encoded the same way, for later crops (crop frame). */
export type PreparedPhoto =
  | (Extract<PreparedImage<ImageVariantName, (typeof PHOTO_FORMATS)[number]>, { kind: "ok" }> & {
      source: PhotoSourceImage;
    })
  | Rejected;
export type PreparedLogo = PreparedImage<LogoVariantName, (typeof LOGO_FORMATS)[number]>;

/**
 * The most pixels any decode in the pipeline may open. sharp checks it against
 * the header's width × height when it opens a file, so it is a second check
 * behind the 2000 px dimension check below, carried on every decode
 * (generateVariants' own included) so none can open a larger image if that
 * check is ever loosened. The one header read below lifts it on purpose, so an
 * oversized file is refused by name.
 */
export const UPLOAD_PIXEL_LIMIT = PHOTO_MAX_EDGE_PX * PHOTO_MAX_EDGE_PX;

const rejected = <Name extends string, F extends ImageFormat>(
  reason: PhotoRejectionReason,
): PreparedImage<Name, F> => ({ kind: "rejected", reason });

/**
 * An uploaded file, checked and turned into its stored variants (P-Q2,
 * P-Q5, K-Q2):
 *
 * 1. its magic bytes say JPEG, PNG or WebP (`sniffImageType`);
 * 2. sharp reads the header only (`metadata()` decodes no pixels), and the
 *    format it finds must be the one the bytes claim, with one frame (an
 *    animated WebP is refused as `unsupported_type`);
 * 3. neither side may exceed `PHOTO_MAX_EDGE_PX`: the device scales to it
 *    before uploading, so a larger file is refused, not scaled here, and a
 *    header claiming a huge image (a decompression bomb) is refused before
 *    anything is decoded;
 * 4. the variants are re-encoded (`generateVariants`: `.rotate()`, resize,
 *    WebP, and AVIF for a photo). sharp writes no metadata unless asked
 *    (`withMetadata` and its `keep*` relatives, which nothing in this module
 *    calls; a source scan pins that), so EXIF (GPS above all: a shelter's photo must not reveal
 *    where it was taken, decision #2), XMP and IPTC never reach a stored file.
 *    This runs for every upload, whatever the checks above found (Oleksii's
 *    P-Q5 amendment: "the server still re-encodes and strips ALL metadata").
 *
 * A refusal is a value, never a throw, so the handler maps each reason to its
 * typed error and an unexpected sharp failure still surfaces as one.
 *
 * Generic over the variant set (pet card PR 3b): every check above is about
 * the *source* file, not what it becomes, so a logo (`LOGO_VARIANTS`) goes
 * through exactly the same validation as an animal photo (`IMAGE_VARIANTS`)
 * - same size/type limits, same metadata stripping - and only the variant
 * map handed to `generateVariants` differs. `prepareUploadedPhoto` and
 * `prepareUploadedLogo` below are this function with that one map fixed.
 */
async function prepareUploadedImage<Name extends string, F extends ImageFormat>(
  bytes: Buffer,
  variants: Record<Name, { width: number; height: number }>,
  formats: readonly F[],
): Promise<PreparedImage<Name, F>> {
  const sniffed = sniffImageType(bytes);
  if (sniffed === null) return rejected("unsupported_type");

  let metadata: Metadata;
  try {
    // Header only: `metadata()` decodes no pixels, so it is safe on any size.
    // The pixel limit is lifted here (sharp applies it to the header read too,
    // and would answer a bomb with a generic error) so the size check below
    // can name the refusal; it applies again to the decode in `generateVariants`.
    metadata = await sharp(bytes, { limitInputPixels: false }).metadata();
  } catch {
    return rejected("unreadable");
  }
  if (metadata.format !== sniffed) return rejected("format_mismatch");
  // An animated or multi-page file is refused before any decode, so the decode
  // never depends on sharp's default of reading only the first frame.
  if (hasSeveralFrames(metadata)) return rejected("unsupported_type");
  if (!metadata.width || !metadata.height) return rejected("unreadable");
  if (metadata.width > PHOTO_MAX_EDGE_PX || metadata.height > PHOTO_MAX_EDGE_PX) {
    return rejected("dimensions_exceeded");
  }

  let generated: EncodedVariants<Name, F>;
  try {
    generated = await generateVariants(variants, bytes, formats, {
      limitInputPixels: UPLOAD_PIXEL_LIMIT,
    });
  } catch {
    return rejected("unreadable");
  }
  const { width, height } = displayedDimensions({
    width: metadata.width,
    height: metadata.height,
    orientation: metadata.orientation,
  });
  return { kind: "ok", variants: generated, width, height };
}

/** The checks and variants every image gets, plus the source, decoded under the same pixel limit. */
export async function prepareUploadedPhoto(bytes: Buffer): Promise<PreparedPhoto> {
  const prepared = await prepareUploadedImage(bytes, IMAGE_VARIANTS, PHOTO_FORMATS);
  if (prepared.kind === "rejected") return prepared;
  try {
    const source = await encodePhotoSource(bytes, { limitInputPixels: UPLOAD_PIXEL_LIMIT });
    return { ...prepared, source };
  } catch {
    return { kind: "rejected", reason: "unreadable" };
  }
}

export function prepareUploadedLogo(bytes: Buffer): Promise<PreparedLogo> {
  return prepareUploadedImage(bytes, LOGO_VARIANTS, LOGO_FORMATS);
}
