import { PHOTO_UPLOAD_MAX_FILE_BYTES } from "@opika/contracts";
import { PHOTO_MAX_EDGE_PX } from "@opika/domain";

/**
 * Device-side compression before an upload (K-Q2, Oleksii: "browser-side
 * compression to 2000 px is mandatory"). A phone photo is routinely 4000 px
 * and 5-12 MB; the server refuses anything over 2000 px or over the body
 * ceiling rather than shrinking it, so the device does the shrinking, once,
 * where the bytes are.
 *
 * Every photo is re-encoded, even one already small enough: the canvas
 * writes a JPEG with no EXIF, so a photo's location leaves the phone already
 * stripped (the server strips it again regardless, P-Q5).
 *
 * HEIC (P-Q6, Oleksii: "the browser accepts HEIC where it can decode it and
 * uploads JPEG/WebP; where it can't decode it (e.g. Chrome on Windows), show a
 * clear error asking for JPG"): whatever the browser can decode becomes a
 * JPEG; a HEIC (or any other format) it can't decode is `unsupported_format`,
 * which the screen turns into «Збережіть фото як JPEG або PNG» (gap 9). The
 * server can't convert it instead: prebuilt sharp has no HEVC decoder.
 */

export type CompressedPhoto =
  | { kind: "ok"; file: Blob; width: number; height: number }
  /** A HEIC/HEIF (or other non-JPEG/PNG/WebP) file this browser can't decode. */
  | { kind: "unsupported_format" }
  /** A JPEG, PNG or WebP by its bytes that still won't decode: a broken file. */
  | { kind: "unreadable" }
  /** Still over the byte limit at the lowest quality tried (not expected at 2000 px). */
  | { kind: "too_large" };

/** A decoded image, already turned the way it displays (EXIF orientation applied). */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** Draws the image at `width` × `height` and encodes it as JPEG. */
  encodeJpeg(width: number, height: number, quality: number): Promise<Blob>;
  close(): void;
}

/** What compression needs from the browser, injected so the logic is testable without a canvas. */
export interface CompressionPlatform {
  /** The decoded image, or null when this browser can't decode the file. */
  decode(file: Blob): Promise<DecodedImage | null>;
}

/**
 * Tried in order until the JPEG fits. 0.86 first: at 2000 px that is a
 * sharp photo of roughly 0.5-1.5 MB, well under the limit, so the later
 * steps exist only for unusually detailed images.
 */
export const JPEG_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.6, 0.5] as const;

/**
 * The size to draw at: the longest side at most `maxEdge`, aspect kept,
 * never enlarged, whole pixels, never zero.
 */
export function scaledSize(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.min(maxEdge, Math.round(width * scale))),
    height: Math.max(1, Math.min(maxEdge, Math.round(height * scale))),
  };
}

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/**
 * Whether a file is HEIC/HEIF, by its `ftyp` box (bytes 4-11) or, failing
 * that, by the type or name the system gave it (case-insensitive; Windows and
 * some iOS paths send an empty type). Only used to choose which refusal to show
 * when decoding fails, so a false answer never causes a wrong upload.
 */
export function isHeif(file: { type: string; name?: string }, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head.length >= 12 && ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return true;
  if (/^image\/hei[cf]/i.test(file.type)) return true;
  return /\.hei[cf]$/i.test(file.name ?? "");
}

const startsWith = (head: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  head.length >= offset + signature.length &&
  signature.every((byte, i) => head[offset + i] === byte);

const bytesOf = (ascii: string) => Array.from(ascii, (char) => char.charCodeAt(0));

/**
 * Why a file the browser couldn't decode is refused. Only a file whose bytes
 * say JPEG, PNG or WebP (the formats the server takes) is a broken file;
 * anything else (HEIC, TIFF, PDF, no bytes at all) is a format to save differently.
 */
export function undecodableRefusal(
  file: { type: string; name?: string },
  head: Uint8Array,
): "unsupported_format" | "unreadable" {
  if (isHeif(file, head)) return "unsupported_format";
  const accepted =
    startsWith(head, [0xff, 0xd8, 0xff]) ||
    startsWith(head, [0x89, ...bytesOf("PNG"), 0x0d, 0x0a, 0x1a, 0x0a]) ||
    (startsWith(head, bytesOf("RIFF")) && startsWith(head, bytesOf("WEBP"), 8));
  return accepted ? "unreadable" : "unsupported_format";
}

export async function compressPhoto(
  file: File,
  platform: CompressionPlatform = browserPlatform(),
  maxBytes: number = PHOTO_UPLOAD_MAX_FILE_BYTES,
): Promise<CompressedPhoto> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  let decoded: DecodedImage | null;
  try {
    decoded = await platform.decode(file);
  } catch {
    decoded = null;
  }
  if (decoded === null) return { kind: undecodableRefusal(file, head) };
  try {
    const size = scaledSize(decoded.width, decoded.height);
    for (const quality of JPEG_QUALITY_STEPS) {
      const jpeg = await decoded.encodeJpeg(size.width, size.height, quality);
      if (jpeg.size <= maxBytes) return { kind: "ok", file: jpeg, ...size };
    }
    return { kind: "too_large" };
  } finally {
    decoded.close();
  }
}

/**
 * The browser's own decoder and canvas: `createImageBitmap` with
 * `imageOrientation: "from-image"` (so a portrait phone photo isn't drawn
 * sideways), drawn on an `OffscreenCanvas` where there is one, a `<canvas>`
 * otherwise. Not unit-tested (happy-dom has no canvas); the logic above it is,
 * through a fake platform.
 */
export function browserPlatform(): CompressionPlatform {
  return {
    async decode(file) {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        return null;
      }
      return {
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
        async encodeJpeg(width, height, quality) {
          if (typeof OffscreenCanvas !== "undefined") {
            const canvas = new OffscreenCanvas(width, height);
            const context = canvas.getContext("2d");
            if (context === null) throw new Error("No 2D canvas context");
            context.drawImage(bitmap, 0, 0, width, height);
            return canvas.convertToBlob({ type: "image/jpeg", quality });
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("No 2D canvas context");
          context.drawImage(bitmap, 0, 0, width, height);
          return new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) =>
                blob === null ? reject(new Error("Canvas produced no JPEG")) : resolve(blob),
              "image/jpeg",
              quality,
            ),
          );
        },
      };
    },
  };
}
