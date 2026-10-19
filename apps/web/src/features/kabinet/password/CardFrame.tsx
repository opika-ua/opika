import type { ReactNode } from "react";

/**
 * The card the sign-in pages share (`/kabinet/vkhid/zabuly`,
 * `/kabinet/vkhid/novyi-parol`): K1's card, on theme tokens only.
 */
export function CardFrame({ titleId, children }: { titleId: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full flex-col gap-6 rounded-rg-card bg-rg-surface p-5 tablet:max-w-lg tablet:p-8"
    >
      {children}
    </section>
  );
}

/** The card's heading: one `h1` per page, focusable so a state change can move focus to it. */
export const CARD_TITLE = "text-2xl font-bold text-rg-ink tablet:text-3xl";
/** A paragraph of the card. */
export const CARD_BODY = "text-lg text-rg-ink-2";
/** A form-level message (sent, done, refused), announced when it appears. */
export const CARD_MESSAGE = "text-base font-medium text-rg-ink";
