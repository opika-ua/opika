import { GALLERY_PAGE_SIZE } from "@opika/contracts";
import { uk } from "@opika/i18n";

/**
 * E4, `docs/design/README.md`'s "Loading (L1/L2)" — this is the only thing
 * that gives that mock a render path at all. Next.js's route-level
 * `loading.tsx` convention: this file implicitly wraps `page.tsx` in a
 * Suspense boundary, so it appears during a client-side (JS-on) navigation
 * to `/tvaryny` while `renderGallery`'s `Promise.all` is still pending, and
 * is swapped out atomically once real content is ready. See
 * `docs/gallery-contract-decisions.md`'s "loading.tsx and error.tsx are
 * JS-only paths" note — with JS disabled this file never renders; the
 * browser's own native loading UI is what a no-JS visitor sees instead.
 *
 * The mock's L1 frame shows the header and rail already carrying real,
 * selected filter state (Бровари, Собаки, Середній chips active) — but
 * that state depends on the same `cities.list()`/`gallery.list()` fetch
 * this skeleton exists because we don't have yet. Reproducing specific
 * chip selections here would mean either a second, duplicate data fetch
 * (defeating the point of a skeleton) or guessing — so the rail and the
 * result-count/sort row are generic placeholder blocks, not a live
 * rendering of `FilterRail`/`SortControl`. Only the grid — the part the
 * mock's own `aria-busy="true"` actually targets — is a literal skeleton
 * of the real card shape.
 */
export default function Loading() {
  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <header className="min-h-14 tablet:min-h-16 desktop:min-h-17 flex items-center bg-rg-surface px-4 tablet:px-6 desktop:px-15">
        <span className="font-bold text-[19px] text-rg-ink">Opika</span>
      </header>

      <div className="p-4 tablet:p-6 desktop:pt-10 desktop:px-15 desktop:pb-14">
        <div className="desktop:flex desktop:gap-8 desktop:items-start">
          <div
            aria-hidden="true"
            className="hidden desktop:flex flex-col gap-7 w-70 shrink-0 rounded-rg-card bg-rg-surface p-6 h-fit"
          >
            <div className="h-6 w-20 rounded-rg-tag bg-rg-fill" />
            <div className="flex flex-col gap-3">
              <div className="h-3 w-16 rounded-rg-tag bg-rg-fill" />
              <div className="h-12 w-full rounded-rg-chip bg-rg-fill" />
            </div>
            <div className="flex flex-col gap-3">
              <div className="h-3 w-16 rounded-rg-tag bg-rg-fill" />
              <div className="h-12 w-full rounded-rg-chip bg-rg-fill" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div aria-hidden="true" className="h-9 w-64 rounded-rg-tag bg-rg-fill-strong" />
              <div
                aria-hidden="true"
                className="hidden desktop:block h-12 w-52 rounded-rg-button bg-rg-surface"
              />
            </div>

            <div
              data-testid="gallery-loading-grid"
              aria-busy="true"
              className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4 gap-4 desktop:gap-6 desktop:max-w-[960px] wide:max-w-[1320px]"
            >
              {Array.from({ length: GALLERY_PAGE_SIZE }, (_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {uk.galleryLoading.liveRegion}
      </p>
    </div>
  );
}

/**
 * Photo `#DCDCD9` (rg-fill-strong), text bars `#F2F2F0` (rg-fill) except
 * the name bar, which shares the photo's `#DCDCD9` — `Opika Registry
 * Frames.dc.html`'s L1 frame states both explicitly. No shimmer, no pulse
 * — docs/design/README.md: "an opacity pulse would read as a data state."
 */
function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="font-rg bg-rg-surface rounded-rg-card p-3 flex flex-col gap-4"
    >
      <div className="aspect-[4/5] rounded-rg-photo bg-rg-fill-strong" />
      <div className="flex flex-col gap-3 px-2 pb-2">
        <div className="w-27 h-5 rounded-rg-tag bg-rg-fill-strong" />
        <div className="w-full h-3.5 rounded-rg-tag bg-rg-fill" />
        <div className="w-37 h-3.5 rounded-rg-tag bg-rg-fill" />
        <div className="w-31 h-3 rounded-rg-tag bg-rg-fill" />
      </div>
    </div>
  );
}
