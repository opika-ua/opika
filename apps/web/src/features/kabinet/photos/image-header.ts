// An image's stored size and EXIF orientation from its first bytes, so a 50-200 MP photo can be
// decoded already downscaled. Uses only what iOS 16 WebKit has: Blob.slice/arrayBuffer, DataView.

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** What the first bytes say about a JPEG, PNG or WebP, read without decoding a pixel. */
export interface ImageHeader {
  readonly format: "jpeg" | "png" | "webp";
  /** As stored, before EXIF orientation. */
  readonly width: number;
  readonly height: number;
  /** 1 when there is no EXIF orientation (always 1 for PNG and WebP). */
  readonly orientation: ExifOrientation;
}

/** Bytes fetched per read; most JPEGs have their SOF inside the first one. */
const READ_WINDOW = 16 * 1024;
/** Past these a JPEG is treated as unreadable and the caller falls back. */
const MAX_JPEG_SEGMENTS = 64;
const MAX_JPEG_SCAN = 4 * 1024 * 1024;

type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

/** Bytes from `offset` on: at least `length` of them unless the file ends first. */
function windowedReader(file: Blob): ReadAt {
  let cacheStart = 0;
  let cache = new Uint8Array(0);
  return async (offset, length) => {
    if (offset >= cacheStart && offset + length <= cacheStart + cache.length) {
      return cache.subarray(offset - cacheStart);
    }
    const end = Math.min(file.size, offset + Math.max(length, READ_WINDOW));
    cache = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    cacheStart = offset;
    return cache;
  };
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function startsWith(bytes: Uint8Array, at: number, expected: readonly number[]): boolean {
  if (bytes.length < at + expected.length) return false;
  return expected.every((value, index) => bytes[at + index] === value);
}

function fourcc(bytes: Uint8Array, at: number, text: string): boolean {
  return startsWith(
    bytes,
    at,
    Array.from(text, (char) => char.charCodeAt(0)),
  );
}

function isOrientation(value: number): value is ExifOrientation {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

function sized(
  format: ImageHeader["format"],
  width: number,
  height: number,
  orientation: ExifOrientation = 1,
): ImageHeader | null {
  return width > 0 && height > 0 ? { format, width, height, orientation } : null;
}

/** IFD0's orientation in a TIFF block; anything malformed reads as 1, never a throw. */
function exifOrientation(tiff: Uint8Array): ExifOrientation {
  if (tiff.length < 8) return 1;
  const view = viewOf(tiff);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return 1;
  const little = order === 0x4949;
  if (view.getUint16(2, little) !== 42) return 1;
  const ifd = view.getUint32(4, little);
  if (ifd < 8 || ifd + 2 > tiff.length) return 1;
  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > tiff.length) return 1;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (view.getUint16(entry + 2, little) !== 3) return 1;
    const value = view.getUint16(entry + 8, little);
    return isOrientation(value) ? value : 1;
  }
  return 1;
}

// SOFn, minus C4 (DHT), C8 (JPG) and CC (DAC), which share the range.
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

async function readJpeg(read: ReadAt): Promise<ImageHeader | null> {
  let offset = 2;
  let orientation: ExifOrientation = 1;
  let exifSeen = false;
  let segments = 0;
  while (segments < MAX_JPEG_SEGMENTS && offset < MAX_JPEG_SCAN) {
    const head = await read(offset, 2);
    if (head.length < 2 || head[0] !== 0xff) return null;
    let fill = 1;
    while (fill < head.length && head[fill] === 0xff) fill++;
    if (fill === head.length) {
      // A run of fill bytes past this window: resume from its last 0xFF.
      offset += fill - 1;
      continue;
    }
    const markerAt = offset + fill;
    const marker = head[fill] ?? 0;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = markerAt + 1;
      continue;
    }
    segments++;
    // SOS or EOI before any SOF, or a byte that is no marker at all.
    if (marker === 0xda || marker === 0xd9 || marker === 0xd8 || marker === 0x00) return null;
    const lengthBytes = await read(markerAt + 1, 2);
    if (lengthBytes.length < 2) return null;
    const length = viewOf(lengthBytes).getUint16(0);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      const sof = await read(markerAt + 1, 7);
      if (sof.length < 7) return null;
      const view = viewOf(sof);
      return sized("jpeg", view.getUint16(5), view.getUint16(3), orientation);
    }
    if (marker === 0xe1 && !exifSeen && length >= 2 + EXIF_ID.length) {
      const payload = (await read(markerAt + 3, length - 2)).subarray(0, length - 2);
      if (startsWith(payload, 0, EXIF_ID)) {
        exifSeen = true;
        orientation = exifOrientation(payload.subarray(EXIF_ID.length));
      }
    }
    offset = markerAt + 1 + length;
  }
  return null;
}

function readPng(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 24 || !fourcc(bytes, 12, "IHDR")) return null;
  const view = viewOf(bytes);
  return sized("png", view.getUint32(16), view.getUint32(20));
}

function readWebp(bytes: Uint8Array): ImageHeader | null {
  const view = viewOf(bytes);
  if (fourcc(bytes, 12, "VP8 ")) {
    if (bytes.length < 30 || !startsWith(bytes, 23, [0x9d, 0x01, 0x2a])) return null;
    return sized("webp", view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (fourcc(bytes, 12, "VP8L")) {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return sized("webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (fourcc(bytes, 12, "VP8X")) {
    if (bytes.length < 30) return null;
    const u24 = (at: number) => view.getUint16(at, true) + ((bytes[at + 2] ?? 0) << 16);
    return sized("webp", u24(24) + 1, u24(27) + 1);
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The header of a JPEG, PNG or WebP, or null when it can't be read. Reads only the bytes it needs. */
export async function readImageHeader(file: Blob): Promise<ImageHeader | null> {
  try {
    const read = windowedReader(file);
    const start = await read(0, 32);
    if (startsWith(start, 0, [0xff, 0xd8, 0xff])) return await readJpeg(read);
    if (startsWith(start, 0, PNG_SIGNATURE)) return readPng(start);
    if (fourcc(start, 0, "RIFF") && fourcc(start, 8, "WEBP")) return readWebp(start);
    return null;
  } catch {
    return null;
  }
}

/** The size the image displays at: width and height swapped for orientations 5-8. */
export function orientedSize(header: ImageHeader): { width: number; height: number } {
  return header.orientation >= 5
    ? { width: header.height, height: header.width }
    : { width: header.width, height: header.height };
}
