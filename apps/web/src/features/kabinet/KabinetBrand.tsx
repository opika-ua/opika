import { uk } from "@opika/i18n";
import { WORDMARK } from "../chrome/SiteHeader";

/**
 * The kabinet's brand row: the «Поріг · Межа» mark, the wordmark and the «кабінет» label.
 * Not the site header's: the kabinet never shows the site's nav (it is a different product surface).
 */
export function KabinetBrand() {
  return (
    <div className="flex items-center gap-2">
      <KabinetMark />
      <span className="text-body-l font-bold text-ink">{WORDMARK}</span>
      <span className="text-body text-ink-2">{uk.kabinet.shell.label}</span>
    </div>
  );
}

/** The «Поріг · Межа» mark alone: the phone header pairs it with the page name, not the wordmark. */
export function KabinetMark() {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className="size-6 shrink-0 text-ink desktop:size-7"
    >
      <path
        d="M22 70V46a26 26 0 0 1 52 0v24"
        stroke="currentColor"
        strokeWidth={12}
        strokeLinecap="round"
      />
      <path d="M14 88h68" stroke="currentColor" strokeWidth={12} strokeLinecap="round" />
      <circle cx="48" cy="79" r="7" fill="currentColor" />
    </svg>
  );
}
