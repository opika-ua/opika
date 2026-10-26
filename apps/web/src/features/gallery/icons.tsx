/**
 * The gallery-v3 redesign's small monochrome icons (Figma `58:1617`:
 * `icon-filter.svg`, `icon-chevron-down.svg`, `icon-chevron-next.svg` -
 * `D:\opika-worktrees\_incoming\figma-gallery\`). Inlined as JSX, not
 * static files, because each is 1-3 paths: `stroke="currentColor"`
 * replaces the source files' hardcoded hex (`#FAF8F9` on the filter icon,
 * `#270041` on the chevrons - both happen to equal this PR's `brand-on-ink`
 * and `brand-ink` tokens) so one icon recolours via the caller's own text
 * colour class, the same convention `SiteHeader.tsx`'s pre-existing
 * `LogoMark` already uses for its hand-drawn mark. The multi-colour logo
 * lockup (`public/brand-v3/logo.svg`) is the one asset that stays a static
 * file - recolouring doesn't apply to a fixed multi-colour logotype.
 *
 * Every source SVG also carried an embedded C2PA metadata blob (see
 * `public/brand-v3/README.md`) - not reproduced here either, for the same
 * "provenance, not rendered content" reason.
 */

/** 24x24, three horizontal bars - the «Фільтр» button's icon. */
export function FilterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M8 17H16" strokeWidth="2" stroke="currentColor" />
      <path d="M6 12H18" strokeWidth="2" stroke="currentColor" />
      <path d="M3 7H21" strokeWidth="2" stroke="currentColor" />
    </svg>
  );
}

/** 20x20 - the four filter dropdowns' own disclosure caret. */
export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M3.33333 7.5L10 14.1667L16.6667 7.5" strokeWidth="1.5" stroke="currentColor" />
    </svg>
  );
}

/**
 * 24x24. The source hand-off supplied `icon-chevron-prev.svg` and
 * `icon-chevron-next.svg` separately, but both carried the identical
 * down-pointing path - one merely at `opacity="0.2"` - rather than a real
 * left/right pair. Treated as an asset-prep artefact, not a deliberate
 * "always-dim prev" affordance: this repo's pagination already renders a
 * disabled prev as wholly *absent*, not dimmed (`GalleryPageNav.tsx`,
 * matching the pre-existing `GalleryPagination`'s own behaviour), so a
 * baked-in opacity would be a second, redundant and contradictory way of
 * saying the same thing. One glyph, rotated by the caller via a `rotate-90`/
 * `-rotate-90` class, is both simpler and actually produces a left/right
 * pair instead of two copies of a down chevron.
 */
export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 9L12 17L20 9" strokeWidth="2" stroke="currentColor" />
    </svg>
  );
}
