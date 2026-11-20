import Image from "next/image";

/**
 * The header lockup (Figma `58:1617`): a multi-colour static SVG (`public/brand-v3/logo.svg`,
 * provenance in that folder's README), so it cannot be a monochrome kit `Icon` and has no photo
 * variants or aspect box for `Photo`. `unoptimized` serves the file as-is, with no loader or
 * `/_next/image` hop. Decorative: the accessible name "Opika" is the sibling `sr-only` text in
 * `SiteHeader`.
 *
 * `width`/`height` stay the asset's own intrinsic size (the hand-off's instruction) and only fix
 * the aspect ratio; the rendered size is the classes: 120px wide on a phone, 154px (the asset's
 * 153.875) from desktop.
 */
export function BrandLogo() {
  return (
    <Image
      src="/brand-v3/logo.svg"
      alt=""
      aria-hidden="true"
      width={153.875}
      height={39.2812}
      unoptimized
      loading="eager"
      className="h-auto w-30 desktop:w-38.5"
    />
  );
}
