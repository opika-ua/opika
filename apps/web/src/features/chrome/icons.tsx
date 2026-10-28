/**
 * Chrome's own small monochrome icon(s), same visual language as the
 * gallery-v3 redesign's icons (`features/gallery/icons.tsx`): inlined as
 * JSX, `stroke="currentColor"` so the caller's own text-colour class
 * recolours it, same `strokeWidth`/no-fill convention as `FilterIcon`
 * there. One icon lives here rather than in that file because it's a
 * `chrome/`-level control (the header's own nav toggle), not a gallery
 * one - `SiteHeader.tsx` importing from `features/gallery/` would read as
 * the more foundational component depending on the more specific one.
 */

/** 24x24, three equal horizontal bars - the mobile nav drawer's toggle (`MobileNavMenu.tsx`). */
export function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M3 6H21" strokeWidth="2" stroke="currentColor" />
      <path d="M3 12H21" strokeWidth="2" stroke="currentColor" />
      <path d="M3 18H21" strokeWidth="2" stroke="currentColor" />
    </svg>
  );
}
