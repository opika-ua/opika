import sharp, { type SharpOptions } from "sharp";
import { displayedDimensions } from "./resolve-local-photo";
import { IMAGE_VARIANT_NAMES, IMAGE_VARIANTS, type ImageVariantName } from "./variants";

type Size = { width: number; height: number };

/**
 * The box the attention crop cuts from the source, at the source's own scale:
 * the variant's shape, as large as fits inside the source, and never larger
 * than the variant. A source that already covers the variant gets the variant
 * itself (sharp scales down, then crops, as it always has). A source that
 * doesn't is cropped first and enlarged after, so what gets enlarged is only
 * the part that is kept.
 *
 * Enlarging first is unbounded: cover-scaling makes the source's short side
 * match the variant's, so the long side grows with the aspect ratio, and the
 * attention crop then holds that whole intermediate in memory (sharp copies
 * it there before `smartcrop`). A 2000 × 10 upload, inside every upload rule,
 * became 280,000 × 1400 for `detail`: 2.6 GB and 19 CPU-seconds. Cropped
 * first, nothing in the pipeline exceeds the source or the variant.
 *
 * Each side is at least one pixel, and no larger than the source's.
 */
export function attentionCropBox(source: Size, variant: Size): Size {
  const scale = Math.max(variant.width / source.width, variant.height / source.height);
  if (scale <= 1) return variant;
  const side = (variantSide: number, sourceSide: number) =>
    Math.max(1, Math.min(sourceSide, Math.round(variantSide / scale)));
  return { width: side(variant.width, source.width), height: side(variant.height, source.height) };
}

/**
 * `cover` — every context this renders into already uses `object-fit:
 * cover` in the app (confirmed in `AnimalCard`/`AnimalDetailScreen`), so
 * cropping to the target box here, once, at upload time, is equivalent to
 * what the browser would otherwise crop on every view — cheaper to do it
 * once than repeatedly on every request. `position: "attention"` (sharp's
 * saliency-based crop) over a fixed centre crop: a shelter's own photo is
 * uncontrolled framing (the seeded corpus's own real photos have
 * off-centre subjects and varied aspect ratios), and a centre crop on a
 * landscape source risks cutting the animal's head off. Not independently
 * verified against a centre crop on a real off-centre photo — sharp's own
 * saliency heuristic is a reasonable default, not something this codebase
 * measured; if a real upload crops badly, this is the line to revisit
 * first. The crop is chosen before any enlargement (`attentionCropBox`).
 *
 * No `withMetadata`/`keepMetadata`/`keepExif` here, on purpose: sharp writes
 * none of the source's metadata unless asked, which is what strips EXIF
 * (GPS included), XMP and IPTC from every stored variant (K-Q2). The
 * metadata test in `prepare-uploaded-photo.test.ts` and the source scan in
 * `apps/web/src/kabinet/photo-pipeline-scan.test.ts` hold that line.
 *
 * `input` passes decoder limits through (`limitInputPixels` for uploads) to
 * every sharp instance here.
 */
export async function generateVariants(
  source: Buffer,
  input: Pick<SharpOptions, "limitInputPixels"> = {},
): Promise<Record<ImageVariantName, Buffer>> {
  const header = await sharp(source, input).metadata();
  if (!header.width || !header.height) throw new Error("The source has no dimensions");
  const displayed = displayedDimensions({
    width: header.width,
    height: header.height,
    orientation: header.orientation,
  });
  const entries = await Promise.all(
    IMAGE_VARIANT_NAMES.map(async (name) => {
      const variant = IMAGE_VARIANTS[name];
      const crop = attentionCropBox(displayed, variant);
      const cropped = sharp(source, input)
        // `.rotate()` with no argument applies the file's own EXIF
        // Orientation tag and strips it — sharp does NOT do this
        // automatically. Round-1 review found this missing: a phone photo
        // shot in portrait but stored with an EXIF rotation (extremely
        // common — that's how most phone cameras write files) would
        // otherwise produce a sideways variant, silently, since resize
        // operates on the stored pixel grid, not the displayed
        // orientation.
        .rotate()
        .resize(crop.width, crop.height, { fit: "cover", position: "attention" });
      if (crop.width === variant.width && crop.height === variant.height) {
        return [name, await cropped.webp({ quality: 82 }).toBuffer()] as const;
      }
      // The crop already has the variant's shape (to the pixel), so this only
      // enlarges it; `cover` keeps the exact size without stretching.
      const { data, info } = await cropped.raw().toBuffer({ resolveWithObject: true });
      const buffer = await sharp(data, {
        ...input,
        raw: { width: info.width, height: info.height, channels: info.channels },
      })
        .resize(variant.width, variant.height, { fit: "cover" })
        .webp({ quality: 82 })
        .toBuffer();
      return [name, buffer] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ImageVariantName, Buffer>;
}
