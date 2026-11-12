import { PHOTO_MAX_EDGE_PX } from "@opika/domain";
import sharp, { type SharpOptions } from "sharp";
import { displayedDimensions } from "./resolve-local-photo";

/** A photo's kept source: re-encoded, as displayed, with its own pixel size (crop-frame shape §1). */
export type PhotoSourceImage = { bytes: Buffer; width: number; height: number };

/** Higher than the variants' 82: every later crop is cut from these pixels. */
export const PHOTO_SOURCE_QUALITY = 90;

/**
 * The photo as displayed, fit inside 2000 × 2000 and never enlarged. Kabinet uploads are at most
 * 2000 px already (refused above it), so only an onboarding file can be scaled here.
 */
export function photoSourceSizeOf(displayed: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const scale = Math.min(1, PHOTO_MAX_EDGE_PX / Math.max(displayed.width, displayed.height));
  if (scale === 1) return { width: displayed.width, height: displayed.height };
  return {
    width: Math.max(1, Math.round(displayed.width * scale)),
    height: Math.max(1, Math.round(displayed.height * scale)),
  };
}

/**
 * Oriented (`.rotate()`), so a frame refers to the photo as shown; no `withMetadata`, so no EXIF,
 * XMP or IPTC (K-Q2). Exactly `photoSourceSizeOf`'s size, the size a frame was checked against.
 */
export async function encodePhotoSource(
  bytes: Buffer,
  input: Pick<SharpOptions, "limitInputPixels"> = {},
): Promise<PhotoSourceImage> {
  const header = await sharp(bytes, input).metadata();
  if (!header.width || !header.height) throw new Error("The photo has no dimensions");
  const displayed = displayedDimensions({
    width: header.width,
    height: header.height,
    orientation: header.orientation,
  });
  const size = photoSourceSizeOf(displayed);
  const oriented = sharp(bytes, input).rotate();
  const sized =
    size.width === displayed.width && size.height === displayed.height
      ? oriented
      : oriented.resize(size.width, size.height, { fit: "fill" });
  const encoded = await sized.webp({ quality: PHOTO_SOURCE_QUALITY }).toBuffer();
  return { bytes: encoded, width: size.width, height: size.height };
}
