/** The patterns the UI guards scan for, shared by `ui-guards.test.ts`. */

// Not preceded by a word char or `&` (entities), 3/6/8 hex digits, nothing
// alphanumeric after (so anchors such as `#site-nav-menu` don't match).
export const HEX =
  /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9]*[a-fA-F])[0-9a-fA-F]{3})(?![\w-])/g;

export const TOKEN_PATTERNS = {
  rg: /-rg-[a-z]/g,
  fontRg: /(?<![\w-])font-rg(?![\w-])/g,
  brand: /-brand-[a-z]/g,
  bare: /(?<![\w-])(?:(?:bg|text|border|ring|outline|fill|stroke|divide|shadow|decoration|accent|from|to|via)-(?:legacy-ink(?:-2)?|ink-[34]|paper(?:-alt)?|sunken-deep|line-(?:strong|heavy)|leaf(?:-press|-hover)?|avatar-bg)|font-sans|font-serif|rounded-(?:photo|button|freshness|chip)|shadow-card|ease-keeper|bg-photo-placeholder)(?![\w-])/g,
} as const;

// `name-[value]` with optional variants, as counted in the inventory. The
// `/[Npx]` line-height suffix after `text-[..]` and `[property:value]` are not matched.
export const ARBITRARY = /(?<![A-Za-z0-9_[])(?:[a-z0-9]+:)*!?-?[a-z]+(?:-[a-z0-9]+)*-\[[^\]\s]+\]/g;

export const IMG = /<img(?:\s|$)/g;
