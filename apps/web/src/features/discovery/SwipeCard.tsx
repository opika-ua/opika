"use client";

import type { FeedCardView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { freshnessLabel, freshnessPips, type PipFill } from "@opika/ui";
import type { RefCallback } from "react";

interface SwipeCardProps {
  card: FeedCardView;
  /** Ref callback from useSwipeGesture — wires pointer events. */
  gestureRef: RefCallback<HTMLElement>;
  /** Signed displacement for affordance labels. 0 when not dragging. */
  dx: number;
  /** Position in the visual stack: 0 = top (interactive), 1 = mid, 2 = back. */
  stackIndex: number;
  onTap?: (() => void) | undefined;
}

function affordanceOpacity(dx: number): number {
  return Math.min(Math.abs(dx) / 40, 1);
}

/**
 * Non-interactive stack layers (mid, back). Plain Tailwind classes — these
 * never move, so unlike the top card there is no dynamic style to keep
 * separate from the className.
 */
const cardBase = "absolute rounded-card overflow-hidden will-change-transform box-border";
const STACK_LAYER_1_2 = [
  // mid card. #F9F3E9 is not a tokens.ts colour, same as before this migration.
  `${cardBase} left-1.5 right-1.5 top-1.25 h-50 bg-[#F9F3E9] border border-line z-2`,
  // back card. #F7F0E4, likewise pre-existing and not a named token.
  `${cardBase} left-3 right-3 top-2.5 h-50 bg-[#F7F0E4] border border-line z-1`,
] as const;

export function SwipeCard({ card, gestureRef, dx, stackIndex, onTap }: SwipeCardProps) {
  // Only the top card (index 0) is interactive; 1 and 2 are inert stack
  // layers; anything else (an out-of-range index) renders nothing, matching
  // the original array-indexing bounds check.
  if (stackIndex > 0) {
    const className = STACK_LAYER_1_2[stackIndex - 1];
    if (!className) return null;
    return <div className={className} aria-hidden="true" />;
  }
  if (stackIndex < 0) return null;

  const photo = card.primaryPhoto;
  const afOpacity = affordanceOpacity(dx);
  const showLeft = dx < 0;
  const showRight = dx > 0;

  return (
    <section
      ref={gestureRef}
      data-testid="swipe-card"
      className={`${cardBase} inset-0 bg-paper shadow-card p-3 z-3 cursor-grab select-none flex flex-col`}
      aria-label={card.name}
      onClick={onTap}
      onKeyDown={undefined}
    >
      {/*
        Photo area. Height 396, not the design's other stated "4:5" ratio —
        see the (long) rationale in git history / the M5 harness fix commit:
        4:5 is the source photography's crop ratio, 396 is this slot's height,
        and `object-cover` on the <img> below is what reconciles them. 396 on
        a 334px content box was measured against the rest of the feed
        screen's spacing; 4:5 would be 417.5, 21.5px taller than specified.
        min-h-50 (200px): the photo shrinks before the text below it does — a
        photo is croppable by definition (`object-cover`), the shelter's
        sentence is not.
      */}
      <div
        data-testid="card-photo"
        className="w-full h-99 grow-0 shrink min-h-50 rounded-photo overflow-hidden bg-photo-placeholder relative"
      >
        {photo && (
          <img
            src={photo.storageKey}
            alt={photo.alt?.uk ?? card.name}
            className="w-full h-full object-cover block"
          />
        )}

        {/* Affordance labels. Opacity is continuous (0..1, driven by drag
            distance) — no fixed Tailwind step expresses that, so it stays
            the one inline style on this element.
            leading-[normal]: `text-lg` carries Tailwind's own paired line-
            height (1.5556), which is not what an un-line-heighted 18px
            label rendered as before this migration — see the note by the
            shelter-line spans below for why `leading-[normal]` and not a
            specific pixel value. */}
        {showLeft && afOpacity > 0 && (
          <div
            className="absolute top-1/2 left-6 -translate-y-1/2 text-ink-3 font-sans text-lg leading-[normal] font-medium pointer-events-none"
            style={{ opacity: afOpacity }}
          >
            {uk.swipe.left}
          </div>
        )}
        {showRight && afOpacity > 0 && (
          <div
            className="absolute top-1/2 right-6 -translate-y-1/2 text-leaf font-sans text-lg leading-[normal] font-medium pointer-events-none"
            style={{ opacity: afOpacity }}
          >
            {uk.swipe.right}
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="pt-group px-label pb-label flex flex-col gap-group shrink-0">
        {/* Name + meta */}
        <div>
          <div
            data-testid="card-name"
            className="font-serif font-medium text-[26px]/[30px] text-ink truncate"
          >
            {card.name}
          </div>
          <div className="font-sans text-[13px]/[19.5px] text-ink-3 mt-label">
            {formatMeta(card)}
          </div>
        </div>

        {/* Freshness block */}
        <FreshnessBlock
          freshness={card.freshness}
          shelterSentence={card.shelter.freshnessSentence}
        />

        {/*
          Shelter line. `leading-[normal]`, not a specific pixel value: these
          two spans and the monogram never had an explicit `lineHeight` before
          this migration, so they rendered at the browser's own UA-computed
          "normal" for the fallback font — measured at 15px for 13px
          Commissioner-fallback text in this environment, but that number is
          font-and-platform-dependent and not something to hardcode. Without
          this override they inherit Tailwind Preflight's `line-height: 1.5`
          from <html> (19.5px here) instead, which is a real, measured 20px
          vertical shift on this row — the CSS keyword is what restores the
          original rendering exactly, in every environment, not just this one.
        */}
        <div data-testid="shelter-line" className="flex items-center gap-1.5">
          <ShelterMonogram name={card.shelter.displayName} />
          <span className="font-sans text-[13px] leading-[normal] text-ink-2">
            {card.shelter.displayName}
          </span>
          {card.shelter.verification === "verified" && (
            <span className="font-sans text-[13px] leading-[normal] text-leaf">· перевірений</span>
          )}
        </div>
      </div>
    </section>
  );
}

// --- Helpers ---

function formatMeta(card: FeedCardView): string {
  const parts: string[] = [];
  if (card.ageBucket) parts.push(ageBucketLabel(card.ageBucket));
  parts.push(sizeLabel(card.size));
  return parts.join(" · ");
}

function ageBucketLabel(bucket: string): string {
  switch (bucket) {
    case "baby":
      return "малюк";
    case "young":
      return "молодий";
    case "adult":
      return "дорослий";
    case "senior":
      return "літній";
    default:
      return bucket;
  }
}

function sizeLabel(size: string): string {
  switch (size) {
    case "small":
      return "мала";
    case "medium":
      return "середня";
    case "large":
      return "велика";
    default:
      return size;
  }
}

function ShelterMonogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div className="size-5 rounded-full bg-avatar-bg flex items-center justify-center font-sans text-[9px] leading-[normal] font-medium text-ink-3 shrink-0">
      {initials}
    </div>
  );
}

function FreshnessBlock({
  freshness,
  shelterSentence,
}: {
  freshness: FeedCardView["freshness"];
  shelterSentence: FeedCardView["shelter"]["freshnessSentence"];
}) {
  const label = freshnessLabel(freshness);
  const fills = freshnessPips(freshness.kind);

  return (
    // min-h-27 (108px), not min-h-21 (84px). The original 84 was a
    // content-box min-height — Tailwind Preflight resets every element to
    // border-box globally, under which min-height caps the *whole* box
    // (padding included) instead of just the content area. 84 content-box
    // with 12px padding top and bottom floors the total at 84+24=108; the
    // same 84 under border-box floors the total at 84 outright, 24px
    // short — a real, measured height difference on any card whose
    // shelter sentence is short enough to hit the floor, not a rounding
    // artifact. 108 reproduces the original total.
    <section
      data-testid="freshness-block"
      className="bg-paper-alt rounded-freshness p-3 flex flex-col gap-row min-h-27"
      aria-label={label}
    >
      {/* Pips + label */}
      <div className="flex items-center gap-row">
        <FreshnessPipRow fills={fills} />
        <span className="font-sans text-[13px]/[19.5px] text-ink-2">{label}</span>
      </div>

      {/* Shelter sentence (if present) */}
      {shelterSentence?.uk && (
        <div className="font-serif font-normal text-[13px]/[19.5px] text-ink-2">
          {shelterSentence.uk}
        </div>
      )}
    </section>
  );
}

/**
 * Three pips, always three, always in the same position.
 * Design spec: 7x7 circles, gap 4px between pips, gap 8px to the label.
 * Each pip is either filled (a Tailwind bg-* class from freshnessPips) or
 * empty (1px line-heavy border, transparent fill).
 */
function FreshnessPipRow({ fills }: { fills: [PipFill, PipFill, PipFill] }) {
  return (
    <div className="flex gap-label" aria-hidden="true">
      {fills.map((fill, i) => (
        <div
          key={i}
          data-testid="freshness-pip"
          data-filled={fill ? "true" : "false"}
          className={`size-1.75 rounded-full ${fill ?? "bg-transparent border border-line-heavy"}`}
        />
      ))}
    </div>
  );
}
