import sharp from "sharp";
import { expect, it } from "vitest";
import { prepareUploadedPhoto } from "./prepare-uploaded-photo";

/**
 * The work an upload costs is bounded by the source and the variants, whatever
 * the source's shape. A 2000 × 10 upload is within every upload rule, and
 * cover-scaling it whole before the attention crop made `detail` a
 * 280,000 × 1400 intermediate that sharp holds in memory for the crop: 2.6 GB
 * and 19 CPU-seconds for a few hundred bytes of PNG, which is what timed out
 * "accepts 2000 wide" in CI (2026-10-18, PR #133's run).
 *
 * The measure is libvips's own high-water mark of the memory it allocated, a
 * count of bytes rather than a clock, so load doesn't move it. It does scale
 * with libvips's thread count (about 12 MB at 24 threads, 2 MB at one), far
 * under the ceiling either way. The mark never resets, which is why this is its own file:
 * vitest runs each test file in a fresh process.
 */
const VIPS_MEMORY_CEILING_MB = 256;

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } });

/** What the upload answers, with each variant's real size read back from its bytes. */
async function uploaded(bytes: Buffer) {
  const prepared = await prepareUploadedPhoto(bytes);
  if (prepared.kind !== "ok") return prepared;
  const variants: Record<string, [number, number]> = {};
  for (const [name, variant] of Object.entries(prepared.variants)) {
    const meta = await sharp(variant).metadata();
    variants[name] = [meta.width ?? 0, meta.height ?? 0];
  }
  return { kind: prepared.kind, width: prepared.width, height: prepared.height, variants };
}

/** Every variant at its specified size, transcribed from `IMAGE_VARIANTS`. */
const accepted = (width: number, height: number) => ({
  kind: "ok",
  width,
  height,
  variants: { thumb: [176, 176], card: [640, 800], detail: [1120, 1400] },
});

/**
 * In this order, the ceiling checked after each: a regression stops at the
 * first and cheapest shape. Without the bound, the later ones cost far more
 * (2000 × 1 made a 2,800,000 × 1400 intermediate, and sharp enlarges before
 * it applies an EXIF rotation, so the rotated one holds two copies).
 */
const SHAPES: readonly [string, () => Promise<Buffer>, ReturnType<typeof accepted>][] = [
  ["2000×10", () => solid(2000, 10).png().toBuffer(), accepted(2000, 10)],
  ["10×2000", () => solid(10, 2000).png().toBuffer(), accepted(10, 2000)],
  // Stored 10 × 2000, displayed 2000 × 10 once `.rotate()` applies its tag.
  [
    "10×2000 shown as 2000×10",
    () => solid(10, 2000).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
    accepted(2000, 10),
  ],
  ["2000×1", () => solid(2000, 1).png().toBuffer(), accepted(2000, 1)],
  ["1×2000", () => solid(1, 2000).png().toBuffer(), accepted(1, 2000)],
];

it("extreme aspect ratios stay within a fixed memory ceiling, every variant at its exact size", async () => {
  expect(sharp.cache().memory.high, "precondition: a fresh process").toBeLessThan(64);
  for (const [label, make, expected] of SHAPES) {
    expect(await uploaded(await make()), label).toEqual(expected);
    expect(sharp.cache().memory.high, `${label}: MB libvips allocated at its peak`).toBeLessThan(
      VIPS_MEMORY_CEILING_MB,
    );
  }
});
