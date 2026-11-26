import type { HomeFoundAnimalView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { LinkButton } from "../../ui/Button";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { Mascot } from "../../ui/Mascot";
import { Panel } from "../../ui/Panel";
import { Photo } from "../../ui/Photo";
import { Text } from "../../ui/Text";
import { SiteFooter } from "../chrome/SiteFooter";
import { SiteHeader } from "../chrome/SiteHeader";

/** «{name} уже вдома»: the page title, the heading and the overlay's name. */
export function homeFoundTitle(view: HomeFoundAnimalView): string {
  return fillTemplate(uk.detail.homeFound.title, { name: view.name });
}

/**
 * An adoption less than 90 days old (owner, 2026-11-24): the photo, the title and one calm line,
 * nothing to contact, reveal, share or save, and no city. Shared by the full page and the
 * gallery's overlay; only the page adds the gallery link (the overlay's ✕ returns to the gallery
 * with its filters).
 */
export function HomeFoundContent({
  view,
  headingLevel,
}: {
  view: HomeFoundAnimalView;
  headingLevel: 1 | 2;
}) {
  const photo = view.primaryPhoto;
  return (
    <>
      {photo ? (
        <Photo
          src={photo.storageKey}
          alt={photo.alt?.uk ?? view.name}
          sizes="(max-width: 599px) 100vw, 560px"
          aspect="wide"
          priority
          className="w-full rounded-card"
        />
      ) : view.species === "dog" ? (
        <Mascot kind="dog" pose="sit" size={64} />
      ) : (
        <Mascot kind="cat" pose="sit" size={64} />
      )}
      <Heading level={headingLevel} look="display-l">
        {homeFoundTitle(view)}
      </Heading>
      <Text look="lead" className="text-ink-2">
        {uk.detail.homeFound.body}
      </Text>
    </>
  );
}

export function HomeFoundScreen({
  view,
  kabinetSignedIn,
}: {
  view: HomeFoundAnimalView;
  kabinetSignedIn: boolean;
}) {
  return (
    <div className="site-page bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} current="animals" />
      <Container as="main" className="flex flex-1 items-start justify-center py-8 desktop:py-14">
        <Panel padding="lg" className="flex w-full max-w-140 flex-col items-start gap-4">
          <HomeFoundContent view={view} headingLevel={1} />
          <LinkButton href="/tvaryny" data-testid="home-found-action">
            {uk.detail.notFound.action}
          </LinkButton>
        </Panel>
      </Container>
      <SiteFooter />
    </div>
  );
}
