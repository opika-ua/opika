import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { jpegBytes, pngBytes, webpBytes } from "./image-fixtures";
import { type ImageHeader, orientedSize, readImageHeader } from "./image-header";

function blobOf(bytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(bytes)]);
}

/** Records every range the parser asks for, to prove it never reads a camera file whole. */
class RecordingBlob extends Blob {
  readonly ranges: Array<readonly [number, number]> = [];

  override slice(start?: number, end?: number, contentType?: string): Blob {
    this.ranges.push([start ?? 0, Math.min(end ?? this.size, this.size)]);
    return super.slice(start, end, contentType);
  }

  bytesRead(): number {
    return this.ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
  }
}

/** Where the TIFF block starts in a fixture with orientation: SOI, APP1 header, `Exif\0\0`. */
const TIFF_AT = 12;

function indexOfMarker(bytes: Uint8Array, marker: number): number {
  const at = bytes.findIndex((byte, index) => byte === 0xff && bytes[index + 1] === marker);
  if (at < 0) throw new Error(`no marker ${marker.toString(16)}`);
  return at;
}

describe("readImageHeader on synthetic files", () => {
  it.each([
    { progressive: false, label: "baseline" },
    { progressive: true, label: "progressive" },
  ])("reads a 12000x9000 $label JPEG", async ({ progressive }) => {
    const header = await readImageHeader(
      blobOf(jpegBytes({ width: 12000, height: 9000, progressive })),
    );
    expect(header).toEqual({ format: "jpeg", width: 12000, height: 9000, orientation: 1 });
  });

  it.each(
    [1, 3, 6].flatMap((orientation) => [
      { orientation, byteOrder: "II" as const },
      { orientation, byteOrder: "MM" as const },
    ]),
  )("reads EXIF orientation $orientation ($byteOrder)", async ({ orientation, byteOrder }) => {
    const header = await readImageHeader(
      blobOf(jpegBytes({ width: 4032, height: 3024, orientation, byteOrder })),
    );
    expect(header).toEqual({ format: "jpeg", width: 4032, height: 3024, orientation });
  });

  it("walks segment lengths past ~200 KB of APPn before the SOF", async () => {
    const bytes = jpegBytes({ width: 12000, height: 9000, orientation: 6, padBeforeSof: 200_000 });
    const blob = new RecordingBlob([Uint8Array.from(bytes)]);
    const header = await readImageHeader(blob);
    expect(header).toEqual({ format: "jpeg", width: 12000, height: 9000, orientation: 6 });
    expect(blob.bytesRead()).toBeLessThan(100_000);
  });

  it("reads a PNG", async () => {
    expect(await readImageHeader(blobOf(pngBytes({ width: 640, height: 480 })))).toEqual({
      format: "png",
      width: 640,
      height: 480,
      orientation: 1,
    });
  });

  it.each(["VP8", "VP8L", "VP8X"] as const)("reads a %s WebP", async (kind) => {
    expect(await readImageHeader(blobOf(webpBytes({ width: 1234, height: 987, kind })))).toEqual({
      format: "webp",
      width: 1234,
      height: 987,
      orientation: 1,
    });
  });

  it("reads a VP8X canvas wider than the 14-bit VP8 limit", async () => {
    const bytes = webpBytes({ width: 20000, height: 300, kind: "VP8X" });
    expect(await readImageHeader(blobOf(bytes))).toMatchObject({ width: 20000, height: 300 });
  });

  it.each([
    { label: "inside the EXIF block", end: () => 20 },
    { label: "inside the SOF", end: (bytes: Uint8Array) => indexOfMarker(bytes, 0xc0) + 6 },
  ])("returns null for a JPEG truncated $label", async ({ end }) => {
    const bytes = jpegBytes({ width: 4032, height: 3024, orientation: 6 });
    expect(await readImageHeader(blobOf(bytes.subarray(0, end(bytes))))).toBeNull();
  });

  it("returns null when the scan starts before any SOF", async () => {
    const dht = [0xff, 0xc4, 0x00, 0x14, 0x00, 1, ...new Array<number>(16).fill(0)];
    const sos = [0xff, 0xda, 0x00, 0x08, 1, 1, 0x00, 0, 63, 0];
    const bytes = Uint8Array.from([0xff, 0xd8, ...dht, ...sos, 0x12, 0x34, 0xff, 0xd9]);
    expect(await readImageHeader(blobOf(bytes))).toBeNull();
  });

  it("returns null when a SOF reports a zero height (DNL)", async () => {
    expect(await readImageHeader(blobOf(jpegBytes({ width: 4032, height: 0 })))).toBeNull();
  });

  it("reads DAC, DHT and JPG markers as ordinary segments, not frames", async () => {
    const sof = jpegBytes({ width: 800, height: 600 }).subarray(2);
    const body = [0x00, 0x09, 0, 0, 0, 1, 2, 3, 4];
    const decoys = [0xc4, 0xc8, 0xcc].flatMap((marker) => [0xff, marker, ...body]);
    const bytes = Uint8Array.from([0xff, 0xd8, ...decoys, 0xff, 0xff, 0xff, ...sof]);
    expect(await readImageHeader(blobOf(bytes))).toMatchObject({ width: 800, height: 600 });
  });

  it.each([
    { label: "an unknown byte order", patch: [[0, 0x58]] },
    { label: "a wrong TIFF magic", patch: [[3, 0x2b]] },
    { label: "an IFD offset past the block", patch: [[7, 0x7f]] },
    {
      label: "an entry count past the block and no orientation tag",
      patch: [
        [9, 0x7f],
        [10, 0x13],
      ],
    },
    { label: "a LONG orientation", patch: [[12, 4]] },
    { label: "orientation 9", patch: [[18, 9]] },
    { label: "orientation 0", patch: [[18, 0]] },
  ])("keeps the size and reads orientation 1 from EXIF with $label", async ({ patch }) => {
    const bytes = jpegBytes({ width: 4032, height: 3024, orientation: 6, byteOrder: "II" });
    for (const [at, value] of patch) bytes[TIFF_AT + (at ?? 0)] = value ?? 0;
    expect(await readImageHeader(blobOf(bytes))).toEqual({
      format: "jpeg",
      width: 4032,
      height: 3024,
      orientation: 1,
    });
  });

  it("returns null for a HEIC file", async () => {
    const heic = new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0mif1heic");
    expect(await readImageHeader(blobOf(heic))).toBeNull();
  });

  it("returns null for an empty blob", async () => {
    expect(await readImageHeader(new Blob([]))).toBeNull();
  });

  it("returns null when reading the blob throws", async () => {
    class BrokenBlob extends Blob {
      override slice(): Blob {
        throw new Error("file gone");
      }
    }
    expect(await readImageHeader(new BrokenBlob([Uint8Array.from([0xff, 0xd8, 0xff])]))).toBeNull();
  });

  it("reads a few kilobytes of a 30 MB file, not the file", async () => {
    const head = jpegBytes({ width: 12000, height: 9000, orientation: 6 });
    const blob = new RecordingBlob([Uint8Array.from(head), new Uint8Array(30 * 1024 * 1024)]);
    expect(await readImageHeader(blob)).toMatchObject({ width: 12000, height: 9000 });
    expect(blob.bytesRead()).toBeLessThanOrEqual(64 * 1024);
  });
});

describe("readImageHeader against sharp's encoder", () => {
  async function expectAgreement(encoded: Buffer, format: ImageHeader["format"]) {
    const meta = await sharp(encoded).metadata();
    expect(await readImageHeader(blobOf(encoded))).toEqual({
      format,
      width: meta.width,
      height: meta.height,
      orientation: meta.orientation ?? 1,
    });
  }

  const base = () =>
    sharp({ create: { width: 4032, height: 3024, channels: 3, background: "#7a5" } });

  it("reads an iPhone-shaped portrait JPEG (4032x3024, orientation 6)", async () => {
    const jpeg = await base().jpeg().withMetadata({ orientation: 6 }).toBuffer();
    await expectAgreement(jpeg, "jpeg");
  });

  it("reads a progressive JPEG", async () => {
    await expectAgreement(await base().jpeg({ progressive: true }).toBuffer(), "jpeg");
  });

  it("reads a 12000x9000 JPEG", async () => {
    const jpeg = await sharp({
      create: { width: 12000, height: 9000, channels: 3, background: "#333" },
    })
      .jpeg()
      .withMetadata({ orientation: 8 })
      .toBuffer();
    await expectAgreement(jpeg, "jpeg");
  });

  it("reads a PNG", async () => {
    await expectAgreement(await base().png().toBuffer(), "png");
  });

  it.each([
    { label: "lossy (VP8)", options: { lossless: false }, channels: 3 as const },
    { label: "lossless (VP8L)", options: { lossless: true }, channels: 3 as const },
    { label: "lossy with alpha (VP8X)", options: { lossless: false }, channels: 4 as const },
  ])("reads a $label WebP", async ({ options, channels }) => {
    const webp = await sharp({
      create: { width: 1500, height: 1001, channels, background: { r: 1, g: 2, b: 3, alpha: 0.5 } },
    })
      .webp(options)
      .toBuffer();
    await expectAgreement(webp, "webp");
  });
});

describe("orientedSize", () => {
  it.each([1, 2, 3, 4] as const)("keeps the stored size for orientation %i", (orientation) => {
    expect(orientedSize({ format: "jpeg", width: 4032, height: 3024, orientation })).toEqual({
      width: 4032,
      height: 3024,
    });
  });

  it.each([5, 6, 7, 8] as const)("swaps width and height for orientation %i", (orientation) => {
    expect(orientedSize({ format: "jpeg", width: 4032, height: 3024, orientation })).toEqual({
      width: 3024,
      height: 4032,
    });
  });
});
