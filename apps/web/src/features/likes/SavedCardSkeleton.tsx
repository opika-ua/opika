/**
 * Designer feedback batch C: shown immediately once the saved ids are known
 * (before `animals.cardsByIds` resolves), one per saved id, matching
 * `AnimalCard`'s own box model (`gap-4 ... rounded-rg-card p-3`, a
 * `aspect-[4/5]` photo block, two text lines) closely enough that swapping
 * a skeleton for the real card causes no layout shift. Not a pixel match -
 * `docs/standing-constraints.md`'s "test logic, not looks" era builds no
 * new visual test for this, and none is added here.
 */
export function SavedCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-4 rounded-rg-card bg-rg-surface p-3 box-border animate-pulse"
    >
      <div className="w-full aspect-[4/5] rounded-rg-photo bg-rg-fill" />
      <div className="flex flex-col gap-3 px-2 pb-2">
        <div className="flex flex-col gap-1">
          <div className="h-6 w-3/4 rounded-rg-chip bg-rg-fill" />
          <div className="h-4 w-1/2 rounded-rg-chip bg-rg-fill" />
        </div>
      </div>
    </div>
  );
}
