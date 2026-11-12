import { describe, expect, it } from "vitest";
import {
  centredBox,
  FRAME_UNITS,
  frameBoxOf,
  frameOfUnits,
  frameUnitsOf,
  MIN_FRAME_WIDTH_PX,
  PHOTO_FRAME_ASPECT,
  PhotoFrameSchema,
  PhotoFramingSchema,
} from "./photo-framing";

const SQUARE = { width: 2000, height: 2000 };

describe("the crop frame's constants (crop-frame shape §4, owner Q8)", () => {
  // Literal values transcribed from the approved shape, not the constants read back.
  it("stores 1/10 000, frames at 4:5 and refuses under 400 source px", () => {
    expect(FRAME_UNITS).toBe(10_000);
    expect(PHOTO_FRAME_ASPECT).toBe(0.8);
    expect(MIN_FRAME_WIDTH_PX).toBe(400);
  });
});

describe("PhotoFrameSchema", () => {
  const accepts = (frame: unknown) => PhotoFrameSchema.safeParse(frame).success;

  it("accepts the whole source and a frame inside it", () => {
    expect(accepts({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(accepts({ x: 0.1, y: 0.2, w: 0.4, h: 0.5 })).toBe(true);
  });

  it("judges x + w after rounding to 1/10 000, as the database stores it", () => {
    expect(accepts({ x: 0.50004, y: 0, w: 0.5, h: 1 })).toBe(true);
    expect(accepts({ x: 0.5001, y: 0, w: 0.5, h: 1 })).toBe(false);
    expect(accepts({ x: 0, y: 0.5001, w: 1, h: 0.5 })).toBe(false);
  });

  it("refuses a side that rounds to nothing, a zero or negative side, and an edge outside 0..1", () => {
    expect(accepts({ x: 0, y: 0, w: 0.00004, h: 1 })).toBe(false);
    expect(accepts({ x: 0, y: 0, w: 0, h: 1 })).toBe(false);
    expect(accepts({ x: 0, y: 0, w: 1, h: -0.5 })).toBe(false);
    expect(accepts({ x: -0.1, y: 0, w: 0.5, h: 1 })).toBe(false);
    expect(accepts({ x: 0, y: 1.1, w: 0.5, h: 0.1 })).toBe(false);
  });

  it("refuses a non-finite number and an extra key", () => {
    expect(accepts({ x: Number.NaN, y: 0, w: 0.5, h: 0.5 })).toBe(false);
    expect(accepts({ x: 0, y: 0, w: Number.POSITIVE_INFINITY, h: 0.5 })).toBe(false);
    expect(accepts({ x: 0, y: 0, w: 0.5, h: 0.5, objectKey: "animals/a/b/source.webp" })).toBe(
      false,
    );
  });
});

describe("PhotoFramingSchema", () => {
  const accepts = (framing: unknown) => PhotoFramingSchema.safeParse(framing).success;

  it("is attention or a frame, nothing else", () => {
    expect(accepts({ kind: "attention" })).toBe(true);
    expect(accepts({ kind: "frame", frame: { x: 0, y: 0, w: 0.8, h: 1 } })).toBe(true);
    expect(accepts({ kind: "attention", frame: { x: 0, y: 0, w: 0.8, h: 1 } })).toBe(false);
    expect(accepts({ kind: "frame" })).toBe(false);
    expect(accepts({ kind: "frame", frame: { x: 0.5, y: 0, w: 0.8, h: 1 } })).toBe(false);
    expect(accepts({ kind: "crop" })).toBe(false);
  });
});

describe("frameUnitsOf and frameOfUnits", () => {
  it("round to whole units and read back as the same fractions", () => {
    const units = frameUnitsOf({ x: 0.12344, y: 0.00006, w: 0.8, h: 0.5 });
    expect(units).toEqual({ x: 1234, y: 1, w: 8000, h: 5000 });
    expect(frameOfUnits(units)).toEqual({ x: 0.1234, y: 0.0001, w: 0.8, h: 0.5 });
    expect(frameUnitsOf(frameOfUnits(units))).toEqual(units);
  });
});

describe("frameBoxOf on landscape, portrait and square sources", () => {
  it("a landscape source: the full-height 4:5 frame in the middle", () => {
    expect(frameBoxOf({ x: 0.275, y: 0, w: 0.45, h: 1 }, { width: 2000, height: 1125 })).toEqual({
      kind: "ok",
      box: { left: 550, top: 0, width: 900, height: 1125 },
    });
  });

  it("a portrait source: the full-width frame lower down", () => {
    expect(frameBoxOf({ x: 0, y: 0.1, w: 1, h: 0.75 }, { width: 1200, height: 2000 })).toEqual({
      kind: "ok",
      box: { left: 0, top: 200, width: 1200, height: 1500 },
    });
  });

  it("a square source: the widest frame it allows", () => {
    expect(frameBoxOf({ x: 0.1, y: 0, w: 0.8, h: 1 }, SQUARE)).toEqual({
      kind: "ok",
      box: { left: 200, top: 0, width: 1600, height: 2000 },
    });
  });

  it("an older photo's detail variant (1120x1400) takes a 400 px frame", () => {
    expect(
      frameBoxOf({ x: 0.5, y: 0.5, w: 400 / 1120, h: 500 / 1400 }, { width: 1120, height: 1400 }),
    ).toEqual({ kind: "ok", box: { left: 560, top: 700, width: 400, height: 500 } });
  });
});

describe("frameBoxOf's aspect tolerance", () => {
  it("a box slightly too wide is narrowed to 4:5 around its centre", () => {
    expect(frameBoxOf({ x: 0, y: 0, w: 0.402, h: 0.5 }, SQUARE)).toEqual({
      kind: "ok",
      box: { left: 2, top: 0, width: 800, height: 1000 },
    });
  });

  it("a box slightly too tall is shortened to 4:5 around its centre", () => {
    expect(frameBoxOf({ x: 0, y: 0, w: 0.398, h: 0.5 }, SQUARE)).toEqual({
      kind: "ok",
      box: { left: 0, top: 2, width: 796, height: 995 },
    });
  });

  it("refuses a box further than the tolerance from 4:5", () => {
    expect(frameBoxOf({ x: 0, y: 0, w: 0.405, h: 0.5 }, SQUARE)).toEqual({
      kind: "rejected",
      reason: "aspect",
    });
    expect(frameBoxOf({ x: 0, y: 0, w: 0.5, h: 0.5 }, SQUARE)).toEqual({
      kind: "rejected",
      reason: "aspect",
    });
  });
});

describe("frameBoxOf's minimum", () => {
  it("accepts 400 px, and 399 px (one edge rounded down), and refuses 398 px", () => {
    expect(frameBoxOf({ x: 0, y: 0, w: 0.2, h: 0.25 }, SQUARE)).toMatchObject({ kind: "ok" });
    expect(frameBoxOf({ x: 0, y: 0, w: 0.1995, h: 0.2495 }, SQUARE)).toEqual({
      kind: "ok",
      box: { left: 0, top: 0, width: 399, height: 499 },
    });
    expect(frameBoxOf({ x: 0, y: 0, w: 0.199, h: 0.249 }, SQUARE)).toEqual({
      kind: "rejected",
      reason: "too_small",
    });
  });

  it("on a source too small for 400 px, only near the widest 4:5 box it allows", () => {
    const small = { width: 300, height: 300 };
    expect(frameBoxOf({ x: 0.1, y: 0, w: 0.8, h: 1 }, small)).toEqual({
      kind: "ok",
      box: { left: 30, top: 0, width: 240, height: 300 },
    });
    expect(frameBoxOf({ x: 0, y: 0, w: 200 / 300, h: 250 / 300 }, small)).toEqual({
      kind: "rejected",
      reason: "too_small",
    });
  });

  it("a side that rounds to no pixels is too small", () => {
    expect(frameBoxOf({ x: 0, y: 0, w: 0.0001, h: 0.0001 }, SQUARE)).toEqual({
      kind: "rejected",
      reason: "too_small",
    });
  });
});

describe("frameBoxOf refuses a frame outside its source", () => {
  it("past the right or bottom edge, or before the left or top one", () => {
    const portrait = { width: 2000, height: 2500 };
    for (const frame of [
      { x: 0.5, y: 0, w: 0.6, h: 0.6 },
      { x: 0, y: 0.6, w: 0.4, h: 0.5 },
      { x: -0.1, y: 0, w: 0.4, h: 0.4 },
      { x: 0, y: -0.1, w: 0.4, h: 0.4 },
    ]) {
      expect(frameBoxOf(frame, portrait)).toEqual({ kind: "rejected", reason: "outside" });
    }
  });
});

describe("centredBox", () => {
  it("the thumb is the square of the frame's width, centred in it", () => {
    expect(centredBox({ left: 550, top: 0, width: 900, height: 1125 }, 1)).toEqual({
      left: 550,
      top: 112,
      width: 900,
      height: 900,
    });
    expect(centredBox({ left: 0, top: 200, width: 1200, height: 1500 }, 1)).toEqual({
      left: 0,
      top: 350,
      width: 1200,
      height: 1200,
    });
  });

  it("a wide box keeps its height and centres horizontally, never leaving the box", () => {
    expect(centredBox({ left: 10, top: 20, width: 1000, height: 500 }, 1)).toEqual({
      left: 260,
      top: 20,
      width: 500,
      height: 500,
    });
    expect(centredBox({ left: 0, top: 0, width: 2000, height: 1125 }, PHOTO_FRAME_ASPECT)).toEqual({
      left: 550,
      top: 0,
      width: 900,
      height: 1125,
    });
  });

  it("a box already at the aspect comes back unchanged", () => {
    const box = { left: 7, top: 9, width: 800, height: 1000 };
    expect(centredBox(box, PHOTO_FRAME_ASPECT)).toEqual(box);
  });
});
