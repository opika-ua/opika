import type { ListedShelterView } from "@opika/contracts";
import { fillTemplate, forOrganisation, uk } from "@opika/i18n";
import Link from "next/link";
import { WORDMARK } from "../../brand";
import { Container, Section } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { TextLink } from "../../ui/TextLink";
import { SiteFooter } from "../chrome/SiteFooter";
import { SiteHeader } from "../chrome/SiteHeader";
import { ShelterLogoAvatar } from "./ShelterLogoAvatar";
import { shelterPagePath } from "./shelter-url";
import type { ShelterCityGroup } from "./shelters-index-load";

/**
 * `/prytulky`: every listed shelter by its city. Each row is a link to the shelter's page with its
 * name, trust line and listed count, never an address or a contact. Plain links, so it works
 * without JS; none prefetched, since the shelter and city pages charge the per-IP budget.
 */
export function SheltersIndexScreen({
  groups,
  kabinetSignedIn,
}: {
  groups: readonly ShelterCityGroup[];
  kabinetSignedIn: boolean;
}) {
  return (
    <div className="site-page bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />
      <Container as="main" className="flex flex-col gap-6 pt-10 pb-10 desktop:pb-14">
        <Heading level={1} look="display-l" className="desktop:text-display-xl">
          {uk.sheltersIndex.heading}
        </Heading>
        {groups.map((group) => (
          <CityGroup key={group.cityId} group={group} />
        ))}
      </Container>
      <SiteFooter />
    </div>
  );
}

function CityGroup({ group }: { group: ShelterCityGroup }) {
  const headingId = `misto-${group.cityId}`;
  return (
    <Section {...(group.cityName === null ? {} : { labelledBy: headingId })}>
      {group.cityName !== null && (
        <Heading level={2} id={headingId}>
          {group.cityHref === null ? (
            group.cityName
          ) : (
            <TextLink href={group.cityHref} prefetch={false} placement="standalone">
              {group.cityName}
            </TextLink>
          )}
        </Heading>
      )}
      <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3 desktop:gap-4">
        {group.shelters.map((shelter) => (
          <li key={shelter.id} className="flex">
            <ShelterRow shelter={shelter} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ShelterRow({ shelter }: { shelter: ListedShelterView }) {
  const trust = fillTemplate(
    forOrganisation(uk.detail.shelterVerifiedYears, shelter.organisationWord),
    { site: WORDMARK, year: String(shelter.createdAt.getFullYear()) },
  );
  return (
    <Link
      href={shelterPagePath(shelter.id)}
      prefetch={false}
      data-testid="shelter-index-row"
      className="flex min-h-target w-full items-center gap-4 rounded-card bg-surface p-4 focus-ring"
    >
      <ShelterLogoAvatar logo={shelter.logo} displayName={shelter.displayName} size="lg" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="break-words text-body-l font-bold text-ink">{shelter.displayName}</span>
        <span className="text-body text-ink-2">
          <span aria-hidden="true">✓ </span>
          {trust}
        </span>
        <span className="text-body text-ink-2">
          {fillTemplate(uk.shelterPage.animalsHeading, {
            count: String(shelter.listedAnimalCount),
          })}
        </span>
      </span>
    </Link>
  );
}
