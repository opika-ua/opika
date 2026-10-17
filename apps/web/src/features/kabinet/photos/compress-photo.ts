import { PHOTO_UPLOAD_MAX_FILE_BYTES } from "@opika/contracts";
import { PHOTO_MAX_EDGE_PX } from "@opika/domain";

/**
 * Device-side compression before an upload (K-Q2, Oleksii: "browser-side
 * compression to 2000 px is mandatory"). A phone photo is routinely 4000 px
 * and 5–12 MB; the server refuses anything over 2000 px or over the body
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
 * JPEG; a HEIC it can't decode is `heic_unsupported`, which the screen (PR 4)
 * turns into that message. Its copy key ships with the K3 sheet, so no string
 * lives here.
 */

export type CompressedPhoto =
  | { kind: "ok"; file: Blob; width: number; height: number }
  /** A HEIC/HEIF file this browser can't decode: ask for a JPG. */
  | { kind: "heic_unsupported" }
  /** Anything else the browser can't decode as an image. */
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
 * sharp photo of roughly 0.5–1.5 MB, well under the limit, so the later
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
 * Whether a file is HEIC/HEIF, by its `ftyp` box (bytes 4–11) or, failing
 * that, by the type or name the system gave it. Only used to choose which
 * refusal to show when decoding fails, so a false answer costs a less
 * specific message, never a wrong upload.
 */
export function isHeif(file: { type: string; name?: string }, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head.length >= 12 && ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return true;
  if (/^image\/hei[cf]/i.test(file.type)) return true;
  return /\.hei[cf]$/i.test(file.name ?? "");
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
  if (decoded === null)
    return isHeif(file, head) ? { kind: "heic_unsupported" } : { kind: "unreadable" };
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
