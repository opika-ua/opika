"use client";

import type { FeedCardView } from "@opika/contracts";
import { ageBucketLabel, sizeLabel, uk } from "@opika/i18n";
import { freshnessLabel, freshnessPips, type PipFill } from "@opika/ui";
import Image from "next/image";
import type { RefCallback } from "react";

/** The deck stays 390-420px centred at every viewport (docs/design/README.md,
 * "02 Deck") — never full-width, so `sizes` is close to a constant. */
const PHOTO_SIZES = "(max-width: 420px) 100vw, 420px";

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
 *
 * V2 (`Opika Registry System.dc.html`'s B7 frame): the two inset/top pairs
 * this codebase already had (6px/5px and 12px/10px) turned out to match the
 * mock's own two stack layers exactly — only the fill colours and the
 * border needed to change (`#F9F3E9`/`#F7F0E4` with a line border ->
 * `#FCFCFB`/`#F7F7F5`, no border at all — "borders are gone").
 */
const cardBase = "absolute rounded-rg-card overflow-hidden will-change-transform box-border";
const STACK_LAYER_1_2 = [
  // mid card — the mock's smaller inset (6px/5px).
  `${cardBase} left-1.5 right-1.5 top-1.25 h-50 bg-[#FCFCFB] z-2`,
  // back card — the mock's larger inset (12px/10px).
  `${cardBase} left-3 right-3 top-2.5 h-50 bg-[#F7F7F5] z-1`,
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
      className={`font-rg ${cardBase} inset-0 bg-rg-surface shadow-rg-card p-3 z-3 cursor-grab select-none flex flex-col gap-4`}
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
        className="w-full h-99 grow-0 shrink min-h-50 rounded-rg-photo overflow-hidden bg-rg-photo-placeholder relative"
      >
        {/*
          draggable={false}: found via E5, not assumed — every harness test
          and the deck's only real route (`/discovery`, pre-E5) always ran
          against `generateMockCards`'s `primaryPhoto: null`, so a real
          <img> here never existed until real `feed.list` data did. A real
          <img> is draggable by default; starting a native browser image
          drag on `pointerdown` suppresses the `pointermove` events
          `use-swipe-gesture.ts` needs, so the card silently stopped
          committing the moment a real photo was behind it — `onCommit`
          never fired at all, not a wrong threshold.
        */}
        {photo && (
          <Image
            src={photo.storageKey}
            alt={photo.alt?.uk ?? card.name}
            fill
            sizes={PHOTO_SIZES}
            className="object-cover"
            draggable={false}
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
        {/*
          V2: dropped the right-swipe affordance's leaf-green — "no colour
          in the interface at all... all colour on screen comes from the
          animals' photographs" (docs/design/README.md). Word choice, not
          hue, is what already distinguishes the two directions; a coloured
          affordance also reads as exactly the judgement/celebration cue
          "the swipe is filtering, not judging... no stamps, no scores" rules
          out.
        */}
        {showLeft && afOpacity > 0 && (
          <div
            className="absolute top-1/2 left-6 -translate-y-1/2 text-rg-ink-3 font-rg text-lg leading-[normal] font-medium pointer-events-none"
            style={{ opacity: afOpacity }}
          >
            {uk.swipe.left}
          </div>
        )}
        {showRight && afOpacity > 0 && (
          <div
            className="absolute top-1/2 right-6 -translate-y-1/2 text-rg-ink font-rg text-lg leading-[normal] font-medium pointer-events-none"
            style={{ opacity: afOpacity }}
          >
            {uk.swipe.right}
          </div>
        )}
      </div>

      {/* Text content. `Opika Registry System.dc.html`'s B7 deck frame:
        outer card `padding: 12px, gap: 16px` (the `gap-4` now on the
        section above is that photo-to-text distance), text block itself
        `gap: 12px; padding: 0 8px` — no top/bottom padding of its own. */}
      <div className="px-2 flex flex-col gap-3 shrink-0">
        {/* Name + meta */}
        <div>
          {/* display-m, docs/design/README.md's type scale: "deck card
            name" is one of display-m's own named uses. */}
          <div
            data-testid="card-name"
            className="font-bold text-[34px]/[38px] tracking-[-0.03em] text-rg-ink truncate"
          >
            {card.name}
          </div>
          <div className="text-[15px]/[22px] text-rg-ink-2 mt-1">{formatMeta(card)}</div>
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
        {/*
          Not part of the B7 mock frame, which shows no shelter line at all
          below the freshness block — kept anyway, re-skinned rather than
          removed: dropping shelter attribution/verification is a content
          decision, not a colour or type-scale one, and this phase is
          re-skinning, not re-scoping what the deck card shows.
        */}
        <div data-testid="shelter-line" className="flex items-center gap-1.5">
          <ShelterMonogram name={card.shelter.displayName} />
          <span className="text-[13px] leading-[normal] text-rg-ink-3">
            {card.shelter.displayName}
            {card.shelter.verification === "verified" && " · перевірений"}
          </span>
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

function ShelterMonogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div className="size-5 rounded-full bg-rg-fill flex items-center justify-center text-[9px] leading-[normal] font-medium text-rg-ink-3 shrink-0">
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
    // padding 16 (p-4) — `Opika Registry System.dc.html`'s B7 deck frame
    // states this literally. min-height is NOT the mock's literal 88,
    // though: the mock has no box-sizing reset (its own <style> block sets
    // only `body { margin: 0 }`), so `min-height: 88px` there is
    // content-box — an 88+16+16=120px rendered box. Preflight resets this
    // app to border-box, where min-height caps the whole box, padding
    // included, so reproducing the mock's real 120px total needs
    // min-h-30, not min-h-22. (The same conversion the pre-V2 code did
    // for its own 84-content-box value — this restates it for V2's 88.)
    <section
      data-testid="freshness-block"
      className="font-rg bg-rg-fill rounded-rg-freshness p-4 flex flex-col gap-row min-h-30"
      aria-label={label}
    >
      {/* Pips + label. docs/design/README.md, "The freshness marker": the
        label is body 15, rg-ink (not rg-ink-2) in every instance the mock
        actually renders it. */}
      <div className="flex items-center gap-2.5">
        <FreshnessPipRow fills={fills} />
        <span className="text-[15px]/[22px] text-rg-ink">{label}</span>
      </div>

      {/* Shelter sentence (if present) — 15/22, not the detail page's
        body-l 17/26: docs/design/README.md's "The shelter's sentence"
        states body-l for the full sentence, but the deck renders the
        "shortened sentence" (same section, "The deck"), and the B7 frame's
        own literal value for it is 15/22 — `Opika Registry System.dc.html`. */}
      {shelterSentence?.uk && (
        <div className="text-[15px]/[22px] text-rg-ink-2 text-pretty">{shelterSentence.uk}</div>
      )}
    </section>
  );
}

/**
 * Three pips, always three, always in the same position.
 * V2 geometry (docs/design/README.md, "The freshness marker"): 10x10px,
 * gap 6 between pips, gap 10 to the label — "grown from 7px: at 1.5x
 * density on a cheap Android panel 7px pips disappeared." Each pip is
 * either filled (a Tailwind bg-* class from freshnessPips) or the "empty"
 * variant — transparent fill, 1.5px border in rg-ink-3 (#63676B), the
 * WCAG 1.4.11 fix recorded in the same section. The mock's original solid
 * #DCDCD9 fill measured 1.16-1.37:1 against every background it appears
 * on; the design was subsequently updated to specify the outline
 * directly, so this is the current spec, not a deviation from it.
 */
function FreshnessPipRow({ fills }: { fills: [PipFill, PipFill, PipFill] }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {fills.map((fill, i) => (
        <div
          key={i}
          data-testid="freshness-pip"
          data-filled={fill === "empty" ? "false" : "true"}
          className={`size-2.5 rounded-full ${
            fill === "empty" ? "bg-transparent border-[1.5px] border-rg-ink-3" : fill
          }`}
        />
      ))}
    </div>
  );
}
