import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnimalIdSchema, type PhotoFraming } from "@opika/domain";
import realSharp, { type SharpOptions } from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cutPhotoVariants } from "./crop-photo";
import { generateVariants } from "./generate-variants";
import { encodePhotoSource } from "./photo-source";
import { prepareUploadedPhoto, UPLOAD_PIXEL_LIMIT } from "./prepare-uploaded-photo";
import type { ImageStorageClient } from "./r2-client";
import { ONBOARDING_PIXEL_LIMIT } from "./resolve-local-photo";
import { uploadAnimalPhoto } from "./upload-animal-photo";
import { IMAGE_VARIANTS, PHOTO_FORMATS } from "./variants";

/**
 * The decoder's own pixel ceiling, behind the header check (P-Q5): every
 * sharp instance the upload path builds, except the one header read that
 * names a bomb's refusal, carries `UPLOAD_PIXEL_LIMIT`. Nothing else would
 * notice it going: a header and its pixel data can't be made to disagree in
 * a test, so the ceiling is held by recording what each instance was given.
 */
const given = vi.hoisted(() => ({ options: [] as (SharpOptions | undefined)[] }));

vi.mock("sharp", async (importOriginal) => {
  const actual = (await importOriginal<{ default: typeof realSharp }>()).default;
  const recording = (...args: Parameters<typeof actual>) => {
    given.options.push(args[1]);
    return actual(...args);
  };
  return { default: Object.assign(recording, actual) };
});

const IMAGE_VARIANT_COUNT = Object.keys(IMAGE_VARIANTS).length;

const solid = (width: number, height: number) =>
  realSharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .png()
    .toBuffer();

beforeEach(() => {
  given.options.length = 0;
});

describe("UPLOAD_PIXEL_LIMIT", () => {
  it("lets the largest upload P-Q5 allows, 2000 × 2000, decode under it", async () => {
    const variants = await generateVariants(IMAGE_VARIANTS, await solid(2000, 2000), ["webp"], {
      limitInputPixels: UPLOAD_PIXEL_LIMIT,
    });
    expect(Object.keys(variants).sort()).toEqual(["card", "compact", "detail", "mid", "thumb"]);
  });

  it("reaches every decode of an upload; only the header read lifts it", async () => {
    // 1200 × 900 takes both paths: `thumb` and `card` are scaled down, then
    // cropped; `detail` and `mid` are cropped, then enlarged from the crop.
    const bytes = await solid(1200, 900);
    given.options.length = 0;

    expect((await prepareUploadedPhoto(bytes)).kind).toBe("ok");

    const [headerRead, ...decodes] = given.options;
    expect(headerRead).toEqual({ limitInputPixels: false });
    // generateVariants' own header read, five crops, the enlargements of
    // `detail`'s and `mid`'s crops, and each variant's pixels opened once per
    // format to encode; then the source's header read and its encode.
    expect(decodes).toHaveLength(10 + IMAGE_VARIANT_COUNT * PHOTO_FORMATS.length);
    decodes.forEach((options, i) => {
      expect(options?.limitInputPixels, `decode ${i + 1} of ${decodes.length}`).toBe(
        UPLOAD_PIXEL_LIMIT,
      );
    });
  });

  it("refuses to decode one column more, whatever the header check did", async () => {
    // 2001 × 2000 is 4,002,000 pixels, so this is sharp's pixel limit refusing
    // (at generateVariants' own header read, the first open that carries it),
    // not the 2000 px side check, which prepareUploadedPhoto runs first.
    await expect(
      generateVariants(IMAGE_VARIANTS, await solid(2001, 2000), PHOTO_FORMATS, {
        limitInputPixels: UPLOAD_PIXEL_LIMIT,
      }),
    ).rejects.toThrow("Input image exceeds pixel limit");
  });

  it("reaches every decode of a crop, the shared raw pixels included", async () => {
    const source = await encodePhotoSource(await solid(1200, 900));
    given.options.length = 0;

    await cutPhotoVariants(
      source.bytes,
      source,
      { kind: "frame", box: { left: 100, top: 0, width: 720, height: 900 } },
      PHOTO_FORMATS,
      { limitInputPixels: UPLOAD_PIXEL_LIMIT },
    );

    // The header read, the one decode to raw pixels, five cuts from them, and each cut's
    // pixels opened once per format to encode.
    expect(given.options).toHaveLength(7 + IMAGE_VARIANT_COUNT * PHOTO_FORMATS.length);
    given.options.forEach((options, i) => {
      expect(options?.limitInputPixels, `decode ${i + 1}`).toBe(UPLOAD_PIXEL_LIMIT);
    });
  });
});

// #587 review: with `decode = {}` in uploadAnimalPhoto, nothing else went red.
describe("ONBOARDING_PIXEL_LIMIT", () => {
  const dir = mkdtempSync(join(tmpdir(), "opika-onboarding-limit-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const storage: ImageStorageClient = {
    async put() {},
    async get() {
      throw new Error("the onboarding upload never reads");
    },
  };
  const ids = {
    photoId: "b1000000-0000-4000-8000-000000000001",
    sourceId: "c2000000-0000-4000-8000-000000000002",
  };

  it.each<PhotoFraming>([
    { kind: "attention" },
    { kind: "frame", frame: { x: 0.25, y: 0.1, w: 0.5, h: 750 / 900 } },
  ])(
    "reaches every decode of the onboarding CLI's upload ($kind); only the header read lifts it",
    async (framing) => {
      const path = join(dir, `photo-${framing.kind}.png`);
      writeFileSync(path, await solid(1200, 900));
      given.options.length = 0;

      await uploadAnimalPhoto(
        storage,
        path,
        AnimalIdSchema.parse("a0000000-0000-4000-8000-000000000000"),
        ids,
        { width: 1200, height: 900 },
        framing,
      );

      const [headerRead, ...decodes] = given.options;
      expect(headerRead).toEqual({ limitInputPixels: false });
      // The source's encode, then generateVariants or generateFramedVariants with every cut.
      expect(decodes.length).toBeGreaterThan(IMAGE_VARIANT_COUNT * PHOTO_FORMATS.length);
      decodes.forEach((options, i) => {
        expect(options?.limitInputPixels, `decode ${i + 1} of ${decodes.length}`).toBe(
          ONBOARDING_PIXEL_LIMIT,
        );
      });
    },
  );
});
