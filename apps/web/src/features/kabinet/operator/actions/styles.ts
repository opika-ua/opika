/**
 * S4 actions' layout classes, from the shared tokens only (the `rg-*`
 * colours and radii in `globals.css`, Tailwind's type and spacing scale), the
 * same set K4's editor uses (`profile-edit/styles.ts`). Oleksii, 2026-10-17:
 * "styled only through shared design tokens (colour, type, spacing) so the
 * rebrand is a token swap. No one-off styles in components." Buttons, fields
 * and the dialog frame are the shared controls (`features/controls`).
 *
 * rebase: fold into R-UI 1's operator styles if it has its own file.
 */
export const CARD = "flex min-w-0 flex-col gap-4 rounded-rg-card bg-rg-surface p-4 tablet:p-6";
export const CARD_TITLE = "text-xl font-bold tracking-tight text-rg-ink";
export const SUBTITLE = "text-base font-bold text-rg-ink";
export const CAPTION = "text-sm text-rg-ink-3";
export const BODY = "text-base text-rg-ink";
export const STRONG = "text-base font-medium text-rg-ink";
export const NOTICE = "text-base font-medium text-rg-ink";
/** An inner block (the reason as the shelter reads it, a left-out document). */
export const INNER = "flex flex-col gap-2 rounded-rg-button bg-rg-fill p-4";
/** A status chip, as K4's locked block draws it, from tokens. */
export const CHIP =
  "inline-flex min-h-8 items-center self-start rounded-rg-chip bg-rg-ink px-3 text-sm font-medium whitespace-nowrap text-rg-surface";
export const ACTIONS = "flex flex-col gap-2 tablet:flex-row tablet:flex-wrap";
