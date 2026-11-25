import { PHOTO_UPLOAD_MAX_FILE_BYTES } from "@opika/contracts";
import { PHOTO_MAX_EDGE_PX } from "@opika/domain";
import { type ImageHeader, orientedSize, readImageHeader } from "./image-header";

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
 *
 * Decoding and encoding each have fallback routes, because one route failed
 * every photo in the field: iOS 16 WebKit rejects `createImageBitmap`'s
 * options, and a 50-200 MP JPEG can run a phone out of memory at full size.
 * Only WebCodecs' `ImageDecoder` (Chromium) really decodes such a JPEG small.
 */

export type DecodeRoute = "image_decoder" | "bitmap_options" | "bitmap_plain" | "img_element";
export type EncodeRoute = "offscreen_canvas" | "html_canvas";
export type PhotoFailureStep = DecodeRoute | EncodeRoute;

/** What a refusal carries for the error report. Never the file name. */
export interface PhotoFailureDiagnostics {
  /** Every route tried, in order, with what each failed with: error name and message, at most 200 chars. */
  readonly attempts: readonly { readonly step: PhotoFailureStep; readonly error: string }[];
  /** `file.type` as given ("" possible). */
  readonly type: string;
  /** Bytes. */
  readonly size: number;
  readonly header: {
    readonly format: "jpeg" | "png" | "webp";
    readonly width: number;
    readonly height: number;
    readonly orientation: number;
  } | null;
  readonly decoded: { readonly width: number; readonly height: number } | null;
}

export type CompressedPhoto =
  | { kind: "ok"; file: Blob; width: number; height: number }
  /** A HEIC/HEIF (or other non-JPEG/PNG/WebP) file this browser can't decode. */
  | { kind: "unsupported_format"; diagnostics?: PhotoFailureDiagnostics }
  /** A JPEG, PNG or WebP by its bytes that still won't decode (or encode): a broken file. */
  | { kind: "unreadable"; diagnostics?: PhotoFailureDiagnostics }
  /** Still over the byte limit at the lowest quality tried (not expected at 2000 px). */
  | { kind: "too_large"; diagnostics?: PhotoFailureDiagnostics };

/** One dimension only, so the browser keeps the aspect ratio. */
export type BitmapResize = { resizeWidth: number } | { resizeHeight: number };

/** What `ImageDecoder` is asked for: the type by the file's bytes and a size in stored (pre-EXIF) orientation. */
export interface DecoderTarget {
  readonly mime: string;
  readonly desiredWidth: number;
  readonly desiredHeight: number;
}

/** A decoded image, already turned the way it displays (EXIF orientation applied). */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** Draws the image at `width` × `height` and encodes it as JPEG by `route`, or throws. */
  encodeJpeg(width: number, height: number, quality: number, route: EncodeRoute): Promise<Blob>;
  close(): void;
}

/** What compression needs from the browser, injected so the logic is testable without a canvas. */
export interface CompressionPlatform {
  /**
   * Decodes by one route or throws; never returns null. `resize` is a `BitmapResize`
   * only with "bitmap_options" and a `DecoderTarget` with "image_decoder".
   */
  decode(
    file: Blob,
    route: DecodeRoute,
    resize?: BitmapResize | DecoderTarget,
  ): Promise<DecodedImage>;
  /** Whether `ImageDecoder` exists and takes `mime`; left out, it counts as no. */
  imageDecoderSupported?(mime: string): Promise<boolean>;
}

/**
 * Tried in order until the JPEG fits. 0.86 first: at 2000 px that is a
 * sharp photo of roughly 0.5-1.5 MB, well under the limit, so the later
 * steps exist only for unusually detailed images.
 */
export const JPEG_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.6, 0.5] as const;

const ENCODE_ROUTES: readonly EncodeRoute[] = ["offscreen_canvas", "html_canvas"];
const ERROR_TEXT_MAX = 200;

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

async function headerOf(file: Blob): Promise<ImageHeader | null> {
  try {
    return await readImageHeader(file);
  } catch {
    return null;
  }
}

/**
 * One dimension only: a browser that resizes before applying EXIF then can't stretch the
 * photo, it just comes back up to ~2667 px and `scaledSize` takes it to 2000.
 */
function bitmapResize(header: ImageHeader | null): BitmapResize | undefined {
  if (header === null) return undefined;
  const { width, height } = orientedSize(header);
  if (Math.max(width, height) <= PHOTO_MAX_EDGE_PX) return undefined;
  return width >= height ? { resizeWidth: PHOTO_MAX_EDGE_PX } : { resizeHeight: PHOTO_MAX_EDGE_PX };
}

/**
 * Chromium's `ImageDecoder` scales a JPEG by a whole k/8, rounded down, so it
 * is asked for 2000 px plus an eighth of the photo: the k/8 it lands on is never under 2000.
 */
async function decoderTarget(
  header: ImageHeader | null,
  platform: CompressionPlatform,
): Promise<DecoderTarget | null> {
  if (header === null || platform.imageDecoderSupported === undefined) return null;
  const longest = Math.max(header.width, header.height);
  if (longest <= PHOTO_MAX_EDGE_PX) return null;
  const mime = `image/${header.format}`;
  try {
    if (!(await platform.imageDecoderSupported(mime))) return null;
  } catch {
    return null;
  }
  const desired = Math.min(longest, PHOTO_MAX_EDGE_PX + Math.ceil(longest / 8));
  const short = (side: number) => Math.max(1, Math.round((side * desired) / longest));
  return header.width >= header.height
    ? { mime, desiredWidth: desired, desiredHeight: short(header.height) }
    : { mime, desiredWidth: short(header.width), desiredHeight: desired };
}

/**
 * Without its options a bitmap may come back un-rotated, so only a photo known to be upright
 * tries `bitmap_plain`; a turned or unread one goes to `<img>`, which always applies EXIF.
 */
function decodeRoutes(header: ImageHeader | null, decoder: boolean): readonly DecodeRoute[] {
  const routes: DecodeRoute[] =
    header !== null && header.orientation === 1
      ? ["bitmap_options", "bitmap_plain", "img_element"]
      : ["bitmap_options", "img_element"];
  return decoder ? ["image_decoder", ...routes] : routes;
}

/** Portrait where the photo displays landscape, or the reverse; a square side says nothing. */
function turnedWrong(
  image: { width: number; height: number },
  shown: { width: number; height: number },
) {
  if (image.width === image.height || shown.width === shown.height) return false;
  return image.width > image.height !== shown.width > shown.height;
}

/** Name and message, capped, with the file name cut out: the text goes to the error report. */
function errorText(error: unknown, fileName: string): string {
  const text =
    typeof error === "object" && error !== null && "message" in error
      ? `${"name" in error ? String(error.name) : "Error"}: ${String(error.message)}`
      : String(error);
  const scrubbed = fileName === "" ? text : text.split(fileName).join("<file>");
  return scrubbed.slice(0, ERROR_TEXT_MAX);
}

export async function compressPhoto(
  file: File,
  platform: CompressionPlatform = browserPlatform(),
  maxBytes: number = PHOTO_UPLOAD_MAX_FILE_BYTES,
): Promise<CompressedPhoto> {
  const header = await headerOf(file);
  const attempts: { step: PhotoFailureStep; error: string }[] = [];
  const failed = (step: PhotoFailureStep, error: unknown) =>
    attempts.push({ step, error: errorText(error, file.name) });
  const diagnostics = (
    decoded: { width: number; height: number } | null,
  ): PhotoFailureDiagnostics => ({
    attempts,
    type: file.type,
    size: file.size,
    header: header && {
      format: header.format,
      width: header.width,
      height: header.height,
      orientation: header.orientation,
    },
    decoded,
  });

  const resize = bitmapResize(header);
  const target = await decoderTarget(header, platform);
  let decoded: DecodedImage | null = null;
  for (const route of decodeRoutes(header, target !== null)) {
    try {
      const image = await platform.decode(
        file,
        route,
        route === "bitmap_options"
          ? resize
          : route === "image_decoder" && target !== null
            ? target
            : undefined,
      );
      const empty = !(image.width >= 1 && image.height >= 1);
      // WebCodecs' EXIF handling is the newest here; a sideways frame falls through to the next route.
      const sideways =
        route === "image_decoder" && header !== null && turnedWrong(image, orientedSize(header));
      if (!empty && !sideways) {
        decoded = image;
        break;
      }
      image.close();
      throw new Error(
        `Decoded to ${image.width} × ${image.height}${sideways ? ", turned the wrong way" : ""}`,
      );
    } catch (error) {
      failed(route, error);
    }
  }
  if (decoded === null) {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    return { kind: undecodableRefusal(file, head), diagnostics: diagnostics(null) };
  }

  try {
    const size = scaledSize(decoded.width, decoded.height);
    const decodedSize = { width: decoded.width, height: decoded.height };
    // Routes before this index threw once and aren't tried again at a lower quality.
    let working = 0;
    for (const quality of JPEG_QUALITY_STEPS) {
      let jpeg: Blob | null = null;
      for (const route of ENCODE_ROUTES.slice(working)) {
        try {
          jpeg = await decoded.encodeJpeg(size.width, size.height, quality, route);
          break;
        } catch (error) {
          failed(route, error);
          working += 1;
        }
      }
      if (jpeg === null) return { kind: "unreadable", diagnostics: diagnostics(decodedSize) };
      if (jpeg.size <= maxBytes) return { kind: "ok", file: jpeg, ...size };
    }
    return { kind: "too_large", diagnostics: diagnostics(decodedSize) };
  } finally {
    decoded.close();
  }
}

/**
 * Not unit-tested (happy-dom has no canvas); the logic above is, through a fake platform.
 * Nothing here is newer than iOS 16 WebKit except the guarded `ImageDecoder`.
 */
export function browserPlatform(): CompressionPlatform {
  return {
    async imageDecoderSupported(mime) {
      return typeof ImageDecoder === "function" && (await ImageDecoder.isTypeSupported(mime));
    },
    decode(file, route, resize) {
      if (route === "img_element") return decodeWithImg(file);
      if (route === "image_decoder") {
        return decodeWithImageDecoder(
          file,
          resize !== undefined && "mime" in resize ? resize : undefined,
        );
      }
      return decodeWithBitmap(
        file,
        route,
        resize !== undefined && "mime" in resize ? undefined : resize,
      );
    },
  };
}

/**
 * The frame keeps the stored size (`visibleRect`) and carries EXIF as a
 * `rotation` lib.dom doesn't type yet; drawing it applies the turn, so a quarter
 * turn swaps the size it displays at.
 */
async function decodeWithImageDecoder(
  file: Blob,
  target: DecoderTarget | undefined,
): Promise<DecodedImage> {
  if (typeof ImageDecoder !== "function") throw new Error("ImageDecoder is not available");
  if (target === undefined) throw new Error("ImageDecoder needs a desired size");
  const decoder = new ImageDecoder({
    data: file.stream(),
    type: target.mime,
    desiredWidth: target.desiredWidth,
    desiredHeight: target.desiredHeight,
    preferAnimation: false,
  });
  let frame: VideoFrame | null = null;
  try {
    frame = (await decoder.decode({ frameIndex: 0 })).image;
    const width = frame.visibleRect?.width ?? frame.codedWidth;
    const height = frame.visibleRect?.height ?? frame.codedHeight;
    const rotation = "rotation" in frame ? Number(frame.rotation) : 0;
    const quarter = rotation === 90 || rotation === 270;
    const decodedFrame = frame;
    return drawable(decodedFrame, quarter ? height : width, quarter ? width : height, () => {
      decodedFrame.close();
      decoder.close();
    });
  } catch (error) {
    frame?.close();
    decoder.close();
    throw error;
  }
}

async function decodeWithBitmap(
  file: Blob,
  route: "bitmap_options" | "bitmap_plain",
  resize: BitmapResize | undefined,
): Promise<DecodedImage> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("createImageBitmap is not available");
  }
  let bitmap: ImageBitmap;
  if (route === "bitmap_plain") {
    bitmap = await createImageBitmap(file);
  } else {
    const options: ImageBitmapOptions =
      resize === undefined
        ? { imageOrientation: "from-image" }
        : { imageOrientation: "from-image", ...resize, resizeQuality: "high" };
    bitmap = await createImageBitmap(file, options);
  }
  return drawable(bitmap, bitmap.width, bitmap.height, () => bitmap.close());
}

async function decodeWithImg(file: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await loadImage(img, url);
    return drawable(img, img.naturalWidth, img.naturalHeight, () => URL.revokeObjectURL(url));
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function loadImage(img: HTMLImageElement, src: string): Promise<void> {
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("<img> could not load the file"));
  });
  img.src = src;
  if (typeof img.decode !== "function") return loaded;
  try {
    await img.decode();
  } catch {
    // WebKit's decode() can reject (EncodingError) on an image that did load.
    if (img.complete && img.naturalWidth > 0) return;
    await loaded;
  }
}

function drawable(
  source: ImageBitmap | HTMLImageElement | VideoFrame,
  width: number,
  height: number,
  close: () => void,
): DecodedImage {
  return {
    width,
    height,
    close,
    encodeJpeg: (w, h, quality, route) =>
      route === "offscreen_canvas"
        ? encodeOffscreen(source, w, h, quality)
        : encodeHtmlCanvas(source, w, h, quality),
  };
}

async function encodeOffscreen(
  source: ImageBitmap | HTMLImageElement | VideoFrame,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("OffscreenCanvas is not available");
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("OffscreenCanvas has no 2D context");
    if (typeof canvas.convertToBlob !== "function") {
      throw new Error("OffscreenCanvas.convertToBlob is not available");
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    return checkedJpeg(
      await canvas.convertToBlob({ type: "image/jpeg", quality }),
      "convertToBlob",
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function encodeHtmlCanvas(
  source: ImageBitmap | HTMLImageElement | VideoFrame,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("<canvas> has no 2D context");
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return checkedJpeg(blob, "toBlob");
  } finally {
    // iOS caps the total canvas memory per page; a spent canvas gives its share back.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** An old encoder can answer a JPEG request with a PNG, which the upload would label a JPEG. */
function checkedJpeg(blob: Blob | null, by: string): Blob {
  if (blob === null || blob.size === 0) throw new Error(`${by} produced no image`);
  if (blob.type !== "image/jpeg")
    throw new Error(`${by} produced ${blob.type || "no type"}, not a JPEG`);
  return blob;
}
