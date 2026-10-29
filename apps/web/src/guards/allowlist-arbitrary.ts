import type { Reasoned } from "./ratchet";

/**
 * Arbitrary Tailwind values (`text-[15px]`, `h-[396px]`) per file: a ceiling and why. Seeded
 * 2026-10-28 from `docs/ui/inventory-2026-10.md`. A new one needs an entry with a real reason;
 * migrations only lower the numbers.
 */
export const ARBITRARY_VALUES: Readonly<Record<string, Reasoned>> = {
  "app/pro/page.tsx": { max: 6, reason: "Content pages; burns down in DS PR 3d." },
  "app/prytulkam/page.tsx": { max: 4, reason: "Content pages; burns down in DS PR 3d." },
  "app/tvaryny/[animalId]/not-found.tsx": {
    max: 7,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "app/tvaryny/error.tsx": { max: 7, reason: "Gallery surface; burns down in DS PR 3a." },
  "app/tvaryny/gortaty/error.tsx": {
    max: 7,
    reason: "Deck: hand-tuned swipe-card geometry, not in DS PR 3a-3d; migrates with the deck.",
  },
  "app/tvaryny/page.tsx": { max: 4, reason: "Gallery surface; burns down in DS PR 3a." },
  "features/animal-detail/AnimalDetailScreen.tsx": {
    max: 21,
    reason: "Pet card surface; burns down in DS PR 3b.",
  },
  "features/animal-detail/DetailPhotoGallery.tsx": {
    max: 3,
    reason: "Pet card surface; burns down in DS PR 3b.",
  },
  "features/animal-detail/PillButton.tsx": {
    max: 2,
    reason: "Pet card surface; burns down in DS PR 3b.",
  },
  "features/animal-overlay/AnimalOverlay.tsx": {
    max: 3,
    reason: "Pet card surface; burns down in DS PR 3b.",
  },
  "features/chrome/BrandLogo.tsx": {
    max: 2,
    reason: "Site header and footer; moves onto the kit with the first public surface migrated.",
  },
  "features/chrome/ContentPageLayout.tsx": {
    max: 3,
    reason: "Site header and footer; moves onto the kit with the first public surface migrated.",
  },
  "features/chrome/Footer.tsx": {
    max: 1,
    reason: "Site header and footer; moves onto the kit with the first public surface migrated.",
  },
  "features/chrome/MobileNavMenu.tsx": {
    max: 2,
    reason: "Site header and footer; moves onto the kit with the first public surface migrated.",
  },
  "features/chrome/SiteHeader.tsx": {
    max: 2,
    reason: "Site header and footer; moves onto the kit with the first public surface migrated.",
  },
  "features/controls/controls.tsx": {
    max: 3,
    reason:
      "Legacy link classes keep `aria-[current=page]:` variants until the kabinet moves to src/ui.",
  },
  "features/discovery/DeckScreen.tsx": {
    max: 6,
    reason: "Deck: hand-tuned swipe-card geometry, not in DS PR 3a-3d; migrates with the deck.",
  },
  "features/discovery/SwipeCard.tsx": {
    max: 13,
    reason: "Deck: hand-tuned swipe-card geometry, not in DS PR 3a-3d; migrates with the deck.",
  },
  "features/discovery/SwipeDeck.tsx": {
    max: 15,
    reason: "Deck: hand-tuned swipe-card geometry, not in DS PR 3a-3d; migrates with the deck.",
  },
  "features/gallery/FilterSheet.tsx": {
    max: 11,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "features/gallery/GalleryCard.tsx": {
    max: 8,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "features/gallery/GalleryControlBlock.tsx": {
    max: 5,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "features/gallery/GalleryFilterDropdowns.tsx": {
    max: 1,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "features/gallery/GalleryPageNav.tsx": {
    max: 3,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "features/gallery/GallerySortToggle.tsx": {
    max: 6,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "features/gallery/NoMatch.tsx": { max: 5, reason: "Gallery surface; burns down in DS PR 3a." },
  "features/gallery/OutOfRangeNotice.tsx": {
    max: 3,
    reason: "Gallery surface; burns down in DS PR 3a.",
  },
  "features/kabinet/JoinFailedCard.tsx": {
    max: 8,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/kabinet/KabinetBrand.tsx": {
    max: 6,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/kabinet/KabinetHome.tsx": {
    max: 13,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/kabinet/ProfileParts.tsx": {
    max: 14,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/kabinet/ShelterProfile.tsx": {
    max: 13,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/kabinet/SignInCard.tsx": {
    max: 13,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/kabinet/SignOutButton.tsx": {
    max: 4,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/kabinet/SupportBanner.tsx": {
    max: 7,
    reason: "Kabinet one-offs; replaced by kit components in Kabinet Phase 2 (after DS PR 2).",
  },
  "features/likes/SavedCardSkeleton.tsx": {
    max: 1,
    reason: "Shelter and saved pages; burns down in DS PR 3c.",
  },
  "features/likes/SavedPageScreen.tsx": {
    max: 12,
    reason: "Shelter and saved pages; burns down in DS PR 3c.",
  },
  "features/reveal/ContactRevealDialog.tsx": {
    max: 25,
    reason: "Contact-reveal dialog; folds into the kit Modal (pet card, DS PR 3b).",
  },
  "features/shelters/ShelterPageNav.tsx": {
    max: 3,
    reason: "Shelter and saved pages; burns down in DS PR 3c.",
  },
  "features/shelters/ShelterPageScreen.tsx": {
    max: 17,
    reason: "Shelter and saved pages; burns down in DS PR 3c.",
  },
  "features/shelters/ShelterSortToggle.tsx": {
    max: 6,
    reason: "Shelter and saved pages; burns down in DS PR 3c.",
  },
};
