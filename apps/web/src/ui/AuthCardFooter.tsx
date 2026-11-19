import { cx } from "./cx";

export type AuthCardFooterProps = {
  /** The muted lead-in: «Уже маєте кабінет?». */
  text: string;
  linkLabel: string;
  /** For a /kabinet target pass `kabinetEntryHref(...)`; the link is always a full page load. */
  href: string;
  /** Layout only. */
  className?: string;
};

/**
 * The strip at the bottom inside an auth card (sign-in, registration, forgot password): the switch to
 * the other auth action. A plain `<a>`, never next/link, so crossing into /kabinet loads a new
 * document with its own headers (#509). The card has no padding, so the strip runs edge to edge.
 */
export function AuthCardFooter({ text, linkLabel, href, className }: AuthCardFooterProps) {
  return (
    <p
      className={cx(
        "border-line border-t bg-tint px-5 py-3 text-center text-body text-ink-2",
        className,
      )}
    >
      {text}{" "}
      <a
        href={href}
        className="inline-flex min-h-target items-center font-bold text-ink underline underline-offset-4 focus-ring"
      >
        {linkLabel}
      </a>
    </p>
  );
}
