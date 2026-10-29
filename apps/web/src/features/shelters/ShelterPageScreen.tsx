import { donationHost, type GallerySort, NO_FILTERS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Image from "next/image";
import { useId } from "react";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";
import { LinkButton } from "../../ui/Button";
import { Chip, chipClass } from "../../ui/Chip";
import { Container } from "../../ui/Container";
import { cx } from "../../ui/cx";
import { Heading } from "../../ui/Heading";
import { Pagination } from "../../ui/Pagination";
import { Toggle } from "../../ui/Toggle";
import { SiteHeader } from "../chrome/SiteHeader";
import { ArrowKeyGrid } from "../gallery/ArrowKeyGrid";
import { cardCityId } from "../gallery/card-text";
import type { CitySlugsById } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import { hasPagination } from "../gallery/gallery-pagination";
import { ShelterLogoAvatar } from "./ShelterLogoAvatar";
import { ShelterWordsSection } from "./ShelterWordsSection";
import type { ShelterPageView } from "./shelter-page-load";
import { shelterPageHref } from "./shelter-url";
import { shelterWordsOf } from "./shelter-words";

/** As the gallery: the first row's photos load eagerly (`tvaryny/page.tsx`'s own `PRIORITY_ROW_SIZE`). */
const PRIORITY_ROW_SIZE = 2;

/** The shelter page parses no filters, so `GalleryCard`'s href gets the "never consulted" pair (as the saved page). */
const EMPTY_CITY_SLUGS: CitySlugsById = new Map();

/**
 * The shelter page (designer round 1, S6): back link, logo/name/city, three facts (verification,
 * animal count, donation; each left out without data), the shelter's own words, then the heading,
 * sort, grid and pagination of its discoverable animals. Date sorts only and no engagement figure
 * anywhere (commitments 1 and 2); every control is a plain link, so it works without JS.
 */
export function ShelterPageScreen({
  shelter,
  cityPlace,
  animals,
  cityNames,
  query,
  kabinetSignedIn = false,
}: ShelterPageView & { kabinetSignedIn?: boolean }) {
  const animalsHeadingId = useId();
  const words = shelterWordsOf(shelter);
  const animalsCountText = fillTemplate(uk.shelterPage.animalsHeading, {
    count: String(animals.totalMatching),
  });
  const withLong = (short: string, long: string) => `${short}. ${long}`;
  const sortHref = (sort: GallerySort) => shelterPageHref(shelter.id, sort, 1);

  return (
    <div className="min-h-dvh bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      {/* The D-2 demo disclosure, visible in the body as on the gallery and the animal page. */}
      {REGISTRY_HAS_NO_REAL_SHELTERS && (
        <Container className="pt-6">
          <span data-testid="shelter-demo-banner" className="text-caption text-ink-2">
            {uk.demo.bannerNotice}
          </span>
        </Container>
      )}

      {/* One `<main>` around the whole body, so the main landmark contains the animal list. */}
      <Container as="main" className="flex flex-col gap-13 pt-10 pb-10 desktop:pb-14">
        <LinkButton
          href="/tvaryny"
          variant="ghost"
          data-testid="shelter-back-link"
          className="w-fit self-start"
        >
          {uk.feed.backToList}
        </LinkButton>

        <div className="flex flex-col gap-6 desktop:flex-row desktop:items-start desktop:justify-between">
          {/* Below `tablet:` the logo stacks above the name: side by side left the name too narrow at 360px. */}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-4 tablet:flex-row tablet:gap-6">
            <ShelterLogoAvatar logo={shelter.logo} displayName={shelter.displayName} size="xl" />
            <div className="flex min-w-0 flex-col gap-3 tablet:pt-2">
              <Heading
                level={1}
                look="display-l"
                className="min-w-0 break-words desktop:text-display-xl"
              >
                {shelter.displayName}
              </Heading>
              {cityPlace !== null && (
                <span className="inline-flex items-center gap-2">
                  <Image
                    src="/pet-card/icon-location.svg"
                    alt=""
                    aria-hidden="true"
                    width={32}
                    height={32}
                    unoptimized
                  />
                  <span className="text-body-l font-semibold text-accent-text">
                    {fillTemplate(uk.cardMeta.atShelter, { place: cityPlace })}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-start gap-2 desktop:w-70 desktop:justify-end">
            {shelter.verification === "verified" && (
              <span data-testid="shelter-verified-badge">
                <Chip kind="info" tone="outline">
                  <span>
                    <span aria-hidden="true">✓ </span>
                    {fillTemplate(uk.detail.shelterVerifiedYears, {
                      year: String(shelter.createdAt.getFullYear()),
                    })}
                  </span>
                </Chip>
              </span>
            )}
            {animals.totalMatching > 0 && (
              <Chip kind="info" tone="outline">
                {animalsCountText}
              </Chip>
            )}
            {shelter.donation && (
              <a
                href={shelter.donation.url}
                target="_blank"
                rel="noopener"
                data-testid="donate-link"
                className={cx(chipClass(false), "py-2 focus-ring")}
              >
                <span>
                  {uk.detail.donateShelter}{" "}
                  <span className="text-ink-2">· {donationHost(shelter.donation)} ↗</span>
                </span>
              </a>
            )}
          </div>
        </div>

        {/* Commitment 7: the shelter's sentence renders here and on no card or animal page. */}
        <ShelterWordsSection words={words} headingLevel={2} />

        <section aria-labelledby={animalsHeadingId} className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Heading level={2} id={animalsHeadingId}>
              {animalsCountText}
            </Heading>
            {animals.totalMatching > 0 && (
              <Toggle
                label={uk.filters.sortLabel}
                current={query.sort === "longest_waiting" ? 1 : 0}
                options={[
                  {
                    label: uk.filters.sortFreshestShort,
                    href: sortHref("freshest"),
                    ariaLabel: withLong(uk.filters.sortFreshestShort, uk.filters.sortFreshest),
                  },
                  {
                    label: uk.filters.sortLongestWaitingShort,
                    href: sortHref("longest_waiting"),
                    ariaLabel: withLong(
                      uk.filters.sortLongestWaitingShort,
                      uk.filters.sortLongestWaiting,
                    ),
                  },
                ]}
              />
            )}
          </div>

          {animals.totalMatching === 0 ? (
            <p className="text-body-l text-ink-2">{uk.shelterPage.noAnimals}</p>
          ) : (
            <>
              {hasPagination(animals.totalPages) && (
                <a
                  href="#pagination"
                  className="sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:min-h-target focus:items-center focus:rounded-field focus:bg-ink focus:px-4 focus:text-body focus:text-on-ink focus-ring"
                >
                  {uk.pagination.skipLink}
                </a>
              )}

              <ArrowKeyGrid
                element="ul"
                labelledBy={animalsHeadingId}
                className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4 desktop:gap-7.5"
              >
                {animals.items.map((card, index) => (
                  <li key={card.id} className="flex flex-col">
                    <GalleryCard
                      card={card}
                      cityName={cityNames.get(cardCityId(card)) ?? null}
                      priority={index < PRIORITY_ROW_SIZE}
                      filters={NO_FILTERS}
                      sort={query.sort}
                      citySlugs={EMPTY_CITY_SLUGS}
                    />
                  </li>
                ))}
              </ArrowKeyGrid>

              {/* The skip link's target: focusable itself so the jump lands on the nav. */}
              <div id="pagination" tabIndex={-1} className="mt-6 pt-2">
                <Pagination
                  page={animals.page}
                  totalPages={animals.totalPages}
                  hrefFor={(target) => shelterPageHref(shelter.id, query.sort, target)}
                  navLabel={uk.pagination.navLabel}
                  prevLabel={uk.pagination.prev}
                  nextLabel={uk.pagination.next}
                  pageLabel={uk.pagination.pageLabel}
                  currentLabel={uk.pagination.current}
                  ofTotalLabel={fillTemplate(uk.pagination.ofTotal, {
                    total: String(animals.totalPages),
                  })}
                />
              </div>
            </>
          )}
        </section>
      </Container>
    </div>
  );
}
