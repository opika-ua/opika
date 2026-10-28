import type { ShelterLogo } from "@opika/domain";
import Image from "next/image";
import { shelterInitialsOf } from "./shelter-logo-avatar";

/**
 * The 40px circle beside a shelter's name (pet card PR 3b §C): its logo, or
 * - with none set - a fallback circle of its own initials. Decorative either
 * way (`alt=""`/`aria-hidden`): the shelter's name is the information, shown
 * as text wherever this renders, same reasoning as the location icon next to
 * it in the design.
 */
export function ShelterLogoAvatar({
  logo,
  displayName,
  size = 40,
  className,
}: {
  logo: ShelterLogo | null;
  displayName: string;
  size?: number;
  /**
   * Responsive audit Phase 2 (2026-10-28): overrides the rendered box size
   * with a (possibly breakpoint-varying) Tailwind size class, so a caller
   * using a large `size` for a sharp image on a big screen isn't stuck
   * rendering that same large box at phone widths. `size` still sets the
   * `<Image>`'s intrinsic width/height either way - a larger `size` stays
   * sharp on a high-DPI phone even once this shrinks the visible box.
   */
  className?: string;
}) {
  if (logo === null) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-rg-fill-strong font-semibold text-rg-ink ${className ?? ""}`}
        style={className === undefined ? { width: size, height: size } : undefined}
      >
        {shelterInitialsOf(displayName)}
      </span>
    );
  }
  return (
    <Image
      src={logo.storageKey}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className ?? ""}`}
    />
  );
}
