import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareUploadedPhoto } from "./prepare-uploaded-photo";
import { sniffImageType } from "./sniff";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } });

/**
 * K-Q2 (Oleksii): "re-encode strips ALL metadata (EXIF GPS especially …);
 * test with a GPS-tagged fixture". The fixture is made here, in the test, so
 * the tags it carries are readable on the page: an IFD0 description, a GPS
 * IFD (IFD3) with a position and a map datum, an XMP packet, and an IPTC
 * caption, each with a value that appears nowhere else.
 */
const CANARY = {
  description: "CANARY-IFD0-DESCRIPTION",
  gps: "CANARY-GPS-DATUM",
  xmp: "CANARY-XMP-TITLE",
  iptc: "CANARY-IPTC-CAPTION",
} as const;

const XMP = [
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
  '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
  '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
  `<dc:title>${CANARY.xmp}</dc:title>`,
  "</rdf:Description></rdf:RDF></x:xmpmeta>",
  '<?xpacket end="w"?>',
].join("");

/**
 * An IPTC block as a JPEG carries it: an APP13 "Photoshop 3.0" segment
 * holding one 8BIM resource (0x0404, IPTC-NAA) with a record version and a
 * caption (dataset 2:120). sharp can read IPTC but has no way to write it, so
 * the segment is built by hand and spliced in after the SOI marker.
 */
function iptcSegment(caption: string): Buffer {
  const text = Buffer.from(caption, "latin1");
  const iptc = Buffer.concat([
    Buffer.from([0x1c, 0x02, 0x00, 0x00, 0x02, 0x00, 0x04]),
    Buffer.from([0x1c, 0x02, 0x78, text.length >> 8, text.length & 0xff]),
    text,
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(iptc.length);
  const resource = Buffer.concat([
    Buffer.from("8BIM", "latin1"),
    Buffer.from([0x04, 0x04, 0x00, 0x00]),
    size,
    iptc,
    Buffer.alloc(iptc.length % 2),
  ]);
  const body = Buffer.concat([Buffer.from("Photoshop 3.0\0", "latin1"), resource]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(body.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xed]), length, body]);
}

async function gpsTaggedJpeg(): Promise<Buffer> {
  const jpeg = await solid(1200, 900)
    .jpeg()
    .withExif({
      IFD0: { ImageDescription: CANARY.description },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "50/1 27/1 1234/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "30/1 31/1 5678/100",
        GPSMapDatum: CANARY.gps,
      },
    })
    .withXmp(XMP)
    .toBuffer();
  return Buffer.concat([jpeg.subarray(0, 2), iptcSegment(CANARY.iptc), jpeg.subarray(2)]);
}

describe("prepareUploadedPhoto strips every piece of metadata (K-Q2)", () => {
  it("precondition: the fixture really carries the GPS, IFD0, XMP and IPTC canaries", async () => {
    const meta = await sharp(await gpsTaggedJpeg()).metadata();
    expect(meta.exif?.includes(CANARY.description)).toBe(true);
    expect(meta.exif?.includes(CANARY.gps)).toBe(true);
    expect(meta.xmp?.includes(CANARY.xmp)).toBe(true);
    expect(meta.iptc?.includes(CANARY.iptc)).toBe(true);
  });

  /**
   * One comparison per variant, format included, so a failure lists every
   * block that survived. WebP, the stored format, has no IPTC container in
   * libvips's writer (even `keepMetadata()` drops it there), so today the
   * format is what keeps IPTC out; the `iptc` field and its canary are what
   * still hold if the stored format ever changes to one that carries it.
   */
  it("no variant carries EXIF, XMP or IPTC, and no canary survives in any byte", async () => {
    const prepared = await prepareUploadedPhoto(await gpsTaggedJpeg());
    if (prepared.kind !== "ok") throw new Error(`refused: ${prepared.reason}`);
    expect(Object.keys(prepared.variants).sort()).toEqual(["card", "detail", "thumb"]);
    for (const [name, bytes] of Object.entries(prepared.variants)) {
      const meta = await sharp(bytes).metadata();
      expect(
        {
          format: meta.format,
          exif: meta.exif !== undefined,
          xmp: meta.xmp !== undefined,
          iptc: meta.iptc !== undefined,
        },
        name,
      ).toEqual({ format: "webp", exif: false, xmp: false, iptc: false });
      for (const canary of Object.values(CANARY)) {
        expect(bytes.includes(canary), `${name} still holds ${canary}`).toBe(false);
      }
    }
  });

  it("reports the photo's own displayed size, not a variant's", async () => {
    expect(await prepareUploadedPhoto(await gpsTaggedJpeg())).toMatchObject({
      kind: "ok",
      width: 1200,
      height: 900,
    });
  });

  it("swaps width and height for a 90°-rotated source, as displayed", async () => {
    const rotated = await solid(1200, 900).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await prepareUploadedPhoto(rotated)).toMatchObject({
      kind: "ok",
      width: 900,
      height: 1200,
    });
  });
});

const ascii = (text: string) => Buffer.from(text, "latin1");

describe("magic-byte sniffing (P-Q6)", () => {
  it.each([
    ["JPEG", () => solid(40, 30).jpeg().toBuffer(), "jpeg"],
    ["PNG", () => solid(40, 30).png().toBuffer(), "png"],
    ["WebP", () => solid(40, 30).webp().toBuffer(), "webp"],
  ] as const)("accepts %s by its bytes", async (_label, make, sniffed) => {
    const bytes = await make();
    expect(sniffImageType(bytes)).toBe(sniffed);
    expect((await prepareUploadedPhoto(bytes)).kind).toBe("ok");
  });

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>';
  it.each([
    ["GIF", async () => solid(40, 30).gif().toBuffer()],
    ["SVG (which sharp could otherwise render)", async () => ascii(svg)],
    [
      "HEIC (an ftyp box)",
      async () =>
        Buffer.concat([Buffer.from([0, 0, 0, 0x18]), ascii("ftypheicmif1heic"), Buffer.alloc(8)]),
    ],
    ["PDF", async () => ascii("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n")],
    ["plain text", async () => ascii("just some text, not a photo")],
    ["an empty file", async () => Buffer.alloc(0)],
    [
      "RIFF that isn't WebP (a WAV header)",
      async () => Buffer.concat([ascii("RIFF"), Buffer.from([0x24, 0, 0, 0]), ascii("WAVEfmt ")]),
    ],
  ])("refuses %s as unsupported_type", async (_label, make) => {
    const bytes = await make();
    expect(sniffImageType(bytes)).toBeNull();
    expect(await prepareUploadedPhoto(bytes)).toEqual({
      kind: "rejected",
      reason: "unsupported_type",
    });
  });
});

describe("the 2000 px ceiling (P-Q5)", () => {
  it.each([
    ["2000 wide", 2000, 10],
    ["2000 tall", 10, 2000],
  ])("accepts %s", async (_label, width, height) => {
    const bytes = await solid(width, height).png().toBuffer();
    expect((await prepareUploadedPhoto(bytes)).kind).toBe("ok");
  });

  it.each([
    ["2001 wide", 2001, 10],
    ["2001 tall", 10, 2001],
  ])("refuses %s", async (_label, width, height) => {
    const bytes = await solid(width, height).png().toBuffer();
    expect(await prepareUploadedPhoto(bytes)).toEqual({
      kind: "rejected",
      reason: "dimensions_exceeded",
    });
  });
});

/**
 * A decompression bomb: a PNG whose header claims 50,000 × 50,000 pixels
 * (2.5 billion, ~7.5 GB decoded) around a few bytes of garbage pixel data.
 * Built by hand so the header can lie. Refused as `dimensions_exceeded`, which
 * only the header read can produce: had the pixels been decoded, the garbage
 * would have failed as `unreadable` instead (or exhausted memory first).
 */
function pngClaiming(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([ascii(type), data]);
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

describe("a pixel bomb is refused from its header, without decoding", () => {
  it("precondition: the header really claims 50,000 × 50,000", async () => {
    const meta = await sharp(pngClaiming(50_000, 50_000), { limitInputPixels: false }).metadata();
    expect([meta.width, meta.height]).toEqual([50_000, 50_000]);
  });

  it("is dimensions_exceeded, quickly", async () => {
    const started = performance.now();
    expect(await prepareUploadedPhoto(pngClaiming(50_000, 50_000))).toEqual({
      kind: "rejected",
      reason: "dimensions_exceeded",
    });
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("the same garbage under a small header is unreadable, so the bomb's answer came from its header", async () => {
    expect(await prepareUploadedPhoto(pngClaiming(100, 100))).toEqual({
      kind: "rejected",
      reason: "unreadable",
    });
  });
});

describe("unreadable files", () => {
  it("JPEG magic followed by junk", async () => {
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), ascii("not really")]);
    expect(await prepareUploadedPhoto(junk)).toEqual({ kind: "rejected", reason: "unreadable" });
  });

  it("a real JPEG cut off halfway through its pixel data", async () => {
    const whole = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .jpeg()
      .toBuffer();
    const cut = whole.subarray(0, Math.floor(whole.length / 2));
    expect(await prepareUploadedPhoto(cut)).toEqual({ kind: "rejected", reason: "unreadable" });
  });
});
