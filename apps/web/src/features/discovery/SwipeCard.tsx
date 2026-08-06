"use client";

import type { FeedCardView } from "@opika/contracts";
import type { CSSProperties, RefCallback } from "react";
import { freshnessLabel, freshnessPips, type PipFill } from "./freshness-display.js";
import { uk } from "./strings.uk.js";
import { color, layout, radius, shadow } from "./tokens.js";

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

const cardBase: CSSProperties = {
  position: "absolute",
  borderRadius: radius.card,
  overflow: "hidden",
  willChange: "transform",
  boxSizing: "border-box",
};

const stackStyles: CSSProperties[] = [
  // top card
  {
    ...cardBase,
    inset: 0,
    background: color.paper,
    boxShadow: shadow.card,
    padding: layout.cardPadding,
    zIndex: 3,
  },
  // mid card
  {
    ...cardBase,
    left: layout.stackMidInset,
    right: layout.stackMidInset,
    top: layout.stackMidTop,
    height: 200,
    background: "#F9F3E9",
    border: `1px solid ${color.line}`,
    zIndex: 2,
  },
  // back card
  {
    ...cardBase,
    left: layout.stackBackInset,
    right: layout.stackBackInset,
    top: layout.stackBackTop,
    height: 200,
    background: "#F7F0E4",
    border: `1px solid ${color.line}`,
    zIndex: 1,
  },
];

export function SwipeCard({ card, gestureRef, dx, stackIndex, onTap }: SwipeCardProps) {
  const style = stackStyles[stackIndex];
  if (!style) return null;

  // Only the top card is interactive
  if (stackIndex > 0) {
    return <div style={style} aria-hidden="true" />;
  }

  const photo = card.primaryPhoto;
  const afOpacity = affordanceOpacity(dx);
  const showLeft = dx < 0;
  const showRight = dx > 0;

  return (
    <section
      ref={gestureRef}
      style={{ ...style, cursor: "grab", userSelect: "none" }}
      aria-label={card.name}
      onClick={onTap}
      onKeyDown={undefined}
    >
      {/* Photo area */}
      <div
        style={{
          width: "100%",
          aspectRatio: "4/5",
          borderRadius: radius.photo,
          overflow: "hidden",
          background: `repeating-linear-gradient(135deg, ${color.sunkenDeep} 0 10px, #F6EFE3 10px 20px)`,
          position: "relative",
        }}
      >
        {photo && (
          <img
            src={photo.storageKey}
            alt={photo.alt?.uk ?? card.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {/* Affordance labels */}
        {showLeft && afOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 24,
              transform: "translateY(-50%)",
              opacity: afOpacity,
              color: color.ink3,
              fontFamily: "'Commissioner', sans-serif",
              fontSize: 18,
              fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            {uk.swipe.left}
          </div>
        )}
        {showRight && afOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              right: 24,
              transform: "translateY(-50%)",
              opacity: afOpacity,
              color: color.leaf,
              fontFamily: "'Commissioner', sans-serif",
              fontSize: 18,
              fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            {uk.swipe.right}
          </div>
        )}
      </div>

      {/* Text content */}
      <div style={{ padding: "16px 4px 4px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Name + meta */}
        <div>
          <div
            style={{
              fontFamily: "'Literata', serif",
              fontWeight: 500,
              fontSize: 26,
              lineHeight: "30px",
              color: color.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {card.name}
          </div>
          <div
            style={{
              fontFamily: "'Commissioner', sans-serif",
              fontSize: 13,
              lineHeight: "19.5px",
              color: color.ink3,
              marginTop: 4,
            }}
          >
            {formatMeta(card)}
          </div>
        </div>

        {/* Freshness block */}
        <FreshnessBlock
          freshness={card.freshness}
          shelterSentence={card.shelter.freshnessSentence}
        />

        {/* Shelter line */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ShelterMonogram name={card.shelter.displayName} />
          <span
            style={{
              fontFamily: "'Commissioner', sans-serif",
              fontSize: 13,
              color: color.ink2,
            }}
          >
            {card.shelter.displayName}
          </span>
          {card.shelter.verification === "verified" && (
            <span
              style={{
                fontFamily: "'Commissioner', sans-serif",
                fontSize: 13,
                color: color.leaf,
              }}
            >
              · перевірений
            </span>
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
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: color.avatarBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Commissioner', sans-serif",
        fontSize: 9,
        fontWeight: 500,
        color: color.ink3,
        flexShrink: 0,
      }}
    >
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
    <section
      style={{
        background: color.paperAlt,
        borderRadius: radius.freshness,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 84,
      }}
      aria-label={label}
    >
      {/* Pips + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FreshnessPipRow fills={fills} />
        <span
          style={{
            fontFamily: "'Commissioner', sans-serif",
            fontSize: 13,
            lineHeight: "19.5px",
            color: color.ink2,
          }}
        >
          {label}
        </span>
      </div>

      {/* Shelter sentence (if present) */}
      {shelterSentence?.uk && (
        <div
          style={{
            fontFamily: "'Literata', serif",
            fontWeight: 400,
            fontSize: 13,
            lineHeight: "19.5px",
            color: color.ink2,
          }}
        >
          {shelterSentence.uk}
        </div>
      )}
    </section>
  );
}

/**
 * Three pips, always three, always in the same position.
 * Design spec: 7x7 circles, gap 4px between pips, gap 8px to the label.
 * Each pip is either filled (with the colour from freshnessPips) or
 * empty (1px #C9BCA2 border, transparent fill).
 */
function FreshnessPipRow({ fills }: { fills: [PipFill, PipFill, PipFill] }) {
  return (
    <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
      {fills.map((fill, i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: fill ?? "transparent",
            border: fill ? "none" : `1px solid ${color.lineHeavy}`,
          }}
        />
      ))}
    </div>
  );
}
