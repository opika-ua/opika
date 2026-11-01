import { ukPublic as uk } from "@opika/i18n/public";
import type { Metadata } from "next";
import { kabinetSessionCookiePresent } from "../features/chrome/kabinet-signed-in";
import { SiteHeader } from "../features/chrome/SiteHeader";
import { LinkButton } from "../ui/Button";
import { Container } from "../ui/Container";
import { Heading } from "../ui/Heading";
import { Mascot } from "../ui/Mascot";
import { Panel } from "../ui/Panel";
import { Text } from "../ui/Text";

/**
 * The 404 for any address no route owns, and for `notFound()` calls with no nearer `not-found.tsx`
 * (the wrong-role `/kabinet/*` pages). Next serves it with a real 404 status; a segment that has its
 * own (`tvaryny/[animalId]`, `prytulky/[shelterId]`) keeps it. Same shape as the animal 404, plus the
 * site header so a visitor is never left without navigation.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NotFound() {
  const copy = uk.siteNotFound;
  return (
    <div className="min-h-dvh bg-page">
      <SiteHeader kabinetSignedIn={await kabinetSessionCookiePresent()} />
      <Container as="main" className="flex justify-center py-8 desktop:py-14">
        <Panel padding="lg" className="flex w-full max-w-140 flex-col items-start gap-4">
          <Mascot kind="cat" pose="sit" variant="collar" size={64} />
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
