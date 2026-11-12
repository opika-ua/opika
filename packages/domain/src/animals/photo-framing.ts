import { z } from "zod";

/** Stored precision of a frame side: 1/10 000 of the source, 0.2 px at 2000 px. */
export const FRAME_UNITS = 10_000;

/** card, mid, detail and compact are 4:5; the thumb is the square centred in the frame. */
export const PHOTO_FRAME_ASPECT = 4 / 5;

/** How far a frame's pixel box may stray from 4:5: the rounding of its edges, not a looser crop. */
export const PHOTO_FRAME_ASPECT_TOLERANCE = 0.005;

/** compact's width; the 1120 px detail variant then enlarges at most 2.8x (owner, crop-frame Q8). */
export const MIN_FRAME_WIDTH_PX = 400;

/** Each edge rounds to a whole pixel on its own, so a frame at the minimum may land 1 px under it. */
const EDGE_ROUNDING_PX = 1;

/** Where a kept source came from: the upload itself, or an older photo's detail variant. */
export const PHOTO_SOURCE_ORIGINS = ["upload", "detail_variant"] as const;
export type PhotoSourceOrigin = (typeof PHOTO_SOURCE_ORIGINS)[number];

/** A frame in whole 1/FRAME_UNITS: what the database stores and its CHECK bounds. */
export type PhotoFrameUnits = { x: number; y: number; w: number; h: number };

type FrameFractions = { x: number; y: number; w: number; h: number };

export const frameUnitsOf = (frame: FrameFractions): PhotoFrameUnits => ({
  x: Math.round(frame.x * FRAME_UNITS),
  y: Math.round(frame.y * FRAME_UNITS),
  w: Math.round(frame.w * FRAME_UNITS),
  h: Math.round(frame.h * FRAME_UNITS),
});

export const frameOfUnits = (units: PhotoFrameUnits): PhotoFrame => ({
  x: units.x / FRAME_UNITS,
  y: units.y / FRAME_UNITS,
  w: units.w / FRAME_UNITS,
  h: units.h / FRAME_UNITS,
});

// Judged on the stored units, so the schema accepts exactly what the table's CHECK accepts.
const liesInsideOnceStored = (frame: FrameFractions): boolean => {
  const u = frameUnitsOf(frame);
  return u.w > 0 && u.h > 0 && u.x + u.w <= FRAME_UNITS && u.y + u.h <= FRAME_UNITS;
};

const fraction = z.number().min(0).max(1);
const positiveFraction = z.number().gt(0).max(1);

/** Fractions of the stored source's own pixel size, so a frame survives the source being scaled. */
export const PhotoFrameSchema = z
  .strictObject({ x: fraction, y: fraction, w: positiveFraction, h: positiveFraction })
  .refine(liesInsideOnceStored, {
    message: "A frame must lie inside its photo once rounded to 1/10 000",
  });
export type PhotoFrame = z.infer<typeof PhotoFrameSchema>;

/** `attention` is the automatic crop every photo had before framing existed. */
export const PhotoFramingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("attention") }),
  z.strictObject({ kind: z.literal("frame"), frame: PhotoFrameSchema }),
]);
export type PhotoFraming = z.infer<typeof PhotoFramingSchema>;

/** sharp's `extract` region, in whole source pixels. */
export type PixelBox = { left: number; top: number; width: number; height: number };

export const PHOTO_FRAME_REJECTION_REASONS = ["aspect", "too_small", "outside"] as const;
export type PhotoFrameRejectionReason = (typeof PHOTO_FRAME_REJECTION_REASONS)[number];

export type FrameBox =
  | { kind: "ok"; box: PixelBox }
  | { kind: "rejected"; reason: PhotoFrameRejectionReason };

/**
 * The largest box of `aspect` (width / height) centred in `box`, never outside it.
 * 4:5 normalises a frame; 1:1 gives the thumb's square.
 */
export function centredBox(box: PixelBox, aspect: number): PixelBox {
  const tooWide = box.width / box.height > aspect;
  const width = tooWide ? Math.max(1, Math.round(box.height * aspect)) : box.width;
  const height = tooWide ? box.height : Math.max(1, Math.round(box.width / aspect));
  return {
    left: box.left + Math.floor((box.width - width) / 2),
    top: box.top + Math.floor((box.height - height) / 2),
    width,
    height,
  };
}

/**
 * The 4:5 pixel box a frame cuts from a source of this size, or why it can't. A frame narrower
 * than 400 px (or than the widest 4:5 box a small source allows) would enlarge too far.
 */
export function frameBoxOf(frame: PhotoFrame, source: { width: number; height: number }): FrameBox {
  // Edges, not sizes, are rounded: with x + w <= 1 the right edge then never passes the source's.
  const left = Math.round(frame.x * source.width);
  const top = Math.round(frame.y * source.height);
  const right = Math.round((frame.x + frame.w) * source.width);
  const bottom = Math.round((frame.y + frame.h) * source.height);
  if (left < 0 || top < 0 || right > source.width || bottom > source.height) {
    return { kind: "rejected", reason: "outside" };
  }
  if (right <= left || bottom <= top) return { kind: "rejected", reason: "too_small" };
  const requested = { left, top, width: right - left, height: bottom - top };
  if (
    Math.abs(requested.width / requested.height - PHOTO_FRAME_ASPECT) > PHOTO_FRAME_ASPECT_TOLERANCE
  ) {
    return { kind: "rejected", reason: "aspect" };
  }
  const box = centredBox(requested, PHOTO_FRAME_ASPECT);
  const widest = centredBox(
    { left: 0, top: 0, width: source.width, height: source.height },
    PHOTO_FRAME_ASPECT,
  ).width;
  if (box.width + EDGE_ROUNDING_PX < Math.min(MIN_FRAME_WIDTH_PX, widest)) {
    return { kind: "rejected", reason: "too_small" };
  }
  return { kind: "ok", box };
}
