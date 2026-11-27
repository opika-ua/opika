import { ukPublic as uk } from "@opika/i18n/public";
import type { Metadata } from "next";
import { GALLERY_PATH } from "../../features/chrome/gallery-path";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { SiteFooter } from "../../features/chrome/SiteFooter";
import { SiteHeader } from "../../features/chrome/SiteHeader";
import { LinkButton } from "../../ui/Button";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { Mascot } from "../../ui/Mascot";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";

/**
 * The 404 for any address no route owns (`[...rest]/page.tsx` calls `notFound()`), with a real 404
 * status. Same shape as the animal 404, plus the full site header so a visitor keeps navigation.
 * It lives here, not at the root, because Next serialises the root `not-found` into every page.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NotFound() {
  const copy = uk.siteNotFound;
  return (
    <div className="site-page bg-page">
      <SiteHeader kabinetSignedIn={await kabinetSessionCookiePresent()} />
      <Container as="main" className="flex flex-1 items-start justify-center py-8 desktop:py-14">
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
          <LinkButton href={GALLERY_PATH} data-testid="not-found-action">
            {copy.action}
          </LinkButton>
        </Panel>
      </Container>
      <SiteFooter />
    </div>
  );
}
