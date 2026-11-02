import { uk } from "@opika/i18n";
import { WORDMARK } from "../../brand";
import { BrandLogo } from "../chrome/BrandLogo";

/**
 * The kabinet's brand row: the public site's logo, then «Кабінет» as plain muted text so the
 * surface is named without a second logo. The logo is decorative; the wordmark text carries the
 * accessible name.
 */
export function KabinetBrand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex min-h-target shrink-0 items-center">
        <BrandLogo />
        <span className="sr-only">{WORDMARK}</span>
      </span>
      <span className="text-label text-ink-2">{uk.kabinet.shell.label}</span>
    </div>
  );
}
