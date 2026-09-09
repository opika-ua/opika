import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { Footer } from "../../features/chrome/Footer";
import { SiteHeader } from "../../features/chrome/SiteHeader";

/**
 * Title only, plus an explicit `description`/`openGraph` override (Option B,
 * 2026-09-06, see `docs/observations.md`) — without one this page would
 * inherit the root layout's default, which swaps to the demo-data
 * disclosure while `REGISTRY_HAS_NO_REAL_SHELTERS`. That disclosure was
 * never meant to reach this page specifically. `uk.about.intro` is the
 * page's own existing, already-shipped opening sentence — used verbatim,
 * not trimmed, and not a new key. A full `openGraph` object, not just
 * `description` — Next replaces a parent's `openGraph` wholesale rather
 * than deep-merging it once a child sets any part of it (same gotcha
 * `/tvaryny/[animalId]/page.tsx` already has its own note on). No `title`
 * inside `openGraph`, deliberately: unlike the nested object as a whole,
 * Next resolves a missing `openGraph.title` from the page's own
 * already-templated `title` («Про проєкт — Opika»); setting it explicitly
 * here would instead freeze it at the untemplated subject, dropping the
 * brand name from the link-preview headline (PR #53 review, caught by
 * rebuilding and diffing the served `og:title`, not by inspection).
 */
export const metadata: Metadata = {
  title: uk.about.title,
  description: uk.about.intro,
  openGraph: {
    type: "website",
    siteName: "Opika",
    locale: "uk_UA",
    description: uk.about.intro,
  },
};

/**
 * «Про проєкт» — no mock, per this phase's own scope: "three or four
 * paragraphs, matching the existing visual language." Static content, no
 * data fetch — the one page in this app that doesn't need
 * `dynamic = "force-dynamic"`, since there's nothing here that can go
 * stale between builds.
 *
 * `hello@opika.org.ua` below is live and receives mail — Cloudflare Email
 * Routing, delivery tested by the owner on 2026-09-02. It is no longer a
 * placeholder and no longer a launch gate.
 *
 * The history is worth keeping, because this comment was wrong twice in
 * different directions: it first claimed no default address was shipped,
 * which stopped being true the moment the string was filled in, and then
 * claimed the address was a placeholder that would bounce, which stopped
 * being true when the mailbox was set up. A page whose whole purpose is
 * "here is who is behind this, get in touch" is worse than absent if the
 * address bounces — that reasoning still holds, it just no longer describes
 * this address.
 *
 * `uk.about.analytics` discloses @vercel/analytics + @vercel/speed-insights
 * (mounted in the root layout) — the disclosure ships in the same phase as
 * the collection, not after.
 */
export default function AboutPage() {
  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <SiteHeader />

      <div className="max-w-[640px] mx-auto p-4 tablet:p-6 desktop:py-16 flex flex-col gap-6">
        <h1 className="font-bold text-[34px]/[38px] desktop:text-[44px]/[46px] tracking-[-0.03em] text-rg-ink">
          {uk.about.title}
        </h1>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.intro}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.free}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.money}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.data}</p>
        <p className="text-[17px]/[26px] text-rg-ink">{uk.about.analytics}</p>
        <p className="text-[15px]/[22px] text-rg-ink-2 pt-2">
          {uk.about.contact.replace("{contact}", "hello@opika.org.ua")}
        </p>
        <Footer currentPage="pro" />
      </div>
    </div>
  );
}
