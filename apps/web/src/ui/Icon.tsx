import type { ReactNode } from "react";
import { cx } from "./cx";

/** The kit's one inline-SVG set (merged from chrome/icons.tsx and gallery/icons.tsx). Monochrome: `currentColor`. */
const PATHS = {
  menu: <path d="M3 6H21M3 12H21M3 18H21" />,
  filter: <path d="M8 17H16M6 12H18M3 7H21" />,
  "chevron-down": <path d="M4 9L12 17L20 9" />,
  "chevron-right": <path d="M9 4L17 12L9 20" />,
  "chevron-left": <path d="M15 4L7 12L15 20" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="M6 6L18 18M18 6L6 18" />,
  check: <path d="M5 12.5L10 17.5L19 7" />,
  plus: <path d="M12 5V19M5 12H19" />,
  share: <path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />,
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z" />
  ),
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  chat: (
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
  ),
  mail: (
    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6" />
  ),
  globe: (
    <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  ),
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
