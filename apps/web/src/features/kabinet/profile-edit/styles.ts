/**
 * K4's layout classes, which R-UI's operator screens share, built only from
 * shared tokens: the `rg-*` colours, radii and shadow in `globals.css`, and
 * Tailwind's own type and spacing scale. No one-off values (Oleksii,
 * 2026-10-17: "styled only through shared design tokens (colour, type,
 * spacing) so the rebrand is a token swap"). Buttons, links and fields are
 * the shared controls (`features/controls`), not classes here.
 */
export const CARD = "flex min-w-0 flex-col gap-4 rounded-rg-card bg-rg-surface p-4 tablet:p-6";
export const CARD_TITLE = "text-xl font-bold tracking-tight text-rg-ink";
/** A page's one heading (the operator's list and shelter pages). */
export const PAGE_TITLE = "text-3xl font-bold tracking-tight break-words text-rg-ink";
/** A status as a filled chip, not a control (the verification status on S4 and on S2's success state). */
export const STATUS_CHIP =
  "inline-flex min-h-8 items-center rounded-rg-chip bg-rg-ink px-3 text-sm font-medium text-rg-surface";
/** Small text that carries weight: the operator's name in the header. */
export const CAPTION_STRONG = "text-sm font-medium text-rg-ink";
export const DIALOG_TITLE = "text-2xl font-bold tracking-tight text-rg-ink";
export const CAPTION = "text-sm text-rg-ink-3";
export const BODY = "text-base text-rg-ink";
export const STRONG = "text-base font-medium text-rg-ink";
export const ERROR_TEXT = "text-base font-medium text-rg-ink";
export const OPTIONAL = "font-normal text-rg-ink-3";
/** An inner block on a card (the pending proposal, the preview row). */
export const INNER = "rounded-rg-button bg-rg-fill p-4";
