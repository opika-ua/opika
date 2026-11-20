import { REVEAL_RETENTION_DAYS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OPERATOR_CONTACT, WORDMARK } from "../../brand";
import { ContentPageLayout } from "../../features/chrome/ContentPageLayout";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { PRIVACY_PATH } from "../../features/chrome/privacy-path";
import { withSlot } from "../../features/chrome/with-slot";
import { isSelfRegistrationEnabled } from "../../features/registration/flag";
import { PRIVACY_SEO } from "../../seo/page-metadata";
import { Heading } from "../../ui/Heading";
import { Text } from "../../ui/Text";
import { TextLink } from "../../ui/TextLink";

/** The date the policy last changed: move it with every material edit (`privacy.changes`). */
export const PRIVACY_POLICY_UPDATED = new Date(Date.UTC(2026, 10, 20));

export const metadata: Metadata = {
  ...PRIVACY_SEO,
  alternates: { canonical: PRIVACY_PATH },
};

/** Reads the kabinet cookie for the role-aware header, as /pro and /prytulkam do. */
export const dynamic = "force-dynamic";

export default async function PrivacyPolicyPage() {
  const kabinetSignedIn = await kabinetSessionCookiePresent();
  return renderPrivacyPage(kabinetSignedIn, { selfRegistration: isSelfRegistrationEnabled() });
}

const p = uk.privacy;

const UPDATED_DATE = new Intl.DateTimeFormat("uk", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(PRIVACY_POLICY_UPDATED);

/** «…2026 р.» ends the sentence: one period, not the abbreviation's and the sentence's both. */
const UPDATED = fillTemplate(p.updated, { date: UPDATED_DATE }).replace(/\.\.$/u, ".");

const MAIL = (
  <TextLink href={`mailto:${OPERATOR_CONTACT.email}`}>{OPERATOR_CONTACT.email}</TextLink>
);

/** A string whose `{email}` is the operator's address as a mailto link. */
const mailed = (template: string) => withSlot(template, "email", MAIL);

/** One entry per processor, in the approved order. */
const PROCESSORS: readonly (readonly [string, ReactNode])[] = [
  ["vercel", p.processors.vercel],
  ["neon", p.processors.neon],
  ["cloudflare", mailed(p.processors.cloudflare)],
  ["resend", p.processors.resend],
  ["upstash", p.processors.upstash],
  ["sentry", p.processors.sentry],
];

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text look="lead" className="text-ink-2">
      {children}
    </Text>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading level={2} look="title">
        {heading}
      </Heading>
      {children}
    </section>
  );
}

/**
 * The page body; exported so `page.test.tsx` can render it without a request scope. The
 * registration section shows only while self-registration is on, as it did on /pro (A7).
 */
export function renderPrivacyPage(
  kabinetSignedIn: boolean,
  { selfRegistration }: { selfRegistration: boolean } = { selfRegistration: false },
) {
  return (
    <ContentPageLayout kabinetSignedIn={kabinetSignedIn} title={p.title}>
      <Text look="hint">{UPDATED}</Text>
      <Paragraph>{mailed(fillTemplate(p.intro, { site: WORDMARK }))}</Paragraph>
      <Section heading={p.short.heading}>
        <Paragraph>{p.short.body}</Paragraph>
      </Section>
      <Section heading={p.visitors.heading}>
        <Paragraph>{p.visitors.cookie}</Paragraph>
        <Paragraph>
          {fillTemplate(p.visitors.reveals, { revealDays: String(REVEAL_RETENTION_DAYS) })}
        </Paragraph>
        <Paragraph>{p.visitors.saved}</Paragraph>
        <Paragraph>{p.visitors.limits}</Paragraph>
        <Paragraph>{p.visitors.stats}</Paragraph>
        <Paragraph>{p.visitors.errors}</Paragraph>
      </Section>
      {selfRegistration ? (
        <Section heading={p.registration.heading}>
          <Paragraph>{uk.registration.privacy}</Paragraph>
          <Paragraph>{p.registration.more}</Paragraph>
        </Section>
      ) : null}
      <Section heading={p.kabinet.heading}>
        <Paragraph>{p.kabinet.access}</Paragraph>
        <Paragraph>{p.kabinet.erasure}</Paragraph>
        <Paragraph>{p.kabinet.history}</Paragraph>
        <Paragraph>{p.kabinet.mailLog}</Paragraph>
        <Paragraph>{fillTemplate(p.kabinet.mailLogo, { site: WORDMARK })}</Paragraph>
        <Paragraph>{p.kabinet.verification}</Paragraph>
      </Section>
      <Section heading={p.public.heading}>
        <Paragraph>{p.public.body}</Paragraph>
        <Paragraph>{p.photos}</Paragraph>
      </Section>
      <Section heading={p.processors.heading}>
        <Paragraph>{p.processors.intro}</Paragraph>
        <ul className="flex list-disc flex-col gap-2 pl-6 text-body-l text-ink-2">
          {PROCESSORS.map(([key, processor]) => (
            <li key={key}>{processor}</li>
          ))}
        </ul>
        <Paragraph>{p.processors.transfers}</Paragraph>
      </Section>
      <Section heading={p.basis.heading}>
        <Paragraph>{p.basis.body}</Paragraph>
      </Section>
      <Section heading={p.rights.heading}>
        <Paragraph>{mailed(p.rights.body)}</Paragraph>
        <Paragraph>{p.rights.visitors}</Paragraph>
        <Paragraph>{p.rights.complaint}</Paragraph>
      </Section>
      <Text look="lead" className="border-t border-line pt-6 text-ink-2">
        {p.changes}
      </Text>
    </ContentPageLayout>
  );
}
