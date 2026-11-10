import { describe, expect, it } from "vitest";
import {
  type CompressionPlatform,
  compressPhoto,
  type DecodedImage,
  isHeif,
  JPEG_QUALITY_STEPS,
  scaledSize,
  undecodableRefusal,
} from "./compress-photo";

/**
 * The compression logic, with the browser's decoder and canvas replaced by a
 * fake (happy-dom has neither). What the fake can't show, that a real
 * canvas really encodes a 2000 px JPEG under the limit, waits for a harness
 * check once a page mounts this module (PR 4).
 */

type Encode = { width: number; height: number; quality: number };

function fakePlatform(opts: {
  width: number;
  height: number;
  /** Bytes the JPEG takes at each quality. */
  bytesAt?: (quality: number, width: number, height: number) => number;
  decodes?: boolean;
}) {
  const encodes: Encode[] = [];
  let closed = 0;
  const platform: CompressionPlatform = {
    async decode() {
      if (opts.decodes === false) return null;
      const image: DecodedImage = {
        width: opts.width,
        height: opts.height,
        close: () => {
          closed += 1;
        },
        async encodeJpeg(width, height, quality) {
          encodes.push({ width, height, quality });
          return new Blob([new Uint8Array(opts.bytesAt?.(quality, width, height) ?? 1000)], {
            type: "image/jpeg",
          });
        },
      };
      return image;
    },
  };
  return { platform, encodes, closedCount: () => closed };
}

const file = (bytes: number[] = [0xff, 0xd8, 0xff, 0xe0], name = "p.jpg", type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], name, { type });

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
    expect(encodes).toEqual([{ width: 2000, height: 1500, quality: JPEG_QUALITY_STEPS[0] }]);
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

  it("too_large when even the lowest quality is over the limit (and the bitmap is still closed)", async () => {
    const { platform, encodes, closedCount } = fakePlatform({
      width: 2000,
      height: 2000,
      bytesAt: () => 5_000_000,
    });
    expect(await compressPhoto(file(), platform, 4_000_000)).toEqual({ kind: "too_large" });
    expect(encodes).toHaveLength(JPEG_QUALITY_STEPS.length);
    expect(closedCount()).toBe(1);
  });

  it("a HEIC this browser decodes is uploaded as a JPEG", async () => {
    const { platform } = fakePlatform({ width: 4032, height: 3024 });
    const result = await compressPhoto(file(heicHead, "IMG_0001.HEIC", "image/heic"), platform);
    expect(result).toMatchObject({ kind: "ok", width: 2000, height: 1500 });
  });

  it("a HEIC this browser can't decode is unsupported_format (P-Q6, gap 9)", async () => {
    const { platform } = fakePlatform({ width: 1, height: 1, decodes: false });
    // By its bytes, even with no type and a misleading name (Windows often sends "").
    expect(await compressPhoto(file(heicHead, "photo.jpg", ""), platform)).toEqual({
      kind: "unsupported_format",
    });
  });

  it("any other format it can't decode is unsupported_format too", async () => {
    const { platform } = fakePlatform({ width: 1, height: 1, decodes: false });
    expect(await compressPhoto(file([0x25, 0x50, 0x44, 0x46], "a.pdf", ""), platform)).toEqual({
      kind: "unsupported_format",
    });
  });

  it("a JPEG by its bytes that won't decode is unreadable (a broken file)", async () => {
    const { platform } = fakePlatform({ width: 1, height: 1, decodes: false });
    expect(await compressPhoto(file(), platform)).toEqual({ kind: "unreadable" });
  });

  it("a decoder that throws counts as not decodable", async () => {
    const platform: CompressionPlatform = {
      decode: async () => {
        throw new Error("DOMException: The source image could not be decoded.");
      },
    };
    expect(await compressPhoto(file(heicHead, "x.heic", "image/heic"), platform)).toEqual({
      kind: "unsupported_format",
    });
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
