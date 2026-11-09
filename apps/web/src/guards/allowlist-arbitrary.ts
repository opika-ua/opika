import type { Reasoned } from "./ratchet";

/**
 * Arbitrary Tailwind values (`text-[15px]`, `h-[396px]`) per file: a ceiling and why. Empty since
 * design system PR 4; a new one needs an entry with a real reason, and the number only goes down.
 */
export const ARBITRARY_VALUES: Readonly<Record<string, Reasoned>> = {
  "features/kabinet/animal-list/AnimalListRow.tsx": {
    max: 2,
    reason:
      "Phone card: owner-specified 1.5px frame and a 96px photo / 1fr name / auto menu grid, neither a token or a stock utility",
  },
};
