import { uk } from "@opika/i18n";
import Link from "next/link";

export const metadata = { title: `${uk.about.title} — Opika` };

/**
 * «Про проєкт» — no mock, per this phase's own scope: "three or four
 * paragraphs, matching the existing visual language." Static content, no
 * data fetch — the one page in this app that doesn't need
 * `dynamic = "force-dynamic"`, since there's nothing here that can go
 * stale between builds.
 *
 * `{contact}` in `uk.about.contact` is a placeholder — fill in a real
 * email or Telegram handle before this deploys; there is no default here
 * that would be honest to ship.
 */
export default function AboutPage() {
  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <header className="min-h-14 tablet:min-h-16 desktop:min-h-17 flex items-center bg-rg-surface px-4 tablet:px-6 desktop:px-15">
        <Link
          href="/tvaryny"
          className="font-bold text-[19px] text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] rounded-rg-button"
        >
          Opika
        </Link>
      </header>

      <div className="max-w-[640px] mx-auto p-4 tablet:p-6 desktop:py-16 flex flex-col gap-6">
        <h1 className="font-bold text-[34px]/[38px] desktop:text-[44px]/[46px] tracking-[-0.03em] text-rg-ink">
          {uk.about.title}
        </h1>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.intro}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.free}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.money}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.data}</p>
        <p className="text-[15px]/[22px] text-rg-ink-2 pt-2">
          {uk.about.contact.replace("{contact}", "hello@opika.org.ua")}
        </p>
      </div>
    </div>
  );
}
