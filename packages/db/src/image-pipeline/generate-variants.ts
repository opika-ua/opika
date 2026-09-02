import sharp from "sharp";
import { IMAGE_VARIANT_NAMES, IMAGE_VARIANTS, type ImageVariantName } from "./variants";

/**
 * `cover` — every context this renders into already uses `object-fit:
 * cover` in the app (confirmed in `AnimalCard`/`AnimalDetailScreen`), so
 * cropping to the target box here, once, at upload time, is equivalent to
 * what the browser would otherwise crop on every view — cheaper to do it
 * once than repeatedly on every request. `position: "attention"` (sharp's
 * saliency-based crop) rather than a fixed centre crop: a shelter's own
 * photo is uncontrolled framing (confirmed by the seeded corpus's own real
 * photos — off-centre subjects, varied aspect ratios), and a centre crop on
 * a landscape source risks cutting the animal's head off entirely, which a
 * saliency crop is specifically built to avoid.
 */
export async function generateVariants(source: Buffer): Promise<Record<ImageVariantName, Buffer>> {
  const entries = await Promise.all(
    IMAGE_VARIANT_NAMES.map(async (name) => {
      const { width, height } = IMAGE_VARIANTS[name];
      const buffer = await sharp(source)
        .resize(width, height, { fit: "cover", position: "attention" })
        .webp({ quality: 82 })
        .toBuffer();
      return [name, buffer] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ImageVariantName, Buffer>;
}
