// Test support: header-only synthetic image files, built to be parsed, never decoded.

function u16be(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u24le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function segment(marker: number, payload: readonly number[]): number[] {
  return [0xff, marker, ...u16be(payload.length + 2), ...payload];
}

/** APP1 Exif whose IFD0 holds only the orientation tag (0x0112, SHORT, count 1). */
function exifSegment(orientation: number, byteOrder: "II" | "MM"): number[] {
  const u16 = byteOrder === "II" ? u16le : u16be;
  const u32 = byteOrder === "II" ? u32le : u32be;
  const tiff = [
    ...ascii(byteOrder),
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
  ];
  return segment(0xe1, [...ascii("Exif"), 0, 0, ...tiff]);
}

const MAX_SEGMENT_PAYLOAD = 65533;

export function jpegBytes(opts: {
  width: number;
  height: number;
  orientation?: number;
  progressive?: boolean;
  /** extra APPn bytes before SOF, e.g. a big ICC/MPF block, split into <=65533-byte segments */
  padBeforeSof?: number;
  byteOrder?: "II" | "MM";
}): Uint8Array {
  const head: number[] = [0xff, 0xd8];
  if (opts.orientation !== undefined) {
    head.push(...exifSegment(opts.orientation, opts.byteOrder ?? "II"));
  }
  const padding: Uint8Array[] = [];
  for (let left = opts.padBeforeSof ?? 0; left > 0; left -= MAX_SEGMENT_PAYLOAD) {
    const size = Math.min(left, MAX_SEGMENT_PAYLOAD);
    const app2 = new Uint8Array(size + 4);
    app2.set([0xff, 0xe2, ...u16be(size + 2)]);
    padding.push(app2);
  }
  const sof = segment(opts.progressive ? 0xc2 : 0xc0, [
    8,
    ...u16be(opts.height),
    ...u16be(opts.width),
    3,
    ...[1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
  ]);
  // One Huffman code of length 1 for symbol 0; enough to look like a real table.
  const dht = segment(0xc4, [0x00, 1, ...new Array<number>(15).fill(0), 0]);
  const sos = segment(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
  const tail = [...sof, ...dht, ...sos, 0x00, 0x00, 0xff, 0xd9];

  const parts = [Uint8Array.from(head), ...padding, Uint8Array.from(tail)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function pngBytes(opts: { width: number; height: number }): Uint8Array {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32be(13),
    ...ascii("IHDR"),
    ...u32be(opts.width),
    ...u32be(opts.height),
    8,
    2,
    0,
    0,
    0,
    ...u32be(0),
    ...u32be(0),
    ...ascii("IEND"),
    ...u32be(0),
  ]);
}

function riffChunk(fourcc: string, data: readonly number[]): number[] {
  const padded = data.length % 2 === 1 ? [...data, 0] : data;
  return [...ascii(fourcc), ...u32le(data.length), ...padded];
}

function vp8Chunk(width: number, height: number): number[] {
  return riffChunk("VP8 ", [
    // Frame tag: key frame, version 0, shown; the partition size is irrelevant here.
    0x10,
    0x00,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...u16le(width & 0x3fff),
    ...u16le(height & 0x3fff),
    0,
    0,
  ]);
}

export function webpBytes(opts: {
  width: number;
  height: number;
  kind: "VP8" | "VP8L" | "VP8X";
}): Uint8Array {
  let chunks: number[];
  if (opts.kind === "VP8") {
    chunks = vp8Chunk(opts.width, opts.height);
  } else if (opts.kind === "VP8L") {
    const bits = ((opts.width - 1) & 0x3fff) | (((opts.height - 1) & 0x3fff) << 14);
    chunks = riffChunk("VP8L", [0x2f, ...u32le(bits >>> 0), 0]);
  } else {
    chunks = [
      ...riffChunk("VP8X", [0, 0, 0, 0, ...u24le(opts.width - 1), ...u24le(opts.height - 1)]),
      ...vp8Chunk(opts.width, opts.height),
    ];
  }
  return Uint8Array.from([
    ...ascii("RIFF"),
    ...u32le(chunks.length + 4),
    ...ascii("WEBP"),
    ...chunks,
  ]);
}
