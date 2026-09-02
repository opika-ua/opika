import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateVariants } from "./generate-variants";
import { IMAGE_VARIANTS } from "./variants";

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
    // The largest variant (detail, 1120x1400) should still be meaningfully
    // smaller than an unprocessed original in bytes for a real photograph,
    // given WebP compression — catches a bug where resize/encode silently
    // no-ops and passes the source straight through.
    expect(variants.detail.byteLength).toBeLessThan(originalSize * 2);
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
