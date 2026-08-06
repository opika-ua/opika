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
  /**
   * Photo area height on the feed card.
   *
   * The design doc states two things that look like a contradiction:
   * README:191 gives "photo area height 396", while README:307 describes the
   * card as "photo 4:5". They are not the same shape — the card's content box
   * is 334 wide (358 minus 12 padding each side), and 4:5 on 334 is 417.5.
   *
   * Resolved in favour of 396, because the other two mentions say what 4:5
   * actually refers to: README:39 calls the placeholder "a real shelter photo
   * (4:5, `object-fit: cover`)" and README:353 asks for "real 4:5 shelter
   * photography, cropped `cover`". 4:5 is the *source asset* ratio; 396 is the
   * *display area* height, and `object-fit: cover` is what reconciles them.
   * The surrounding numbers agree: 396 is what the rest of the feed screen's
   * spacing was measured against.
   *
   * The card had `aspectRatio: "4/5"` on the container, which made it 417.5px
   * tall — 21.5px more than specified — pushing the shelter's sentence past
   * the card's `overflow: hidden` edge, where it vanished silently.
   */
  photoHeight: 396,
  /**
   * Floor for the photo when the card is shorter than the design assumes.
   * The photo is croppable by definition; the text below it is not, so the
   * photo is the flex item that gives way.
   */
  photoMinHeight: 200,
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
