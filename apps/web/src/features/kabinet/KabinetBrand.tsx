import { uk } from "@opika/i18n";
import { WORDMARK } from "../../brand";
import { Chip } from "../../ui/Chip";
import { BrandLogo } from "../chrome/BrandLogo";

/**
 * The kabinet's brand row: the public site's logo, then a «Кабінет» tag so the surface is named
 * without a second logo. The logo is decorative; the wordmark text carries the accessible name.
 */
export function KabinetBrand() {
  return (
    <div className="flex min-w-0 items-center gap-2 desktop:gap-3">
      <span className="inline-flex min-h-target shrink-0 items-center">
        <BrandLogo />
        <span className="sr-only">{WORDMARK}</span>
      </span>
      <Chip kind="info" tone="neutral">
        {uk.kabinet.shell.label}
      </Chip>
    </div>
  );
}
