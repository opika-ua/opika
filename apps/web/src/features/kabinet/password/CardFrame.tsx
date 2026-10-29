import type { ReactNode } from "react";
import { Card } from "../../../ui/Card";

/**
 * The card the sign-in pages share (`/kabinet/vkhid/zabuly`, `/kabinet/vkhid/novyi-parol`): a kit
 * Card, so the sign-in, forgot and reset screens read as one family.
 */
export function CardFrame({ titleId, children }: { titleId: string; children: ReactNode }) {
  return (
    <Card
      as="section"
      tone="outline"
      aria-labelledby={titleId}
      className="flex w-full flex-col gap-6 p-5 tablet:w-120 tablet:p-8"
    >
      {children}
    </Card>
  );
}

/** A form-level message (sent, done, refused), announced when it appears. */
export const CARD_MESSAGE = "text-label text-ink";
