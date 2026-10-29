import type { FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Pagination } from "../../ui/Pagination";
import type { CitySlugsById } from "./filter-url";
import { galleryPageHref } from "./filter-url";
import { hasPagination } from "./gallery-pagination";

interface GalleryPageNavProps {
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
  page: number;
  totalPages: number;
}

/**
 * The kit's `Pagination` with the gallery's URL scheme. The wrapper is the skip link's target
 * (`#pagination`, focusable without being a Tab stop) because the kit nav carries no id.
 */
export function GalleryPageNav({
  filters,
  sort,
  citySlugs,
  page,
  totalPages,
}: GalleryPageNavProps) {
  if (!hasPagination(totalPages)) return null;

  return (
    <div id="pagination" tabIndex={-1} data-testid="gallery-pagination" className="mt-6 pt-2">
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) => galleryPageHref(filters, sort, target, citySlugs)}
        navLabel={uk.pagination.navLabel}
        prevLabel={uk.pagination.prev}
        nextLabel={uk.pagination.next}
        pageLabel={uk.pagination.pageLabel}
        currentLabel={uk.pagination.current}
        ofTotalLabel={uk.pagination.ofTotal.replace("{total}", String(totalPages))}
      />
    </div>
  );
}
