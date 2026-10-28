"use client";

import type { AnimalPhoto } from "@opika/domain";
import { uk } from "@opika/i18n";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleButton } from "./CircleButton";

/**
 * Pet card PR 5 (Figma `75:425`/`88:1929`): replaced the dot-indicator
 * (mobile) / thumbnail-strip (desktop) gallery (O-10, critique C6) with a
 * native `scroll-snap` slider, owner decision 7 - "native scroll-snap, with
 * no library. The next button scrolls one photo, and a prev button appears
 * once you've scrolled. Keep the existing DetailPhotoGallery behaviour (alt
 * text, keyboard) and swap its look." Kept from the old component: the same
 * cap (`visible = photos.slice(0, 3)`, unchanged from before this PR -
 * nothing here asked that cap to move), the same `altFallback` contract, and
 * real keyboard operability (the prev/next buttons are ordinary `<button>`s,
 * naturally tabbable - no roving-tabindex or `role="tablist"` machinery is
 * needed for a scroll-snap row the way it was for the old dot/thumbnail
 * controls, which this file no longer renders at all).
 *
 * 360x480, radius 30, gap 24 - the handoff's own numbers, not derived from
 * an existing token (none of this app's spacing/radius scales had a 30px
 * radius or a 360px fixed width before this). Uses the `detail` R2 variant
 * through `image-loader.ts`, unchanged from before this PR - only the frame
 * around each photo changed, not which image is requested.
 *
 * The "prev" button only appears once the strip has scrolled (owner decision
 * 7), tracked by the container's own `scrollLeft`, not a `useState` set from
 * `activeIndex` the way the old thumbnail highlight was - there is no single
 * "active" photo in a scroll-snap row the way there was with the old
 * click-to-select thumbnails; "has scrolled at all" is the one fact the
 * button's visibility actually needs.
 */
export function DetailPhotoGallery({
  photos,
  altFallback,
}: {
  photos: readonly AnimalPhoto[];
  /** `animal.name` - used when a photo's own `alt` is unset. */
  altFallback: string;
}) {
  const visible = photos.slice(0, 3);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  /** Mirrors `scrolled` at the other end: "next" hides once there's nothing
   * further to reveal, the same "no wrap-around" shape "prev" already had -
   * a real screenshot caught "next" staying visible (and clickable, doing
   * nothing) past the last photo while "prev" correctly disappeared at the
   * first. Starts `false`: a container `canScroll` ever renders for has
   * scroll position 0 on mount, which is never "at the end" by construction. */
  const [atEnd, setAtEnd] = useState(false);
  /**
   * `"unknown"` until a real measurement comes in, and treated as "there
   * might be something to scroll to" (the buttons' old, unconditional
   * behaviour) rather than hidden - happy-dom's `scrollWidth`/`clientWidth`
   * are both 0 with no real layout, so a naive "no overflow" default would
   * hide the buttons in every component test regardless of photo count.
   * `ResizeObserver` doesn't run real geometry there either, so this stays
   * `"unknown"` in tests and the buttons render exactly as before; only a
   * real browser's real box sizes ever flip it to `"fits"`.
   */
  const [overflow, setOverflow] = useState<SliderOverflow>("unknown");

  const measureOverflow = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    setOverflow(sliderOverflowOf(node.scrollWidth, node.clientWidth));
  }, []);

  useEffect(() => {
    measureOverflow();
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureOverflow]);

  const onScroll = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    setScrolled(node.scrollLeft > 0);
    // `+1` absorbs the same sub-pixel rounding slack `sliderOverflowOf` does.
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 1);
  }, []);

  const scrollBy = useCallback((direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: direction * PHOTO_STEP_PX, behavior: "smooth" });
  }, []);

  if (visible.length === 0) return null;
  // Found live: two photos narrow enough to both fit the panel's width need
  // no slider at all - the old unconditional "2+ photos means both buttons"
  // rule left a "next" button that scrolled nothing (owner feedback, PR 5
  // follow-up). `"unknown"` still counts as scrollable (see above).
  const canScroll = visible.length > 1 && overflow !== "fits";

  return (
    <div className="relative">
      <section
        ref={scrollerRef}
        onScroll={onScroll}
        aria-label={uk.detail.photoGalleryLabel}
        data-testid="detail-photo-scroller"
        className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory [scrollbar-width:none]"
      >
        {visible.map((photo, index) => (
          <div
            key={`${index}-${photo.storageKey}`}
            data-testid="detail-photo"
            // 360x480 (3:4) is the handoff's own number, but that's wider than a phone's
            // own content column once the page's p-4 (32px) gutters are subtracted - found
            // live, not assumed: a real page-level horizontal scrollbar, constant regardless
            // of viewport, because this cell stayed a fixed 360px wide underneath it.
            // `w-[min(...)]` keeps the designed 360px width everywhere it fits and only
            // shrinks below that; `aspect-[3/4]` (not a fixed height) keeps the photo's own
            // proportions correct once the width does shrink, rather than cropping shorter.
            className="relative aspect-[3/4] w-[min(360px,calc(100vw-2rem))] flex-none snap-start overflow-hidden rounded-[30px] bg-brand-line"
          >
            <Image
              src={photo.storageKey}
              alt={photo.alt?.uk ?? altFallback}
              fill
              sizes="(max-width: 392px) calc(100vw - 32px), 360px"
              priority={index === 0}
              className="object-cover"
            />
          </div>
        ))}
      </section>

      {canScroll && scrolled && (
        <CircleButton
          onClick={() => scrollBy(-1)}
          aria-label={uk.detail.photoPrev}
          data-testid="detail-photo-prev"
          className="absolute left-6 top-1/2 -translate-y-1/2"
        >
          {/* `unoptimized`: a static icon, not a real photo key - the custom
          loader (`image-loader.ts`) ignores `width` for these regardless,
          and Next warns on a loader that does. */}
          <Image
            src="/pet-card/icon-chevron-next.svg"
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            unoptimized
            className="rotate-90"
          />
        </CircleButton>
      )}
      {canScroll && !atEnd && (
        <CircleButton
          onClick={() => scrollBy(1)}
          aria-label={uk.detail.photoNext}
          data-testid="detail-photo-next"
          className="absolute right-6 top-1/2 -translate-y-1/2"
        >
          <Image
            src="/pet-card/icon-chevron-next.svg"
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            unoptimized
            className="-rotate-90"
          />
        </CircleButton>
      )}
    </div>
  );
}

/** 360px photo width + 24px gap - one slider "step," matching the frame's own numbers. */
const PHOTO_STEP_PX = 384;

export type SliderOverflow = "unknown" | "overflows" | "fits";

/**
 * Pure, so the "is there really anything to scroll to" decision is testable
 * without a real layout pass - `clientWidth` is 0 whenever the node hasn't
 * been laid out yet (every component test; happy-dom never lays anything
 * out), which is not the same fact as "0 width of real content fits in 0
 * width of real container," so that case stays `"unknown"` rather than
 * being read as `"fits"`. The `+1` absorbs sub-pixel rounding between the
 * two measurements, which a real browser's layout can introduce even when
 * nothing is actually cut off.
 */
export function sliderOverflowOf(scrollWidth: number, clientWidth: number): SliderOverflow {
  if (clientWidth === 0) return "unknown";
  return scrollWidth > clientWidth + 1 ? "overflows" : "fits";
}
