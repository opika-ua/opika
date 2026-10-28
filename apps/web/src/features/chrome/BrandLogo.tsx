/**
 * The gallery-v3 header lockup (Figma `58:1617`) - a static asset
 * (`public/brand-v3/logo.svg`, see that folder's own README for
 * provenance), not inline JSX like the old `LogoMark` it replaces: it is
 * multi-coloured and already draws the wordmark as vector paths, so
 * there is nothing to recolour via `currentColor` the way the small
 * monochrome icons in `features/gallery/icons.tsx` do.
 *
 * Decorative (`alt=""`, `aria-hidden="true"`): the accessible name for
 * "Opika" comes from the sibling `sr-only` text `SiteHeader.tsx` renders
 * next to this image, not from this element - see that file's own comment
 * for why (the image contributes nothing to `.textContent`, which
 * `SiteHeader.test.tsx`'s "renders the wordmark as plain text" case reads
 * directly).
 *
 * Width/height HTML attributes are the asset's own intrinsic size,
 * unchanged (the hand-off's instruction: "don't redraw them or change their
 * width/height attributes") — they still only set the image's aspect
 * ratio and reserve its layout box; nothing here redraws the asset or edits
 * those numbers.
 *
 * Responsive display size added during the mobile proportion pass (owner,
 * verbatim: "reduce header icon size etc to make it look proportional"):
 * CSS `width` overrides the attribute for the actual rendered size, with
 * `h-auto` deriving the height from the intrinsic aspect ratio those
 * attributes still set, so there's one number to keep in sync, not two.
 * Below `desktop:`, smaller — found live, not assumed: at the fixed native
 * size the wordmark ate a disproportionate share of a 360-390px header next
 * to the nav links, the same "desktop asset at every width" gap as
 * `PillButton.tsx`'s pre-fix pills. `desktop:w-[153.875px]` restores the
 * exact original size unchanged above that breakpoint.
 */
export function BrandLogo() {
  return (
    <img
      src="/brand-v3/logo.svg"
      alt=""
      aria-hidden="true"
      width={153.875}
      height={39.2812}
      className="h-auto w-[120px] desktop:w-[153.875px]"
    />
  );
}
