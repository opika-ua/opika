import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cutPhotoVariants } from "./crop-photo";
import { encodePhotoSource } from "./photo-source";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } });

const sizesOf = async (variants: Record<string, Buffer>) =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(variants).map(async ([name, bytes]) => {
        const meta = await sharp(bytes).metadata();
        return [name, [meta.format, meta.width, meta.height]] as const;
      }),
    ),
  );

const STORED_SIZES = {
  thumb: ["webp", 176, 176],
  card: ["webp", 640, 800],
  detail: ["webp", 1120, 1400],
  mid: ["webp", 840, 1050],
  compact: ["webp", 400, 500],
};

describe("cutPhotoVariants (crop frame)", () => {
  it("cuts the five variants from a frame, and from attention (a reset)", async () => {
    const source = await encodePhotoSource(await solid(1600, 1200).png().toBuffer());
    for (const cut of [
      { kind: "frame", box: { left: 200, top: 100, width: 800, height: 1000 } },
      { kind: "attention" },
    ] as const) {
      expect(await sizesOf(await cutPhotoVariants(source.bytes, source, cut)), cut.kind).toEqual(
        STORED_SIZES,
      );
    }
  });

  it("refuses bytes that aren't WebP, before decoding them", async () => {
    const png = await solid(1600, 1200).png().toBuffer();
    await expect(
      cutPhotoVariants(png, { width: 1600, height: 1200 }, { kind: "attention" }),
    ).rejects.toThrow(/must be WebP/);
  });

  it("refuses a source whose size isn't the one its record names (a frame is in those pixels)", async () => {
    const source = await encodePhotoSource(await solid(1600, 1200).png().toBuffer());
    await expect(
      cutPhotoVariants(source.bytes, { width: 1120, height: 1400 }, { kind: "attention" }),
    ).rejects.toThrow(/its record says 1120×1400/);
  });
});
