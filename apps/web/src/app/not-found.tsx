import { ukPublic as uk } from "@opika/i18n/public";
import type { Metadata } from "next";
import { NotFoundHeader } from "../features/chrome/NotFoundHeader";
import { LinkButton } from "../ui/Button";
import { Container } from "../ui/Container";
import { Heading } from "../ui/Heading";
import { Panel } from "../ui/Panel";
import { Text } from "../ui/Text";

/**
 * Kept small on purpose: Next serialises this element into every page's payload. Unknown addresses
 * get `[...rest]/not-found.tsx` with the full header; this one only answers a `notFound()` with no
 * nearer `not-found.tsx` (the wrong-role `/kabinet/*` pages), with the plain header.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  const copy = uk.siteNotFound;
  return (
    <div className="min-h-dvh bg-page">
      <NotFoundHeader />
      <Container as="main" className="flex justify-center py-8 desktop:py-14">
        <Panel padding="lg" className="flex w-full max-w-140 flex-col items-start gap-4">
          <Text look="hint" className="uppercase tracking-wider">
            {copy.eyebrow}
          </Text>
          <Heading level={1} look="display-l">
            {copy.title}
          </Heading>
          <Text look="lead" className="text-ink-2">
            {copy.body}
          </Text>
          <LinkButton href="/tvaryny" data-testid="not-found-action">
            {copy.action}
          </LinkButton>
        </Panel>
      </Container>
    </div>
  );
}
