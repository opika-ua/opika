/**
 * Legacy token classes still in use, as per-file ceilings. `rg`: the V2 set; `fontRg`: e-Ukraine;
 * `brand`: the brand set (aliases of the single token set until DS PR 4); `bare`: the Keeper's
 * Voice set plus `font-sans` and `font-serif`. Seeded 2026-10-28. New UI uses the unprefixed
 * tokens and the type scale in `app/globals.css`; migrations only lower the numbers, to zero.
 */
export const TOKEN_CEILINGS: Readonly<
  Record<"rg" | "fontRg" | "brand" | "bare", Readonly<Record<string, number>>>
> = {
  rg: {
    "features/animal-detail/medical-labels.ts": 10,
    "features/chrome/RateLimitedScreen.tsx": 4,
    "features/gallery/FilterSheet.tsx": 18,
  },
  fontRg: {
    "features/chrome/RateLimitedScreen.tsx": 1,
    "features/gallery/FilterSheet.tsx": 2,
  },
  brand: {
    "app/tvaryny/page.tsx": 7,
    "features/gallery/card-text.ts": 6,
    "features/gallery/GalleryCard.tsx": 16,
    "features/gallery/GalleryControlBlock.tsx": 4,
    "features/gallery/GalleryFilterDropdowns.tsx": 8,
    "features/gallery/GalleryPageNav.tsx": 13,
    "features/gallery/GallerySortToggle.tsx": 11,
    "features/gallery/NoMatch.tsx": 11,
    "features/gallery/OutOfRangeNotice.tsx": 6,
  },
  bare: {},
};
