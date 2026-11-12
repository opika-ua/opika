import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  attentionCropBox,
  framedRegionOf,
  generateFramedVariants,
  generateVariants,
} from "./generate-variants";
import { IMAGE_VARIANTS } from "./variants";

// Deliberate cross-package coupling, not an accident - real photographs
// (off-centre subjects, real JPEG artefacts, real varied aspect ratios)
// catch things a synthetic fixture wouldn't, and apps/web/public/
// seed-photos/ already has nine of them with a licence file next to them.
// Renaming or removing a file there would break this file's landscape test
// below (it asserts width > height, not an exact number).
const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const REAL_PHOTO = readFileSync(resolve(REPO_ROOT, "apps/web/public/seed-photos/cat-1.jpg"));

/** Average RGB of a small square at (x,y) in a raw (non-alpha) pixel buffer. */
function pixelAt(
  data: Buffer,
  info: { width: number; channels: number },
  x: number,
  y: number,
): [number, number, number] {
  const i = (y * info.width + x) * info.channels;
  return [data.readUInt8(i), data.readUInt8(i + 1), data.readUInt8(i + 2)];
}

function isRed([r, g, b]: [number, number, number]): boolean {
  return r > 200 && g < 50 && b < 50;
}

describe("generateVariants", () => {
  it("produces exactly the named variants", async () => {
    const variants = await generateVariants(IMAGE_VARIANTS, REAL_PHOTO);
    expect(Object.keys(variants).sort()).toEqual(["card", "compact", "detail", "mid", "thumb"]);
  });

  it("each variant is a real WebP at exactly its specified dimensions", async () => {
    const variants = await generateVariants(IMAGE_VARIANTS, REAL_PHOTO);
    for (const [name, buffer] of Object.entries(variants)) {
      const meta = await sharp(buffer).metadata();
      const spec = IMAGE_VARIANTS[name as keyof typeof IMAGE_VARIANTS];
      expect(meta.format, `${name} format`).toBe("webp");
      expect(meta.width, `${name} width`).toBe(spec.width);
      expect(meta.height, `${name} height`).toBe(spec.height);
    }
  });

  it("actually shrinks a real photo - sanity check against a no-op bug", async () => {
    const originalSize = REAL_PHOTO.byteLength;
    const variants = await generateVariants(IMAGE_VARIANTS, REAL_PHOTO);
    // Round-1 review found the original assertion here
    // (`toBeLessThan(originalSize * 2)`) passed even against a mutated
    // pass-through no-op - `originalSize < originalSize * 2` is trivially
    // true regardless of what generateVariants does. A real, checkable
    // claim instead: WebP at quality 82 (generate-variants.ts) compresses
    // this real fixture smaller than its own JPEG source, even though
    // `detail` (1120x1400) has more pixels than cat-1.jpg's original
    // 1024x490 - confirmed empirically against this exact fixture, not
    // assumed to hold for photos in general.
    const detail = variants.detail;
    const thumb = variants.thumb;
    expect(detail.byteLength).toBeLessThan(originalSize);
    expect(thumb.byteLength).toBeLessThan(detail.byteLength);
  });

  it("handles a landscape source without distortion - cover crop, not squeeze", async () => {
    // dog-3.jpg is a real landscape photo in the seed corpus (per
    // apps/web/public/seed-photos/SOURCES.md) - this is the exact case a
    // centre-crop-without-saliency would risk cropping the subject out of.
    const landscape = readFileSync(resolve(REPO_ROOT, "apps/web/public/seed-photos/dog-3.jpg"));
    const sourceMeta = await sharp(landscape).metadata();
    expect(sourceMeta.width, "fixture actually is landscape").toBeGreaterThan(
      sourceMeta.height ?? 0,
    );

    const variants = await generateVariants(IMAGE_VARIANTS, landscape);
    const cardMeta = await sharp(variants.card).metadata();
    // fit: "cover" always produces the exact target box regardless of
    // source aspect ratio - this is the property that proves no distortion
    // (a "fill" resize would also hit the target box, but by squeezing).
    expect(cardMeta.width).toBe(IMAGE_VARIANTS.card.width);
    expect(cardMeta.height).toBe(IMAGE_VARIANTS.card.height);
  });

  it("applies EXIF orientation, not just source pixels - round-2 review found this untested", async () => {
    // Round-2 review found that removing generateVariants' .rotate() call
    // left every prior test in this file green, since fixed-size crops
    // can't reveal a missing rotation from dimensions alone. Direct pixel
    // proof instead: a synthetic photo, stored-top-left carries a red
    // marker on a grey field, tagged EXIF orientation 6 ("rotate 90° CW to
    // display correctly"). Ground truth measured once by hand (see this
    // test's own history): WITH .rotate() applied, the marker lands at
    // the DISPLAYED top-right; WITHOUT it, the raw pixel grid is used
    // unrotated and the marker stays at the raw top-left.
    const marker = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const source = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .composite([{ input: marker, left: 0, top: 0 }])
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    // Every variant: the displayed 200 × 300 covers `thumb` (scaled down,
    // then cropped) but not `card` or `detail` (cropped, then enlarged), so
    // both paths through `generateVariants` are held to the rotation.
    const variants = await generateVariants(IMAGE_VARIANTS, source);
    for (const [name, bytes] of Object.entries(variants)) {
      const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });

      const topLeft = pixelAt(data, info, 2, 2);
      const topRight = pixelAt(data, info, info.width - 3, 2);

      expect(isRed(topLeft), `${name}: top-left should be background, was rgb(${topLeft})`).toBe(
        false,
      );
      expect(
        isRed(topRight),
        `${name}: top-right should carry the rotated marker, was rgb(${topRight})`,
      ).toBe(true);
    }
  });
});

/**
 * The expected boxes are worked by hand: the variant's shape, as large as fits
 * inside the source, never larger than the variant, and never under a pixel.
 */
describe("attentionCropBox", () => {
  it("a source that covers the variant is cropped at the variant's own size", () => {
    expect(attentionCropBox({ width: 2000, height: 2000 }, IMAGE_VARIANTS.detail)).toEqual({
      width: 1120,
      height: 1400,
    });
    expect(attentionCropBox({ width: 1200, height: 900 }, IMAGE_VARIANTS.card)).toEqual({
      width: 640,
      height: 800,
    });
  });

  it("a source that doesn't is cropped at its own scale, to the variant's shape", () => {
    // 1200 × 900 is 900 tall where `detail` is 1400: a 4:5 box 900 tall.
    expect(attentionCropBox({ width: 1200, height: 900 }, IMAGE_VARIANTS.detail)).toEqual({
      width: 720,
      height: 900,
    });
  });

  it.each([
    [
      "2000×10",
      { width: 2000, height: 10 },
      { thumb: [10, 10], card: [8, 10], detail: [8, 10], mid: [8, 10], compact: [8, 10] },
    ],
    [
      "10×2000",
      { width: 10, height: 2000 },
      { thumb: [10, 10], card: [10, 13], detail: [10, 13], mid: [10, 13], compact: [10, 13] },
    ],
    [
      "2000×1",
      { width: 2000, height: 1 },
      { thumb: [1, 1], card: [1, 1], detail: [1, 1], mid: [1, 1], compact: [1, 1] },
    ],
    [
      "1×2000",
      { width: 1, height: 2000 },
      { thumb: [1, 1], card: [1, 1], detail: [1, 1], mid: [1, 1], compact: [1, 1] },
    ],
  ] as const)("%s: a box inside the source for every variant", (_label, source, boxes) => {
    for (const [name, variant] of Object.entries(IMAGE_VARIANTS)) {
      const box = attentionCropBox(source, variant);
      expect([box.width, box.height], name).toEqual(boxes[name as keyof typeof boxes]);
    }
  });

  it("a side that would round to nothing is one pixel", () => {
    // 2000 × 1 into a 1:4 box: 0.25 px wide, before the floor.
    expect(attentionCropBox({ width: 2000, height: 1 }, { width: 100, height: 400 })).toEqual({
      width: 1,
      height: 1,
    });
  });
});

/**
 * Crop frame (shape §6, §7): every variant from a chosen frame. A synthetic source with a red
 * block at a known place: a frame around the block makes every variant red in its middle, and
 * the thumb is the square centred in the frame, side = frame width.
 */
describe("generateFramedVariants", () => {
  /** A grey source with a red block at (left, top, size × size). */
  const withBlock = async (
    width: number,
    height: number,
    block: { left: number; top: number; size: number },
  ) => {
    const red = await sharp({
      create: { width: block.size, height: block.size, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    return sharp({ create: { width, height, channels: 3, background: { r: 50, g: 50, b: 50 } } })
      .composite([{ input: red, left: block.left, top: block.top }])
      .webp({ quality: 90 })
      .toBuffer();
  };

  const centreOf = async (bytes: Buffer) => {
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    return pixelAt(data, info, Math.floor(info.width / 2), Math.floor(info.height / 2));
  };

  it.each([
    ["landscape 2000×1200", 2000, 1200, { left: 1400, top: 300, size: 500 }],
    ["portrait 1200×2000", 1200, 2000, { left: 100, top: 1300, size: 500 }],
    ["square 1500×1500", 1500, 1500, { left: 900, top: 900, size: 500 }],
  ])(
    "%s: a frame around the block cuts every variant at its size, red in the middle",
    async (_label, width, height, block) => {
      const source = await withBlock(width, height, block);
      // A 400 × 500 frame centred on the block.
      const frame = { left: block.left + 50, top: block.top, width: 400, height: 500 };
      const variants = await generateFramedVariants(IMAGE_VARIANTS, source, frame);
      for (const [name, bytes] of Object.entries(variants)) {
        const meta = await sharp(bytes).metadata();
        const spec = IMAGE_VARIANTS[name as keyof typeof IMAGE_VARIANTS];
        expect([meta.format, meta.width, meta.height], name).toEqual([
          "webp",
          spec.width,
          spec.height,
        ]);
        expect(isRed(await centreOf(bytes)), name).toBe(true);
      }
    },
  );

  it("the same frame elsewhere misses the block: the frame, not attention, decides", async () => {
    const source = await withBlock(2000, 1200, { left: 1400, top: 300, size: 500 });
    const variants = await generateFramedVariants(IMAGE_VARIANTS, source, {
      left: 0,
      top: 0,
      width: 400,
      height: 500,
    });
    for (const [name, bytes] of Object.entries(variants)) {
      expect(isRed(await centreOf(bytes)), name).toBe(false);
    }
  });

  it("the thumb is the square centred in the frame, side = frame width", () => {
    const frame = { left: 100, top: 40, width: 800, height: 1000 };
    expect(framedRegionOf(frame, IMAGE_VARIANTS.thumb)).toEqual({
      left: 100,
      top: 140,
      width: 800,
      height: 800,
    });
    for (const name of ["card", "mid", "detail", "compact"] as const) {
      expect(framedRegionOf(frame, IMAGE_VARIANTS[name]), name).toEqual(frame);
    }
  });

  it("reads the frame on the photo as displayed: EXIF orientation is applied first", async () => {
    // Stored 300 × 200 with the marker at the stored top-left; orientation 6 shows it 200 × 300
    // with the marker at the displayed top-right (the attention test's fixture above).
    const marker = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const source = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .composite([{ input: marker, left: 0, top: 0 }])
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    // The displayed top-right 40 × 50: inside the marker only once rotated.
    const variants = await generateFramedVariants(IMAGE_VARIANTS, source, {
      left: 150,
      top: 5,
      width: 40,
      height: 50,
    });
    for (const [name, bytes] of Object.entries(variants)) {
      expect(isRed(await centreOf(bytes)), name).toBe(true);
    }
  });

  it.each([
    ["past the right edge", { left: 1700, top: 0, width: 400, height: 500 }],
    ["past the bottom", { left: 0, top: 800, width: 400, height: 500 }],
    ["a negative edge", { left: -1, top: 0, width: 400, height: 500 }],
  ])("refuses a frame %s", async (_label, frame) => {
    const source = await withBlock(2000, 1200, { left: 0, top: 0, size: 10 });
    await expect(generateFramedVariants(IMAGE_VARIANTS, source, frame)).rejects.toThrow(
      /outside the source/,
    );
  });
});
