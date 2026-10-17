/**
 * The three formats the registry accepts from an upload (P-Q6), named as
 * sharp's `metadata().format` names them, so the decoder's reading can be
 * compared with the bytes' claim directly.
 */
export type SniffedImageType = "jpeg" | "png" | "webp";

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, i) => bytes[offset + i] === byte);

const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50] as const; // "WEBP", at offset 8

/**
 * What a file is, by its first bytes, never by its name or the type the
 * browser declared: both are chosen by whoever sends the request. Anything
 * else (GIF, SVG, HEIC, PDF, text) is null, refused before sharp sees it, so
 * the decoders sharp would otherwise reach for (SVG's renderer, HEIF, PDF)
 * are never run on an upload at all.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, JPEG)) return "jpeg";
  if (startsWith(bytes, PNG)) return "png";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "webp";
  return null;
}
