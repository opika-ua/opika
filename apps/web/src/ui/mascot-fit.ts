/**
 * Keeps a mascot inside the 16px content gutter on the narrowest phones (below `compact`, 360px).
 * Class names are literal so Tailwind sees them; the steps are pure so a test can pin them.
 */
export type MascotSizeStep = 32 | 48 | 64 | 96;
export type MascotOffsetStep = 0 | 4 | 8 | 16 | 24 | 32;

/** The widest inset a perched mascot keeps below `compact`; 16 is the gutter, for a perch on a full-width sheet. */
export const COMPACT_OFFSET_MAX = 16;

export function compactOffset(offset: MascotOffsetStep): MascotOffsetStep {
  return offset > COMPACT_OFFSET_MAX ? COMPACT_OFFSET_MAX : offset;
}

export const COMPACT_HEIGHT_CLASS = {
  32: "max-compact:h-8",
  48: "max-compact:h-8",
  64: "max-compact:h-8",
  96: "max-compact:h-12",
} as const satisfies Record<MascotSizeStep, string>;

export const COMPACT_LEFT_CLASS = {
  0: "max-compact:left-0",
  4: "max-compact:left-1",
  8: "max-compact:left-2",
  16: "max-compact:left-4",
} as const;
export const COMPACT_RIGHT_CLASS = {
  0: "max-compact:right-0",
  4: "max-compact:right-1",
  8: "max-compact:right-2",
  16: "max-compact:right-4",
} as const;
