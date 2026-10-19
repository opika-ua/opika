import { PHOTO_MAX_EDGE_PX, type PhotoRejectionReason } from "@opika/domain";
import sharp, { type Metadata } from "sharp";
import { generateVariants } from "./generate-variants";
import { displayedDimensions } from "./resolve-local-photo";
import { sniffImageType } from "./sniff";
import type { ImageVariantName } from "./variants";

export type PreparedPhoto =
  | {
      kind: "ok";
      /** The only bytes ever stored: re-encoded WebP, no metadata, never the original. */
      variants: Record<ImageVariantName, Buffer>;
      /** As displayed (EXIF orientation applied), like `validateLocalPhoto`'s. */
      width: number;
      height: number;
    }
  | { kind: "rejected"; reason: PhotoRejectionReason };

/**
 * The most pixels any decode in the pipeline may open. sharp checks it against
 * the header's width × height when it opens a file, so it is a second check
 * behind the 2000 px dimension check below, carried on every decode
 * (generateVariants' own included) so none can open a larger image if that
 * check is ever loosened. The one header read below lifts it on purpose, so an
 * oversized file is refused by name.
 */
export const UPLOAD_PIXEL_LIMIT = PHOTO_MAX_EDGE_PX * PHOTO_MAX_EDGE_PX;

const rejected = (reason: PhotoRejectionReason): PreparedPhoto => ({ kind: "rejected", reason });

/**
 * An uploaded file, checked and turned into the three stored variants
 * (P-Q2, P-Q5, K-Q2):
 *
 * 1. its magic bytes say JPEG, PNG or WebP (`sniffImageType`);
 * 2. sharp reads the header only (`metadata()` decodes no pixels), and the
 *    format it finds must be the one the bytes claim;
 * 3. neither side may exceed `PHOTO_MAX_EDGE_PX`: the device scales to it
 *    before uploading, so a larger file is refused, not scaled here, and a
 *    header claiming a huge image (a decompression bomb) is refused before
 *    anything is decoded;
 * 4. the variants are re-encoded (`generateVariants`: `.rotate()`, resize,
 *    WebP). sharp writes no metadata unless asked (`withMetadata` and its
 *    `keep*` relatives, which nothing in this module calls; a source scan
 *    pins that), so EXIF (GPS above all: a shelter's photo must not reveal
 *    where it was taken, decision #2), XMP and IPTC never reach a stored file.
 *    This runs for every upload, whatever the checks above found (Oleksii's
 *    P-Q5 amendment: "the server still re-encodes and strips ALL metadata").
 *
 * A refusal is a value, never a throw, so the handler maps each reason to its
 * typed error and an unexpected sharp failure still surfaces as one.
 */
export async function prepareUploadedPhoto(bytes: Buffer): Promise<PreparedPhoto> {
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
  if (!metadata.width || !metadata.height) return rejected("unreadable");
  if (metadata.width > PHOTO_MAX_EDGE_PX || metadata.height > PHOTO_MAX_EDGE_PX) {
    return rejected("dimensions_exceeded");
  }

  let variants: Record<ImageVariantName, Buffer>;
  try {
    variants = await generateVariants(bytes, { limitInputPixels: UPLOAD_PIXEL_LIMIT });
  } catch {
    return rejected("unreadable");
  }
  const { width, height } = displayedDimensions({
    width: metadata.width,
    height: metadata.height,
    orientation: metadata.orientation,
  });
  return { kind: "ok", variants, width, height };
}
