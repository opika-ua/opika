import { uk } from "@opika/i18n";
import { WORDMARK } from "../chrome/SiteHeader";

/**
 * The kabinet's brand row (KABINET N2; mock `Opika Kabinet.dc.html`, every
 * K-frame's header): the «Поріг · Межа» mark, the wordmark, and the
 * «кабінет» label in ink-3. Not the site header's: the mock draws it at its
 * own sizes, 28 / stroke 11 with a 24/28 wordmark on desktop and 24 / stroke 12
 * with a 19/24 wordmark on the phone, and the kabinet never shows the site's
 * nav (it is a different product surface).
 */
export function KabinetBrand() {
  return (
    <div className="flex items-center gap-2 desktop:gap-[10px]">
      <svg
        viewBox="0 0 96 96"
        fill="none"
        aria-hidden="true"
        className="h-6 w-6 shrink-0 text-rg-ink [stroke-width:12] desktop:h-7 desktop:w-7 desktop:[stroke-width:11]"
      >
        <path d="M22 70V46a26 26 0 0 1 52 0v24" stroke="currentColor" strokeLinecap="round" />
        <path d="M14 88h68" stroke="currentColor" strokeLinecap="round" />
        <circle cx="48" cy="79" r="7" fill="currentColor" />
      </svg>
      <span className="text-[19px] leading-6 font-bold tracking-[-0.02em] text-rg-ink desktop:text-2xl desktop:leading-7 desktop:tracking-[-0.03em]">
        {WORDMARK}
      </span>
      <span className="ml-1 text-[15px] leading-[22px] text-rg-ink-3 desktop:ml-0">
        {uk.kabinet.shell.label}
      </span>
    </div>
  );
}
