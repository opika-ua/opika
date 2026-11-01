import type { Reasoned } from "./ratchet";

/**
 * Arbitrary Tailwind values (`text-[15px]`, `h-[396px]`) per file: a ceiling and why. Empty since
 * design system PR 4; a new one needs an entry with a real reason, and the number only goes down.
 */
export const ARBITRARY_VALUES: Readonly<Record<string, Reasoned>> = {};
