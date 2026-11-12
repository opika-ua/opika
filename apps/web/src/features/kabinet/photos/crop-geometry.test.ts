import type { KabinetPhotoCropView } from "@opika/contracts";
import {
  centredBox,
  FRAME_UNITS,
  frameBoxOf,
  frameOfUnits,
  frameUnitsOf,
  MIN_FRAME_WIDTH_PX,
  PhotoFrameSchema,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  type CropArea,
  cropImageOf,
  frameOfArea,
  initialAreaOf,
  partOfArea,
  partStyle,
  type SourceSize,
  stepZoom,
  thumbSquareOf,
  zoomBoundsOf,
} from "./crop-geometry";

const SOURCES: [string, SourceSize][] = [
  ["landscape", { width: 2000, height: 1125 }],
  ["portrait", { width: 1500, height: 2000 }],
  ["square", { width: 1333, height: 1333 }],
  ["older photo's detail variant", { width: 1120, height: 1400 }],
];

/** The area react-easy-crop reports for a 4:5 frame `widthPx` wide at (leftPx, topPx). */
const areaOf = (size: SourceSize, leftPx: number, topPx: number, widthPx: number): CropArea => ({
  x: (leftPx / size.width) * 100,
  y: (topPx / size.height) * 100,
  width: (widthPx / size.width) * 100,
  height: ((widthPx * 5) / 4 / size.height) * 100,
});

const widestOf = (size: SourceSize) =>
  centredBox({ left: 0, top: 0, width: size.width, height: size.height }, 4 / 5).width;

describe.each(SOURCES)("a %s source", (_name, size) => {
  const widest = widestOf(size);
  const bounds = zoomBoundsOf(size);

  it("zooms from the widest 4:5 frame down to the 400 px minimum, no further", () => {
    expect(bounds.min).toBe(1);
    expect(widest / bounds.max).toBeCloseTo(MIN_FRAME_WIDTH_PX, 6);
  });

  it("the zoom steps stay inside the bounds", () => {
    expect(stepZoom(bounds.min, "out", bounds)).toBe(bounds.min);
    expect(stepZoom(bounds.max, "in", bounds)).toBe(bounds.max);
    expect(stepZoom(1, "in", bounds)).toBeGreaterThan(1);
    expect(stepZoom(stepZoom(1, "in", bounds), "out", bounds)).toBeCloseTo(1, 10);
  });

  it("every frame from zoomed out to the most zoomed in, anywhere, is one the server accepts", () => {
    for (const zoom of [bounds.min, (bounds.min + bounds.max) / 2, bounds.max]) {
      const widthPx = widest / zoom;
      const heightPx = (widthPx * 5) / 4;
      for (const [fx, fy] of [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
        [0.37, 0.81],
      ] as const) {
        const area = areaOf(
          size,
          fx * (size.width - widthPx),
          fy * (size.height - heightPx),
          widthPx,
        );
        const frame = frameOfArea(area, size);
        expect(PhotoFrameSchema.safeParse(frame).success, JSON.stringify(area)).toBe(true);
        expect(frameBoxOf(frame, size).kind, JSON.stringify(area)).toBe("ok");
      }
    }
  });

  it("a frame sent is whole 1/10 000 units, and comes back as the area it started from", () => {
    const frame = frameOfArea(
      areaOf(size, size.width * 0.1, size.height * 0.05, widest / 1.7),
      size,
    );
    // fractions -> units -> fractions changes nothing: what is sent is what the table stores
    expect(frameOfUnits(frameUnitsOf(frame))).toEqual(frame);
    for (const value of Object.values(frameUnitsOf(frame))) {
      expect(Number.isInteger(value) && value >= 0 && value <= FRAME_UNITS).toBe(true);
    }
    // the stored frame reopens the cropper where it was, and saving again sends the same frame
    const reopened = initialAreaOf({ kind: "frame", frame });
    if (reopened === undefined) throw new Error("a frame reopens as an area");
    expect(frameOfArea(reopened, size)).toEqual(frame);
  });

  it("the thumb is the square as wide as the frame, centred in it", () => {
    const frame = partOfArea(areaOf(size, size.width * 0.05, 0, widest / 1.5));
    const square = thumbSquareOf(frame, size);
    expect(square.w * size.width).toBeCloseTo(frame.w * size.width, 6);
    expect(square.h * size.height).toBeCloseTo(frame.w * size.width, 6);
    expect(square.x).toBeCloseTo(frame.x, 10);
    // centred: equal space above and below inside the frame
    expect(square.y - frame.y).toBeCloseTo(frame.y + frame.h - (square.y + square.h), 10);
    const server = centredBox(
      {
        left: frame.x * size.width,
        top: frame.y * size.height,
        width: frame.w * size.width,
        height: frame.h * size.height,
      },
      1,
    );
    expect(Math.abs(square.y * size.height - server.top)).toBeLessThanOrEqual(1);
  });
});

describe("where the cropper starts", () => {
  it("the automatic crop starts centred and zoomed out: no initial area", () => {
    expect(initialAreaOf({ kind: "attention" })).toBeUndefined();
  });

  it("a stored frame starts as its percentages", () => {
    expect(
      initialAreaOf({ kind: "frame", frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 } }),
    ).toStrictEqual({ x: 10, y: 20, width: 50, height: 40 });
  });
});

describe("the preview's CSS", () => {
  it("scales and shifts the image so the part fills its box", () => {
    expect(partStyle({ x: 0.25, y: 0.1, w: 0.5, h: 0.8 })).toEqual({
      width: "200%",
      height: "125%",
      left: "-50%",
      top: "-12.5%",
    });
    expect(partStyle({ x: 0, y: 0, w: 1, h: 1 })).toEqual({
      width: "100%",
      height: "100%",
      left: "0%",
      top: "0%",
    });
  });
});

describe("what the dialog crops from", () => {
  const BASE = "https://img.example.test";
  const crop = (source: KabinetPhotoCropView["source"], storageKey = "animals/a1/p1") =>
    ({ storageKey, framing: { kind: "attention" }, source }) as KabinetPhotoCropView;

  it("a kept upload: its own file, full freedom", () => {
    expect(
      cropImageOf(
        crop({
          kind: "kept",
          objectKey: "animals/a1/p1/source-0f.webp",
          origin: "upload",
          width: 2000,
          height: 1125,
        }),
        `${BASE}/`,
      ),
    ).toEqual({
      url: `${BASE}/animals/a1/p1/source-0f.webp`,
      size: { width: 2000, height: 1125 },
      zoomOnly: false,
    });
  });

  it("an older photo, kept or not, crops its detail variant and can only zoom", () => {
    expect(
      cropImageOf(
        crop({
          kind: "kept",
          objectKey: "animals/a1/p1/source-1a.webp",
          origin: "detail_variant",
          width: 1120,
          height: 1400,
        }),
        BASE,
      )?.zoomOnly,
    ).toBe(true);
    expect(cropImageOf(crop({ kind: "variants_only" }), BASE)).toEqual({
      url: `${BASE}/animals/a1/p1/detail.webp`,
      size: { width: 1120, height: 1400 },
      zoomOnly: true,
    });
  });

  it("a support view's withheld source is never offered", () => {
    expect(cropImageOf(crop({ kind: "withheld" }), BASE)).toBeNull();
  });

  it("with no CDN address a real photo can't be shown, so it isn't offered", () => {
    expect(cropImageOf(crop({ kind: "variants_only" }), undefined)).toBeNull();
  });

  it("a seed photo (local dev) is its own root-relative file", () => {
    expect(
      cropImageOf(crop({ kind: "variants_only" }, "seed-photos/dog-1.jpg"), undefined)?.url,
    ).toBe("/seed-photos/dog-1.jpg");
  });
});
