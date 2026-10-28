/**
 * Designer feedback batch C: shown immediately once the saved ids are known
 * (before `animals.cardsByIds` resolves), one per saved id, matching
 * `GalleryCard`'s own box model (`aspect-[328/480]`, `rounded-brand-card`)
 * closely enough that swapping a skeleton for the real card causes no
 * layout shift. Not a pixel match - `docs/standing-constraints.md`'s "test
 * logic, not looks" era builds no new visual test for this, and none is
 * added here.
 */
export function SavedCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[328/480] animate-pulse overflow-clip rounded-brand-card bg-brand-line"
    />
  );
}
