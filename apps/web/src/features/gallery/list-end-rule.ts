/**
 * The fewest cards a last page needs before its closing mascot shows. Two mascot moments never
 * share a screen, and the hero's cat on «дім» always stays: a second row of cards is what keeps
 * the two at least a screen apart. Measured 2026-11-27 (4 columns from 1024: 5 cards, 2 columns
 * below: 3), the larger kept for every width. Plain module: the harness imports it too.
 */
export const LIST_END_MIN_CARDS = 5;
