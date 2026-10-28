import type { ReactNode } from "react";
import { cx } from "./cx";

/** The kit's one inline-SVG set (merged from chrome/icons.tsx and gallery/icons.tsx). Monochrome: `currentColor`. */
const PATHS = {
  menu: <path d="M3 6H21M3 12H21M3 18H21" />,
  filter: <path d="M8 17H16M6 12H18M3 7H21" />,
  "chevron-down": <path d="M4 9L12 17L20 9" />,
  "chevron-right": <path d="M9 4L17 12L9 20" />,
  "chevron-left": <path d="M15 4L7 12L15 20" />,
  close: <path d="M6 6L18 18M18 6L6 18" />,
  check: <path d="M5 12.5L10 17.5L19 7" />,
  plus: <path d="M12 5V19M5 12H19" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

const SIZE = { sm: "size-4", md: "size-5", lg: "size-6" } as const;

export type IconProps = {
  name: IconName;
  size?: keyof typeof SIZE;
  className?: string;
} & ({ label?: undefined } | { label: string });

/** Decorative by default (`aria-hidden`); pass `label` only when the icon stands alone. */
export function Icon({ name, size = "lg", className, label }: IconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative by default; the title renders when `label` is set.
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      role={label === undefined ? undefined : "img"}
      aria-hidden={label === undefined ? true : undefined}
      className={cx("shrink-0", SIZE[size], className)}
    >
      {label === undefined ? null : <title>{label}</title>}
      {PATHS[name]}
    </svg>
  );
}
