import { describe, expect, it } from "vitest";
import {
  type BitmapResize,
  type CompressionPlatform,
  compressPhoto,
  type DecodedImage,
  type DecodeRoute,
  type DecoderTarget,
  type EncodeRoute,
  isHeif,
  JPEG_QUALITY_STEPS,
  scaledSize,
  undecodableRefusal,
} from "./compress-photo";
import { jpegBytes } from "./image-fixtures";

/**
 * The compression logic, with the browser's decoder and canvas replaced by a
 * fake (happy-dom has neither). What the fake can't show, that a real
 * browser decodes and encodes by each route, is the real-browser probe's job.
 */

type Size = { width: number; height: number };
type Resize = BitmapResize | DecoderTarget | undefined;
type DecodeCall = { route: DecodeRoute; resize: Resize };
type EncodeCall = Size & { route: EncodeRoute; quality: number };

/**
 * What a browser that applies `resize` after EXIF orientation returns. An
 * `ImageDecoder` target is met the way Chromium meets it: a whole k/8, rounded down.
 */
const resized = (size: Size, resize: Resize): Size => {
  if (resize === undefined) return size;
  if ("mime" in resize) {
    const desired = Math.max(resize.desiredWidth, resize.desiredHeight);
    const eighths = Math.floor((8 * desired) / Math.max(size.width, size.height));
    return {
      width: Math.round((size.width * eighths) / 8),
      height: Math.round((size.height * eighths) / 8),
    };
  }
  if ("resizeWidth" in resize) {
    return {
      width: resize.resizeWidth,
      height: Math.round((size.height * resize.resizeWidth) / size.width),
    };
  }
  return {
    width: Math.round((size.width * resize.resizeHeight) / size.height),
    height: resize.resizeHeight,
  };
};

function fakePlatform(opts: {
  /** The size the photo displays at (EXIF applied), before any resize. */
  width: number;
  height: number;
  /** Overrides what a decode answers, e.g. a browser that resizes before EXIF. */
  decodedSize?: (route: DecodeRoute, resize: Resize) => Size;
  /** What `imageDecoderSupported` answers; left out, the platform has no such method (Safari). */
  imageDecoder?: boolean;
  /** Decode routes that throw. */
  failDecode?: readonly DecodeRoute[];
  /** Encode routes that throw. */
  failEncode?: readonly EncodeRoute[];
  /** Bytes the JPEG takes at each quality. */
  bytesAt?: (quality: number, width: number, height: number) => number;
}) {
  const decodes: DecodeCall[] = [];
  const encodes: EncodeCall[] = [];
  const mimesAsked: string[] = [];
  let closed = 0;
  const platform: CompressionPlatform = {
    ...(opts.imageDecoder === undefined
      ? {}
      : {
          async imageDecoderSupported(mime: string) {
            mimesAsked.push(mime);
            return opts.imageDecoder === true;
          },
        }),
    async decode(_file, route, resize) {
      decodes.push({ route, resize });
      if (opts.failDecode?.includes(route)) {
        throw new TypeError(`Failed by ${route}`);
      }
      const size =
        opts.decodedSize?.(route, resize) ??
        resized({ width: opts.width, height: opts.height }, resize);
      const image: DecodedImage = {
        ...size,
        close: () => {
          closed += 1;
        },
        async encodeJpeg(width, height, quality, encodeRoute) {
          encodes.push({ route: encodeRoute, width, height, quality });
          if (opts.failEncode?.includes(encodeRoute)) {
            throw new Error(`Failed by ${encodeRoute}`);
          }
          return new Blob([new Uint8Array(opts.bytesAt?.(quality, width, height) ?? 1000)], {
            type: "image/jpeg",
          });
        },
      };
      return image;
    },
  };
  return { platform, decodes, encodes, mimesAsked, closedCount: () => closed };
}

const ALL_DECODES: readonly DecodeRoute[] = ["bitmap_options", "bitmap_plain", "img_element"];

const file = (bytes: number[] = [0xff, 0xd8, 0xff, 0xe0], name = "p.jpg", type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], name, { type });

const jpeg = (opts: Parameters<typeof jpegBytes>[0], name = "IMG_0001.JPG") =>
  new File([new Uint8Array(jpegBytes(opts))], name, { type: "image/jpeg" });

const heicHead = [0, 0, 0, 0x18, ...Array.from("ftypheic", (c) => c.charCodeAt(0)), 0, 0, 0, 0];

describe("scaledSize: the longest side at most 2000 px", () => {
  it.each([
    [4000, 3000, 2000, 1500],
    [3000, 4000, 1500, 2000],
    [4032, 3024, 2000, 1500],
    [2001, 10, 2000, 10],
    [2000, 2000, 2000, 2000],
    [1200, 900, 1200, 900],
    [9000, 3, 2000, 1],
  ])("%i × %i → %i × %i", (w, h, ew, eh) => {
    expect(scaledSize(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe("compressPhoto", () => {
  it("a 4000 px photo is drawn at 2000 px and comes back as one JPEG under the limit", async () => {
    const { platform, encodes, closedCount } = fakePlatform({ width: 4000, height: 3000 });
    const result = await compressPhoto(file(), platform, 4_000_000);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.file.type).toBe("image/jpeg");
    expect(encodes).toEqual([
      { route: "offscreen_canvas", width: 2000, height: 1500, quality: JPEG_QUALITY_STEPS[0] },
    ]);
    expect(closedCount()).toBe(1);
  });

  it("lowers the quality until the JPEG fits, and stops there", async () => {
    // 5 MB at the first two steps, 3 MB from the third on.
    const { platform, encodes } = fakePlatform({
      width: 2000,
      height: 2000,
      bytesAt: (quality) => (quality > 0.72 ? 5_000_000 : 3_000_000),
    });
    const result = await compressPhoto(file(), platform, 4_000_000);
    expect(result.kind).toBe("ok");
    expect(encodes.map((e) => e.quality)).toEqual(JPEG_QUALITY_STEPS.slice(0, 3));
    if (result.kind === "ok") expect(result.file.size).toBeLessThanOrEqual(4_000_000);
  });

  it("too_large when even the lowest quality is over the limit, with diagnostics (and the bitmap is still closed)", async () => {
    const { platform, encodes, closedCount } = fakePlatform({
      width: 2000,
      height: 2000,
      bytesAt: () => 5_000_000,
    });
    const result = await compressPhoto(file(), platform, 4_000_000);
    expect(result).toMatchObject({
      kind: "too_large",
      diagnostics: { attempts: [], decoded: { width: 2000, height: 2000 } },
    });
    expect(encodes).toHaveLength(JPEG_QUALITY_STEPS.length);
    expect(closedCount()).toBe(1);
  });

  it("a HEIC this browser decodes is uploaded as a JPEG", async () => {
    const { platform } = fakePlatform({ width: 4032, height: 3024 });
    const result = await compressPhoto(file(heicHead, "IMG_0001.HEIC", "image/heic"), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
  });

  it("a HEIC this browser can't decode is unsupported_format (P-Q6, gap 9)", async () => {
    const { platform } = fakePlatform({ width: 1, height: 1, failDecode: ALL_DECODES });
    // By its bytes, even with no type and a misleading name (Windows often sends "").
    expect(await compressPhoto(file(heicHead, "photo.jpg", ""), platform)).toMatchObject({
      kind: "unsupported_format",
    });
  });

  it("any other format it can't decode is unsupported_format too", async () => {
    const { platform } = fakePlatform({ width: 1, height: 1, failDecode: ALL_DECODES });
    expect(
      await compressPhoto(file([0x25, 0x50, 0x44, 0x46], "a.pdf", ""), platform),
    ).toMatchObject({ kind: "unsupported_format" });
  });

  it("a decoder that throws a DOMException on every route counts as not decodable", async () => {
    const platform: CompressionPlatform = {
      decode: async () => {
        throw new DOMException("The source image could not be decoded.", "InvalidStateError");
      },
    };
    expect(await compressPhoto(file(heicHead, "x.heic", "image/heic"), platform)).toMatchObject({
      kind: "unsupported_format",
      diagnostics: {
        attempts: [
          {
            step: "bitmap_options",
            error: "InvalidStateError: The source image could not be decoded.",
          },
          {
            step: "bitmap_plain",
            error: "InvalidStateError: The source image could not be decoded.",
          },
          {
            step: "img_element",
            error: "InvalidStateError: The source image could not be decoded.",
          },
        ],
      },
    });
  });

  it("an image that decodes to zero pixels is closed and the next route is tried", async () => {
    let closed = 0;
    const real = fakePlatform({ width: 1200, height: 900 });
    const platform: CompressionPlatform = {
      async decode(blob, route, resize) {
        if (route !== "bitmap_options") return real.platform.decode(blob, route, resize);
        return {
          width: 0,
          height: 0,
          close: () => {
            closed += 1;
          },
          encodeJpeg: async () => new Blob(),
        };
      },
    };
    expect(await compressPhoto(jpeg({ width: 1200, height: 900 }), platform)).toMatchObject({
      kind: "ok",
      width: 1200,
      height: 900,
    });
    expect(closed).toBe(1);
  });
});

describe("compressPhoto: decoding a big photo straight to 2000 px", () => {
  it("a 12000 × 9000 JPEG is decoded once, by bitmap_options with only the width given", async () => {
    const { platform, decodes } = fakePlatform({ width: 12000, height: 9000 });
    const result = await compressPhoto(jpeg({ width: 12000, height: 9000 }), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    expect(decodes).toEqual([{ route: "bitmap_options", resize: { resizeWidth: 2000 } }]);
  });

  it("a portrait one (EXIF orientation 6) is given only the height", async () => {
    const { platform, decodes } = fakePlatform({ width: 9000, height: 12000 });
    const result = await compressPhoto(
      jpeg({ width: 12000, height: 9000, orientation: 6 }),
      platform,
    );
    expect(result).toMatchObject({ kind: "ok", width: 1500, height: 2000 });
    expect(decodes).toEqual([{ route: "bitmap_options", resize: { resizeHeight: 2000 } }]);
  });

  it("a browser that resizes before turning the photo still gives a 2000 px photo, aspect kept", async () => {
    // Height 2000 applied to the stored 12000 × 9000, then turned: 2000 × 2667.
    const { platform, encodes } = fakePlatform({
      width: 9000,
      height: 12000,
      decodedSize: () => ({ width: 2000, height: 2667 }),
    });
    const result = await compressPhoto(
      jpeg({ width: 12000, height: 9000, orientation: 6 }),
      platform,
    );
    expect(result).toMatchObject({ kind: "ok", width: 1500, height: 2000 });
    expect(encodes[0]).toMatchObject({ width: 1500, height: 2000 });
  });

  it("a photo that already fits is decoded with no resize", async () => {
    const { platform, decodes } = fakePlatform({ width: 1200, height: 900 });
    const result = await compressPhoto(jpeg({ width: 1200, height: 900 }), platform);
    expect(result).toMatchObject({ kind: "ok", width: 1200, height: 900 });
    expect(decodes).toEqual([{ route: "bitmap_options", resize: undefined }]);
  });
});

describe("compressPhoto: ImageDecoder, the one route that really decodes small (Chromium)", () => {
  it("a 12000 × 9000 JPEG is decoded once, at 2000 px plus an eighth, and drawn at 2000 × 1500", async () => {
    const { platform, decodes, encodes } = fakePlatform({
      width: 12000,
      height: 9000,
      imageDecoder: true,
    });
    const result = await compressPhoto(jpeg({ width: 12000, height: 9000 }), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    expect(decodes).toEqual([
      {
        route: "image_decoder",
        resize: { mime: "image/jpeg", desiredWidth: 3500, desiredHeight: 2625 },
      },
    ]);
    // 3500 / 12000 floors to 2/8: 3000 × 2250, never under 2000.
    expect(encodes[0]).toMatchObject({ width: 2000, height: 1500 });
  });

  it("a 4032 px photo is asked for 2504 px, so the k/8 it lands on (4/8, 2016) is not under 2000", async () => {
    const { platform, decodes } = fakePlatform({ width: 4032, height: 3024, imageDecoder: true });
    const result = await compressPhoto(jpeg({ width: 4032, height: 3024 }), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    expect(decodes[0]?.resize).toEqual({
      mime: "image/jpeg",
      desiredWidth: 2504,
      desiredHeight: 1878,
    });
  });

  it("a portrait one (orientation 6) asks in stored orientation and displays 1500 × 2000", async () => {
    const { platform, decodes } = fakePlatform({ width: 9000, height: 12000, imageDecoder: true });
    const result = await compressPhoto(
      jpeg({ width: 12000, height: 9000, orientation: 6 }),
      platform,
    );
    expect(result).toMatchObject({ kind: "ok", width: 1500, height: 2000 });
    expect(decodes[0]?.resize).toEqual({
      mime: "image/jpeg",
      desiredWidth: 3500,
      desiredHeight: 2625,
    });
  });

  it("a frame that comes back turned the wrong way is closed and the next route used", async () => {
    const { platform, decodes, closedCount } = fakePlatform({
      width: 9000,
      height: 12000,
      imageDecoder: true,
      // Stored orientation, EXIF ignored.
      decodedSize: (route, resize) =>
        route === "image_decoder"
          ? { width: 3000, height: 2250 }
          : resized({ width: 9000, height: 12000 }, resize),
    });
    const result = await compressPhoto(
      jpeg({ width: 12000, height: 9000, orientation: 6 }),
      platform,
    );
    expect(result).toMatchObject({ kind: "ok", width: 1500, height: 2000 });
    expect(decodes.map((d) => d.route)).toEqual(["image_decoder", "bitmap_options"]);
    expect(closedCount()).toBe(2);
  });

  it("ImageDecoder throws: bitmap_options, with its resize, as before", async () => {
    const { platform, decodes } = fakePlatform({
      width: 12000,
      height: 9000,
      imageDecoder: true,
      failDecode: ["image_decoder"],
    });
    const result = await compressPhoto(jpeg({ width: 12000, height: 9000 }), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    expect(decodes.slice(1)).toEqual([{ route: "bitmap_options", resize: { resizeWidth: 2000 } }]);
  });

  it("a photo that already fits never uses it, nor asks whether it can", async () => {
    const { platform, decodes, mimesAsked } = fakePlatform({
      width: 1200,
      height: 900,
      imageDecoder: true,
    });
    await compressPhoto(jpeg({ width: 1200, height: 900 }), platform);
    expect(decodes.map((d) => d.route)).toEqual(["bitmap_options"]);
    expect(mimesAsked).toEqual([]);
  });

  it("not supported: not tried and no attempt recorded; the type asked comes from the bytes", async () => {
    const { platform, decodes, mimesAsked } = fakePlatform({
      width: 1,
      height: 1,
      imageDecoder: false,
      failDecode: ALL_DECODES,
    });
    const photo = new File([new Uint8Array(jpegBytes({ width: 12000, height: 9000 }))], "a.bin", {
      type: "application/octet-stream",
    });
    const result = await compressPhoto(photo, platform);
    expect(mimesAsked).toEqual(["image/jpeg"]);
    expect(decodes.map((d) => d.route)).toEqual(ALL_DECODES);
    if (result.kind === "ok") throw new Error("decoded");
    expect(result.diagnostics?.attempts.map((a) => a.step)).toEqual(ALL_DECODES);
  });

  it("a header that can't be read: not tried", async () => {
    const { platform, decodes, mimesAsked } = fakePlatform({
      width: 12000,
      height: 9000,
      imageDecoder: true,
    });
    await compressPhoto(file([0xff, 0xd8, 0, 1, 2, 3]), platform);
    expect(decodes[0]?.route).toBe("bitmap_options");
    expect(mimesAsked).toEqual([]);
  });
});

describe("compressPhoto: fallback routes", () => {
  it("iOS 16: options rejected, so a plain bitmap, drawn on a <canvas> when OffscreenCanvas fails", async () => {
    const { platform, decodes, encodes } = fakePlatform({
      width: 4032,
      height: 3024,
      failDecode: ["bitmap_options"],
      failEncode: ["offscreen_canvas"],
    });
    const result = await compressPhoto(jpeg({ width: 4032, height: 3024 }), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    expect(decodes.map((d) => d.route)).toEqual(["bitmap_options", "bitmap_plain"]);
    expect(decodes[1]?.resize).toBeUndefined();
    expect(encodes.map((e) => e.route)).toEqual(["offscreen_canvas", "html_canvas"]);
  });

  it("iOS 16 portrait (orientation 6): no plain bitmap, which may come back un-turned; <img> instead", async () => {
    const { platform, decodes } = fakePlatform({
      width: 3024,
      height: 4032,
      failDecode: ["bitmap_options"],
    });
    const result = await compressPhoto(
      jpeg({ width: 4032, height: 3024, orientation: 6 }),
      platform,
    );
    expect(result).toMatchObject({ kind: "ok", width: 1500, height: 2000 });
    expect(decodes.map((d) => d.route)).toEqual(["bitmap_options", "img_element"]);
  });

  it("both bitmap routes fail: <img>", async () => {
    const { platform, decodes } = fakePlatform({
      width: 4032,
      height: 3024,
      failDecode: ["bitmap_options", "bitmap_plain"],
    });
    const result = await compressPhoto(jpeg({ width: 4032, height: 3024 }), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    expect(decodes.map((d) => d.route)).toEqual(ALL_DECODES);
  });

  it("an unreadable header: bitmap_options with no resize, then the other routes", async () => {
    const { platform, decodes } = fakePlatform({
      width: 4032,
      height: 3024,
      failDecode: ["bitmap_options", "bitmap_plain"],
    });
    const junk = [0xff, 0xd8, ...Array.from({ length: 64 }, (_, i) => (i * 37) % 251)];
    const result = await compressPhoto(file(junk), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
    expect(decodes).toEqual([
      { route: "bitmap_options", resize: undefined },
      { route: "bitmap_plain", resize: undefined },
      { route: "img_element", resize: undefined },
    ]);
  });

  it("a JPEG no route decodes is unreadable, with what each route said and never the file name", async () => {
    const { platform } = fakePlatform({ width: 1, height: 1, failDecode: ALL_DECODES });
    const photo = jpeg({ width: 4032, height: 3024 }, "Барсик у ветеринара.jpg");
    const result = await compressPhoto(photo, platform);
    expect(result).toEqual({
      kind: "unreadable",
      diagnostics: {
        attempts: [
          { step: "bitmap_options", error: "TypeError: Failed by bitmap_options" },
          { step: "bitmap_plain", error: "TypeError: Failed by bitmap_plain" },
          { step: "img_element", error: "TypeError: Failed by img_element" },
        ],
        type: "image/jpeg",
        size: photo.size,
        header: { format: "jpeg", width: 4032, height: 3024, orientation: 1 },
        decoded: null,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Барсик");
  });

  it("an error that quotes the file name is reported without it", async () => {
    const platform: CompressionPlatform = {
      decode: async () => {
        throw new Error("Could not decode IMG_7781.JPG");
      },
    };
    const result = await compressPhoto(jpeg({ width: 10, height: 10 }, "IMG_7781.JPG"), platform);
    expect(JSON.stringify(result)).not.toContain("IMG_7781");
  });

  it("an error text over 200 characters is cut to 200", async () => {
    const platform: CompressionPlatform = {
      decode: async () => {
        throw new Error("x".repeat(500));
      },
    };
    const result = await compressPhoto(jpeg({ width: 10, height: 10 }), platform);
    if (result.kind === "ok") throw new Error("decoded");
    const errors = result.diagnostics?.attempts.map((a) => a.error) ?? [];
    expect(errors).toHaveLength(3);
    for (const error of errors) {
      expect(error).toHaveLength(200);
      expect(error.startsWith("Error: xxx")).toBe(true);
    }
  });

  it("an OffscreenCanvas that throws once is not tried again: every later quality goes to the <canvas>", async () => {
    const { platform, encodes } = fakePlatform({
      width: 2000,
      height: 2000,
      failEncode: ["offscreen_canvas"],
      bytesAt: (quality) => (quality > 0.72 ? 5_000_000 : 3_000_000),
    });
    const result = await compressPhoto(file(), platform, 4_000_000);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 2000 });
    expect(encodes.map((e) => [e.route, e.quality])).toEqual([
      ["offscreen_canvas", JPEG_QUALITY_STEPS[0]],
      ["html_canvas", JPEG_QUALITY_STEPS[0]],
      ["html_canvas", JPEG_QUALITY_STEPS[1]],
      ["html_canvas", JPEG_QUALITY_STEPS[2]],
    ]);
  });

  it("no encode route works: unreadable, with the decoded size, and the image closed once", async () => {
    const { platform, closedCount } = fakePlatform({
      width: 4032,
      height: 3024,
      failEncode: ["offscreen_canvas", "html_canvas"],
    });
    const result = await compressPhoto(jpeg({ width: 4032, height: 3024 }), platform);
    expect(result).toMatchObject({
      kind: "unreadable",
      diagnostics: {
        attempts: [
          { step: "offscreen_canvas", error: "Error: Failed by offscreen_canvas" },
          { step: "html_canvas", error: "Error: Failed by html_canvas" },
        ],
        // Already 2000 px wide: bitmap_options decoded it downscaled.
        decoded: { width: 2000, height: 1500 },
      },
    });
    expect(closedCount()).toBe(1);
  });
});

describe("undecodableRefusal: which refusal a file the browser couldn't decode gets", () => {
  const none = new Uint8Array();
  const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

  it.each([
    ["image/heic", "IMG_0001.HEIC"],
    ["image/HEIF", "photo"],
    ["IMAGE/HEIC-SEQUENCE", ""],
  ])("HEIC by its type (%s), any case", (type, name) => {
    expect(undecodableRefusal({ type, name }, none)).toBe("unsupported_format");
  });

  it.each(["IMG_0001.heic", "IMG_0001.HEIC", "a.HeIf"])(
    "HEIC by its name (%s) when the browser reports no type (iOS Safari, Windows)",
    (name) => {
      expect(undecodableRefusal({ type: "", name }, none)).toBe("unsupported_format");
    },
  );

  it("HEIC by its ftyp box even when the name and type say JPEG", () => {
    expect(
      undecodableRefusal({ type: "image/jpeg", name: "a.jpg" }, new Uint8Array(heicHead)),
    ).toBe("unsupported_format");
  });

  it.each([
    ["TIFF", [0x49, 0x49, 0x2a, 0x00], "scan.tif", "image/tiff"],
    ["PDF", ascii("%PDF-1.7"), "a.pdf", "application/pdf"],
    ["an empty file", [], "a.jpg", "image/jpeg"],
  ])("%s is unsupported_format", (_label, bytes, name, type) => {
    expect(undecodableRefusal({ type, name }, new Uint8Array(bytes))).toBe("unsupported_format");
  });

  it.each([
    ["JPEG", [0xff, 0xd8, 0xff, 0xe0]],
    ["PNG", [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a]],
    ["WebP", [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]],
  ])("a %s by its bytes is unreadable, whatever its name says", (_label, bytes) => {
    expect(undecodableRefusal({ type: "", name: "x.bin" }, new Uint8Array(bytes))).toBe(
      "unreadable",
    );
  });
});

describe("isHeif", () => {
  it.each(["heic", "heix", "mif1", "msf1", "hevc"])("recognises the %s brand", (brand) => {
    const head = new Uint8Array([
      0,
      0,
      0,
      0x18,
      ...Array.from(`ftyp${brand}`, (c) => c.charCodeAt(0)),
    ]);
    expect(isHeif({ type: "" }, head)).toBe(true);
  });

  it("recognises the type or the extension when the bytes don't say", () => {
    expect(isHeif({ type: "image/heif" }, new Uint8Array())).toBe(true);
    expect(isHeif({ type: "", name: "IMG_1.HEIC" }, new Uint8Array())).toBe(true);
  });

  it("is false for a JPEG", () => {
    expect(isHeif({ type: "image/jpeg", name: "a.jpg" }, new Uint8Array([0xff, 0xd8, 0xff]))).toBe(
      false,
    );
  });
});
