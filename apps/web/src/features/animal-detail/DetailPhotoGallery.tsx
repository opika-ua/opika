"use client";

import type { AnimalPhoto } from "@opika/domain";
import { uk } from "@opika/i18n";
import Image from "next/image";
import { useState } from "react";

/**
 * O-10 (`docs/observations.md`) + critique C6 (`docs/design-critique.md`) —
 * one component, built together per O-10's own note ("same component, same
 * session — do not do them separately"). Before this, only `animal.photos[0]`
 * was ever viewable at size; the next three rendered as static, non-interactive
 * 88px thumbnails on desktop and not at all on mobile.
 *
 * Design: `docs/design/README.md`'s "04 Detail (D1/D2)" — desktop shows the
 * active photo (4:5, `desktop:aspect-[4/5]`) beside three 88px thumbnails,
 * `outline 3px #101112 offset 3` on whichever one is active; mobile shows the
 * active photo full-bleed with an 8px dot indicator (active filled `#101112`,
 * inactive outlined 2px `#63676B`). One component, not two — the breakpoint
 * split is CSS (`desktop:hidden` / `hidden desktop:flex`), matching how the
 * rest of this screen already reflows in one DOM tree rather than branching
 * in JS on viewport width (a Server Component one level up cannot know the
 * client's width at all).
 *
 * Capped at 4 photos shown (1 active + 3 alternatives) — the frame's own
 * fixed thumbnail count, not an arbitrary limit this component invented.
 * `activeIndex` is state into that capped slice, not into the full
 * `animal.photos` array, so clicking a thumbnail or dot swaps which of the
 * 4 is "active" without ever needing a 5th slot.
 *
 * Critique C6's actual question — does a landscape source photo crop a
 * subject out of frame inside the portrait 4:5 box? — has no new answer
 * here: `object-fit: cover` always fills the frame (the card's own
 * behaviour, already accepted), and no focal-point data exists anywhere in
 * the schema to crop toward instead. What changes is that this is now
 * verified against real, deliberately awkward source ratios (D-6,
 * `apps/web/public/seed-photos/d6-real/`) in the harness, rather than
 * asserted true from 9 same-ish placeholder photos that never stressed it.
 */
export function DetailPhotoGallery({
  photos,
  altFallback,
  pipsOverlay,
}: {
  photos: readonly AnimalPhoto[];
  /** `animal.name` — used when a photo's own `alt` is unset. */
  altFallback: string;
  /** The freshness-pips overlay (mobile only), rendered as a sibling so it
   * never has to know this component swaps photos underneath it. */
  pipsOverlay: React.ReactNode;
}) {
  const visible = photos.slice(0, 4);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = visible[activeIndex] ?? null;
  const thumbnails = visible
    .map((photo, index) => ({ photo, index }))
    .filter(({ index }) => index !== activeIndex);

  return (
    <>
      <div
        data-testid="detail-photo"
        className="relative w-full h-[380px] tablet:h-[480px] desktop:h-auto desktop:aspect-[4/5] rounded-rg-card overflow-hidden bg-rg-photo-placeholder"
      >
        {active && (
          <Image
            src={active.storageKey}
            alt={active.alt?.uk ?? altFallback}
            fill
            sizes={DETAIL_PHOTO_SIZES}
            priority={activeIndex === 0}
            className="object-cover"
          />
        )}
        {pipsOverlay}
        {/* Photo-gallery dots — distinct from the freshness pips above, which
            always render top-right regardless of how many photos exist.
            Bottom-centre keeps the two from ever overlapping. Only rendered
            when there's something to switch between. */}
        {visible.length > 1 && (
          <div
            className="desktop:hidden absolute left-1/2 -translate-x-1/2 bottom-4 flex gap-2"
            role="tablist"
            aria-label={uk.detail.photoGalleryLabel}
          >
            {visible.map((photo, index) => (
              <button
                key={photo.storageKey}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={uk.detail.photoGalleryDot.replace("{n}", String(index + 1))}
                data-testid="detail-photo-dot"
                onClick={() => setActiveIndex(index)}
                className={`size-4 flex items-center justify-center focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] rounded-full`}
              >
                <span
                  aria-hidden="true"
                  className={
                    index === activeIndex
                      ? "size-2 rounded-full bg-rg-ink"
                      : "size-2 rounded-full border-2 border-rg-ink-3"
                  }
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {thumbnails.length > 0 && (
        <div className="hidden desktop:flex gap-2">
          {thumbnails.map(({ photo, index }) => (
            <button
              key={photo.storageKey}
              type="button"
              aria-label={uk.detail.photoGalleryThumbnail.replace("{n}", String(index + 1))}
              data-testid="detail-photo-thumbnail"
              onClick={() => setActiveIndex(index)}
              className="relative w-22 h-22 rounded-rg-photo overflow-hidden bg-rg-photo-placeholder focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
            >
              <Image src={photo.storageKey} alt="" fill sizes="88px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Moved here from `AnimalDetailScreen.tsx` (O-10/C6) along with the photo
 * box itself — same `sizes` defect class `AnimalCard.tsx`'s own
 * `PHOTO_SIZES` was first found and fixed for: `sizes` is a promise about
 * how wide this image will be, the browser multiplies it by DPR before
 * choosing from `srcset`, and nothing in the toolchain checks the promise.
 * Overstating silently downloads a larger variant forever; understating
 * ships a blurry photo. Each clause is the maximum real width in its range.
 *
 * Needed the phone/tablet clause *split*: the container is `p-4 tablet:p-6`,
 * so a single `(max-width: 1023px)` clause would span two genuinely
 * different widths — 16px of padding a side below 600, 24px above it.
 *
 * Phone (<600):     `p-4`  -> 100vw - 32px.  328px at 360, measured.
 * Tablet (600-1023): `p-6`  -> 100vw - 48px.  720px at 768, measured.
 * Desktop (1024+):  the photo column is `desktop:w-[560px] desktop:flex-none`
 *                   — a constant 560px at every desktop width, not derived
 *                   from the viewport at all. Already exact; unchanged.
 *
 * This changes no variant selection at 360 @2x (328 x 2 = 656 still exceeds
 * `card`'s 640w and correctly resolves to `detail`), but the moment a
 * variant is added to the ladder an overstated `sizes` stops being dormant
 * and becomes a live overfetch — fixed on the same reasoning regardless.
 */
const DETAIL_PHOTO_SIZES =
  "(max-width: 599px) calc(100vw - 32px), (max-width: 1023px) calc(100vw - 48px), 560px";
