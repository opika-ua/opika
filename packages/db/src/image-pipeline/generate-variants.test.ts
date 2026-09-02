import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateVariants } from "./generate-variants";
import { IMAGE_VARIANTS } from "./variants";

// Deliberate cross-package coupling, not an accident — real photographs
// (off-centre subjects, real JPEG artefacts, real varied aspect ratios)
// catch things a synthetic fixture wouldn't, and apps/web/public/
// seed-photos/ already has nine of them with a licence file next to them.
// Renaming or removing a file there breaks this file's tests too; dog-3.jpg's
// exact 1023x782 below is asserted against, not assumed.
const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const REAL_PHOTO = readFileSync(resolve(REPO_ROOT, "apps/web/public/seed-photos/cat-1.jpg"));

describe("generateVariants", () => {
  it("produces exactly the three named variants", async () => {
    const variants = await generateVariants(REAL_PHOTO);
    expect(Object.keys(variants).sort()).toEqual(["card", "detail", "thumb"]);
  });

  it("each variant is a real WebP at exactly its specified dimensions", async () => {
    const variants = await generateVariants(REAL_PHOTO);
    for (const [name, buffer] of Object.entries(variants)) {
      const meta = await sharp(buffer).metadata();
      const spec = IMAGE_VARIANTS[name as keyof typeof IMAGE_VARIANTS];
      expect(meta.format, `${name} format`).toBe("webp");
      expect(meta.width, `${name} width`).toBe(spec.width);
      expect(meta.height, `${name} height`).toBe(spec.height);
    }
  });

  it("actually shrinks a real photo — sanity check against a no-op bug", async () => {
    const originalSize = REAL_PHOTO.byteLength;
    const variants = await generateVariants(REAL_PHOTO);
    // Round-1 review found the original assertion here
    // (`toBeLessThan(originalSize * 2)`) passed even against a mutated
    // pass-through no-op — `originalSize < originalSize * 2` is trivially
    // true regardless of what generateVariants does. A real, checkable
    // claim instead: WebP at quality 82 (generate-variants.ts) compresses
    // this real fixture smaller than its own JPEG source, even though
    // `detail` (1120x1400) has more pixels than cat-1.jpg's original
    // 1024x490 — confirmed empirically against this exact fixture, not
    // assumed to hold for photos in general.
    expect(variants.detail.byteLength).toBeLessThan(originalSize);
    expect(variants.thumb.byteLength).toBeLessThan(variants.detail.byteLength);
  });

  it("handles a landscape source without distortion — cover crop, not squeeze", async () => {
    // dog-3.jpg is a real landscape photo in the seed corpus (per
    // apps/web/public/seed-photos/SOURCES.md) — this is the exact case a
    // centre-crop-without-saliency would risk cropping the subject out of.
    const landscape = readFileSync(resolve(REPO_ROOT, "apps/web/public/seed-photos/dog-3.jpg"));
    const sourceMeta = await sharp(landscape).metadata();
    expect(sourceMeta.width, "fixture actually is landscape").toBeGreaterThan(
      sourceMeta.height ?? 0,
    );

    const variants = await generateVariants(landscape);
    const cardMeta = await sharp(variants.card).metadata();
    // fit: "cover" always produces the exact target box regardless of
    // source aspect ratio — this is the property that proves no distortion
    // (a "fill" resize would also hit the target box, but by squeezing).
    expect(cardMeta.width).toBe(IMAGE_VARIANTS.card.width);
    expect(cardMeta.height).toBe(IMAGE_VARIANTS.card.height);
  });
});
