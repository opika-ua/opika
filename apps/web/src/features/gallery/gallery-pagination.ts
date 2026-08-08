export type PaginationItem = number | "ellipsis";

/**
 * Whether page controls exist at all for this result set. Exported rather
 * than spelled out twice because two files depend on the same answer and
 * would fail differently if they disagreed: `GalleryPagination` returns
 * null below it, and `app/tvaryny/page.tsx` gates the skip link that
 * targets `#pagination` on it. A skip link pointing at an element that
 * isn't rendered is a keyboard dead end, and nothing about it looks wrong
 * in either file on its own.
 */
export const hasPagination = (totalPages: number): boolean => totalPages > 1;

/**
 * `docs/build-plan.md`'s E3 row specifies "numbered pages with prev/next,
 * active page leaf-filled, all targets 44px" — it does not specify a
 * windowing algorithm for how many page links to draw once `totalPages`
 * grows past what fits on a phone screen, so this is E3's own call, not a
 * design deviation (there is no exact value here to deviate from).
 *
 * Drawing every page up to the navigable bound (`maxNavigablePage`,
 * `packages/domain` — 84 pages at 24/page) would mean up to 84 × 44px
 * targets, three rows of them on a 390px phone. At or below
 * `ALWAYS_EXPANDED_THRESHOLD`, every page is drawn with no gaps (small
 * counts read better fully spelled out than abbreviated). Above it, only
 * page 1, the last page, and a `current`-1..`current`+1 band are drawn,
 * with an "ellipsis" marker for
 * each gap — worst case (current mid-range) is 5 numbers + 2 ellipses, a
 * fixed upper bound regardless of `totalPages`, so this never needs a
 * viewport-conditional variant: the same window at every width, always
 * narrow enough to fit a 390px row (5 × 44px + 2 × ~24px ≈ 268px).
 */
const ALWAYS_EXPANDED_THRESHOLD = 7;

export function paginationWindow(current: number, total: number): PaginationItem[] {
  if (total <= 0) return [];
  if (total <= ALWAYS_EXPANDED_THRESHOLD) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total]);
  for (let page = current - 1; page <= current + 1; page++) {
    if (page >= 1 && page <= total) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let previous: number | null = null;
  for (const page of sorted) {
    if (previous !== null && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
    previous = page;
  }
  return items;
}
