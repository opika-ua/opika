import { cx } from "./cx";
import { Icon } from "./Icon";

export type AssistanceLineProps = {
  /** The muted lead-in: «Потрібна допомога?». */
  text: string;
  linkLabel: string;
  /** A contact address (`mailto:`, a Telegram link) from the contact config. */
  href: string;
  /** Layout only. */
  className?: string;
};

/** The help line under an auth card, outside it: a small chat icon, muted text and a link. */
export function AssistanceLine({ text, linkLabel, href, className }: AssistanceLineProps) {
  return (
    <p
      className={cx(
        "flex flex-wrap items-center justify-center gap-x-2 text-center text-body text-ink-2",
        className,
      )}
    >
      <Icon name="chat" size="sm" />
      <span>
        {text}{" "}
        <a
          href={href}
          className="inline-flex min-h-target items-center text-ink underline underline-offset-4 focus-ring"
        >
          {linkLabel}
        </a>
      </span>
    </p>
  );
}
