/**
 * Design tokens for the discovery flow — colours, typography, spacing, motion.
 * Derived from docs/design/README.md (Keeper's Voice direction).
 */

export const color = {
  paper: "#FBF7F0",
  paperAlt: "#F4ECDF",
  sunkenDeep: "#EFE6D6",
  line: "#E8DECB",
  lineStrong: "#E0D4BF",
  lineHeavy: "#C9BCA2",
  ink: "#2A2118",
  ink2: "#4A3D2C",
  ink3: "#6E5C44",
  ink4: "#85735A",
  leaf: "#4F6B3A",
  leafPress: "#3E5529",
  leafHover: "#445B32",
  avatarBg: "#E3D6C0",
} as const;

export const radius = {
  card: 20,
  photo: 12,
  button: 12,
  chip: 999,
  freshness: 12,
} as const;

export const shadow = {
  card: "0 18px 40px -24px rgba(60,44,24,0.45)",
} as const;

export const motion = {
  quick: 160,
  settle: 300,
  reveal: 340,
  exit: 300,
  reducedExit: 120,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export const layout = {
  /** Card width inside a 390 viewport. */
  cardWidth: 358,
  cardPadding: 12,
  /** Three stack layers, no scaling. */
  stackLayers: 3,
  /** Back layer inset from left/right. */
  stackBackInset: 12,
  stackBackTop: 10,
  /** Mid layer inset from left/right. */
  stackMidInset: 6,
  stackMidTop: 5,
  /** Minimum touch target. */
  minTouchTarget: 44,
  /** Action button height. */
  actionHeight: 52,
} as const;
