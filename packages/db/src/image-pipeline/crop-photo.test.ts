import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cutPhotoVariants } from "./crop-photo";
import { encodePhotoSource } from "./photo-source";
import { type ImageFormat, PHOTO_FORMATS } from "./variants";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } });

/** Each variant's container, width and height per format; sharp names AVIF's container HEIF. */
const sizesOf = async (variants: Record<string, Partial<Record<ImageFormat, Buffer>>>) =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(variants).map(async ([name, formats]) => {
        const read = await Promise.all(
          Object.entries(formats).map(async ([format, bytes]) => {
            const meta = await sharp(bytes).metadata();
            return [format, [meta.format, meta.width, meta.height]] as const;
          }),
        );
        return [name, Object.fromEntries(read)] as const;
      }),
    ),
  );

const both = (width: number, height: number) => ({
  webp: ["webp", width, height],
  avif: ["heif", width, height],
});

const STORED_SIZES = {
  thumb: both(176, 176),
  card: both(640, 800),
  detail: both(1120, 1400),
  mid: both(840, 1050),
  compact: both(400, 500),
};

describe("cutPhotoVariants (crop frame)", () => {
  it("cuts the five variants from a frame, and from attention (a reset)", async () => {
    const source = await encodePhotoSource(await solid(1600, 1200).png().toBuffer());
    for (const cut of [
      { kind: "frame", box: { left: 200, top: 100, width: 800, height: 1000 } },
      { kind: "attention" },
    ] as const) {
      expect(
        await sizesOf(await cutPhotoVariants(source.bytes, source, cut, PHOTO_FORMATS)),
        cut.kind,
      ).toEqual(STORED_SIZES);
    }
  });

  it("cuts AVIF alone when asked (the backfill's own call)", async () => {
    const source = await encodePhotoSource(await solid(1600, 1200).png().toBuffer());
    const variants = await cutPhotoVariants(source.bytes, source, { kind: "attention" }, ["avif"]);
    for (const formats of Object.values(variants)) expect(Object.keys(formats)).toEqual(["avif"]);
  });

  it("refuses bytes that aren't WebP, before decoding them", async () => {
    const png = await solid(1600, 1200).png().toBuffer();
    await expect(
      cutPhotoVariants(png, { width: 1600, height: 1200 }, { kind: "attention" }, PHOTO_FORMATS),
    ).rejects.toThrow(/must be WebP/);
  });

  it("refuses a source whose size isn't the one its record names (a frame is in those pixels)", async () => {
    const source = await encodePhotoSource(await solid(1600, 1200).png().toBuffer());
    await expect(
      cutPhotoVariants(
        source.bytes,
        { width: 1120, height: 1400 },
        { kind: "attention" },
        PHOTO_FORMATS,
      ),
    ).rejects.toThrow(/its record says 1120×1400/);
  });
});
