import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { OPERATOR_CONTACT, WORDMARK } from "../../brand";
import { ContentPageLayout } from "../../features/chrome/ContentPageLayout";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { PRIVACY_PATH } from "../../features/chrome/privacy-path";
import { withSlot } from "../../features/chrome/with-slot";
import { ABOUT_SEO } from "../../seo/page-metadata";
import { Heading } from "../../ui/Heading";
import { Mascot, MascotPerch } from "../../ui/Mascot";
import { Text } from "../../ui/Text";
import { TextLink } from "../../ui/TextLink";

/**
 * `about.intro` names the site with a `{site}` slot (audit 2026-10-22 #33): the
 * name is app config (`brand.ts`), never typed in the catalogue.
 */
const INTRO = fillTemplate(uk.about.intro, { site: WORDMARK });
const MONEY = fillTemplate(uk.about.money, { site: WORDMARK });

/** The dataset page and the licence URL are the data.gov.ua record's own (CKAN `license_url`, read 2026-10-30). */
const CODIFIER_DATASET_URL = "https://data.gov.ua/dataset/43c2a113-a032-4c8a-a409-3b5e1660bb38";
const CODIFIER_LICENCE_URL = "http://www.opendefinition.org/licenses/cc-by";

/** Handoff B2's title and description, for the page and its previews alike (not the demo default). */
export const metadata: Metadata = {
  ...ABOUT_SEO,
  alternates: { canonical: "/pro" },
};

/**
 * «Про проєкт» - no mock, per this phase's own scope: "three or four
 * paragraphs, matching the existing visual language." Static content, no
 * data fetch - the one page in this app that doesn't need
 * `dynamic = "force-dynamic"`, since there's nothing here that can go
 * stale between builds.
 *
 * The contact address (`OPERATOR_CONTACT.email`) is live: Cloudflare Email Routing, delivery
 * tested by the owner on 2026-09-02. A "get in touch" page is worse than absent if it bounces.
 *
 * `uk.about.analytics` names the visit statistics (@vercel/analytics and
 * speed-insights, mounted in the root layout); the details, the cookie included, are on the
 * privacy policy, which the data summary links to.
 *
 * **Designer feedback batch D (2026-10-23):** reading the kabinet cookie
 * for the role-aware header makes this page `force-dynamic` (below) rather
 * than statically prerendered - a real, named trade, not an oversight. The
 * alternative (skip the role-aware header on this one marketing page)
 * would show a signed-in admin «Збережені» here and «Кабінет» everywhere
 * else the header appears, which reads as broken rather than merely
 * static; this page has no other dynamic data, so that's the whole cost.
 * Split into this thin async wrapper (the real page, computes the cookie)
 * and `renderAboutPage` below (what `page.test.tsx` calls directly) for
 * the same reason the animal and shelter pages already are: `cookies()`
 * throws outside a real request scope, which a direct vitest render never
 * has.
 */
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const kabinetSignedIn = await kabinetSessionCookiePresent();
  return renderAboutPage(kabinetSignedIn);
}

/** The data summary: old links to `/pro#dani` still land on it. */
export const DATA_SECTION_ANCHOR = "dani";

/** The page body; exported so `page.test.tsx` can render it without a real request scope. */
export function renderAboutPage(kabinetSignedIn: boolean) {
  return (
    <ContentPageLayout kabinetSignedIn={kabinetSignedIn} current="about" title={uk.about.title}>
      <Text look="lead" className="text-ink-2">
        {INTRO}
      </Text>
      <Text look="lead" className="text-ink-2">
        {uk.about.free}
      </Text>
      <Text look="lead" className="text-ink-2">
        {MONEY}
      </Text>
      {/* The summary only (owner, 2026-11-20); the privacy policy has the details. */}
      <Text id={DATA_SECTION_ANCHOR} look="lead" className="scroll-mt-24 text-ink-2">
        {uk.about.dataSummary}
      </Text>
      <Text look="lead" className="text-ink-2">
        {uk.about.analytics}
      </Text>
      <Text look="lead" className="text-ink-2">
        {withSlot(
          uk.about.dataLink,
          "link",
          <TextLink href={PRIVACY_PATH}>{uk.about.dataLinkLabel}</TextLink>,
        )}
      </Text>
      {/* Decorative divider; the one mascot moment on this page. */}
      <div aria-hidden="true" className="relative mt-8 border-t border-line">
        <MascotPerch perch="top-left" offset={24}>
          <Mascot kind="cat" pose="lie" size={48} />
          <Mascot kind="dog" pose="sit" size={48} />
        </MascotPerch>
      </div>
      <section id="dzherela-danykh" className="flex scroll-mt-24 flex-col gap-3">
        <Heading level={2} look="title">
          {uk.about.sources.heading}
        </Heading>
        <Text look="lead" className="text-ink-2">
          {uk.about.sources.intro}
        </Text>
        <Text look="lead" className="text-ink-2">
          <TextLink href={CODIFIER_DATASET_URL} placement="standalone">
            {uk.about.sources.datasetLink}
          </TextLink>
        </Text>
        <Text look="lead" className="text-ink-2">
          {uk.about.sources.edition}
        </Text>
        <Text look="lead" className="text-ink-2">
          <TextLink href={CODIFIER_LICENCE_URL} placement="standalone">
            {uk.about.sources.licenceLink}
          </TextLink>
        </Text>
        <Text look="lead" className="text-ink-2">
          {uk.about.sources.changes}
        </Text>
      </section>
      <Text look="lead" className="border-t border-line pt-6 text-ink-2">
        {uk.about.contact.replace("{contact}", OPERATOR_CONTACT.email)}
      </Text>
    </ContentPageLayout>
  );
}
