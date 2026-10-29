import type { ShelterLogo } from "@opika/domain";
import { Avatar, type AvatarProps } from "../../ui/Avatar";

/**
 * A shelter's logo, or its initials, on the kit's one Avatar. Kept as a thin adapter so the callers
 * that hold a nullable `ShelterLogo` (animal page, kabinet logo section) need no branching of their own.
 */
export function ShelterLogoAvatar({
  logo,
  displayName,
  size,
}: {
  logo: ShelterLogo | null;
  displayName: string;
  size?: AvatarProps["size"];
}) {
  return logo === null ? (
    <Avatar kind="initials" name={displayName} {...(size ? { size } : {})} />
  ) : (
    <Avatar kind="logo" src={logo.storageKey} {...(size ? { size } : {})} />
  );
}
