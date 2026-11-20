import TOKENS from "./tokens.generated.json";

/**
 * The emails' colours and type, all from the site's tokens (`tokens.generated.json`). The few values
 * the token set has no name for are mixed from tokens here, never typed: Outlook ignores rgba(), so
 * a translucent ink is blended to a solid colour. The card is the token set's pure white (plan §3).
 */
const WHITE = TOKENS["color-on-accent-strong"];

const channels = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** `top` laid over `under` at `opacity`, as a solid #rrggbb. */
export function mix(top: string, under: string, opacity: number): string {
  const a = channels(top);
  const b = channels(under);
  const blended = a.map((channel, i) =>
    Math.round(channel * opacity + (b[i] ?? 0) * (1 - opacity)),
  );
  return `#${blended.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const ink = TOKENS["color-ink"];
const onInk = TOKENS["color-on-ink"];

export const LIGHT = {
  page: TOKENS["color-page"],
  card: WHITE,
  ink,
  /** Paragraphs: ink at 85% (plan §3). */
  text: mix(ink, WHITE, 0.85),
  secondary: TOKENS["color-ink-2"],
  rule: TOKENS["color-line"],
  buttonFill: ink,
  buttonText: WHITE,
  information: TOKENS["color-status-published"],
  success: TOKENS["color-success-bg"],
  warning: TOKENS["color-status-reserved"],
} as const;

/** Apple Mail's dark variant (plan §3): ink ground, light text, lavender links, inverted button. */
export const DARK = {
  page: ink,
  card: mix(onInk, ink, 0.07),
  text: onInk,
  secondary: mix(onInk, ink, 0.78),
  rule: mix(onInk, ink, 0.2),
  link: TOKENS["color-status-published"],
  buttonFill: onInk,
  buttonText: ink,
  information: mix(TOKENS["color-status-published"], ink, 0.2),
  success: mix(TOKENS["color-success-bg"], ink, 0.2),
  warning: mix(TOKENS["color-status-reserved"], ink, 0.2),
} as const;

/** Fallback first (Gmail and Outlook drop web fonts); the Opika face only where it loads. */
export const FONT_STACK =
  "'Opika', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const TYPE = {
  title: {
    size: TOKENS["text-title"],
    lineHeight: TOKENS["text-title--line-height"],
    weight: TOKENS["text-title--font-weight"],
  },
  body: { size: TOKENS["text-body"], lineHeight: "1.5" },
  label: { size: TOKENS["text-label"] },
  caption: { size: TOKENS["text-caption"], lineHeight: "1.5" },
} as const;

export const RADIUS = { card: TOKENS["radius-card"], box: TOKENS["radius-panel"] } as const;

/** The button's height: the site's touch target. */
export const TARGET = TOKENS["spacing-target"];

/** The card's width, the most an email column takes (plan §1). */
export const EMAIL_WIDTH = 600;
