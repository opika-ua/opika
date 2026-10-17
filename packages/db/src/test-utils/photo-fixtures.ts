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
