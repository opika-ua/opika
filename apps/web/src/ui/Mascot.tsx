import type { ReactNode } from "react";
import { cx } from "./cx";
import {
  COMPACT_HEIGHT_CLASS,
  COMPACT_LEFT_CLASS,
  COMPACT_RIGHT_CLASS,
  compactOffset,
} from "./mascot-fit";
import { MASCOT_SHAPES, type MascotShapeKey } from "./mascot-shapes";

/** Heights in px; a phone uses the next step down (32 stays 32); `mascot-fit.ts` steps again below 360px. */
const HEIGHT = { 32: "h-8", 48: "h-12", 64: "h-16", 96: "h-24" } as const;
const HEIGHT_PHONE = {
  32: "max-tablet:h-8",
  48: "max-tablet:h-8",
  64: "max-tablet:h-12",
  96: "max-tablet:h-16",
} as const;

export type MascotSize = keyof typeof HEIGHT;

const OFFSET_LEFT = {
  0: "left-0",
  4: "left-1",
  8: "left-2",
  16: "left-4",
  24: "left-6",
  32: "left-8",
} as const;
const OFFSET_RIGHT = {
  0: "right-0",
  4: "right-1",
  8: "right-2",
  16: "right-4",
  24: "right-6",
  32: "right-8",
} as const;

export type MascotOffset = keyof typeof OFFSET_LEFT;

export type MascotPose =
  | { kind: "cat"; pose: "sit"; variant?: "collar" }
  | { kind: "cat"; pose: "stand"; variant?: "tail" }
  | { kind: "cat"; pose: "lie"; variant?: never }
  | { kind: "dog"; pose: "sit" | "lie" | "stand"; variant?: never };

/**
 * `top-left` / `top-right`: sits on the top edge of the nearest positioned ancestor (it needs `relative`)
 * at the inset `offset`. `word`: centred on the letters of the `PerchedWords` word it is rendered in,
 * its feet on the cap line (`--cap-offset`), so it takes no offset. No perch: an ordinary inline block.
 */
export type MascotPerchProps =
  | { perch?: undefined; offset?: MascotOffset }
  | { perch: "top-left" | "top-right"; offset?: MascotOffset }
  | { perch: "word"; offset?: never };

export type MascotProps = MascotPose &
  MascotPerchProps & {
    size: MascotSize;
    /** Layout only (margin, self alignment). */
    className?: string;
  };

/** Top padding that reserves the room a word-perched mascot of this size takes above its line. */
export const MASCOT_RESERVE_CLASS = {
  32: "pt-8",
  48: "pt-8 tablet:pt-12",
  64: "pt-12 tablet:pt-16",
  96: "pt-16 tablet:pt-24",
} as const satisfies Record<MascotSize, string>;

function perchClass(perch: "top-left" | "top-right", offset: MascotOffset): string {
  const compact = compactOffset(offset) as keyof typeof COMPACT_LEFT_CLASS;
  return cx(
    "absolute bottom-full",
    perch === "top-left" ? OFFSET_LEFT[offset] : OFFSET_RIGHT[offset],
    perch === "top-left" ? COMPACT_LEFT_CLASS[compact] : COMPACT_RIGHT_CLASS[compact],
  );
}

/** Two or more mascots sitting side by side on one edge (the contact dialog, the about divider). */
export function MascotPerch({
  perch,
  offset = 0,
  children,
}: {
  perch: "top-left" | "top-right";
  offset?: MascotOffset;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      data-mascot-group=""
      className={cx(
        "pointer-events-none flex max-w-full items-end gap-2",
        perchClass(perch, offset),
      )}
    >
      {children}
    </div>
  );
}

export function mascotKey({ kind, pose, variant }: MascotPose): MascotShapeKey {
  return (variant ? `${kind}-${pose}-${variant}` : `${kind}-${pose}`) as MascotShapeKey;
}

/**
 * A brand mascot: decorative, so it is hidden from assistive tech, never takes a click or focus,
 * and has no motion. Inline SVG (no request); colours come from tokens. At most one mascot moment
 * per screen, never on cards, controls or over photos (`docs/ui/components/Mascot.md`).
 */
export function Mascot({ size, perch, offset = 0, className, ...pose }: MascotProps) {
  const perchClasses =
    perch === "word" ? "mascot-word-perch" : perch && perchClass(perch, offset as MascotOffset);
  const shape = MASCOT_SHAPES[mascotKey(pose)];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      shapeRendering="crispEdges"
      data-mascot={mascotKey(pose)}
      className={cx(
        "pointer-events-none block w-auto shrink-0 select-none",
        HEIGHT[size],
        HEIGHT_PHONE[size],
        COMPACT_HEIGHT_CLASS[size],
        perchClasses,
        className,
      )}
    >
      {shape.paths.map(([token, d, evenOdd]) => (
        <path
          key={d}
          fill={`var(--color-${token})`}
          fillRule={evenOdd ? "evenodd" : undefined}
          d={d}
        />
      ))}
    </svg>
  );
}
