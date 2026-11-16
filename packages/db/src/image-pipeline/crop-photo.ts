import type { PixelBox } from "@opika/domain";
import sharp, { type SharpOptions } from "sharp";
import {
  type EncodedVariants,
  generateFramedVariants,
  generateVariants,
} from "./generate-variants";
import { displayedDimensions } from "./resolve-local-photo";
import { sniffImageType } from "./sniff";
import { IMAGE_VARIANTS, type ImageFormat, type ImageVariantName } from "./variants";

/** How a crop cuts its variants: the automatic crop, or `frameBoxOf`'s box in source pixels. */
export type VariantCut = { kind: "attention" } | { kind: "frame"; box: PixelBox };

/**
 * The five variants a crop stores, cut from a photo's kept source (crop-frame shape §6), in
 * `formats` (the AVIF backfill asks for AVIF alone). The bytes come back from our own bucket, yet
 * are still checked: WebP by their magic bytes, and the size the source's row records, since a
 * frame's box is in those pixels.
 */
export async function cutPhotoVariants<F extends ImageFormat>(
  source: Buffer,
  expected: { width: number; height: number },
  cut: VariantCut,
  formats: readonly F[],
  input: Pick<SharpOptions, "limitInputPixels"> = {},
): Promise<EncodedVariants<ImageVariantName, F>> {
  if (sniffImageType(source) !== "webp") throw new Error("A photo source must be WebP");
  const header = await sharp(source, input).metadata();
  if (!header.width || !header.height) throw new Error("The source has no dimensions");
  const displayed = displayedDimensions({
    width: header.width,
    height: header.height,
    orientation: header.orientation,
  });
  if (displayed.width !== expected.width || displayed.height !== expected.height) {
    throw new Error(
      `The source is ${displayed.width}×${displayed.height}, its record says ${expected.width}×${expected.height}`,
    );
  }
  switch (cut.kind) {
    case "attention":
      return generateVariants(IMAGE_VARIANTS, source, formats, input);
    case "frame":
      return generateFramedVariants(IMAGE_VARIANTS, source, cut.box, formats, input);
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = cut;
      return unreachable;
    }
  }
}
