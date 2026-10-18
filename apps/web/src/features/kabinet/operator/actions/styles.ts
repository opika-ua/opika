import { INNER as INNER_BLOCK } from "../../profile-edit/styles";

/**
 * S4 actions' layout classes: the kabinet's shared set (`profile-edit/styles.ts`,
 * which R-UI 1's S4 uses too), plus the few the actions add, from the shared
 * tokens only (the `rg-*` colours and radii in `globals.css`, Tailwind's type
 * and spacing scale). Oleksii, 2026-10-17: "styled only through shared design
 * tokens (colour, type, spacing) so the rebrand is a token swap. No one-off
 * styles in components." Buttons, fields and the dialog frame are the shared
 * controls (`features/controls`).
 */
export {
  BODY,
  CAPTION,
  CARD,
  CARD_TITLE,
  ERROR_TEXT as NOTICE,
  STRONG,
} from "../../profile-edit/styles";

/** An inner block (the reason as the shelter reads it), its lines stacked. */
export const INNER = `${INNER_BLOCK} flex flex-col gap-2`;
export const SUBTITLE = "text-base font-bold text-rg-ink";
/** A status chip, as S4's heading draws it. */
export const CHIP =
  "inline-flex min-h-8 items-center self-start rounded-rg-chip bg-rg-ink px-3 text-sm font-medium whitespace-nowrap text-rg-surface";
export const ACTIONS = "flex flex-col gap-2 tablet:flex-row tablet:flex-wrap";
