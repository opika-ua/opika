import sharp from "sharp";
import { IMAGE_VARIANT_NAMES, IMAGE_VARIANTS, type ImageVariantName } from "./variants";

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
 * first.
 */
export async function generateVariants(source: Buffer): Promise<Record<ImageVariantName, Buffer>> {
  const entries = await Promise.all(
    IMAGE_VARIANT_NAMES.map(async (name) => {
      const { width, height } = IMAGE_VARIANTS[name];
      const buffer = await sharp(source)
        // `.rotate()` with no argument applies the file's own EXIF
        // Orientation tag and strips it — sharp does NOT do this
        // automatically. Round-1 review found this missing: a phone photo
        // shot in portrait but stored with an EXIF rotation (extremely
        // common — that's how most phone cameras write files) would
        // otherwise produce a sideways variant, silently, since resize
        // operates on the stored pixel grid, not the displayed
        // orientation.
        .rotate()
        .resize(width, height, { fit: "cover", position: "attention" })
        .webp({ quality: 82 })
        .toBuffer();
      return [name, buffer] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ImageVariantName, Buffer>;
}
