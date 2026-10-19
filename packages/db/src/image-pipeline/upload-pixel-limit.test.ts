import realSharp, { type SharpOptions } from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateVariants } from "./generate-variants";
import { prepareUploadedPhoto, UPLOAD_PIXEL_LIMIT } from "./prepare-uploaded-photo";

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

const solid = (width: number, height: number) =>
  realSharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .png()
    .toBuffer();

beforeEach(() => {
  given.options.length = 0;
});

describe("UPLOAD_PIXEL_LIMIT", () => {
  it("lets the largest upload P-Q5 allows, 2000 × 2000, decode under it", async () => {
    const variants = await generateVariants(await solid(2000, 2000), {
      limitInputPixels: UPLOAD_PIXEL_LIMIT,
    });
    expect(Object.keys(variants).sort()).toEqual(["card", "detail", "thumb"]);
  });

  it("reaches every decode of an upload; only the header read lifts it", async () => {
    // 1200 × 900 takes both paths: `thumb` and `card` are scaled down, then
    // cropped; `detail` is cropped, then enlarged from the crop.
    const bytes = await solid(1200, 900);
    given.options.length = 0;

    expect((await prepareUploadedPhoto(bytes)).kind).toBe("ok");

    const [headerRead, ...decodes] = given.options;
    expect(headerRead).toEqual({ limitInputPixels: false });
    // generateVariants' own header read, three crops, and the enlargement of
    // `detail`'s crop.
    expect(decodes).toHaveLength(5);
    decodes.forEach((options, i) => {
      expect(options?.limitInputPixels, `decode ${i + 1} of ${decodes.length}`).toBe(
        UPLOAD_PIXEL_LIMIT,
      );
    });
  });

  it("refuses to decode one column more, whatever the header check did", async () => {
    // 2001 × 2000 is 4,002,000 pixels, so this is the decoder refusing, not
    // the 2000 px side check, which prepareUploadedPhoto runs first.
    await expect(
      generateVariants(await solid(2001, 2000), { limitInputPixels: UPLOAD_PIXEL_LIMIT }),
    ).rejects.toThrow("Input image exceeds pixel limit");
  });
});
