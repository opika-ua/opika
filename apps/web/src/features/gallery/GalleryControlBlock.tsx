import type { ReactNode } from "react";

/**
 * The gallery's control block. From 1024px: the title, then one row of fields and the sort toggle
 * (`children`), always visible. Below it (filters v2): the title, the species switch at full width,
 * one row with the «Фільтри» pill and the sort toggle, the row of active-filter chips, and the
 * result count. The two sets are separate DOM copies, each hidden by CSS at the width the other
 * owns, so neither needs JS to appear.
 */
export function GalleryControlBlock({
  title,
  trailing,
  mobileSpecies,
  mobileSort,
  mobileChips,
  mobileCount,
  children,
}: {
  title: ReactNode;
  /** `FilterSheet`'s own trigger; self-hides from `desktop:`. */
  trailing: ReactNode;
  /** The species toggle at full width (a second DOM copy of the desktop row's own). */
  mobileSpecies?: ReactNode;
  /** A second sort toggle, beside `trailing`. */
  mobileSort?: ReactNode;
  /** The active-filter chips; renders nothing when no filter is on. */
  mobileChips?: ReactNode;
  /** The visible result line. */
  mobileCount?: ReactNode;
  /** The desktop row's content: the fields and the sort toggle. */
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      {title}

      <div className="flex flex-col gap-3 desktop:hidden">
        {mobileSpecies}
        {/* One row at every phone width (filters v2 M1): the pill and the sort never wrap, except below 360px where they would overflow. */}
        <div className="flex items-center justify-between gap-x-3 max-compact:flex-wrap max-compact:gap-y-2">
          {trailing}
          {mobileSort}
        </div>
        {mobileChips}
        {mobileCount}
      </div>

      <div
        data-testid="gallery-filter-row"
        className="hidden items-start justify-between gap-4 desktop:flex"
      >
        {children}
      </div>
    </div>
  );
}
