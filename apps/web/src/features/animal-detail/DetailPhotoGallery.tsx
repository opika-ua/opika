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
 * Design: `docs/design/README.md`'s "04 Detail" prose (`### Detail (04)`) and
 * the D1 (1920 desktop) / D2 (360 mobile) frame pins, both opened directly in
 * the mock file itself (`Opika Registry Frames.dc.html`), not a paraphrase —
 * `docs/standing-constraints.md`'s "when a mock exists, open the mock file."
 * The mock shows exactly 3 photos total: D1's main photo beside three 88px
 * thumbnails that include the active photo (not three *alternatives* to it),
 * the active one carrying `outline: 3px #101112, offset 3`. Clicking a
 * different thumbnail changes which photo is active — the thumbnail itself
 * stays in the row, it isn't swapped out. D2 shows the active photo
 * full-bleed with an 8px dot cluster at the photo's own bottom-right corner
 * (`right: 16px; bottom: 16px` in the mock), one dot per photo, active
 * filled `#101112`, inactive outlined 2px `#63676B` — same "all of them,
 * mark which is active" shape as the thumbnails, just dots instead of
 * images. Neither frame overlays freshness on the photo — see O-22
 * (`docs/observations.md`) for that surface's own history.
 *
 * One component, not two — the breakpoint split is CSS (`desktop:hidden` /
 * `hidden desktop:flex`), matching how the rest of this screen already
 * reflows in one DOM tree rather than branching in JS on viewport width (a
 * Server Component one level up cannot know the client's width at all).
 *
 * Capped at 3 photos shown — the frame's own fixed count, confirmed against
 * the mock file directly. The mock doesn't say what happens with a 4th or
 * later photo; `docs/decisions-inbox/feat-d-6-detail-photo-gallery.md`
 * (D6-2) records that as Oleksii's call, not defaulted here — and it is a
 * live question, not a hypothetical one: `photoCount = 1 + (i % 5)` gives
 * about 2 in 5 of the seeded corpus 4 or 5 photos already, so a real share
 * of published animals already lose at least one photo to this cap today.
 *
 * Dot spacing is wider than the mock's own 6px gap between 8px decorative
 * dots — a deliberate, accepted deviation, not an oversight: the mock's
 * dots were never meant to be independently tappable (there's no touch
 * target drawn around them at all), while `docs/design/README.md:200`'s
 * 48px floor applies the moment they become real buttons. `gap-2` (8px)
 * between 48px targets is the closest spacing that still keeps adjacent
 * dots from being accidentally double-hit.
 *
 * Critique C6's actual question — does a landscape source photo crop a
 * subject out of frame inside the portrait 4:5 box? — has no new answer
 * here: `object-fit: cover` always fills the frame (the card's own
 * behaviour, already accepted), and no focal-point data exists anywhere in
 * the schema to crop toward instead. What changes is that this is now
 * verified against real, deliberately awkward source ratios (D-6,
 * `apps/web/public/seed-photos/d6-real/`) — checked live against a real
 * seeded animal in a real browser (desktop breakpoint, documented in this
 * row's own PR body rather than asserted), not assumed true from 9
 * same-ish placeholder photos that never stressed it. No automated harness
 * coverage of the crop itself: there's nothing to assert numerically once
 * `object-fit: cover` is accepted as the mechanism (it has no "correct"
 * output to compare against without focal-point data).
 *
 * Known, accepted gap, not fixed here: an active thumbnail that also holds
 * keyboard focus distinguishes the two states by outline colour alone
 * (`outline-rg-ink` vs `focus-visible:outline-rg-registry`), which CSS
 * resolves by source order rather than anything this component controls
 * explicitly. No test covers this combined state; nothing on the STOP list
 * is implicated.
 */
export function DetailPhotoGallery({
  photos,
  altFallback,
}: {
  photos: readonly AnimalPhoto[];
  /** `animal.name` — used when a photo's own `alt` is unset. */
  altFallback: string;
}) {
  const visible = photos.slice(0, 3);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = visible[activeIndex] ?? null;

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
        {visible.length > 1 && (
          <div
            className="desktop:hidden absolute right-4 bottom-4 flex gap-2"
            role="tablist"
            aria-label={uk.detail.photoGalleryLabel}
          >
            {visible.map((photo, index) => (
              <button
                key={`${index}-${photo.storageKey}`}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={uk.detail.photoGalleryDot.replace("{n}", String(index + 1))}
                data-testid="detail-photo-dot"
                onClick={() => setActiveIndex(index)}
                // 48px minimum target (docs/design/README.md: "48px minimum
                // target everywhere"), the 8px visual dot centred inside it
                // — same "small visual, real hit area" shape O-19
                // (docs/observations.md) exists to keep from regressing.
                className="size-12 flex items-center justify-center focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] rounded-full"
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

      {visible.length > 1 && (
        <div className="hidden desktop:flex gap-2">
          {visible.map((photo, index) => (
            <button
              key={`${index}-${photo.storageKey}`}
              type="button"
              aria-pressed={index === activeIndex}
              aria-label={uk.detail.photoGalleryThumbnail.replace("{n}", String(index + 1))}
              data-testid="detail-photo-thumbnail"
              onClick={() => setActiveIndex(index)}
              className={`relative w-22 h-22 rounded-rg-photo overflow-hidden bg-rg-photo-placeholder focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] ${
                index === activeIndex
                  ? "outline outline-[3px] outline-offset-[3px] outline-rg-ink"
                  : ""
              }`}
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
