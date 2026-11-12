import type { KabinetPhotoCropView } from "@opika/contracts";
import { IMAGE_VARIANTS, isRealPhotoKey, r2PublicUrl } from "@opika/db/image-pipeline";
import {
  centredBox,
  FRAME_UNITS,
  frameOfUnits,
  MIN_FRAME_WIDTH_PX,
  PHOTO_FRAME_ASPECT,
  type PhotoFrame,
  type PhotoFraming,
} from "@opika/domain";

/**
 * The crop dialog's arithmetic, pure: between react-easy-crop's area (percentages of the shown
 * image), the stored frame (fractions in whole 1/FRAME_UNITS, `photo-framing.ts`) and the previews.
 */

/** react-easy-crop's cropped area: percentages (0-100) of the image's own size. */
export type CropArea = { x: number; y: number; width: number; height: number };
export type SourceSize = { width: number; height: number };
/** A part of the image as fractions (0-1) of its size. */
export type ImagePart = { x: number; y: number; w: number; h: number };

/** What the dialog crops: the image, its pixel size, and whether only a zoom is possible. */
export type CropImage = { url: string; size: SourceSize; zoomOnly: boolean };

/** One press of «+» or «−»: 8 presses span the 1-5x of a 2000 px source. */
export const ZOOM_STEP = 1.25;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * What can be cropped and from where, or null (a support view's `withheld`, or a kept source with
 * no CDN address configured). An older photo crops its detail variant, so it only zooms; a seed
 * key (local dev) is its own root-relative file, as in `image-loader.ts`.
 */
export function cropImageOf(
  crop: KabinetPhotoCropView,
  publicBaseUrl: string | undefined,
): CropImage | null {
  const base = publicBaseUrl?.replace(/\/$/, "") ?? "";
  const { source, storageKey } = crop;
  switch (source.kind) {
    case "withheld":
      return null;
    case "kept":
      if (base === "") return null;
      return {
        url: `${base}/${source.objectKey}`,
        size: { width: source.width, height: source.height },
        zoomOnly: source.origin === "detail_variant",
      };
    case "variants_only": {
      if (!isRealPhotoKey(storageKey)) {
        const url = storageKey.startsWith("/") ? storageKey : `/${storageKey}`;
        return { url, size: IMAGE_VARIANTS.detail, zoomOnly: true };
      }
      if (base === "") return null;
      return {
        url: r2PublicUrl(base, storageKey, "detail"),
        size: IMAGE_VARIANTS.detail,
        zoomOnly: true,
      };
    }
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled source; unreachable at runtime */
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

/**
 * Zoom 1 is the widest 4:5 frame the image allows (react-easy-crop's crop size with `contain`);
 * the frame narrows by the zoom, so the 400 px minimum frame sets the most it may zoom.
 */
export function zoomBoundsOf(size: SourceSize): { min: number; max: number } {
  const widest = centredBox(
    { left: 0, top: 0, width: size.width, height: size.height },
    PHOTO_FRAME_ASPECT,
  ).width;
  return { min: 1, max: Math.max(1, widest / MIN_FRAME_WIDTH_PX) };
}

export function stepZoom(
  zoom: number,
  direction: "in" | "out",
  bounds: { min: number; max: number },
): number {
  return clamp(direction === "in" ? zoom * ZOOM_STEP : zoom / ZOOM_STEP, bounds.min, bounds.max);
}

/** Where the cropper starts: the stored frame, or none for `attention` (centred, zoomed out). */
export function initialAreaOf(framing: PhotoFraming): CropArea | undefined {
  if (framing.kind === "attention") return undefined;
  const { x, y, w, h } = framing.frame;
  return { x: x * 100, y: y * 100, width: w * 100, height: h * 100 };
}

export const partOfArea = (area: CropArea): ImagePart => ({
  x: area.x / 100,
  y: area.y / 100,
  w: area.width / 100,
  h: area.height / 100,
});

/**
 * The frame to send for the area the cropper shows: 4:5 in pixels from its width, inside the
 * image, snapped to whole 1/FRAME_UNITS so the server's check (`frameBoxOf`) sees what was shown.
 */
export function frameOfArea(area: CropArea, size: SourceSize): PhotoFrame {
  const shown = {
    left: (area.x / 100) * size.width,
    top: (area.y / 100) * size.height,
    width: (area.width / 100) * size.width,
    height: (area.height / 100) * size.height,
  };
  const widest = Math.min(shown.width, size.width, size.height * PHOTO_FRAME_ASPECT);
  // The height follows the stored width, so a frame reopened and saved again is the same frame.
  const w = clamp(Math.round((widest / size.width) * FRAME_UNITS), 1, FRAME_UNITS);
  const width = (w / FRAME_UNITS) * size.width;
  const height = width / PHOTO_FRAME_ASPECT;
  const h = clamp(Math.round((height / size.height) * FRAME_UNITS), 1, FRAME_UNITS);
  const left = clamp(shown.left + (shown.width - width) / 2, 0, size.width - width);
  const top = clamp(shown.top + (shown.height - height) / 2, 0, size.height - height);
  return frameOfUnits({
    x: clamp(Math.round((left / size.width) * FRAME_UNITS), 0, FRAME_UNITS - w),
    y: clamp(Math.round((top / size.height) * FRAME_UNITS), 0, FRAME_UNITS - h),
    w,
    h,
  });
}

/** The thumb's square: as wide as the frame, centred in it (the server's `centredBox(box, 1)`). */
export function thumbSquareOf(frame: ImagePart, size: SourceSize): ImagePart {
  const side = frame.w * size.width;
  const h = Math.min(frame.h, side / size.height);
  const w = (h * size.height) / size.width;
  return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h };
}

/** Inline style that makes an image box show `part` of the image across its parent. */
export function partStyle(part: ImagePart): {
  width: string;
  height: string;
  left: string;
  top: string;
} {
  const percent = (value: number) => `${value * 100}%`;
  return {
    width: percent(1 / part.w),
    height: percent(1 / part.h),
    left: percent(-part.x / part.w),
    top: percent(-part.y / part.h),
  };
}
