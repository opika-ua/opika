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
}: {
  logo: ShelterLogo | null;
  displayName: string;
  size?: number;
}) {
  if (logo === null) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-rg-fill-strong font-semibold text-rg-ink"
        style={{ width: size, height: size }}
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
      className="shrink-0 rounded-full object-cover"
    />
  );
}
