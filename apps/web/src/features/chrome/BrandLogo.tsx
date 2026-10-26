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
 * Width/height are the asset's own intrinsic size, unchanged (the
 * hand-off's instruction: "don't redraw them or change their width/height
 * attributes") — no CSS override on top of them either, so it renders at
 * that same native size at every breakpoint. No mobile-specific variant
 * was supplied and the mobile header is otherwise unspecified by this
 * redesign (`CLAUDE.md`'s "when no mock exists, the prose is the spec"
 * has no prose for this case either, so nothing is invented); a narrow
 * viewport falls back on `SiteHeader`'s own pre-existing `flex-wrap`.
 */
export function BrandLogo() {
  return (
    <img src="/brand-v3/logo.svg" alt="" aria-hidden="true" width={153.875} height={39.2812} />
  );
}
