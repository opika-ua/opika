import { crc32 } from "node:zlib";
import sharp from "sharp";

/**
 * Real image bytes for tests outside this package (the kabinet's upload
 * tests in `apps/web`), so they exercise the real pipeline without
 * `apps/web` depending on sharp itself: the app only ever reaches sharp
 * through `@opika/db/image-pipeline/server`.
 */
export async function testJpeg(
  opts: { width?: number; height?: number; gpsCanary?: string } = {},
): Promise<Buffer> {
  const image = sharp({
    create: {
      width: opts.width ?? 1200,
      height: opts.height ?? 900,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  }).jpeg();
  const tagged =
    opts.gpsCanary === undefined
      ? image
      : image.withExif({ IFD3: { GPSLatitudeRef: "N", GPSMapDatum: opts.gpsCanary } });
  return tagged.toBuffer();
}

/** What a stored file is, read back: its format and whether it carries EXIF/XMP/IPTC. */
export async function imageFactsOf(
  bytes: Buffer,
): Promise<{ format: string | undefined; hasMetadata: boolean }> {
  const meta = await sharp(bytes).metadata();
  return {
    format: meta.format,
    hasMetadata: meta.exif !== undefined || meta.xmp !== undefined || meta.iptc !== undefined,
  };
}

/** An animated WebP of `frames` small frames: its header reports `pages`, a still one none. */
export async function animatedWebp(frames: number): Promise<Buffer> {
  const pngs = await Promise.all(
    Array.from({ length: frames }, (_, i) =>
      sharp({
        create: { width: 40, height: 30, channels: 3, background: { r: i * 60, g: 0, b: 0 } },
      })
        .png()
        .toBuffer(),
    ),
  );
  return sharp(pngs, { join: { animated: true } })
    .webp()
    .toBuffer();
}

/** A PNG whose header claims any size around a few bytes of garbage pixel data, so it can lie. */
export function pngClaiming(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", Buffer.from([0x78, 0x9c, 0xde, 0xad, 0xbe, 0xef])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
