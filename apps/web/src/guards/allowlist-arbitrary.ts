import type { Reasoned } from "./ratchet";

/**
 * Arbitrary Tailwind values (`text-[15px]`, `h-[396px]`) per file: a ceiling and why. Seeded
 * 2026-10-28 from `docs/ui/inventory-2026-10.md`. A new one needs an entry with a real reason;
 * migrations only lower the numbers.
 */
export const ARBITRARY_VALUES: Readonly<Record<string, Reasoned>> = {
  "app/tvaryny/page.tsx": { max: 4, reason: "Gallery surface; burns down in DS PR 3a." },
  "features/animal-overlay/AnimalOverlay.tsx": {
    max: 1,
    reason:
      "Overlay backdrop tint, safe-area top offset and rounded-corner clip-path have no token.",
  },
  "features/controls/controls.tsx": {
    max: 3,
    reason:
      "Legacy link classes keep `aria-[current=page]:` variants until the kabinet moves to src/ui.",
  },
  "features/discovery/SwipeCard.tsx": {
    max: 1,
    reason: "Two-letter monogram in a 20px circle; the 14px type floor would overflow it.",
  },
  "features/discovery/SwipeDeck.tsx": {
    max: 1,
    reason:
      "The not-a-judgement line hides below 360px, where it wraps to two lines and clips the deck.",
  },
  "features/gallery/FilterSheet.tsx": {
    max: 21,
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
    max: 6,
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
  "features/reveal/ContactRevealDialog.tsx": {
    max: 1,
    reason: "Dialog height cap of 85vh; no scale step. Folds into the kit Modal later.",
  },
};
