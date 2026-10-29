import { LinkButton } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * Previous and next as icon links (the pet card overlay's walk through a result set). Real links, so
 * navigation is prefetchable and works without JS. A missing side renders nothing; pass `null`.
 * Each link is named by its `label` (the kit holds no copy).
 */
export type PrevNextProps = {
  prev: { href: string; label: string } | null;
  next: { href: string; label: string } | null;
  className?: string;
};

export function PrevNext({ prev, next, className }: PrevNextProps) {
  if (prev === null && next === null) return null;
  return (
    <div className={cx("flex items-center gap-3", className)}>
      {prev === null ? null : (
        <LinkButton variant="icon" href={prev.href} aria-label={prev.label} prefetch={false}>
          <Icon name="chevron-left" />
        </LinkButton>
      )}
      {next === null ? null : (
        <LinkButton variant="icon" href={next.href} aria-label={next.label} prefetch={false}>
          <Icon name="chevron-right" />
        </LinkButton>
      )}
    </div>
  );
}
