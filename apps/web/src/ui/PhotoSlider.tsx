"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Photo } from "./Photo";

/**
 * CSS scroll-snap, so swiping is the browser's own and works without JS. Later slides load only when
 * about half a slide away: Chrome's own lazy threshold is too far to spare a 412px slide.
 */
const SLIDE = {
  peek: "w-4/5 max-w-90",
  full: "w-full max-w-90",
} as const;

/** `hero` from desktop: whole photos in view, never a part of one. */
const ROW_VIEW = 3;
// The 24px gap is each slide's 12+12 padding with the scroller pulled out 12 each side: a slide is
// exactly one step wide, and the outer photos sit on the row's edges.
// Set on the scroller for its children, so ten slides don't each repeat them in the page's HTML.
const ROW_SLIDE = [
  "*:w-full *:flex-none *:snap-start desktop:*:px-3 desktop:*:w-full",
  "*:w-full *:flex-none *:snap-start desktop:*:px-3 desktop:*:w-1/2",
  "*:w-full *:flex-none *:snap-start desktop:*:px-3 desktop:*:w-1/3",
] as const;

export type PhotoSliderItem = { src: string; alt: string };

type Common = {
  photos: readonly PhotoSliderItem[];
  /** The `sizes` of one slide, as for Photo. */
  sizes: string;
  /** Names the scrolling region. */
  label: string;
  prevLabel: string;
  nextLabel: string;
  /** Photo proportions; `portrait` (4:5) by default, `tall` (3:4). */
  aspect?: "portrait" | "tall";
  className?: string;
};

/** `peek`: 80% wide so the next slide shows. `full`: one slide fills the row (still capped at 360px). */
type Plain = { slide?: "peek" | "full" };

/**
 * Phone: edge to edge, dots and «N/M». Desktop: up to three whole photos; with more, each arrow moves
 * one photo and a «first–last of total» counter sits on the last one in view.
 */
type Hero = {
  slide: "hero";
  /** The phone counter's accessible name: `{n}` and `{total}` filled in («Фото {n} з {total}»). */
  counterTemplate: string;
  /** The desktop arrows' names (`prevLabel`/`nextLabel` name the phone's). */
  rowPrevLabel: string;
  rowNextLabel: string;
  /** The desktop counter, visible and announced: `{first}`, `{last}`, `{total}`. */
  rowCounterTemplate: string;
};

export type PhotoSliderProps = Common & (Plain | Hero);

type Arrow = "phone-prev" | "phone-next" | "row-prev" | "row-next";
const PARTNER: Record<Arrow, Arrow> = {
  "phone-prev": "phone-next",
  "phone-next": "phone-prev",
  "row-prev": "row-next",
  "row-next": "row-prev",
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function PhotoSlider(props: PhotoSliderProps) {
  const { photos, sizes, label, prevLabel, nextLabel, aspect = "portrait", className } = props;
  const hero = props.slide === "hero";
  const count = photos.length;
  const scrollerRef = useRef<HTMLElement | null>(null);
  // `peek`/`full`: read from the scroll extents.
  const [edges, setEdges] = useState({ prev: false, next: false });
  // `hero`: the first photo in view, and how many fit (one on a phone, up to three from desktop).
  const [first, setFirst] = useState(0);
  const [perView, setPerView] = useState(1);
  // Where an arrow sent the row while it glides there: scroll events in between must not move the
  // counter back, and a second press goes on from it.
  const target = useRef<number | null>(null);
  const arrows = useRef<Partial<Record<Arrow, HTMLButtonElement | null>>>({});
  const refocus = useRef<Arrow | null>(null);
  // Sticky: an armed slide keeps its image, so scrolling back never blanks it.
  const [armed, setArmed] = useState<ReadonlySet<number>>(() => new Set([0]));

  const measure = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    if (!hero) {
      setEdges({
        prev: node.scrollLeft > 0,
        next: node.scrollLeft + node.clientWidth < node.scrollWidth - 1,
      });
      return;
    }
    if (count === 0 || node.scrollWidth === 0) return;
    // Slides carry their gap as padding, so every slide is one step wide.
    const step = node.scrollWidth / count;
    const view = clamp(Math.round(node.clientWidth / step), 1, count);
    const at = clamp(Math.round(node.scrollLeft / step), 0, count - view);
    setPerView(view);
    if (target.current !== null && at !== target.current) return;
    target.current = null;
    setFirst(at);
  }, [hero, count]);

  useEffect(() => {
    measure();
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || count < 2) return;
    const arm = (indexes: number[]) =>
      setArmed((prev) => {
        const next = new Set(prev);
        for (const index of indexes) next.add(index);
        return next.size === prev.size ? prev : next;
      });
    if (typeof IntersectionObserver === "undefined") {
      arm(Array.from({ length: count }, (_, index) => index));
      return;
    }
    const slides = Array.from(node.children);
    const observer = new IntersectionObserver(
      (entries) => {
        arm(
          entries
            .filter((entry) => entry.isIntersecting)
            .map((entry) => slides.indexOf(entry.target))
            .filter((index) => index >= 0),
        );
      },
      { root: node, rootMargin: "0px 50% 0px 50%" },
    );
    for (const slide of slides) observer.observe(slide);
    return () => observer.disconnect();
  }, [count]);

  // An arrow that has just hidden (an end reached) hands its focus to the other one.
  useEffect(() => {
    const arrow = refocus.current;
    if (arrow === null) return;
    refocus.current = null;
    arrows.current[PARTNER[arrow]]?.focus();
  }, [first]);

  // A jump, not a glide, for visitors who asked the system for less motion.
  const behavior = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  const stepPlain = (direction: 1 | -1) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.9, behavior: behavior() });
  };

  const stepHero = (arrow: Arrow, direction: 1 | -1, button: HTMLButtonElement) => {
    const node = scrollerRef.current;
    if (!node || count === 0) return;
    const from = target.current ?? first;
    const to = clamp(from + direction, 0, count - perView);
    if (to === from) return;
    const atEnd = direction === 1 ? to + perView >= count : to === 0;
    if (atEnd && document.activeElement === button) refocus.current = arrow;
    target.current = to;
    setFirst(to);
    node.scrollTo({ left: to * (node.scrollWidth / count), behavior: behavior() });
  };

  if (count === 0) return null;

  const canPrev = hero ? first > 0 : edges.prev;
  const canNext = hero ? first + perView < count : edges.next;
  const arrowButton = (arrow: Arrow, direction: 1 | -1, name: string, place: string) => (
    <Button
      ref={(node) => {
        arrows.current[arrow] = node;
      }}
      variant={arrow.startsWith("row") ? "scrim" : "icon"}
      aria-label={name}
      onClick={(event) =>
        hero ? stepHero(arrow, direction, event.currentTarget) : stepPlain(direction)
      }
      className={cx("absolute top-1/2 -translate-y-1/2", place)}
    >
      <Icon name={direction === 1 ? "chevron-right" : "chevron-left"} />
    </Button>
  );
  // On a phone the hero's arrows are for keyboard users: out of sight until focused, since touch
  // swipes. From desktop the row's own arrows replace them.
  const phoneArrow = hero ? "max-desktop:sr-only max-desktop:focus:not-sr-only desktop:hidden" : "";
  const rowSlide = ROW_SLIDE[Math.min(count, ROW_VIEW) - 1];
  const rowLast = Math.min(first + ROW_VIEW, count);

  return (
    <div className={cx("relative", className)}>
      <section
        ref={scrollerRef}
        onScroll={measure}
        // A visitor scrolling by hand takes over from an arrow's glide.
        onPointerDown={() => {
          target.current = null;
        }}
        onWheel={() => {
          target.current = null;
        }}
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be focusable so a keyboard user can scroll it.
        tabIndex={0}
        className={cx(
          "flex snap-x snap-mandatory overflow-x-auto motion-safe:scroll-smooth focus-ring [scrollbar-width:none]",
          hero ? cx("desktop:-mx-3 desktop:rounded-card", rowSlide) : "gap-4 rounded-card",
        )}
      >
        {photos.map((photo, index) => {
          const key = `${index}-${photo.src}`;
          const image = (look: string) => (
            <Photo
              key={key}
              src={armed.has(index) ? photo.src : null}
              alt={photo.alt}
              sizes={sizes}
              aspect={aspect}
              priority={index === 0}
              className={look}
            />
          );
          return hero ? (
            <div key={key}>
              {image("w-full max-h-photo desktop:max-h-none desktop:rounded-card")}
            </div>
          ) : (
            image(cx(SLIDE[props.slide ?? "peek"], "flex-none snap-start rounded-card"))
          );
        })}
      </section>
      {canPrev ? arrowButton("phone-prev", -1, prevLabel, cx("left-3", phoneArrow)) : null}
      {canNext ? arrowButton("phone-next", 1, nextLabel, cx("right-3", phoneArrow)) : null}
      {hero && count > ROW_VIEW ? (
        <>
          {canPrev
            ? arrowButton("row-prev", -1, props.rowPrevLabel, "left-1.5 max-desktop:hidden")
            : null}
          {canNext
            ? arrowButton("row-next", 1, props.rowNextLabel, "right-1.5 max-desktop:hidden")
            : null}
          <span
            aria-live="polite"
            className="pointer-events-none absolute right-3 bottom-3 rounded-pill bg-ink/70 px-2 text-caption text-on-ink max-desktop:hidden"
          >
            {props.rowCounterTemplate
              .replace("{first}", String(first + 1))
              .replace("{last}", String(rowLast))
              .replace("{total}", String(count))}
          </span>
        </>
      ) : null}
      {hero && count > 1 ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 desktop:hidden"
          >
            {photos.map((photo, index) => (
              <span
                key={`${index}-${photo.src}`}
                className={cx(
                  "h-1.5 rounded-pill bg-surface shadow-float",
                  index === first ? "w-5" : "w-1.5 opacity-70",
                )}
              />
            ))}
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 bottom-3 rounded-pill bg-ink px-2 text-caption text-on-ink desktop:hidden"
          >
            {first + 1}/{count}
          </span>
          <span role="status" aria-live="polite" className="sr-only desktop:hidden">
            {props.counterTemplate
              .replace("{n}", String(first + 1))
              .replace("{total}", String(count))}
          </span>
        </>
      ) : null}
    </div>
  );
}
