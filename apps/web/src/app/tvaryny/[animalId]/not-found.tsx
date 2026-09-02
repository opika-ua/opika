import { uk } from "@opika/i18n";
import Link from "next/link";

/**
 * Next's own 404 mechanism (`notFound()`, called from `page.tsx` in this
 * same segment) renders this file instead of a bare, unstyled default —
 * an animal id that doesn't resolve (removed, never existed, or a
 * malformed string in the URL) is a real, on-brand dead end, not the
 * generic error card `/tvaryny/error.tsx` already owns for genuine
 * failures. No mock frame covers this exact state; copy matches the
 * established eyebrow/title/body/action pattern from the gallery's own
 * error card (`docs/design/README.md`'s "Whole-list error").
 */
export default function NotFound() {
  const copy = uk.detail.notFound;
  return (
    <div className="font-rg min-h-dvh bg-rg-page flex items-center justify-center p-6">
      <div className="bg-rg-surface rounded-rg-card p-8 flex flex-col gap-4 items-start max-w-[560px] w-full">
        <span className="text-[11px] font-medium tracking-[0.12em] text-rg-ink-3">
          {copy.eyebrow}
        </span>
        <span className="text-[34px]/[38px] font-bold tracking-[-0.03em] text-rg-ink">
          {copy.title}
        </span>
        <span className="text-[17px]/[26px] text-rg-ink-2">{copy.body}</span>
        <Link
          href="/tvaryny"
          data-testid="not-found-action"
          className="min-h-14 inline-flex items-center rounded-rg-button bg-rg-ink px-6 text-[15px] font-medium text-rg-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          {copy.action}
        </Link>
      </div>
    </div>
  );
}
