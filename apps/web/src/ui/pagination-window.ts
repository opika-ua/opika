export type PaginationItem = number | "ellipsis";

const ALWAYS_EXPANDED_THRESHOLD = 7;

/**
 * Which page numbers to show: all of them up to 7 pages, otherwise first, last and the current one
 * with its neighbours, gaps marked as an ellipsis. Pure, so it is tested without a browser.
 */
export function paginationWindow(current: number, total: number): PaginationItem[] {
  if (total <= 0) return [];
  if (total <= ALWAYS_EXPANDED_THRESHOLD) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, total]);
  for (let page = current - 1; page <= current + 1; page++) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  const items: PaginationItem[] = [];
  let previous: number | null = null;
  for (const page of [...pages].sort((a, b) => a - b)) {
    if (previous !== null && page - previous > 1) items.push("ellipsis");
    items.push(page);
    previous = page;
  }
  return items;
}
